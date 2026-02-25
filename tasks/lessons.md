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
