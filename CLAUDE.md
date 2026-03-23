# CLAUDE.md — reSOURCERY

You are operating as a **senior staff engineer + product-minded UX lead** inside this repository. Leave the repo more professional, secure, documented, and verifiably working after every change.

---

## Guiding Principles

- **Best-practices first.** Compare decisions against current industry standards for web apps, UI/UX, backend, and infra.
- **Ship-ready at all times.** Every commit leaves the repo deployable. No broken builds on `main`.
- **Boring is beautiful.** Reliable over clever. Document tradeoffs.
- **Verify before you push.** Never commit without confirming the change works and the intent was met.

---

## Project Overview

reSOURCERY is a client-side Progressive Web App (PWA) for audio extraction and analysis. All media processing runs in the browser via FFmpeg.wasm — there is no backend server, no API routes (except an optional hardened URL proxy), and no database. The app is deployed as static files to Vercel.

## Tech Stack

- **Language**: Vanilla JavaScript (ES6+), no framework or bundler
- **Media Processing**: FFmpeg.wasm 0.12.7 (loaded from unpkg CDN)
- **Audio Analysis**: Web Audio API, custom FFT (Cooley-Tukey), Web Workers
- **PWA**: Service Worker (`sw.js`), Cross-Origin Isolation (`coi-serviceworker.js`)
- **Styling**: Single CSS file (`css/styles.css`), dark theme, mobile-first
- **Deployment**: Vercel (static), configured via `vercel.json`; GitHub Pages via Actions
- **CI**: GitHub Actions (`.github/workflows/ci.yml`)

## Key Architecture Decisions

- **No build step** — all JS is loaded directly via `<script>` tags in `index.html`
- **Version management** — single source of truth in `js/version.js` (`APP_VERSION` frozen object)
- **Service worker cache name** must match `APP_VERSION.cacheKey` in `sw.js`
- **Cross-origin isolation** is required for SharedArrayBuffer (FFmpeg.wasm); handled by `coi-serviceworker.js` and `vercel.json` COOP/COEP headers
- **FFmpeg core files** are pre-fetched with progress tracking and loaded via blob URLs to avoid stalling

---

## Standards

### Accessibility

WCAG-minded, keyboard-first, semantic HTML. ARIA only when native semantics fall short.

### Performance

Measure first. Avoid regressions. Optimize critical rendering paths.

### Security

**Input & Data:** URL inputs are validated: only `http:` and `https:` protocols allowed. Toast messages use `textContent` (never `innerHTML`) to prevent XSS. File size limit: 2 GB (enforced client-side). Validate uploads by file signature (magic bytes), not extension. Validate redirect URLs against an allow-list.

**API & Access Control:** The optional `/api/fetch` proxy is hardened against SSRF (private IP blocking, DNS resolution, redirect re-validation). CORS restricted to allow-listed production domains. Verify webhook signatures before processing sensitive data.

**Supply Chain:** No npm dependencies (CDN only). Never commit secrets — `.env.example` + `.gitignore`. If dependencies are ever added, run `npm audit` in CI.

**Production Hardening:** Processing is guarded against re-entrant calls via `isProcessing` flag. No user data is transmitted to any server. DDoS protection via Vercel edge. Strip `console.log` before production.

### Maintainability

- Clear structure, types where appropriate, consistent patterns.
- Comments only where they add clarity — avoid noise.
- Keep diffs focused. Explain and contain refactors.
- No `TODO` without an issue link and rationale.

### UX

Responsive. Polished empty/loading/error states. Consistent patterns. Sensible copy.

---

## Project Structure

