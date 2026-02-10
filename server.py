#!/usr/bin/env python3
"""
Simple HTTP server for reSOURCERY PWA
Serves the application on port 50910
"""
import http.server
import socketserver
import os
import sys

PORT = 50910
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class CORSHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def end_headers(self):
        # Add CORS headers for cross-origin isolation (required for SharedArrayBuffer in FFmpeg.wasm)
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        super().end_headers()

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
