#!/usr/bin/env python3
"""
Simple HTTP server for reSOURCERY PWA
Serves the application on port 50910 and provides /api/fetch proxy for local testing.
"""
import http.client
import http.server
import ipaddress
import json
import os
import shutil
import socket
import socketserver
import ssl
import sys
import urllib.parse

PORT = 50910
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
MAX_CONTENT_LENGTH = 2 * 1024 * 1024 * 1024
MAX_REDIRECTS = 5
CONNECT_TIMEOUT = 30   # seconds
STREAM_IDLE_TIMEOUT = 60  # seconds per-read idle timeout


def is_private_ip(addr_str: str) -> bool:
    """Check whether a parsed IP address is private/reserved."""
    try:
        ip = ipaddress.ip_address(addr_str)
        return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved
    except ValueError:
        return True  # Unparseable — block by default


def validate_and_resolve(hostname: str):
    """Validate hostname against SSRF protections and resolve to a pinned IP.

    Returns (resolved_ip: str | None, error_message: str | None).
    If resolved_ip is None, error_message explains the rejection.
    """
    if not hostname:
        return None, 'Missing hostname'

    normalized = hostname.strip('[]').lower()
    if normalized in {'localhost', '::1'}:
        return None, 'Private network addresses are not allowed'

    # Literal IP address
    try:
        ip = ipaddress.ip_address(normalized)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved:
            return None, 'Private network addresses are not allowed'
        return normalized, None
    except ValueError:
        pass

    # Hostname — resolve via DNS and check all resulting IPs
    try:
        addrinfo = socket.getaddrinfo(normalized, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        if not addrinfo:
            return None, f'Could not resolve hostname: {hostname}'

        first_public = None
        for _family, _type, _proto, _canonname, sockaddr in addrinfo:
            resolved_ip = sockaddr[0]
            if is_private_ip(resolved_ip):
                return None, 'Private network addresses are not allowed'
            if first_public is None:
                first_public = resolved_ip

        return first_public, None
    except (socket.gaierror, socket.herror, OSError):
        return None, f'Could not resolve hostname: {hostname}'


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    """HTTPS connection pinned to a resolved IP with TLS verified against the original hostname."""

    def __init__(self, resolved_ip, port, original_hostname, timeout=CONNECT_TIMEOUT):
        context = ssl.create_default_context()
        super().__init__(resolved_ip, port, timeout=timeout, context=context)
        self._original_hostname = original_hostname

    def connect(self):
        """Connect to the resolved IP, then do TLS with SNI for the original hostname."""
        http.client.HTTPConnection.connect(self)
        self.sock = self._context.wrap_socket(
            self.sock,
            server_hostname=self._original_hostname
        )


def pinned_open(url_string, resolved_ip, timeout=CONNECT_TIMEOUT):
    """Open a URL with DNS pinning to prevent DNS rebinding.

    Returns (connection, response) where response is an http.client.HTTPResponse.
    """
    parsed = urllib.parse.urlparse(url_string)
    is_https = parsed.scheme == 'https'
    port = parsed.port or (443 if is_https else 80)
    hostname = parsed.hostname

    path = parsed.path or '/'
    if parsed.query:
        path += '?' + parsed.query

    if is_https:
        conn = PinnedHTTPSConnection(resolved_ip, port, hostname, timeout=timeout)
    else:
        conn = http.client.HTTPConnection(resolved_ip, port, timeout=timeout)

    netloc = parsed.hostname
    if parsed.port:
        netloc += f':{parsed.port}'

    conn.request('GET', path, headers={
        'User-Agent': f'reSOURCERY-local/2.4 (+http://127.0.0.1:{PORT})',
        'Host': netloc
    })

    response = conn.getresponse()

    # Set longer timeout for the streaming phase
    if conn.sock:
        conn.sock.settimeout(STREAM_IDLE_TIMEOUT)

    return conn, response


class CORSHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Add CORS headers for cross-origin isolation (required for SharedArrayBuffer in FFmpeg.wasm)
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        super().end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store, max-age=0')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'none'")
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/fetch':
            self.handle_fetch_proxy(parsed)
            return
        super().do_GET()

    def _validate_url(self, url_string):
        """Parse and validate a URL against SSRF protections.
        Returns (parsed_url, resolved_ip) on success, or (None, None) on failure."""
        try:
            target = urllib.parse.urlparse(url_string)
        except ValueError:
            self.send_json(400, {'error': 'Invalid URL format'})
            return None, None

        if target.scheme not in {'http', 'https'}:
            self.send_json(400, {'error': 'Only HTTP(S) URLs are supported'})
            return None, None

        resolved_ip, error = validate_and_resolve(target.hostname or '')
        if error:
            status = 403 if 'private' in error.lower() else 400
            self.send_json(status, {'error': error})
            return None, None

        return target, resolved_ip

    def handle_fetch_proxy(self, parsed):
        params = urllib.parse.parse_qs(parsed.query)
        media_url = params.get('url', [None])[0]

        if not media_url:
            self.send_json(400, {'error': 'Missing url query parameter'})
            return

        target, resolved_ip = self._validate_url(media_url)
        if target is None:
            return

        current_url = media_url

        # Follow redirects manually, re-validating each hop against SSRF
        for _hop in range(MAX_REDIRECTS):
            try:
                conn, upstream = pinned_open(current_url, resolved_ip, timeout=CONNECT_TIMEOUT)
            except (OSError, http.client.HTTPException) as error:
                self.send_json(502, {'error': f'Proxy request failed: {error}'})
                return

            try:
                status = upstream.status

                if 300 <= status < 400:
                    location = upstream.getheader('Location')
                    if not location:
                        self.send_json(502, {'error': 'Redirect without Location header'})
                        return

                    # Resolve relative redirects
                    redirect_url = urllib.parse.urljoin(current_url, location)

                    # Re-validate the redirect target
                    redirect_target, redirect_resolved_ip = self._validate_url(redirect_url)
                    if redirect_target is None:
                        return

                    current_url = redirect_url
                    resolved_ip = redirect_resolved_ip
                    upstream.close()
                    conn.close()
                    continue

                if status < 200 or status > 299:
                    self.send_json(status, {'error': f'Upstream request failed: HTTP {status}'})
                    upstream.close()
                    conn.close()
                    return

                content_type = upstream.getheader('Content-Type')
                content_length = upstream.getheader('Content-Length')
                if content_length:
                    try:
                        if int(content_length) > MAX_CONTENT_LENGTH:
                            self.send_json(413, {'error': 'Remote file exceeds 2 GB limit'})
                            upstream.close()
                            conn.close()
                            return
                    except ValueError:
                        pass

                self.send_response(200)
                self.send_header('Cache-Control', 'no-store, max-age=0')
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Security-Policy', "default-src 'none'")
                if content_type:
                    self.send_header('Content-Type', content_type)
                if content_length:
                    self.send_header('Content-Length', content_length)
                self.end_headers()

                # Stream the response in chunks
                try:
                    shutil.copyfileobj(upstream, self.wfile)
                except (socket.timeout, BrokenPipeError, ConnectionResetError):
                    pass  # Stream interrupted — client disconnected or idle timeout
                finally:
                    upstream.close()
                    conn.close()
                return

            except Exception:
                upstream.close()
                conn.close()
                raise

        self.send_json(502, {'error': 'Too many redirects'})


def main():
    # Enable address reuse to avoid TIME_WAIT issues on restart
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), CORSHTTPRequestHandler) as httpd:
        print(f"reSOURCERY server running at http://127.0.0.1:{PORT}/")
        print(f"Serving files from: {DIRECTORY}")
        print("Press Ctrl+C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
            sys.exit(0)


if __name__ == "__main__":
    main()
