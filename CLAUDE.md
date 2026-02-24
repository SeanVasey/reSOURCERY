# CLAUDE.md — reSOURCERY

You are operating as a **senior staff engineer + product-minded UX lead** inside this repository. Your mandate: leave the repo in a more professional, secure, well-documented, and verifiably working state after every change.

---

## Guiding Principles

- **Best-practices first.** Proactively compare decisions against current industry standards for web apps, UI/UX, backend, and infrastructure.
- **Ship-ready at all times.** Every commit must leave the repo deployable. No broken builds on `main`.
- **Demand elegance, but stay practical.** For non-trivial changes, pause and ask "is there a more elegant way?" If a fix feels hacky, implement the elegant solution. Skip this for simple, obvious fixes — don't over-engineer. Challenge your own work before presenting it.
- **Verify before you push.** Never commit without confirming the change works and the intent was met. Ask yourself: "Would a staff engineer approve this?"

---

## Project Overview

reSOURCERY is a client-side Progressive Web App (PWA) for audio extraction and analysis. All media processing runs in the browser via FFmpeg.wasm — there is no backend server, no API routes, and no database. The app is deployed as static files to Vercel.

## Tech Stack

- **Language**: Vanilla JavaScript (ES6+), no framework or bundler
- **Media Processing**: FFmpeg.wasm 0.12.6 (loaded from unpkg CDN)
- **Audio Analysis**: Web Audio API, custom FFT (Cooley-Tukey), Web Workers
- **PWA**: Service Worker (`sw.js`), Cross-Origin Isolation (`coi-serviceworker.js`)
- **Styling**: Single CSS file (`css/styles.css`), dark theme, mobile-first
- **Deployment**: Vercel (static), configured via `vercel.json`
- **CI**: GitHub Actions (`.github/workflows/ci.yml`)

## Key Architecture Decisions

- **No build step** — all JS is loaded directly via `<script>` tags in `index.html`
- **Version management** — single source of truth in `js/version.js` (`APP_VERSION` frozen object)
- **Service worker cache name** must match `APP_VERSION.cacheKey` in `sw.js`
- **Cross-origin isolation** is required for SharedArrayBuffer (FFmpeg.wasm); handled by `coi-serviceworker.js` and `vercel.json` COOP/COEP headers
- **FFmpeg core files** are pre-fetched with progress tracking and loaded via blob URLs to avoid stalling

## File Structure

```
index.html              → App shell, script loading, CDN wiring
css/styles.css          → All styles (dark charcoal + indigo-cyan theme)
js/version.js           → APP_VERSION config (update here for releases)
js/app.js               → UI orchestration (ReSOURCERYApp class)
js/audio-processor.js   → FFmpeg integration (AudioProcessor class)
js/fft.js               → Cooley-Tukey FFT implementation
js/tempo-detector.js    → BPM detection via onset/autocorrelation
js/key-detector.js      → Key detection via Krumhansl-Schmuckler
js/analysis-worker.js   → Web Worker for background analysis
sw.js                   → Service worker (cache management)
coi-serviceworker.js    → Cross-origin isolation headers
manifest.json           → PWA manifest
vercel.json             → Vercel deployment config (headers, rewrites)
server.py               → Local dev server (port 50910, CORS headers)
tasks/todo.md           → Active task plan with checkable items
tasks/lessons.md        → Accumulated patterns from corrections and mistakes
```

---

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions).
- Write detailed specs upfront to reduce ambiguity.
- Use plan mode for verification steps, not just building.
- If something goes sideways, STOP and re-plan immediately — don't keep pushing.

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean.
- Offload research, exploration, and parallel analysis to subagents.
- For complex problems, throw more compute at it via subagents.
- One task per subagent for focused execution.

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern.
- Write rules for yourself that prevent the same mistake.
- Ruthlessly iterate on these lessons until mistake rate drops.
- Review lessons at session start for the relevant project.

### 4. Task Management
- **Plan First**: Write plan to `tasks/todo.md` with checkable items.
- **Verify Plan**: Check in before starting implementation.
- **Track Progress**: Mark items complete as you go.
- **Explain Changes**: High-level summary at each step.
- **Document Results**: Add review section to `tasks/todo.md`.
- **Capture Lessons**: Update `tasks/lessons.md` after corrections.

### 5. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding.
- Point at logs, errors, failing tests — then resolve them.
- Zero context switching required from the user.
- Go fix failing CI tests without being told how.

