# Task Plan — reSOURCERY

Active task tracking for Claude Code sessions.

## Session (2026-07-18) — Smart link resolution, download naming, waveform playhead, glass polish (v2.5.0)

- [x] Explore URL pipeline / download flow / waveform + design system; plan approved (smart share-link resolution, naming dialog, playback overlay, glass polish)
- [x] Extract shared SSRF helpers to `api/_lib/security.js` (verbatim move + optional headers/timeout on `pinnedRequest`); `api/fetch.js` imports them, handler unchanged
- [x] New `api/resolve.js`: SSRF-validated page fetch (crawler UA → browser UA), per-hop redirect re-validation, 3 MB HTML cap, extraction priority og:video → JSON-LD → video/audio tags → contentUrl/playAddr JSON, page title for naming, structured codes (LOGIN_WALL / NO_MEDIA_FOUND / STREAM_MANIFEST_ONLY / UPSTREAM_BLOCKED / UNSUPPORTED_PLATFORM)
- [x] Mirror `/api/resolve` in `server.py` (same JSON contract) for local dev
- [x] Client flow (`audio-processor.js`): YouTube guard, `isKnownSharePage` pre-resolution, HTML byte-sniff before FFmpeg with one-hop resolve retry, container-extension default for extensionless share URLs, specific error copy (login wall / web page / manifest / 403)
- [x] `app.js`: YouTube toast at URL submit (no doomed processing run)
- [x] Naming dialog (glass, z-350): title field pre-filled + remembered per track, live preview, Enter/Escape/overlay handling, sanitizer; downloads save as `Title - 124bpm - F#m.ext` (segments omitted when analysis missing)
- [x] Waveform playback overlay: setup/draw split (no per-frame layout reads), indigo wash + glowing playhead, rAF loop bound to audio play/pause events, prefers-reduced-motion fallback to timeupdate, click-to-seek, seek-bar gradient fill; fixed initial draw happening while the results section was still hidden
- [x] Glass polish: saturate() behind panel blur, crisper top bevel, per-panel noise (drop zone excluded — keeps its glow), format-btn hover sheen, indigo play-btn glow + input focus ring
- [x] Tests: `tests/resolve-extract.test.mjs` (extraction fixtures) — added to CI alongside existing config test; CI syntax/baseline lists extended with the new api files
- [x] Bump to v2.5.0 (version.js, sw.js fallback, index.html ×3, README badge/features/tree/history, CHANGELOG, CLAUDE.md, docs/MANIFEST.md)
- [x] Verify: syntax + unit tests + version consistency + local `/api/resolve` guard checks (400/403/422) + live-network resolver runs against real pages (article → NO_MEDIA_FOUND; Wikimedia Commons video page → direct `.webm` via JSON-LD) + Node-handler smoke tests (proxy streams byte-identical to direct fetch) + headless-Chromium E2E (YouTube toast, upload → 120 BPM / A minor results, playhead animates + stops on pause, click-to-seek, naming dialog Escape/preview/download `My Test Track - 120bpm - Am.wav`, title remembered across formats)
- [x] Found & fixed while verifying: DNS-pinning `lookup` callback incompatible with Node ≥ 20 `autoSelectFamily` (`{all: true}` array shape) — production proxy would fail on modern runtimes
- [x] Commit + push + draft PR

## Session (2026-07-16) — Cache-bust corrected icons for returning devices

