# CLAUDE.md — reSOURCERY

Project context and directives for Claude Code sessions.

## Project Overview

reSOURCERY is a client-side Progressive Web App (PWA) for audio extraction and analysis. All media processing runs in the browser via FFmpeg.wasm — there is no backend server, no API routes, and no database. The app is deployed as static files to Vercel.

## Tech Stack

- **Language**: Vanilla JavaScript (ES6+), no framework or bundler
- **Media Processing**: FFmpeg.wasm 0.12.6 (loaded from unpkg CDN)
- **Audio Analysis**: Web Audio API, custom FFT (Cooley-Tukey), Web Workers
- **PWA**: Service Worker (`sw.js`), Cross-Origin Isolation (`coi-serviceworker.js`)
- **Styling**: Single CSS file (`css/styles.css`), dark theme, mobile-first
- **Deployment**: Vercel (static), configured via `vercel.json`
- **CI**: GitHub Actions (`.github/workflows/ci.yml`)

## Key Architecture Decisions

- **No build step** — all JS is loaded directly via `<script>` tags in `index.html`
- **Version management** — single source of truth in `js/version.js` (`APP_VERSION` frozen object)
- **Service worker cache name** must match `APP_VERSION.cacheKey` in `sw.js`
- **Cross-origin isolation** is required for SharedArrayBuffer (FFmpeg.wasm); handled by `coi-serviceworker.js` and `vercel.json` COOP/COEP headers
- **FFmpeg core files** are pre-fetched with progress tracking and loaded via blob URLs to avoid stalling

## File Structure

```
index.html              → App shell, script loading, CDN wiring
css/styles.css          → All styles (dark charcoal + indigo-cyan theme)
js/version.js           → APP_VERSION config (update here for releases)
js/app.js               → UI orchestration (ReSOURCERYApp class)
js/audio-processor.js   → FFmpeg integration (AudioProcessor class)
js/fft.js               → Cooley-Tukey FFT implementation
js/tempo-detector.js    → BPM detection via onset/autocorrelation
js/key-detector.js      → Key detection via Krumhansl-Schmuckler
js/analysis-worker.js   → Web Worker for background analysis
sw.js                   → Service worker (cache management)
coi-serviceworker.js    → Cross-origin isolation headers
manifest.json           → PWA manifest
vercel.json             → Vercel deployment config (headers, rewrites)
server.py               → Local dev server (port 50910, CORS headers)
```

## Development Workflow

### Before committing, run all syntax checks:

```bash
node --check js/version.js
node --check js/fft.js
node --check js/tempo-detector.js
node --check js/key-detector.js
node --check js/analysis-worker.js
node --check js/audio-processor.js
node --check js/app.js
node --check sw.js
```

### Repository baseline smoke checks:

```bash
test -f README.md
test -f CHANGELOG.md
test -f LICENSE
test -f SECURITY.md
test -f .editorconfig
test -f index.html
test -f css/styles.css
test -f js/app.js
test -f js/audio-processor.js
test -f docs/MANIFEST.md
```

### Local testing:

```bash
python3 server.py
# Open http://127.0.0.1:50910/
```

## Version Bumping Checklist

When releasing a new version:

1. Update `js/version.js` — change `major`, `minor`, or `patch`
2. Update `sw.js` — the `CACHE_NAME` constant must match `APP_VERSION.cacheKey`
3. Update `CHANGELOG.md` — add new entry at top
4. Update `README.md` — version badge and version history table
5. Run all syntax checks (see above)
6. Commit with descriptive message

## Common Pitfalls

- **FFmpeg stall at 20-30%**: Ensure `ffmpeg-core.worker.js` is pre-fetched and passed as blob URL to `ffmpeg.load()`; without it the loader tries to resolve relative to a blob: URL and hangs
- **Sample rate 0**: If FFmpeg probe fails to parse audio metadata, `extractAudio` receives `sampleRate: 0`; the code defaults to 48000 Hz in this case
- **CORS on URL fetch**: Cross-origin media URLs will fail unless the remote server sends CORS headers; error messages should guide users accordingly
- **Vercel COEP**: Use `credentialless` (not `require-corp`) to allow CDN fetches without CORS headers on every resource
- **Service worker conflicts**: Both `coi-serviceworker.js` and `sw.js` handle fetch events; the COI worker adds COOP/COEP headers while `sw.js` handles caching

## Security Notes

- URL inputs are validated: only `http:` and `https:` protocols allowed
- Toast messages use `textContent` (never `innerHTML`) to prevent XSS
- No user data is transmitted to any server
- File size limit: 2 GB (enforced client-side)
- Processing is guarded against re-entrant calls via `isProcessing` flag
