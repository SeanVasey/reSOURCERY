# Changelog

All notable changes to reSOURCERY will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
