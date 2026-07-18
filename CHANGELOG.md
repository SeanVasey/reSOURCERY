# Changelog

All notable changes to reSOURCERY will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.5.0] - 2026-07-18

### Added
- **Smart link resolution for social share URLs.** Pasting a share link (Instagram Reel/post, TikTok — including `vm.tiktok.com` shortlinks, X/Twitter status, Facebook watch/reel) no longer fails with a generic error. A new hardened `/api/resolve` endpoint fetches the page (crawler User-Agent first, browser UA as fallback), extracts the direct media URL from Open Graph tags, JSON-LD, `<video>`/`<audio>` tags, or embedded platform JSON, and hands it back for the normal fetch → FFmpeg pipeline. The client also byte-sniffs every fetched URL and auto-resolves when the bytes turn out to be a web page instead of media.
- **Standardized download naming.** Clicking a download format now opens a compact naming dialog with a live filename preview. Files are saved as `[Title] - [BPM]bpm - [KEY].[ext]` (e.g. `Sunset Groove - 124bpm - F#m.wav`), using the detected tempo and key; segments are omitted gracefully when analysis is unavailable. The title is pre-filled from the resolved page title or source filename, remembered across formats for the same track, and sanitized for filesystem safety.
- **Waveform playback overlay.** During playback the waveform sweeps left→right with a translucent indigo wash (the icon's blue) and a glowing playhead marker, animated at 60 fps via `requestAnimationFrame` (falls back to coarse `timeupdate` redraws when the OS prefers reduced motion). The waveform is now click/tap-to-seek and the seek bar shows a filled indigo→cyan track.
- Unit tests for the resolver's HTML extraction helpers (`tests/resolve-extract.test.mjs`), now run in CI alongside the FFmpeg config test.

### Changed
- **Glassmorphism polish.** Panels gain `saturate()` behind the blur, a crisper light-catching top edge, and a whisper of per-panel film grain; format buttons get a glass sheen sweep on hover; the play button and input focus rings pick up the indigo accent. No layout changes; reduced-motion is respected.
- Proxy SSRF helpers extracted to `api/_lib/security.js` (not exposed as an endpoint) and shared by `/api/fetch` and `/api/resolve`; `/api/fetch` behavior is unchanged.
- YouTube links are detected up front and get an honest explanation (YouTube serves protected/ciphered streams that cannot be extracted in-browser) instead of a doomed fetch attempt.
- URL processing errors are now specific: login-walled posts, streaming-manifest-only pages, "this link returns a web page", and platform 403s each get actionable guidance instead of one generic message.
- `server.py` mirrors `/api/resolve` for local development, matching the production JSON contract.

### Fixed
- **Proxy DNS-pinning lookup was incompatible with Node ≥ 20.** `net.connect` with `autoSelectFamily` (default since Node 20) invokes the custom `lookup` with `{ all: true }` and expects an address array; the pinned lookup only answered the legacy `(err, address, family)` shape, so on modern runtimes every proxied request failed with `Invalid IP address: undefined`. The lookup now serves both callback shapes — still answering exclusively with the pre-validated pinned IP. Verified by streaming a real URL through the handler byte-for-byte on Node 22.

### Security
- `/api/resolve` reuses the full SSRF hardening from `/api/fetch`: private-IP blocking, DNS resolution with IP pinning, and per-redirect re-validation. It returns URLs only — media bytes still flow exclusively through the existing validated fetch paths. Resolved URLs are re-validated client-side (http/https only), page buffering is capped at 3 MB, and extracted titles are clamped and sanitized.

### Notes
- Some platforms serve login walls to datacenter IPs regardless of User-Agent (Instagram in particular), and some resolved platform URLs are signed/IP-bound. Resolution is best-effort by design: failures surface as clear, actionable messages, never silent hangs.

## [2.4.7] - 2026-07-16

### Fixed
- **Corrected icon didn't reach devices that had already cached the old one.** The v2.4.5 border fix was live on the server, but Safari/iOS kept serving a previously cached `apple-touch-icon.png` (cached under the old 7-day `max-age` before v2.4.6 shortened it), so even removing and re-adding the Home Screen icon showed the old artwork. The service worker is network-first and doesn't cover the OS-level webclip icon fetch, so it couldn't help here either.
  - **iOS icon:** renamed `icons/apple-touch-icon.png` → `icons/apple-touch-icon-v2.png`. A brand-new URL cannot be served from the stale cache, so re-adding to the Home Screen now fetches the corrected icon. (A query string alone is unreliable for iOS webclips; a real filename change is not.)
  - **Browser favicons:** added `?v=2` to the favicon `<link>`s (`resourcery-icon-ios.svg`, `favicon-16/32.png`, `favicon.ico`) so browsers holding the old-gradient favicon re-fetch the corrected one.
  - The service worker's offline cache fallback now matches with `ignoreSearch: true`, so these `?v=2` requests (and the bare-referenced manifest SVG) still resolve to their precached entries offline instead of failing.
- Service worker precache and version bumped to `resourcery-v2.4.7`.

### Notes
- Going forward, updated icons propagate on their own within ~a day thanks to the v2.4.6 `stale-while-revalidate` headers — this one-time rename/`?v=` bust is only needed to clear copies cached under the old long-lived header.

## [2.4.6] - 2026-07-16

### Changed
- **Icon assets now propagate faster when they change.** `/icons/*` previously used `Cache-Control: public, max-age=604800` (a hard 7-day cache with no revalidation), so an updated favicon/PWA icon could take up to a week to reach returning browsers. It now uses `public, max-age=86400, stale-while-revalidate=604800` — fresh for a day, then served stale-while-revalidating for up to a week — matching the JS/CSS caching convention. Added the same header for the root `favicon.ico` and `resourcery-icon-ios.svg`, which previously fell back to Vercel's default caching. (Note: this only affects browser/HTTP caching; iOS Home Screen webclip icons are cached by the OS and are not governed by HTTP headers — evicting those still requires removing and re-adding the icon.)

### Verified
- Audited every icon surface: all favicon, PWA, and iOS Home Screen rasters (`apple-touch-icon.png`, `icon-192/512.png`, `icon-maskable-512.png`, `favicon-16/32.png`, `favicon.ico`) are byte-for-byte reproducible from the full-bleed `resourcery-icon-ios.svg`, are fully opaque, and carry the uniform `#5f86ff` border. The in-app header logo remains the transparent `icons/reSOURCERY_optimized.svg`.

## [2.4.5] - 2026-07-16

### Fixed
- **iOS Home Screen icon showed a white / uneven fringe on the rounded corners.** The full-bleed border plate used a vertical gradient that went pale (`#7597ff`) at the top. When iOS masks the square icon into its squircle, the anti-aliased top corners of that pale edge read as a whitish, uneven rim against the wallpaper. The plate is now a single **uniform brand blue** (`#5f86ff`, matching the icon's inner glow), so the masked border is one clean, even "pure" color all the way around. Regenerated the full raster set (`apple-touch-icon`, `icon-192/512`, `icon-maskable-512`, `favicon-16/32`, `favicon.ico`) from the corrected source; all icons remain fully opaque. Verified by simulating iOS's superellipse squircle mask over the icon on a dark background — the rim is uniform with no white pixels.
- Service worker cache bumped to `resourcery-v2.4.5` so returning users receive the corrected icon instead of the cached v2.4.4 artwork.

## [2.4.4] - 2026-07-16

### Changed
- **Refreshed iOS / PWA app icon artwork**: `resourcery-icon-ios.svg` now paints an **opaque full-bleed border plate** edge-to-edge instead of an outer glow ring on transparent corners. iOS applies its own squircle mask to the square, so the Home Screen icon never shows light/dark mode bleeding through the corners, and Android maskable crops stay filled.
- **Regenerated the entire raster icon set** from the updated source so every install surface matches the new artwork: `icons/apple-touch-icon.png` (180×180), `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`, `icons/favicon-16.png`, `icons/favicon-32.png`, and the multi-resolution `favicon.ico` (16/32/48). All raster icons are fully opaque (no alpha) so no background shows through.
- Service worker cache bumped to `resourcery-v2.4.4` so returning users receive the new precached icon assets instead of stale cached versions.
- Rewrote `generate-icons.html` to regenerate the correct icon set (right sizes and filenames) from `resourcery-icon-ios.svg` rather than the transparent header logo.

### Notes
- The transparent `icons/reSOURCERY_optimized.svg` remains the in-app header logo, where a transparent background is ideal. Only the standalone app-icon surfaces (favicon, Apple touch, PWA/Home Screen install) use the opaque `resourcery-icon-ios.svg`.

## [2.4.3] - 2026-07-16

### Added
- **Branded iOS Home Screen / PWA icon**: adopted the new `resourcery-icon-ios.svg` app mark (opaque rounded-rect wizard) for the favicon, Apple touch icon, and PWA manifest. Generated the raster set required by iOS/Android install flows — `icons/apple-touch-icon.png` (180×180), `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`, `icons/favicon-16.png`, `icons/favicon-32.png`, and a multi-size `favicon.ico` (16/32/48).

### Fixed
- **iOS "Add to Home Screen" showed no custom icon**: `apple-touch-icon` previously pointed at an SVG, which iOS ignores. It now references a 180×180 PNG so the wizard mark renders correctly on the Home Screen.

### Changed
- Favicon now serves the branded SVG to modern browsers with PNG + `favicon.ico` fallbacks; the transparent `icons/reSOURCERY_optimized.svg` remains the in-app header logo (where a transparent background is ideal).
- PWA manifest icons switched from a single SVG to PNG entries (192/512 + a dedicated maskable 512) plus a scalable SVG `any` entry.
- Service worker cache bumped to `resourcery-v2.4.3`; new icon assets added to the precache list.

## [2.4.2] - 2026-07-12

### Added
- **Waveform playback progress**: the results waveform now renders the played portion in bright cyan with the remainder dimmed, updating live during playback and when seeking, and resetting when playback ends.
- **Keyboard accessibility**: the drop zone is focusable (`role="button"`, `tabindex="0"`) and opens the file browser on Enter/Space; Escape closes the settings panel; all interactive controls (drop zone, format buttons, play button, seek bar, URL submit, cancel/close buttons) show a visible `:focus-visible` outline.
- **Screen reader support**: toast notifications are announced via `role="status"`/`aria-live="polite"`; the cancel-processing and close-settings icon buttons have `aria-label`s.

### Fixed
- **Concurrent conversion guard**: clicking a second download format (or double-clicking) while a conversion is running is now ignored; the other format buttons are visibly disabled until the conversion finishes.
- **Waveform resize**: the waveform canvas redraws on window resize/orientation change instead of stretching and blurring.
- **Seek before metadata**: seeking or time updates before audio metadata loads no longer produce `NaN` seek-bar values or invalid `currentTime` assignments.
- **Playback errors**: `audio.play()` rejections (e.g. decode/autoplay failures) are caught, the play button state is reverted, and an error toast is shown instead of a stuck "playing" UI.
- **Deprecated event**: URL input now uses `keydown` instead of the deprecated `keypress` event.

### Changed
- Error toasts stay visible for 5 seconds (info/success remain 3 seconds) so failure messages can actually be read.
- Service worker cache bumped to `resourcery-v2.4.2`.

## [2.4.1] - 2026-07-10

### Fixed
- **File upload and processing completely broken** — vendored the `@ffmpeg/ffmpeg` wrapper same-origin. The CDN-hosted `@ffmpeg/ffmpeg` 0.12.7 UMD wrapper spawns its internal class worker relative to its own script URL (`https://unpkg.com/.../814.ffmpeg.js`), and browsers reject cross-origin classic workers, so `ffmpeg.load()` threw `SecurityError: Failed to construct 'Worker'` on every attempt and no file or URL could ever be processed. The wrapper (`js/vendor/ffmpeg.js`, its worker chunk `js/vendor/814.ffmpeg.js`) and `@ffmpeg/util` (`js/vendor/ffmpeg-util.js`) are now served from the app's own origin, letting the worker resolve same-origin. The large `@ffmpeg/core` files (~31 MB) remain CDN-hosted and pre-fetched into blob URLs as before. Verified end-to-end in a real browser: WAV upload → extraction → tempo/key analysis → results; MP4 (video+audio) upload → audio extraction; MP3 conversion/download.
- **FFmpeg media initialization**: The app no longer fetches or passes `ffmpeg-core.worker.js` for the default single-threaded `@ffmpeg/core` build, because that package does not ship a worker script. This prevents media handling from failing before processing starts or timing out while preparing the audio engine.
- **Top safe-area scrim**: Page content no longer scrolls visibly into the iOS status bar / notch / Dynamic Island region. A fixed, pointer-transparent `.top-safe-scrim` layer replicates the page background stack — `--color-bg-primary` (the top stop of `--gradient-dark-vertical`), the animated ambient glow, and the noise texture — opaque through `env(safe-area-inset-top)` with a short (≤16px) masked fade below it, so the inset is indistinguishable from the page background at rest (the fade lets the hero glow bleed through without a clipped edge) and scrolling content blends out before reaching the status icons. The ambient gradient and noise texture were promoted to `:root` custom properties (`--gradient-ambient`, `--noise-texture`) so the scrim and page share one definition.

### Changed
- Service worker cache bumped to `resourcery-v2.4.1`; the vendored FFmpeg wrapper files are pre-cached as static assets, and only the `@ffmpeg/core` files and Google Fonts remain in the CDN cache list.

## [2.4.0] - 2026-02-27

### Security
- **DNS rebinding mitigation** (#24, #25): Both `api/fetch.js` and `server.py` now pin DNS-resolved IPs and use them for the actual TCP connection, preventing TOCTOU attacks where DNS records change between validation and connection. Node.js proxy uses `http.request`/`https.request` with a custom `lookup` callback; Python proxy uses `http.client` with `PinnedHTTPSConnection` for proper TLS SNI handling.
- **IPv6 link-local range fix** (#17, #27): `isPrivateIPv6` now blocks the full `fe80::/10` range (fe80–febf) instead of only `fe80`-prefixed addresses. Python's `ipaddress.ip_address.is_link_local` already handled this correctly.
- **Content Security Policy on proxy** (#26): Both `server.py` proxy responses and JSON error responses now include `Content-Security-Policy: default-src 'none'`, preventing browser execution of proxied HTML content.
- **Streaming timeout protection** (#28): `api/fetch.js` enforces a 60-second idle timeout and 5-minute maximum streaming time to prevent resource exhaustion from slow or infinite upstream responses. `server.py` uses a 60-second per-read socket timeout.
- **DNS error handling** (#24): Empty `catch` blocks in DNS resolution replaced with error-code-aware handling that only suppresses expected `ENODATA`/`ENOTFOUND` errors and reports unexpected failures.

### Changed
- Service worker cache bumped to `resourcery-v2.4.0`.
- `api/fetch.js` now uses Node.js `http`/`https` modules instead of the `fetch()` API for upstream requests, enabling DNS pinning via the `lookup` callback.
- `server.py` now uses `http.client` instead of `urllib.request` for upstream requests, enabling DNS-pinned connections with proper TLS SNI.
- Version fallbacks in `index.html` updated from v2.1/v2.1.0 to v2.4/v2.4.0.

## [2.3.1] - 2026-02-27

### Security
- **SSRF: Block private IPv6 forms** (#17): `isPrivateHost` now parses IPv4-mapped loopback (`::ffff:7f00:1`), link-local (`fe80::1`), multicast, and reserved IPv6 ranges instead of relying on prefix-only regex patterns.
- **SSRF: Re-validate redirect targets** (#18): Proxy handler now follows redirects manually (`redirect: 'manual'`) and re-validates each hop against SSRF protections, preventing attackers from redirecting to private IPs.
- **SSRF: DNS resolution bypass** (#19, #21): Both `api/fetch.js` and `server.py` now resolve hostnames via DNS before validating, blocking public domains that resolve to private IP addresses.
- **Memory exhaustion** (#20, #22): Proxy responses are now streamed directly to clients instead of buffering entire bodies into memory, preventing OOM crashes for large files on constrained environments.

### Fixed
- URL processing now retries through a hardened `/api/fetch` proxy when direct browser fetch is blocked by CORS/network policies, reducing fetch failures for remote media sources.
- Vercel SPA rewrite now excludes `/api/*` paths so serverless functions are reachable in production.
- Local development server now supports `/api/fetch` to match production URL-processing behavior during tests.

### Changed
- Service worker cache bumped to `resourcery-v2.3.1`.

## [2.3.0] - 2026-02-22

### Safe Area & Deployment

#### Added
- **Safe area insets for curved/notched screens**: Applied `env(safe-area-inset-left)` and `env(safe-area-inset-right)` padding to `.app-container`, adjusted `.floating-menu-btn` right position and `.toast-container` width to respect side safe areas. Background color extends naturally behind safe areas via existing `viewport-fit=cover`.
- **GitHub Pages deployment workflow** (`.github/workflows/deploy-pages.yml`): Automatic static deployment to GitHub Pages on pushes to `main` using `actions/deploy-pages@v4`.
- **CI version consistency check**: New CI step validates that `sw.js` fallback cache name matches `APP_VERSION.cacheKey` from `js/version.js`.
- **CI baseline additions**: Added `manifest.json`, `js/version.js`, and `sw.js` to repository smoke checks.
- README: Added CI status badge, GitHub Pages deployment badge, expanded deployment documentation covering Vercel, GitHub Pages, and custom static hosts with header requirements.

#### Changed
- Service worker cache bumped to `resourcery-v2.3.0`.
- README version badge updated to 2.3.0.

## [2.2.0] - 2026-02-21

### Audio Processing & Deployment

#### Fixed
- **URL processing stall/failure**: `processURL` now uses `fetchWithProgress` with ReadableStream progress tracking instead of a bare `fetch().blob()` call that provided no progress feedback and caused the UI to freeze at 25%.
- **Sample rate crash**: `extractAudio` now defaults to 48000 Hz when FFmpeg probe fails to detect a valid sample rate (previously passed `0` to FFmpeg, causing extraction failure).
- **Error message overflow**: Toast notifications now constrain long error messages with word-break, line-clamping, and truncation to prevent text from leaking into the main body.
- **Re-entrant processing**: Added `isProcessing` guard to prevent concurrent `processFile`/`processURL` calls from corrupting state.
- **Metadata reset**: Audio metadata is now reset at the start of each processing run to prevent stale values from a previous file leaking into the next result.

#### Added
- `vercel.json` — Vercel deployment configuration with `Cross-Origin-Embedder-Policy: credentialless` and `Cross-Origin-Opener-Policy: same-origin` headers for SharedArrayBuffer support, cache headers for static assets, and SPA rewrite rules.
- `CLAUDE.md` — Project context and directives for Claude Code sessions.
- URL fetch timeout (120 seconds) to prevent indefinite hangs on slow or unresponsive servers.
- URL download size validation (2 GB limit, matching file upload limit).
- User-friendly error messages for CORS failures and network errors during URL fetching.

#### Changed
- README: Added centered app icon, Vercel deployment badge, deployment instructions, corrected version references throughout.
- Service worker cache bumped to `resourcery-v2.2.0`.
- `fetchWithProgress` now catches network errors explicitly for clearer error reporting.
- URL fetch no longer double-reads the file (fetched data is written directly to FFmpeg filesystem instead of being re-read through `processFile`).

## [2.1.1] - 2026-02-18

### Upload/Conversion Reliability

#### Fixed
- FFmpeg bootstrap could stall around 20–30% because `ffmpeg-core.worker.js` was not explicitly resolved when loading from blob URLs; the worker script is now fetched and passed to `ffmpeg.load()` directly.
- Added timeout protection around FFmpeg engine loading so users get a clear recoverable error instead of an indefinite spinner.
- Improved local file ingestion progress using `FileReader` progress events to keep the upload progress bar moving during large file reads.
- Added richer FFmpeg bootstrap diagnostic logging (core URLs and online state) for easier production debugging.
- Service worker CDN list now includes `ffmpeg-core.worker.js` so offline/runtime caching aligns with runtime dependencies.

#### Added
- CI workflow (`.github/workflows/ci.yml`) to enforce JavaScript syntax and repository baseline checks on PRs and pushes to `main`.
- `.editorconfig` and `docs/MANIFEST.md` as repository baseline governance artifacts.

## [2.1.0] - 2026-02-09

### Mobile Layout & Code Quality

#### Added
- `js/version.js` - Centralized version configuration (single source of truth for all version numbers)
- Dynamic version injection into hero badge and settings footer via `APP_VERSION`
- iOS-safe `overflow-x: hidden` on `html` element to prevent horizontal scroll

#### Fixed
- **Font sizing**: Condensed reSOURCERY title (Outfit 700, 2.25rem) to prevent icon and version badge from being pushed off-screen on mobile
- **Cell overlap**: Reduced analysis item icon size (44px → 36px) and gap/padding on mobile to prevent content overflow in 2-column grid
- **Padding alignment**: Tightened format button, audio player, and metadata grid spacing for proper mobile containment
- **Z-index stacking**: Fixed noise texture overlay (z-index 1000 → 2) that sat above settings panel; reordered settings (300), toasts (400) for correct layering
- **Stacking context**: Added `isolation: isolate` to drop zone to fix `z-index: -1` pseudo-element rendering
- **Version inconsistency**: Hero badge showed "v2.0", settings footer showed "v1.0.0" — now both read from `APP_VERSION`
- **Worker memory leak**: `AudioProcessor.destroy()` now terminates the Web Worker and clears pending calls
- **Duplicate meta tag**: Removed second `apple-mobile-web-app-capable` meta element
- **Service worker**: Added `version.js` to cached assets, fixed CDN font list to include Outfit font family

#### Changed
- App logo: 72px → 56px on mobile, 72px on desktop (was 88px)
- Title font: weight 800 → 700, size 3rem → 2.25rem on mobile
- Version badge: smaller padding (4px 10px), font-size 0.7rem
- Brand row: `max-width: 100%` with padding to prevent horizontal overflow
- Metadata values: added `text-overflow: ellipsis` for long values
- Analysis items: responsive sizing — compact on mobile, full-size at 480px+
- Audio player: tighter gap on mobile, expands at 480px breakpoint
- Service worker cache bumped to `resourcery-v2.1.0`
- Removed hardcoded version strings from `app.js` and `audio-processor.js` file comments

## [2.0.0] - 2026-02-08

### Rebrand — Media Sourceror → reSOURCERY

#### Changed
- **Identity**: Full rebrand from "Media Sourceror" to "reSOURCERY" across all files
- **Logo**: New wizard + music note SVG icon (`reSOURCERY_optimized.svg`) replaces all previous icon assets
- **Color scheme**: Shifted from neutral charcoal/teal to wizard-derived indigo-cyan-slate palette
  - Primary accent: `#4dd8c8` / `#5ce6d6` (wizard's teal-cyan)
  - New indigo layer: `#4455aa` → `#7088dd` (wizard's blue outer glow)
  - Cooler slate backgrounds: `#050508`, `#08080c`, `#1e1e2a`
- **JavaScript**: Renamed `MediaSourcerorApp` → `ReSOURCERYApp`, updated localStorage keys
- **PWA**: Updated manifest identity, cache name (`resourcery-v2.0.0`), all icon references
- **Paths**: Converted all absolute paths to relative (`./`) for GitHub Pages deployment compatibility
- **Service worker**: Updated cached asset list to match current file structure
- **Documentation**: README, CHANGELOG, SECURITY all updated with new branding

#### Removed
- Deprecated icon files: `icon-512.svg`, `app-icon.svg`, `favicon.svg`
- Old teal/green accent colors (`#0891b2`, `#0d9488`, `#BBFF33`)

## [1.2.0] - 2026-02-02

### Bug Fixes
- **preserveSampleRate setting not used**: The UI setting for preserving original sample rate was saved to localStorage but never passed to AudioProcessor. Now correctly respects user preference for all sample rates.
- **Web Worker not integrated**: The `analysis-worker.js` was created but never instantiated. AudioProcessor now properly initializes and uses the Web Worker for non-blocking tempo and key detection.

### Changed
- `js/audio-processor.js` - Now accepts settings in constructor, implements Web Worker integration, preserves all sample rates when setting enabled
- `js/app.js` - Now passes settings to AudioProcessor on init and updates them when changed
- `sw.js` - Updated cache version to v1.2.0

### Technical Details
- AudioProcessor constructor now accepts `{ preserveSampleRate, useWebWorker }` options
- Added `updateSettings()` method to AudioProcessor for runtime setting changes
- Added `analyzeAudio()` method that delegates to Web Worker with main thread fallback
- Sample rates from 8kHz to 384kHz are now preserved when setting is enabled

## [1.1.0] - 2026-02-02

### Security Fixes
- **MS1-[critical]**: Fixed O(N²) performance bottleneck in tempo detection by implementing optimized FFT
- **MS2-[critical]**: Fixed O(N²) performance bottleneck in key detection by implementing optimized FFT

### Added
- `js/fft.js` - Optimized Cooley-Tukey FFT implementation with O(N log N) complexity
- `js/analysis-worker.js` - Web Worker for background audio analysis
- `FFTCache` class for reusing FFT instances across operations
- Pre-computed twiddle factors for improved FFT performance
- Hanning and Hamming window utility functions
- `SECURITY.md` - Security policy and vulnerability documentation
- `CHANGELOG.md` - Version history documentation

### Changed
- `js/tempo-detector.js` - Now uses optimized FFT instead of manual DFT
- `js/key-detector.js` - Now uses optimized FFT instead of manual DFT
- `sw.js` - Updated cache version to v1.1.0, added new files to cache
- `index.html` - Added fft.js script include

### Performance Improvements
- Tempo detection: ~50-100x faster for typical audio files
- Key detection: ~100-200x faster due to larger FFT size (8192 samples)
- Reduced main thread blocking during analysis
- Optional Web Worker support for completely non-blocking analysis

## [1.0.0] - 2026-02-02

### Added
- Initial release of reSOURCERY PWA
- Audio extraction from video/audio files using FFmpeg.wasm
- URL-based media fetching
- Drag and drop file upload
- Export to FLAC (lossless), WAV (24-bit), MP3 (320kbps), AAC (256kbps)
- Tempo (BPM) detection using onset detection and autocorrelation
- Musical key detection using chromagram analysis
- Camelot wheel notation for DJ mixing
- Waveform visualization
- Sample rate preservation (44.1kHz/48kHz)
- Mobile-first responsive design
- iOS PWA support with app icons and splash screens
- Glassmorphism UI with charcoal/turquoise theme
- Bebas Neue and Reddit Sans typography
- VASEY/AI branding
- Offline support via service worker
