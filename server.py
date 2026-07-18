#!/usr/bin/env python3
"""
Simple HTTP server for reSOURCERY PWA
Serves the application on port 50910 and provides the /api/fetch proxy and
/api/resolve media-link resolver for local testing (mirrors api/fetch.js
and api/resolve.js).
"""
import html as html_lib
import http.client
import http.server
import ipaddress
import json
import os
import re
import shutil
import socket
import socketserver
import ssl
import sys
import time
import urllib.parse

PORT = 50910
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
MAX_CONTENT_LENGTH = 2 * 1024 * 1024 * 1024
MAX_REDIRECTS = 5
CONNECT_TIMEOUT = 30   # seconds
STREAM_IDLE_TIMEOUT = 60  # seconds per-read idle timeout

# /api/resolve mirror of api/resolve.js — same contract and error codes
MAX_HTML_BYTES = 3 * 1024 * 1024
PAGE_CONNECT_TIMEOUT = 8   # seconds
PAGE_BODY_DEADLINE = 12    # seconds to buffer the page body
MAX_TITLE_LENGTH = 300
CRAWLER_USER_AGENT = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
BROWSER_USER_AGENT = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36')

RESOLVE_ERROR_MESSAGES = {
    'UNSUPPORTED_PLATFORM': 'YouTube streams cannot be extracted',
    'LOGIN_WALL': 'The page requires login to view',
    'UPSTREAM_BLOCKED': 'The platform refused the request',
    'STREAM_MANIFEST_ONLY': 'The page only exposes a streaming manifest',
    'NO_MEDIA_FOUND': 'No direct media link found on the page',
    'UPSTREAM_ERROR': 'The page could not be fetched',
}

RESOLVE_ERROR_STATUS = {
    'UNSUPPORTED_PLATFORM': 422,
    'LOGIN_WALL': 403,
    'UPSTREAM_BLOCKED': 403,
    'STREAM_MANIFEST_ONLY': 422,
    'NO_MEDIA_FOUND': 422,
    'UPSTREAM_ERROR': 502,
}

RESOLVE_FAILURE_RANK = {
    'LOGIN_WALL': 4,
    'UPSTREAM_BLOCKED': 3,
    'STREAM_MANIFEST_ONLY': 2,
    'NO_MEDIA_FOUND': 1,
    'UPSTREAM_ERROR': 0,
}


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


