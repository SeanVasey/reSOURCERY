# Repository Manifest

## Product Files
- `index.html`: Application shell and script/style wiring.
- `css/styles.css`: Theme, layout, and responsive styling.
- `js/app.js`: UI orchestration and upload/processing state machine.
- `js/audio-processor.js`: FFmpeg.wasm integration, extraction, conversion, and analysis orchestration.
- `js/analysis-worker.js`: Background tempo/key analysis worker.
- `js/tempo-detector.js` / `js/key-detector.js` / `js/fft.js`: Audio analysis algorithms.

## Vendored Third-Party Files (`js/vendor/`)
Unmodified UMD builds copied from npm (via unpkg). The `@ffmpeg/ffmpeg` wrapper must be served same-origin because it spawns its class worker (`814.ffmpeg.js`) relative to its own script URL, and browsers reject cross-origin classic workers.
- `js/vendor/ffmpeg.js`: `@ffmpeg/ffmpeg@0.12.7` `dist/umd/ffmpeg.js` (MIT).
- `js/vendor/814.ffmpeg.js`: `@ffmpeg/ffmpeg@0.12.7` `dist/umd/814.ffmpeg.js` — worker chunk spawned by `ffmpeg.js`; must live in the same directory (MIT).
- `js/vendor/ffmpeg-util.js`: `@ffmpeg/util@0.12.1` `dist/umd/index.js` (MIT).

The large `@ffmpeg/core@0.12.6` files (`ffmpeg-core.js`, `ffmpeg-core.wasm`, ~31 MB) are **not** vendored; they are fetched from unpkg at runtime with progress tracking and loaded via blob URLs (see `js/audio-processor.js`).

## PWA and Runtime
- `manifest.json`: Web app manifest.
- `sw.js`: Service worker cache/runtime logic.
- `coi-serviceworker.js`: Cross-origin isolation support.

## Deployment
- `vercel.json`: Vercel deployment headers (COOP/COEP), cache config, API-aware rewrites.
- `api/fetch.js`: Hardened URL proxy for CORS-restricted media hosts (Vercel serverless function).
- `server.py`: Local static host with matching `/api/fetch` proxy behavior for development testing.

## Documentation and Governance
- `README.md`: Product overview, usage, and development instructions.
- `CHANGELOG.md`: Versioned release notes.
- `SECURITY.md`: Vulnerability disclosure process.
- `CLAUDE.md`: Project context, workflow standards, and directives for Claude Code sessions.
- `LICENSE`: Project license.

## Task Tracking
- `tasks/todo.md`: Active task plan with checkable items, updated per session.
- `tasks/lessons.md`: Accumulated patterns from corrections and mistakes.
