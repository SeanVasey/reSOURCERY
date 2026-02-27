# Changelog

All notable changes to reSOURCERY will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
