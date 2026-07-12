# Task Plan — reSOURCERY

Active task tracking for Claude Code sessions.

## Current Session (2026-07-12)

- [x] Survey app.js / index.html / styles.css for small functionality & design gaps
- [x] Waveform: live playback progress rendering + redraw on resize/orientation change
- [x] Keyboard a11y: focusable drop zone (Enter/Space), Escape closes settings, `:focus-visible` outlines
- [x] Screen readers: aria-live toast container, aria-labels on icon-only buttons
- [x] Guard concurrent format conversions (disable other format buttons while converting)
- [x] Playback robustness: NaN seek-bar guard pre-metadata, `play()` rejection handling
- [x] Error toasts linger 5s; URL input keypress → keydown
- [x] Bump to v2.4.2 (version.js, sw.js fallback, index.html, README, CHANGELOG)
- [x] Verify: syntax + baseline + version checks; headless-Chromium E2E (upload → results → playback → seek → MP3 download, waveform-progress pixel assert, conversion-guard assert)

## Session (2026-07-10)

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