def pinned_open(url_string, resolved_ip, timeout=CONNECT_TIMEOUT, headers=None):
    """Open a URL with DNS pinning to prevent DNS rebinding.

    Optional `headers` merge over the defaults (e.g. a custom User-Agent).
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

    request_headers = {
        'User-Agent': f'reSOURCERY-local/2.5 (+http://127.0.0.1:{PORT})',
        'Host': netloc
    }
    if headers:
        request_headers.update(headers)

    conn.request('GET', path, headers=request_headers)

    response = conn.getresponse()

    # Set longer timeout for the streaming phase
    if conn.sock:
        conn.sock.settimeout(STREAM_IDLE_TIMEOUT)

    return conn, response


_ATTR_RE = re.compile(r'([a-zA-Z][a-zA-Z0-9:_-]*)\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s"\'>]+))')
_META_RE = re.compile(r'<meta\b[^>]*>', re.IGNORECASE)
_TITLE_RE = re.compile(r'<title[^>]*>([\s\S]*?)</title>', re.IGNORECASE)
_TITLE_SUFFIX_RE = re.compile(
    r'\s*[|\-–—•]\s*(on\s+)?(Instagram|TikTok|Twitter|Facebook|Vimeo|YouTube|X)\b.*$',
    re.IGNORECASE)
_JSONLD_RE = re.compile(
    r'<script\b[^>]*type\s*=\s*["\']application/ld\+json["\'][^>]*>([\s\S]*?)</script>',
    re.IGNORECASE)
_MEDIA_TAG_RE = re.compile(r'<(video|audio)\b[^>]*>', re.IGNORECASE)
_MEDIA_BLOCK_RE = re.compile(r'<(video|audio)\b[^>]*>([\s\S]*?)</\1>', re.IGNORECASE)
_SOURCE_RE = re.compile(r'<source\b[^>]*>', re.IGNORECASE)
_JSON_URL_PATTERNS = [
    (re.compile(r'"contentUrl"\s*:\s*"((?:[^"\\]|\\.)+)"'), 'json-contentUrl'),
    (re.compile(r'"playAddr"\s*:\s*"((?:[^"\\]|\\.)+)"'), 'json-playAddr'),
]
_HTML_SNIFF_RE = re.compile(
    r'^\ufeff?\s*(?:<!--[\s\S]*?-->\s*)*<(?:!doctype\s|html[\s>]|head[\s>]|body[\s>]'
    r'|meta[\s>]|script[\s>]|title[\s>]|link[\s>]|div[\s>])',
    re.IGNORECASE)


def is_youtube_host(hostname):
    host = (hostname or '').lower().rstrip('.')
    return (host == 'youtu.be' or host == 'youtube.com' or host.endswith('.youtube.com')
            or host == 'youtube-nocookie.com' or host.endswith('.youtube-nocookie.com'))


def parse_attributes(tag):
    attrs = {}
    for match in _ATTR_RE.finditer(tag):
        name = match.group(1).lower()
        if name not in attrs:
            value = match.group(2)
            if value is None:
                value = match.group(3)
            if value is None:
                value = match.group(4) or ''
            attrs[name] = value
    return attrs


def collect_meta_tags(html_text):
    meta = {}
    for match in _META_RE.finditer(html_text):
        attrs = parse_attributes(match.group(0))
        key = (attrs.get('property') or attrs.get('name') or '').lower()
        if key and 'content' in attrs and key not in meta:
            meta[key] = attrs['content']
    return meta


def collect_jsonld_media(node, out):
    if isinstance(node, list):
        for item in node:
            collect_jsonld_media(item, out)
        return
    if not isinstance(node, dict):
        return
    raw_type = node.get('@type')
    types = raw_type if isinstance(raw_type, list) else [raw_type]
    if 'VideoObject' in types or 'AudioObject' in types:
        content_url = node.get('contentUrl')
        if isinstance(content_url, str) and content_url:
            kind = 'audio' if 'AudioObject' in types else 'video'
            out.append({'url': content_url, 'kind': kind, 'source': 'json-ld'})
    for value in node.values():
        collect_jsonld_media(value, out)


def extract_page_title(html_text, meta):
    title = meta.get('og:title')
    if not title:
        match = _TITLE_RE.search(html_text)
        title = match.group(1) if match else None
    if not title:
        return None
    title = html_lib.unescape(title)
    title = re.sub(r'\s+', ' ', title).strip()
    title = _TITLE_SUFFIX_RE.sub('', title).strip()
    return title[:MAX_TITLE_LENGTH] if title else None


def is_stream_manifest_url(url_string):
    try:
        pathname = urllib.parse.urlparse(url_string).path.lower()
        return pathname.endswith('.m3u8') or pathname.endswith('.mpd')
    except ValueError:
        return False


def normalize_candidate(raw, base_url):
    if not raw:
        return None
    decoded = html_lib.unescape(str(raw).strip())
    try:
        absolute = urllib.parse.urljoin(base_url, decoded)
        scheme = urllib.parse.urlparse(absolute).scheme
    except ValueError:
        return None
    if scheme not in {'http', 'https'}:
        return None
    return absolute


def extract_media_from_html(html_text, base_url):
    """Python port of extractMediaFromHTML in api/resolve.js (same priority)."""
    meta = collect_meta_tags(html_text)
    candidates = []

    meta_priority = [
        ('og:video:secure_url', 'video'),
        ('og:video:url', 'video'),
        ('og:video', 'video'),
        ('og:audio:secure_url', 'audio'),
        ('og:audio:url', 'audio'),
        ('og:audio', 'audio'),
        ('twitter:player:stream', 'video'),
    ]
    for key, kind in meta_priority:
        if meta.get(key):
            candidates.append({'url': meta[key], 'kind': kind, 'source': key})

    for match in _JSONLD_RE.finditer(html_text):
        try:
            collect_jsonld_media(json.loads(match.group(1)), candidates)
        except (json.JSONDecodeError, RecursionError):
            pass

    for match in _MEDIA_TAG_RE.finditer(html_text):
        kind = match.group(1).lower()
        attrs = parse_attributes(match.group(0))
        if attrs.get('src'):
            candidates.append({'url': attrs['src'], 'kind': kind, 'source': f'{kind}-tag'})
    for block in _MEDIA_BLOCK_RE.finditer(html_text):
        kind = block.group(1).lower()
        for source_match in _SOURCE_RE.finditer(block.group(2)):
            attrs = parse_attributes(source_match.group(0))
            if attrs.get('src'):
                candidates.append({'url': attrs['src'], 'kind': kind, 'source': f'{kind}-source'})

    for pattern, source in _JSON_URL_PATTERNS:
        for match in pattern.finditer(html_text):
            try:
                unescaped = json.loads(f'"{match.group(1)}"')
            except json.JSONDecodeError:
                continue
            candidates.append({'url': unescaped, 'kind': 'video', 'source': source})

    page_title = extract_page_title(html_text, meta)
    login_title = bool(page_title and re.match(r'^\s*(log\s*in|login|sign\s*in)\b', page_title, re.IGNORECASE))

    saw_manifest = False
    for candidate in candidates:
        normalized = normalize_candidate(candidate['url'], base_url)
        if not normalized:
            continue
        if is_stream_manifest_url(normalized):
            saw_manifest = True
            continue
        return {
            'mediaUrl': normalized,
            'kind': candidate['kind'],
            'source': candidate['source'],
            'pageTitle': page_title,
            'sawManifestOnly': False,
            'loginTitle': login_title,
        }

    return {
        'mediaUrl': None,
        'kind': None,
        'source': None,
        'pageTitle': page_title,
        'sawManifestOnly': saw_manifest,
        'loginTitle': login_title,
    }


def is_html_content_type(content_type):
    return bool(re.match(r'^(text/html|application/xhtml\+xml)', content_type or '', re.IGNORECASE))


def is_media_content_type(content_type):
    return bool(re.match(r'^(audio|video)/', content_type or '', re.IGNORECASE)
                or re.match(r'^application/(octet-stream|mp4)', content_type or '', re.IGNORECASE))


def is_manifest_content_type(content_type):
    return bool(re.search(r'mpegurl|dash\+xml', content_type or '', re.IGNORECASE))


def looks_like_html_bytes(body):
    head = body[:1024].decode('utf-8', errors='replace')
    return bool(_HTML_SNIFF_RE.match(head))


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
        if parsed.path == '/api/resolve':
            self.handle_resolve(parsed)
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

    # ---- /api/resolve (mirror of api/resolve.js) ----

    def _resolve_failure(self, code, detail=None):
        return {'ok': False, 'code': code, 'error': detail or RESOLVE_ERROR_MESSAGES[code]}

    def _read_page_body(self, conn, upstream):
        """Buffer the page body up to MAX_HTML_BYTES / PAGE_BODY_DEADLINE."""
        chunks = []
        total = 0
        deadline = time.monotonic() + PAGE_BODY_DEADLINE
        try:
            while total <= MAX_HTML_BYTES:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                if conn.sock:
                    conn.sock.settimeout(min(remaining, 5))
                chunk = upstream.read(65536)
                if not chunk:
                    break
                chunks.append(chunk)
                total += len(chunk)
        except (socket.timeout, OSError, http.client.HTTPException):
            pass  # Parse whatever arrived before the cap/deadline
        return b''.join(chunks)

    def _attempt_resolve(self, page_url, user_agent):
        """One resolution attempt with a given User-Agent.

        Returns None when a validation error response was already sent,
        otherwise an outcome dict ({'ok': True, ...} or a structured failure).
        """
        target, resolved_ip = self._validate_url(page_url)
        if target is None:
            return None

        current_url = page_url
        request_headers = {
            'User-Agent': user_agent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        }

        for _hop in range(MAX_REDIRECTS):
            try:
                conn, upstream = pinned_open(current_url, resolved_ip,
                                             timeout=PAGE_CONNECT_TIMEOUT,
                                             headers=request_headers)
            except (OSError, http.client.HTTPException) as error:
                return self._resolve_failure('UPSTREAM_ERROR', f'Page fetch failed: {error}')

            try:
                status = upstream.status

                if 300 <= status < 400:
                    location = upstream.getheader('Location')
                    if not location:
                        return self._resolve_failure('UPSTREAM_ERROR', 'Redirect without Location header')

                    redirect_url = urllib.parse.urljoin(current_url, location)
                    redirect_target, redirect_ip = self._validate_url(redirect_url)
                    if redirect_target is None:
                        return None

                    current_url = redirect_url
                    resolved_ip = redirect_ip
                    continue

                if status in (401, 403):
                    return self._resolve_failure('UPSTREAM_BLOCKED')
                if status < 200 or status > 299:
                    return self._resolve_failure('UPSTREAM_ERROR', f'Upstream request failed: HTTP {status}')

                content_type = upstream.getheader('Content-Type') or ''

                # The "page" is already a media file — the link was direct after all
                if is_media_content_type(content_type):
                    return {'ok': True, 'mediaUrl': current_url, 'kind': 'direct',
                            'pageTitle': None, 'source': 'content-type'}
                if is_manifest_content_type(content_type) or is_stream_manifest_url(current_url):
                    return self._resolve_failure('STREAM_MANIFEST_ONLY')

                body = self._read_page_body(conn, upstream)

                if not is_html_content_type(content_type) and not looks_like_html_bytes(body):
                    return {'ok': True, 'mediaUrl': current_url, 'kind': 'direct',
                            'pageTitle': None, 'source': 'sniff'}

                extraction = extract_media_from_html(
                    body.decode('utf-8', errors='replace'), current_url)
                if extraction['mediaUrl']:
                    return {'ok': True, 'mediaUrl': extraction['mediaUrl'],
                            'kind': extraction['kind'],
                            'pageTitle': extraction['pageTitle'],
                            'source': extraction['source']}

                final_path = urllib.parse.urlparse(current_url).path.lower()
                if extraction['loginTitle'] or re.search(r'/login\b|/accounts/login', final_path):
                    return self._resolve_failure('LOGIN_WALL')
                if extraction['sawManifestOnly']:
                    return self._resolve_failure('STREAM_MANIFEST_ONLY')
                return self._resolve_failure('NO_MEDIA_FOUND')
            finally:
                try:
                    upstream.close()
                    conn.close()
                except OSError:
                    pass

        return self._resolve_failure('UPSTREAM_ERROR', 'Too many redirects')

    def handle_resolve(self, parsed):
        params = urllib.parse.parse_qs(parsed.query)
        page_url = params.get('url', [None])[0]

        if not page_url:
            self.send_json(400, {'ok': False, 'error': 'Missing url query parameter',
                                 'code': 'BAD_REQUEST'})
            return

        try:
            hostname = urllib.parse.urlparse(page_url).hostname
        except ValueError:
            self.send_json(400, {'ok': False, 'error': 'Invalid URL format',
                                 'code': 'BAD_REQUEST'})
            return

        if is_youtube_host(hostname):
            self.send_json(RESOLVE_ERROR_STATUS['UNSUPPORTED_PLATFORM'],
                           self._resolve_failure('UNSUPPORTED_PLATFORM'))
            return

        failures = []
        for user_agent in (CRAWLER_USER_AGENT, BROWSER_USER_AGENT):
            outcome = self._attempt_resolve(page_url, user_agent)
            if outcome is None:
                return  # validation error response already sent
            if outcome.get('ok'):
                self.send_json(200, outcome)
                return
            failures.append(outcome)

        failures.sort(key=lambda f: RESOLVE_FAILURE_RANK.get(f['code'], 0), reverse=True)
        best = failures[0] if failures else self._resolve_failure('UPSTREAM_ERROR')
        self.send_json(RESOLVE_ERROR_STATUS.get(best['code'], 502), best)


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
