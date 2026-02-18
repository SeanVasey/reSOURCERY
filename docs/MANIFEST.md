# Repository Manifest

## Product Files
- `index.html`: Application shell and script/style wiring.
- `css/styles.css`: Theme, layout, and responsive styling.
- `js/app.js`: UI orchestration and upload/processing state machine.
- `js/audio-processor.js`: FFmpeg.wasm integration, extraction, conversion, and analysis orchestration.
- `js/analysis-worker.js`: Background tempo/key analysis worker.
- `js/tempo-detector.js` / `js/key-detector.js` / `js/fft.js`: Audio analysis algorithms.

## PWA and Runtime
- `manifest.json`: Web app manifest.
- `sw.js`: Service worker cache/runtime logic.
- `coi-serviceworker.js`: Cross-origin isolation support.

## Documentation and Governance
- `README.md`: Product overview, usage, and development instructions.
- `CHANGELOG.md`: Versioned release notes.
- `SECURITY.md`: Vulnerability disclosure process.
- `LICENSE`: Project license.
