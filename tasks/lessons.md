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

### Third-Party Libraries That Spawn Workers
- A library loaded from a CDN that calls `new Worker(...)` with a URL relative to its own script will resolve to the CDN origin — and browsers reject cross-origin classic workers with a synchronous `SecurityError`. Vendor such wrappers same-origin (the worker chunk must sit in the same directory), even if the heavy assets (e.g. ffmpeg-core.wasm) stay on the CDN.
- Verify "it loads from CDN fine" claims in a real browser: script tags loading successfully says nothing about worker spawning at runtime. A headless-Chromium E2E test (upload → results) catches this class of failure; syntax checks and smoke checks cannot.