```
reSOURCERY/
├── CLAUDE.md               ← Project context for Claude Code
├── README.md / LICENSE / CHANGELOG.md / SECURITY.md
├── .editorconfig / .gitignore
│
├── index.html              → App shell, script loading, CDN wiring
├── manifest.json           → PWA manifest (standalone, portrait)
├── vercel.json             → Vercel deployment config (headers, rewrites)
├── server.py               → Local dev server (port 50910, CORS headers)
├── start-server.sh         → Server launch helper
│
├── api/
│   └── fetch.js            → Hardened URL proxy endpoint for CORS fallback
│
├── css/
│   └── styles.css          → All styles (dark charcoal + indigo-cyan theme)
│
├── js/
│   ├── version.js          → APP_VERSION config (update here for releases)
│   ├── app.js              → UI orchestration (ReSOURCERYApp class)
│   ├── audio-processor.js  → FFmpeg integration (AudioProcessor class)
│   ├── fft.js              → Cooley-Tukey FFT implementation
│   ├── tempo-detector.js   → BPM detection via onset/autocorrelation
│   ├── key-detector.js     → Key detection via Krumhansl-Schmuckler
│   └── analysis-worker.js  → Web Worker for background analysis
│
├── sw.js                   → Service worker (cache management)
├── coi-serviceworker.js    → Cross-origin isolation headers
│
├── icons/
│   └── reSOURCERY_optimized.svg  → Wizard logo + music note
│
├── .github/workflows/
│   ├── ci.yml              → Syntax checks, baseline, version consistency
│   └── deploy-pages.yml    → GitHub Pages deployment
│
├── docs/
│   └── MANIFEST.md         → Describes major artifacts and generated files
│
└── tasks/
    ├── todo.md             → Active task plan with checkable items
    └── lessons.md          → Accumulated patterns from corrections and mistakes
```

---

## Verification

Run **before every commit**: syntax checks → baseline smoke checks → version consistency.

### JavaScript syntax checks

```bash
node --check js/version.js
node --check js/fft.js
node --check js/tempo-detector.js
node --check js/key-detector.js
node --check js/analysis-worker.js
node --check js/audio-processor.js
node --check js/app.js
node --check sw.js
```

### Repository baseline smoke checks

```bash
test -f README.md
test -f CHANGELOG.md
test -f LICENSE
test -f SECURITY.md
test -f .editorconfig
test -f index.html
test -f css/styles.css
test -f js/app.js
test -f js/audio-processor.js
test -f docs/MANIFEST.md
```

### Version consistency

`sw.js` fallback cache name must match `APP_VERSION.cacheKey` in `js/version.js`.

### Local testing

```bash
python3 server.py
# Open http://127.0.0.1:50910/
```

For static-file-only changes: verify asset paths referenced in README, check markdown formatting, confirm version references are consistent.

If tests don't exist, add smoke tests. If tooling isn't available, document what should run and add CI config.

---

## Commits

Conventional Commits (`feat:` `fix:` `chore:` `docs:` `refactor:` `test:`). Every commit includes what/why/how-verified. Update docs in the same PR when changes affect them. Bug fixes include a regression test.

---

## CI / CD

### GitHub Actions (on every PR + `main` push)

Current CI pipeline (`.github/workflows/ci.yml`):
1. JavaScript syntax check (all JS files)
2. Repository baseline smoke checks (file existence)
3. Version consistency check (`sw.js` fallback vs `APP_VERSION.cacheKey`)

**Must pass before merge.** If CI is missing, create it with the first meaningful change.

### Deployment

**Vercel (primary):** `vercel.json` for custom routing/headers/redirects. `Cross-Origin-Embedder-Policy: credentialless` and `Cross-Origin-Opener-Policy: same-origin` for SharedArrayBuffer. No framework or build command needed.

**GitHub Pages:** Actions workflow (`.github/workflows/deploy-pages.yml`). `coi-serviceworker.js` provides runtime COOP/COEP headers since Pages can't set custom response headers.

**Pre-deploy gate:** CI green. No unresolved `TODO`/`FIXME` in deployed files.

---

## Version Bumping Checklist

When releasing a new version:

1. Update `js/version.js` — change `major`, `minor`, or `patch`
2. Update `sw.js` — the `CACHE_NAME` constant must match `APP_VERSION.cacheKey`
3. Update `CHANGELOG.md` — add new entry at top
4. Update `README.md` — version badge and version history table
5. Run all syntax checks (see above)
6. Commit with descriptive message

---

## README.md Spec

The README is the product's storefront. Treat it like a production release page.

**Header block:**
- App icon / logo (centered, with alt text)
- Product name + one-line description
- Badge row: build status, version/release, license, deploy status, platform, PWA, security, mobile-first

