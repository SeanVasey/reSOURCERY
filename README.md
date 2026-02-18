# reSOURCERY

> Premium audio extraction and analysis studio — Extract the magic from your media

[![Version](https://img.shields.io/badge/version-2.1.1-blue.svg)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Web%20%7C%20iOS%20%7C%20Android-lightgrey.svg)]()
[![PWA](https://img.shields.io/badge/PWA-enabled-blueviolet.svg)]()
[![iOS](https://img.shields.io/badge/iOS-primary-000000.svg?logo=apple&logoColor=white)]()
[![Security](https://img.shields.io/badge/security-fixes%20applied-brightgreen.svg)](SECURITY.md)
[![Mobile First](https://img.shields.io/badge/design-mobile%20first-orange.svg)]()
[![Status](https://img.shields.io/badge/status-active-success.svg)]()

reSOURCERY is a Progressive Web App (PWA) for extracting high-quality audio from multimedia sources. It runs entirely in the browser using WebAssembly-based audio processing — no server, no uploads, fully offline-capable.

## Features

### Audio Extraction
- Extract audio from video files (MP4, MOV, AVI, MKV, WEBM)
- Process audio files (MP3, WAV, M4A, FLAC, etc.)
- Fetch media directly from URLs
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

The included `server.py` serves the application on **port 50910** with proper CORS headers for cross-origin isolation.

**Test the server:**
```bash
curl -I http://127.0.0.1:50910/
```

> **Note**: Requires HTTPS or localhost for full PWA + Service Worker functionality.

## Architecture

```
reSOURCERY/
├── index.html              # Main PWA interface
├── manifest.json           # PWA manifest (standalone, portrait)
├── sw.js                   # Service worker (v2.1.0)
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
- No data is transmitted to external servers
- No persistent storage of media files
- CSP-ready architecture

## Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed version history.

| Version | Date       | Summary                                |
| ------- | ---------- | -------------------------------------- |
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
```

GitHub Actions runs the same checks on pull requests and pushes to `main` (see `.github/workflows/ci.yml`).

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