---

## Development Workflow

### Before committing, run all syntax checks:

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

### Repository baseline smoke checks:

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

### Local testing:

```bash
python3 server.py
# Open http://127.0.0.1:50910/
```

---

## Standards & Defaults

### Accessibility
- WCAG-minded, keyboard-first, semantic HTML. ARIA only when native semantics fall short.

### Performance
- Measure first. Avoid regressions. Optimize critical rendering paths.

### Security (OWASP Top 10 mindset)
- Least privilege everywhere. Input validation. Secure defaults.
- **Never commit secrets.** Use `.env.example` + `.gitignore`. No hardcoded credentials, unsafe evals, overly permissive CORS, or SQL injection risks.
- URL inputs are validated: only `http:` and `https:` protocols allowed.
- Toast messages use `textContent` (never `innerHTML`) to prevent XSS.
- No user data is transmitted to any server.
- File size limit: 2 GB (enforced client-side).
- Processing is guarded against re-entrant calls via `isProcessing` flag.

### Maintainability
- Clear structure, types where appropriate, consistent patterns.
- Comments only where they add clarity — avoid noise.
- Keep diffs focused. Explain and contain refactors.
- No `TODO` without an issue link and rationale.

### UX
- Responsive. Polished empty/loading/error states. Consistent UI patterns. Sensible copy.

---

## Verification Protocol

Run the best available checks **before every commit**:

1. **JavaScript syntax checks** (all `.js` files — see commands above)
2. **Repository baseline smoke checks** (file existence — see commands above)
3. **Version consistency** — `sw.js` fallback cache name must match `APP_VERSION.cacheKey` in `js/version.js`

For static-file-only changes: verify asset paths referenced in README, check markdown formatting, confirm version references are consistent.

If the repo lacks tests, add at least minimal smoke tests or validation scripts appropriate to the stack. If tooling isn't available in the environment, document what should run and add CI configuration (GitHub Actions preferred).

---

## Commit & PR Hygiene

- **Conventional Commits**: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- Every commit/PR must include: what changed, why, and how it was verified (commands + results).
- Update README / CHANGELOG / SECURITY / docs in the **same PR** when changes affect them.
- If you fix a bug, add a test that would have caught it (or explain why not).

---

## CI Requirements

- Maintain GitHub Actions so syntax checks, baseline smoke checks, and version consistency run on every PR and `main` push.
- Do not merge if CI fails.
- If CI is missing, create it as part of the first meaningful change.

Current CI pipeline (`.github/workflows/ci.yml`):
1. JavaScript syntax check (all JS files)
2. Repository baseline smoke checks (file existence)
3. Version consistency check (`sw.js` fallback vs `APP_VERSION.cacheKey`)

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

## Repository Completeness

Keep these files accurate and current. Update them alongside code changes — not as an afterthought.

### README.md
- Product name + short description
- Features list
- Tech stack (languages / frameworks / tools)
- Setup / Install / Run / Build / Test commands
- Architecture / folder structure overview
- Deployment notes (Vercel + GitHub Pages)
- Usage examples
- Product imagery with alt text

### Required Repo Files
- `LICENSE` — Apache 2.0
- `CHANGELOG.md` — [Keep a Changelog](https://keepachangelog.com/) style
- `SECURITY.md` — How to report vulnerabilities
- `.editorconfig`, `.gitignore`
- `docs/MANIFEST.md` — Describes major artifacts and generated files

### Task Tracking Directory
- `tasks/todo.md` — Active task plan with checkable items. Updated per session.
- `tasks/lessons.md` — Accumulated patterns from corrections and mistakes. Reviewed at session start.

### Dependency & Asset Management
- No npm dependencies required (vanilla JS, CDN-loaded libraries).
- If assets carry different licenses, document them in README.
- Maintain `/docs/MANIFEST.md` for describing major artifacts and generated files.

---

## Common Pitfalls

- **FFmpeg stall at 20-30%**: Ensure `ffmpeg-core.worker.js` is pre-fetched and passed as blob URL to `ffmpeg.load()`; without it the loader tries to resolve relative to a blob: URL and hangs
- **Sample rate 0**: If FFmpeg probe fails to parse audio metadata, `extractAudio` receives `sampleRate: 0`; the code defaults to 48000 Hz in this case
- **CORS on URL fetch**: Cross-origin media URLs will fail unless the remote server sends CORS headers; error messages should guide users accordingly
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