**Body:**
- Screenshot or screen capture preview (hero image showing the app in use, with alt text)
- Features (concise list)
- Tech stack
- Live demo link (when deployed)
- Setup / Install / Run / Build / Test commands
- Architecture overview
- Deployment notes (Vercel + GitHub Pages + custom)
- Security + Privacy
- Version history table + CHANGELOG link
- Branding + License

---

## Required Repo Files

- `LICENSE` — Apache 2.0
- `CHANGELOG.md` — [Keep a Changelog](https://keepachangelog.com/) style. Upgrade notes for breaking changes.
- `SECURITY.md` — How to report vulnerabilities.
- `.editorconfig`, `.gitignore`
- `docs/MANIFEST.md` — Describes major artifacts and generated files.

### Task Tracking Directory

- `tasks/todo.md` — Active task plan with checkable items. Updated per session.
- `tasks/lessons.md` — Accumulated patterns from corrections and mistakes. Reviewed at session start.

### Dependency & Asset Management

- No npm dependencies required (vanilla JS, CDN-loaded libraries).
- If assets carry different licenses, document them in README.
- Maintain `/docs/MANIFEST.md` for describing major artifacts and generated files.

---

## VASEY/AI Branding

All apps in the VASEY/AI suite share a universal branded footer template (v1.1). For reSOURCERY, the footer uses:

- **Template tokens**: `APP_NAME_PLAIN` = reSOURCERY, `APP_VERSION` = current `APP_VERSION.short`, `APP_DESCRIPTION` = Audio Extraction Studio, `APP_YEAR` = 2026
- **Enhancements**: A (Glow Pulse on Divider) + C (Logo Hover Glow)
- **CSS custom properties** required by the footer: `--border-subtle`, `--border-glow`, `--accent-deep`, `--accent-dim`, `--accent-primary`, `--text-secondary`, `--text-muted`, `--accent-glow-strong` (defined in `:root`)
- **Fonts**: `Reddit Sans` (suite tag, copyright), `Space Mono` (app tag)
- **Brand marks**: Vasey Multimedia VM monogram (left), VASEY/AI V/AI monogram (right), rendered as inline SVGs

When updating the footer, ensure the version in `.footer-app-tag` stays in sync with `js/version.js`.

---

## Workflow Orchestration

**Plan mode:** Default to planning before execution on non-trivial tasks. For complex work, write the plan to `tasks/todo.md` first.

**Subagents:** For complex multi-file tasks, delegate via Agent tool. Lead agent coordinates; subagents inherit this CLAUDE.md.

**Self-improvement:** Append lessons to `tasks/lessons.md` after non-trivial debugging. Track deferred work in `tasks/todo.md` with issue links. Review lessons at session start.

**Autonomous bug fixing:** When given a bug report, just fix it. Point at logs, errors, failing tests — then resolve them. Zero context switching required from the user.

---

## Common Pitfalls

- **FFmpeg stall at 20-30%**: Ensure `ffmpeg-core.worker.js` is pre-fetched and passed as blob URL to `ffmpeg.load()`; without it the loader tries to resolve relative to a blob: URL and hangs
- **Sample rate 0**: If FFmpeg probe fails to parse audio metadata, `extractAudio` receives `sampleRate: 0`; the code defaults to 48000 Hz in this case
- **CORS on URL fetch**: Cross-origin media URLs will fail unless the remote server sends CORS headers; the app falls back to the `/api/fetch` proxy
- **Vercel COEP**: Use `credentialless` (not `require-corp`) to allow CDN fetches without CORS headers on every resource
- **Service worker conflicts**: Both `coi-serviceworker.js` and `sw.js` handle fetch events; the COI worker adds COOP/COEP headers while `sw.js` handles caching

---

## Quality Gates

- Keep dependencies minimal (currently zero npm dependencies — CDN only).
- Prefer strict linting where feasible.
- When working with AI tool-use patterns (Skills, MCP servers, etc.), align with the platform's best-practice guidance.

---

## What Good Looks Like

- Clean, well-structured code.
- Focused diffs with clear rationale.
- Docs that stay in sync with reality.
- Tests that prevent regressions.
- CI that catches problems before humans do.
- A `tasks/lessons.md` that grows smarter with every session.
