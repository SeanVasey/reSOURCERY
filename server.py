#!/usr/bin/env python3
"""
Simple HTTP server for reSOURCERY PWA
Serves the application on port 50910 and provides /api/fetch proxy for local testing.
"""
import http.server
import ipaddress
import json
import os
import socketserver
import sys
import urllib.error
import urllib.parse
import urllib.request

PORT = 50910
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
MAX_CONTENT_LENGTH = 2 * 1024 * 1024 * 1024


def is_private_host(hostname: str) -> bool:
    """Block private/localhost targets for SSRF safety."""
    if not hostname:
        return True

    normalized = hostname.strip('[]').lower()
    if normalized in {'localhost', '::1'}:
        return True

    try:
        ip = ipaddress.ip_address(normalized)
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except ValueError:
        return False


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

    def handle_fetch_proxy(self, parsed):
        params = urllib.parse.parse_qs(parsed.query)
        media_url = params.get('url', [None])[0]

        if not media_url:
            self.send_json(400, {'error': 'Missing url query parameter'})
            return

        try:
            target = urllib.parse.urlparse(media_url)
        except ValueError:
            self.send_json(400, {'error': 'Invalid URL format'})
            return

        if target.scheme not in {'http', 'https'}:
            self.send_json(400, {'error': 'Only HTTP(S) URLs are supported'})
            return

        if is_private_host(target.hostname or ''):
            self.send_json(403, {'error': 'Private network addresses are not allowed'})
            return

        req = urllib.request.Request(
            media_url,
            headers={'User-Agent': 'reSOURCERY-local/2.3 (+http://127.0.0.1:50910)'},
            method='GET'
        )

        try:
            with urllib.request.urlopen(req, timeout=45) as upstream:
                status = upstream.getcode()
                if status < 200 or status > 299:
                    self.send_json(status, {'error': f'Upstream request failed: HTTP {status}'})
                    return

                content_type = upstream.headers.get('Content-Type')
                content_length = upstream.headers.get('Content-Length')
                if content_length:
                    try:
                        if int(content_length) > MAX_CONTENT_LENGTH:
                            self.send_json(413, {'error': 'Remote file exceeds 2 GB limit'})
                            return
                    except ValueError:
                        pass

                data = upstream.read(MAX_CONTENT_LENGTH + 1)
                if len(data) > MAX_CONTENT_LENGTH:
                    self.send_json(413, {'error': 'Remote file exceeds 2 GB limit'})
                    return

                self.send_response(200)
                self.send_header('Cache-Control', 'no-store, max-age=0')
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.send_header('Access-Control-Allow-Origin', '*')
                if content_type:
                    self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as error:
            self.send_json(error.code, {'error': f'Upstream request failed: HTTP {error.code}'})
        except urllib.error.URLError as error:
            self.send_json(502, {'error': f'Proxy request failed: {error.reason}'})


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