- [x] User re-added icon, still old → diagnose: Safari/iOS HTTP cache still holds old apple-touch-icon.png (cached under pre-v2.4.6 7-day max-age); SW is network-first and doesn't cover the OS webclip icon fetch
- [x] Rename icons/apple-touch-icon.png → apple-touch-icon-v2.png (new URL can't be served from stale cache); update index.html, sw.js precache, generate-icons.html, README tree, docs/MANIFEST
- [x] Add ?v=2 to favicon links (svg/png16/png32/ico) so browsers re-fetch the corrected favicon
- [x] Bump to v2.4.7; verify syntax + version consistency + no dangling old-name refs; confirm -v2 file is the uniform #5f86ff icon

## Session (2026-07-16) — Icon cache propagation + full-bleed source audit

- [x] Confirm the v2.4.5 fix is actually live on production (resourcery.vercel.app icon byte-identical to local, corners #5f86ff) — "still same" was device/HTTP caching
- [x] Audit: regenerate all icons from resourcery-icon-ios.svg → zero diff vs committed (all derive from the full-bleed source); every raster opaque with uniform #5f86ff border; favicon.ico = 3 PNG entries
- [x] Confirm references: apple-touch-icon / favicon SVG+PNG+ICO / manifest icons all → full-bleed source; in-app header logo → transparent reSOURCERY_optimized.svg
- [x] vercel.json: `/icons/*` 7-day hard cache → `max-age=86400, stale-while-revalidate=604800`; add same header for root favicon.ico + resourcery-icon-ios.svg
- [x] Bump to v2.4.6; update CHANGELOG/README/index; verify syntax + version consistency + JSON valid

## Session (2026-07-16) — Fix white/uneven fringe on iOS Home Screen icon

- [x] Diagnose from user's Home Screen screenshot: white/uneven rim on the squircle corners
- [x] Root-cause via pixel inspection: full-bleed plate gradient went pale (#7597ff, 117,151,255) at the top; iOS squircle-mask AA of that pale edge over dark wallpaper reads as a whitish, uneven rim
- [x] Fix: replace the `fb_border` gradient with a uniform brand blue (#5f86ff) so the masked border is one clean, even color
- [x] Regenerate the full raster set + favicon.ico from the corrected SVG (all fully opaque; 4 corners + top edge now identical #5f86ff)
- [x] Verify by simulating iOS's superellipse (n=5) squircle mask over the icon on a dark background — rim uniform, zero white pixels
- [x] Bump to v2.4.5 (version.js, sw.js, index.html ×3, README, CHANGELOG) so SW re-serves the corrected icon
- [x] Verify: syntax + baseline + version consistency

## Session (2026-07-16) — Refresh iOS / PWA icon (full-bleed opaque plate)

- [x] Pull updated `resourcery-icon-ios.svg` from main (outer glow ring → opaque full-bleed border plate; iOS applies its own squircle mask)
- [x] Regenerate raster set from the new SVG (resvg): `apple-touch-icon.png` (180), `icon-192/512.png`, `icon-maskable-512.png`, `favicon-16/32.png`, `favicon.ico` (16/32/48) — all fully opaque, no alpha
- [x] Verify references already point correctly (index.html favicon/apple-touch, manifest.json icons, sw.js precache); no ref changes needed
- [x] Keep transparent `icons/reSOURCERY_optimized.svg` as the in-app header logo
- [x] Rewrite stale `generate-icons.html` to regenerate the correct set from `resourcery-icon-ios.svg`
- [x] Bump to v2.4.4 (version.js, sw.js fallback, index.html ×3, README badge/tree/table, CHANGELOG) so SW re-caches new icons
- [x] Update docs/MANIFEST.md (full-bleed description, generator entry)
- [x] Verify: syntax + baseline + version consistency; spot-check rendered PNGs + corner opacity

## Session (2026-07-16) — Branded iOS / PWA icon

- [x] Pull new `resourcery-icon-ios.svg` (opaque app mark) from main; confirm it matches the transparent `reSOURCERY_optimized.svg` artwork
- [x] Generate raster icon set via CairoSVG: `apple-touch-icon.png` (180), `icon-192/512.png`, `icon-maskable-512.png`, `favicon-16/32.png`, `favicon.ico` (16/32/48)
- [x] index.html: apple-touch-icon → 180×180 PNG (iOS ignores SVG); favicon → branded SVG + PNG + ICO fallbacks
- [x] manifest.json: PNG icons (192/512 + maskable) + scalable SVG `any`; shortcut icon → PNG
- [x] sw.js: precache new icon assets; bump fallback cache to `resourcery-v2.4.3`
- [x] Keep transparent `reSOURCERY_optimized.svg` as the in-app header logo (transparent bg ideal there)
- [x] Bump to v2.4.3 (version.js, sw.js, index.html/README, CHANGELOG); update docs/MANIFEST.md + README tree
- [x] Verify: syntax + baseline + version consistency; spot-check rendered PNGs

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
