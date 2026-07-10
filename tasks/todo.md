# Task Plan — reSOURCERY

Active task tracking for Claude Code sessions.

## Current Session (2026-07-10)

- [x] Reproduce report: file upload / processing fails on every attempt
- [x] Root-cause: CDN-hosted @ffmpeg/ffmpeg wrapper spawns cross-origin class worker (814.ffmpeg.js) → SecurityError in ffmpeg.load()
- [x] Vendor @ffmpeg/ffmpeg 0.12.7 wrapper + worker chunk + @ffmpeg/util 0.12.1 into js/vendor/ (same-origin)
- [x] Update index.html script tags, sw.js asset lists, bump version to 2.4.1
- [x] Verify E2E in headless Chromium: WAV upload → results (tempo/key), MP4 upload → audio extraction, MP3 conversion download
- [x] Update CHANGELOG, README, docs/MANIFEST, CLAUDE.md, lessons.md
- [x] Run syntax + baseline + version-consistency checks

## Previous Session

- [x] Reproduce and inspect URL/upload processing bottlenecks and failure paths
- [x] Add resilient URL fetch fallback through `/api/fetch` for CORS-blocked hosts
- [x] Harden proxy endpoint (HTTP(S)-only, private-network blocking, 2 GB response cap)
- [x] Align local server behavior with Vercel API route for deterministic testing
- [x] Fix Vercel rewrite rule to preserve `/api/*` function routing
- [x] Update README, CHANGELOG, SECURITY, TESTING, and docs/MANIFEST
- [x] Run syntax checks, smoke checks, and server-level proxy validation commands
- [x] Commit and prepare PR details
