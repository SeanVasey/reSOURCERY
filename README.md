<p align="center">
  <img src="icons/reSOURCERY_optimized.svg" alt="reSOURCERY" width="128" height="128">
</p>

<h1 align="center">reSOURCERY</h1>

<p align="center">
  <em>Premium audio extraction and analysis studio — Extract the magic from your media</em>
</p>

<p align="center">
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/version-2.3.0-blue.svg" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-green.svg" alt="License"></a>
  <a href="https://github.com/SeanVasey/reSOURCERY/actions/workflows/ci.yml"><img src="https://github.com/SeanVasey/reSOURCERY/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/platform-Web%20%7C%20iOS%20%7C%20Android-lightgrey.svg" alt="Platform">
  <img src="https://img.shields.io/badge/PWA-enabled-blueviolet.svg" alt="PWA">
  <img src="https://img.shields.io/badge/iOS-primary-000000.svg?logo=apple&logoColor=white" alt="iOS">
  <a href="SECURITY.md"><img src="https://img.shields.io/badge/security-fixes%20applied-brightgreen.svg" alt="Security"></a>
  <img src="https://img.shields.io/badge/design-mobile%20first-orange.svg" alt="Mobile First">
  <img src="https://img.shields.io/badge/deploy-Vercel%20ready-black.svg?logo=vercel&logoColor=white" alt="Vercel">
  <img src="https://img.shields.io/badge/deploy-GitHub%20Pages-222.svg?logo=github&logoColor=white" alt="GitHub Pages">
  <img src="https://img.shields.io/badge/status-active-success.svg" alt="Status">
</p>

---

reSOURCERY is a Progressive Web App (PWA) for extracting high-quality audio from multimedia sources. It runs primarily in the browser using WebAssembly-based audio processing, with an optional hardened URL proxy endpoint for hosts that block direct browser fetches.

## Features

### Audio Extraction
- Extract audio from video files (MP4, MOV, AVI, MKV, WEBM)
- Process audio files (MP3, WAV, M4A, FLAC, etc.)
- Fetch media directly from URLs with progress tracking and secure proxy fallback for CORS-restricted hosts
- Drag & drop or click-to-browse file selection

### Export Formats (Highest Quality Only)
- **FLAC** — Lossless compression
- **WAV** — 24-bit PCM uncompressed
- **MP3** — 320 kbps CBR
- **AAC** — 256 kbps in M4A container

### Audio Analysis
- **Tempo Detection** — BPM estimation using onset detection and autocorrelation
- **Key Detection** — Musical key using Krumhansl-Schmuckler algorithm
- **Camelot Wheel** — DJ-friendly key notation
- **Waveform Visualization** — Real-time amplitude display

### Technical Features
- Sample rate preservation (8 kHz–384 kHz)
- Bit depth handling (16/24/32-bit)
- Optimized FFT processing (O(N log N) Cooley-Tukey)
- Web Worker support for non-blocking analysis
- Offline-capable PWA with network-first caching
- Centralized version management (`js/version.js`)
- Vercel deployment with COOP/COEP headers (`vercel.json`)

## Installation

### As PWA (Recommended)
1. Visit the hosted application in a modern browser
2. Click "Add to Home Screen" or install prompt
3. Launch from your device's home screen

### Local Development
```bash
# Clone the repository
git clone https://github.com/SeanVasey/reSOURCERY.git
cd reSOURCERY

# Option 1: Use the included server (recommended for development)
./start-server.sh
# or
python3 server.py

# Option 2: Use any static file server
npx serve .
# or
python -m http.server 8080
```

The included `server.py` serves the application on **port 50910** with proper CORS headers for cross-origin isolation and a local `/api/fetch` endpoint that mirrors Vercel proxy behavior for URL testing.

**Test the server:**
```bash
curl -I http://127.0.0.1:50910/
```

> **Note**: Requires HTTPS or localhost for full PWA + Service Worker functionality.

### Deployment

reSOURCERY is a static-first web app with a lightweight optional serverless API route (`/api/fetch`) for URL proxy fallback. No build step is needed.

#### Vercel (Recommended)

The project includes `vercel.json` pre-configured with:
- `Cross-Origin-Embedder-Policy: credentialless` — enables SharedArrayBuffer for FFmpeg.wasm
- `Cross-Origin-Opener-Policy: same-origin` — required for cross-origin isolation
- Cache headers for static assets (JS/CSS: 1 day + stale-while-revalidate, icons: 7 days)
- Service worker files (`sw.js`, `coi-serviceworker.js`) set to `no-cache` for instant updates
- SPA rewrite rules for client-side routing (excluding `/api/*` functions)

To deploy: connect the repository to Vercel and push to `main`. No framework or build command is needed.

#### GitHub Pages

A GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) is included for automatic deployment to GitHub Pages on pushes to `main`.

To enable:
1. Go to **Settings > Pages** in the repository
2. Under **Source**, select **GitHub Actions**
3. Push to `main` — the workflow will deploy automatically

> **Note**: GitHub Pages does not support custom response headers. Cross-origin isolation headers (COOP/COEP) are handled at runtime by `coi-serviceworker.js`, which intercepts fetch requests and injects the required headers. FFmpeg.wasm SharedArrayBuffer support works on GitHub Pages through this service worker approach.

#### Custom Static Host

