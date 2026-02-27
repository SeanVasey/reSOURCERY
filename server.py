#!/usr/bin/env python3
"""
Simple HTTP server for reSOURCERY PWA
Serves the application on port 50910 and provides /api/fetch proxy for local testing.
"""
import http.server
import ipaddress
import json
import os
import shutil
import socket
import socketserver
import sys
import urllib.error
import urllib.parse
import urllib.request

PORT = 50910
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
MAX_CONTENT_LENGTH = 2 * 1024 * 1024 * 1024
MAX_REDIRECTS = 5


def is_private_ip(addr_str: str) -> bool:
    """Check whether a parsed IP address is private/reserved."""
    try:
        ip = ipaddress.ip_address(addr_str)
        return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved
    except ValueError:
        return True  # Unparseable — block by default


def is_private_host(hostname: str) -> bool:
    """Block private/localhost targets for SSRF safety, including DNS resolution."""
    if not hostname:
        return True

    normalized = hostname.strip('[]').lower()
    if normalized in {'localhost', '::1'}:
        return True

    # Check if it's a literal IP address
    try:
        ip = ipaddress.ip_address(normalized)
        return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved
    except ValueError:
        pass

    # It's a hostname — resolve via DNS and check all resulting IPs
    try:
        addrinfo = socket.getaddrinfo(normalized, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        if not addrinfo:
            return True  # Cannot resolve — block

        for family, _type, _proto, _canonname, sockaddr in addrinfo:
            resolved_ip = sockaddr[0]
            if is_private_ip(resolved_ip):
                return True
        return False
    except (socket.gaierror, socket.herror, OSError):
        return True  # DNS failure — block by default


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
        Returns the parsed URL on success or None (and sends error response) on failure."""
        try:
            target = urllib.parse.urlparse(url_string)
        except ValueError:
            self.send_json(400, {'error': 'Invalid URL format'})
            return None

        if target.scheme not in {'http', 'https'}:
            self.send_json(400, {'error': 'Only HTTP(S) URLs are supported'})
            return None

        if is_private_host(target.hostname or ''):
            self.send_json(403, {'error': 'Private network addresses are not allowed'})
            return None

        return target

    def handle_fetch_proxy(self, parsed):
        params = urllib.parse.parse_qs(parsed.query)
        media_url = params.get('url', [None])[0]

        if not media_url:
            self.send_json(400, {'error': 'Missing url query parameter'})
            return

        target = self._validate_url(media_url)
        if target is None:
            return

        current_url = media_url

        # Follow redirects manually, re-validating each hop against SSRF
        for _hop in range(MAX_REDIRECTS):
            req = urllib.request.Request(
                current_url,
                headers={'User-Agent': 'reSOURCERY-local/2.3 (+http://127.0.0.1:50910)'},
                method='GET'
            )

            try:
                # Disable automatic redirect following
                opener = urllib.request.build_opener(NoRedirectHandler())
                upstream = opener.open(req, timeout=45)
                status = upstream.getcode()

                if 300 <= status < 400:
                    location = upstream.headers.get('Location')
                    if not location:
                        self.send_json(502, {'error': 'Redirect without Location header'})
                        return

                    # Resolve relative redirects
                    redirect_url = urllib.parse.urljoin(current_url, location)

                    # Re-validate the redirect target
                    redirect_target = self._validate_url(redirect_url)
                    if redirect_target is None:
                        return

                    current_url = redirect_url
                    upstream.close()
                    continue

                if status < 200 or status > 299:
                    self.send_json(status, {'error': f'Upstream request failed: HTTP {status}'})
                    return

                content_type = upstream.headers.get('Content-Type')
                content_length = upstream.headers.get('Content-Length')
                if content_length:
                    try:
                        if int(content_length) > MAX_CONTENT_LENGTH:
                            self.send_json(413, {'error': 'Remote file exceeds 2 GB limit'})
                            upstream.close()
                            return
                    except ValueError:
                        pass

                self.send_response(200)
                self.send_header('Cache-Control', 'no-store, max-age=0')
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.send_header('Access-Control-Allow-Origin', '*')
                if content_type:
                    self.send_header('Content-Type', content_type)
                if content_length:
                    self.send_header('Content-Length', content_length)
                self.end_headers()

                # Stream the response in chunks instead of buffering entirely
                shutil.copyfileobj(upstream, self.wfile)
                upstream.close()
                return

            except urllib.error.HTTPError as error:
                self.send_json(error.code, {'error': f'Upstream request failed: HTTP {error.code}'})
                return
            except urllib.error.URLError as error:
                self.send_json(502, {'error': f'Proxy request failed: {error.reason}'})
                return

        self.send_json(502, {'error': 'Too many redirects'})


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Prevent urllib from automatically following redirects."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

    def http_error_302(self, req, fp, code, msg, headers):
        return fp

    http_error_301 = http_error_302
    http_error_303 = http_error_302
    http_error_307 = http_error_302
    http_error_308 = http_error_302


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
