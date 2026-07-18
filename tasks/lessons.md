# Lessons Learned — reSOURCERY

Accumulated patterns from corrections and mistakes. Review at session start.

## Patterns

### URL Ingestion Reliability
- Browser-only URL fetch is not sufficient for many hosts because of CORS; provide a controlled proxy fallback to prevent user-facing dead-ends.
- Keep progress updates active during fallback transitions so the UI does not appear frozen around 20–30%.

### Proxy Security
- Any URL proxy must block localhost/private addresses to reduce SSRF exposure.
- Enforce protocol allowlist (`http`/`https`) and response-size caps before forwarding data into processing pipelines.

### Deployment Routing
- SPA rewrite rules can accidentally shadow serverless API routes; always exclude `/api/*` when rewrites route to `index.html`.

### Development Parity
- If production uses a serverless route, local development should offer the same path contract to avoid environment-only regressions.

### Documentation Sync
- For runtime behavior changes, update README + CHANGELOG + SECURITY + TESTING + manifest docs in the same patch.

### Custom DNS `lookup` Callbacks on Modern Node
- A custom `lookup` passed to `net`/`http` (e.g. for DNS pinning) must handle BOTH callback shapes: legacy `(err, address, family)` AND, when invoked with `{ all: true }`, `(err, [{ address, family }])`. Node ≥ 20 enables `autoSelectFamily` by default, which always requests `all: true` — a legacy-only callback makes every connection fail with `Invalid IP address: undefined`.
- Exercise serverless handlers directly in Node with mock `req`/`res` before deploying: the syntax checker and even endpoint-shape tests pass while the connection layer is broken. Streaming a real URL through the handler and byte-comparing against a direct fetch catches this class of failure.

### HTML Extraction From Share Pages
- Social share links point at HTML, not media. Byte-sniff every fetched URL body before handing it to FFmpeg (`<!doctype`/`<html`… in the first KB) — Content-Type headers alone are unreliable across proxies.
- Platforms server-render `og:video` for link-preview crawlers but not for unknown agents: fetch pages with a crawler User-Agent (`facebookexternalhit`) first, a browser UA second.
- Entity-decode extracted attribute URLs (`&amp;` inside query strings) and absolutize against the FINAL post-redirect URL, or signed CDN links break subtly.
- Cap resolution at one hop and fail with actionable copy — og:video frequently points at embed *players* (more HTML), and looping resolution would hang the UX.

### Invisible Bytes in Generated Code
- When writing regex character classes with control-character ranges (`\u0000-\u001f`) or BOM anchors (`\uFEFF`) through tooling, verify the file afterward (`grep -P '[\x00-\x08]'` or a byte scan): escape sequences can materialize as literal control bytes, corrupting the file in ways `node --check` may still pass.

### Third-Party Libraries That Spawn Workers
- A library loaded from a CDN that calls `new Worker(...)` with a URL relative to its own script will resolve to the CDN origin — and browsers reject cross-origin classic workers with a synchronous `SecurityError`. Vendor such wrappers same-origin (the worker chunk must sit in the same directory), even if the heavy assets (e.g. ffmpeg-core.wasm) stay on the CDN.
- Verify "it loads from CDN fine" claims in a real browser: script tags loading successfully says nothing about worker spawning at runtime. A headless-Chromium E2E test (upload → results) catches this class of failure; syntax checks and smoke checks cannot.
