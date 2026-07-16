# Repository Manifest

## Product Files
- `index.html`: Application shell and script/style wiring.
- `css/styles.css`: Theme, layout, and responsive styling.
- `js/app.js`: UI orchestration and upload/processing state machine.
- `js/audio-processor.js`: FFmpeg.wasm integration, extraction, conversion, and analysis orchestration.
- `js/analysis-worker.js`: Background tempo/key analysis worker.
- `js/tempo-detector.js` / `js/key-detector.js` / `js/fft.js`: Audio analysis algorithms.

## Vendored Third-Party Files (`js/vendor/`)
UMD builds copied from npm (via unpkg), unmodified except that trailing `sourceMappingURL` comments were removed (the `.map` files are not vendored, and the dangling references would cause 404 warnings in browser devtools). The `@ffmpeg/ffmpeg` wrapper must be served same-origin because it spawns its class worker (`814.ffmpeg.js`) relative to its own script URL, and browsers reject cross-origin classic workers.
- `js/vendor/ffmpeg.js`: `@ffmpeg/ffmpeg@0.12.7` `dist/umd/ffmpeg.js` (MIT).
- `js/vendor/814.ffmpeg.js`: `@ffmpeg/ffmpeg@0.12.7` `dist/umd/814.ffmpeg.js` — worker chunk spawned by `ffmpeg.js`; must live in the same directory (MIT).
- `js/vendor/ffmpeg-util.js`: `@ffmpeg/util@0.12.1` `dist/umd/index.js` (MIT).

The large `@ffmpeg/core@0.12.6` files (`ffmpeg-core.js`, `ffmpeg-core.wasm`, ~31 MB) are **not** vendored; they are fetched from unpkg at runtime with progress tracking and loaded via blob URLs (see `js/audio-processor.js`).

## PWA and Runtime
- `manifest.json`: Web app manifest.
- `sw.js`: Service worker cache/runtime logic.
- `coi-serviceworker.js`: Cross-origin isolation support.

## Icons and Branding
- `resourcery-icon-ios.svg`: Source app icon — the branded wizard mark on an **opaque** rounded-rect background. Used for the favicon and PWA manifest, and as the source for all generated raster icons. Ideal wherever the icon must render on its own (iOS Home Screen, install tiles).
- `icons/reSOURCERY_optimized.svg`: **Transparent-background** variant of the same artwork. Used as the in-app header logo, where it sits on the app's dark background.
- Generated PNGs (produced from `resourcery-icon-ios.svg`; regenerate with a faithful SVG rasterizer such as CairoSVG, or the browser-based `generate-icons.html`):
  - `icons/apple-touch-icon.png` (180×180) — iOS Home Screen icon. iOS ignores SVG `apple-touch-icon`s, so a PNG is required.
  - `icons/icon-192.png`, `icons/icon-512.png` — PWA install icons (`purpose: any`).
  - `icons/icon-maskable-512.png` — Android maskable icon (`purpose: maskable`); the opaque background fills the platform safe-zone crop.
  - `icons/favicon-16.png`, `icons/favicon-32.png` — PNG favicon fallbacks.
  - `favicon.ico` — multi-resolution favicon (16/32/48) for legacy browsers.
- `VM-Logo-White.svg` / `VA-Logo-White.svg`: Vasey Multimedia and VASEY/AI brand monograms used in the footer.

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