For any static hosting provider, ensure these response headers are set:
| Header | Value | Purpose |
| --- | --- | --- |
| `Cross-Origin-Embedder-Policy` | `credentialless` | SharedArrayBuffer for FFmpeg.wasm |
| `Cross-Origin-Opener-Policy` | `same-origin` | Cross-origin isolation |
| `Service-Worker-Allowed` | `/` | Allow service worker scope |

If custom headers cannot be configured, `coi-serviceworker.js` provides a runtime fallback.

## Architecture

```
reSOURCERY/
├── index.html              # Main PWA interface
├── manifest.json           # PWA manifest (standalone, portrait)
├── vercel.json             # Vercel deployment headers, rewrites, and API support
├── api/
│   └── fetch.js            # Hardened URL proxy endpoint for CORS fallback
├── sw.js                   # Service worker (v2.3.0)
├── coi-serviceworker.js    # Cross-Origin Isolation for SharedArrayBuffer
├── css/
│   └── styles.css          # Dark slate + indigo/cyan wizard theme
├── js/
│   ├── version.js          # Centralized version config (APP_VERSION)
│   ├── app.js              # Main application (ReSOURCERYApp)
│   ├── audio-processor.js  # FFmpeg.wasm integration
│   ├── fft.js              # Optimized FFT (Cooley-Tukey)
│   ├── tempo-detector.js   # BPM detection
│   ├── key-detector.js     # Key detection (Krumhansl-Schmuckler)
│   └── analysis-worker.js  # Web Worker for background analysis
└── icons/
    └── reSOURCERY_optimized.svg  # Wizard logo + music note
```

## Security

See [SECURITY.md](SECURITY.md) for:
- Security policy and supported versions
- Fixed vulnerabilities (MS1, MS2)
- Reporting guidelines

### Security Fixes (v1.1.0)
- **MS1-[critical]**: Fixed O(N²) DFT in tempo detection → O(N log N) FFT
- **MS2-[critical]**: Fixed O(N²) DFT in key detection → O(N log N) FFT

### Privacy
- All processing runs client-side in the browser
- Uploaded files are processed locally in-browser; URL sources may be fetched through your deployment proxy when direct CORS access is blocked
- No persistent storage of media files
- CSP-ready architecture
- URL validation (HTTP/HTTPS only, protocol enforcement)

## Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed version history.

| Version | Date       | Summary                                |
| ------- | ---------- | -------------------------------------- |
| 2.3.0   | 2026-02-22 | Safe area insets for curved screens, GitHub Pages deployment, CI enhancements |
| 2.2.0   | 2026-02-21 | Fix audio upload/URL processing, Vercel deployment, security hardening |
| 2.1.2   | 2026-02-19 | Version config patch alignment         |
| 2.1.1   | 2026-02-18 | FFmpeg upload/initialization reliability fixes, CI baseline checks |
| 2.1.0   | 2026-02-09 | Mobile layout fixes, modular versioning, code cleanup |
| 2.0.0   | 2026-02-08 | Media Sourceror → reSOURCERY rebrand   |
| 1.2.0   | 2026-02-02 | Bug fixes (sample rate, Web Worker)    |
| 1.1.0   | 2026-02-02 | Critical FFT performance fixes         |
| 1.0.0   | 2026-02-02 | Initial release                        |

## Development Checks

Run these checks before committing:

```bash
# JavaScript syntax checks
node --check js/version.js
node --check js/fft.js
node --check js/tempo-detector.js
node --check js/key-detector.js
node --check js/analysis-worker.js
node --check js/audio-processor.js
node --check js/app.js
node --check sw.js

# Repository baseline checks
test -f README.md && test -f CHANGELOG.md && test -f LICENSE && \
test -f SECURITY.md && test -f index.html && test -f css/styles.css && \
test -f js/app.js && test -f js/audio-processor.js && echo "All checks passed"
```

### CI / CD

GitHub Actions runs these checks automatically:
- **CI** (`.github/workflows/ci.yml`) — syntax checks, baseline smoke checks, and version consistency validation on all PRs and pushes to `main`
- **Deploy** (`.github/workflows/deploy-pages.yml`) — deploys to GitHub Pages on pushes to `main`

## Technology Stack

| Technology       | Purpose                          |
| ---------------- | -------------------------------- |
| FFmpeg.wasm      | Browser-based media processing   |
| Web Audio API    | Audio decoding and analysis      |
| Web Workers      | Non-blocking background analysis |
| Service Workers  | Offline caching, PWA support     |
| Canvas API       | Waveform visualization           |
| Google Fonts     | Bebas Neue, Outfit, Reddit Sans  |

## Design

- **Theme**: Dark charcoal/monochrome with indigo-cyan wizard accents
- **Typography**: Outfit (display), Bebas Neue (headers), Reddit Sans (body)
- **Style**: Glassmorphism with metallic 3D textures
- **Layout**: Mobile-first, iOS-primary, responsive to 768px+
- **Accessibility**: Reduced motion support, 44px touch targets, dark mode enforced

## Branding

Created by **VASEY/AI**

Associated ventures:
- [Vasey Multimedia](https://seanvasey.link/)
- [VASEY.AUDIO](https://www.vasey.audio/)

## License

Apache License 2.0 — See [LICENSE](LICENSE) for details.

---

*reSOURCERY — Extract the magic from your media*
