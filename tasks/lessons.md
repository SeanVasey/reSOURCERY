# Lessons Learned — reSOURCERY

Accumulated patterns from corrections and mistakes. Review at session start.

## Patterns

### Version Consistency
- Always verify `sw.js` fallback cache name matches `APP_VERSION.cacheKey` in `js/version.js` before committing.
- The CI pipeline enforces this check — never skip it locally.

### Service Worker Cache
- When updating cached assets in `sw.js`, verify every file path in `STATIC_ASSETS` actually exists in the repo.
- CDN URLs in `CDN_ASSETS` must match versions referenced in `index.html`.

### Cross-Origin Isolation
- `coi-serviceworker.js` and `sw.js` both intercept fetch events — changes to one may affect the other.
- Vercel uses `credentialless` (not `require-corp`) for COEP to allow CDN fetches.

### Documentation Sync
- When changing features or files, update README.md, CHANGELOG.md, and docs/MANIFEST.md in the same commit.
- SECURITY.md supported versions table must be updated when new minor/major versions ship.
