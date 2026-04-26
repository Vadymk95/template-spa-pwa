# Verification — when to run what (agents & humans)

**Goal:** match checks to the change. Do **not** run the full CI stack for every tiny edit.

Full reference: `.github/workflows/ci.yml`. Stricter one-command pre-push: `npm run ci:local` (see section below).

---

## Minimal check by task type

| What you changed | Suggested commands |
|------------------|-------------------|
| **Docs only** (`*.md` in repo root / `README`, brain markdown) | `npm run format:check` |
| **Styling only** (`*.css`, `*.scss`, `*.styled.*`) | `npm run format:check` + `npm run lint` (if CSS is in ESLint scope) |
| **TS/TSX / tests** (logic, components, hooks, stores) | `npm run lint && npm run typecheck && npm test` |
| **E2E / Playwright** (`e2e/**`, `playwright.config.ts`, routing/flows) | `npm run build && PLAYWRIGHT_USE_PREVIEW=1 npm run test:e2e` (needs `npx playwright install chromium` once) |
| **Touches `src/env.ts`, `vite.config.ts`, `src/lib/vitals.ts`, `src/lib/webVitals/`** | Above + `npm run build && node scripts/check-web-vitals-chunks.mjs` |
| **PWA** (`vite.config.ts → VitePWA`, `index.html` PWA meta, `public/icons/**`, `src/components/common/PwaUpdateToast/**`, `src/hooks/pwa/**`, `src/lib/pwa/**`) | `npm run lint && npm run typecheck && npm test && npm run build && npm run verify:pwa` |
| **Perf budget** (any change that could move LCP/CLS/TBT — vendor chunks, fonts, route-loaded code, third-party deps) | `npm run build && npm run perf:ci` (runs Lighthouse against `vite preview`; reads `lighthouserc.json` assertions) |
| **A11y** (`src/components/common/**`, `src/components/ui/**`, `src/pages/**` UI, `index.html` semantics) | Above + `PLAYWRIGHT_USE_PREVIEW=1 npm run test:e2e -- a11y.spec.ts` (axe scan) |
| **Feature flag wiring** (`src/lib/features/**`, `src/hooks/features/**`, provider swap in `main.tsx`) | `npm run lint && npm run typecheck && npm test` |
| **MSW** (`src/mocks/**`, `test/handlers.ts`, MSW wiring in `main.tsx`) | `npm run lint && npm run typecheck && npm test` (smoke dev manually if handlers changed) |
| **Suspected bundle size / duplicate deps** | `npm run build:analyze` → open `dist/bundle-analysis.html` (do not commit HTML) |
| **Regressions in standard vs attribution web-vitals chunks** | `npm run verify:web-vitals-chunks` (two full builds — use sparingly) |

---

## Full local CI (`ci:local` vs GitHub)

Run **`npm run ci:local`** for the full pre-push gate. It **aligns** with `.github/workflows/ci.yml` (audit at moderate+ → typecheck through E2E) but is **stricter**: after `build` it runs **`npm run verify:pwa`**, **`npm run perf:ci`** (Lighthouse-CI), then **`node scripts/ensure-playwright.mjs`**, then E2E with **`PLAYWRIGHT_USE_PREVIEW=1`**. **GitHub Actions** (`ci.yml`) skip `verify:pwa` and Lighthouse — use `ci:local` or add workflow steps when those gates matter. **`.github/workflows/security.yml`** (gitleaks, CodeQL) is separate and not invoked by `ci:local`. Exact order: `package.json` → `scripts.ci:local`. **Do not** run the full chain for one-line fixes or copy-only brain edits.

---

## Do not run by default

| Command | Why |
|---------|-----|
| `npm run verify:web-vitals-chunks` | Two production builds; only for vitals/env/chunk work |
| `npm run icons:placeholders` | Regenerates the placeholder PWA icons; only run after editing the generator script. The output PNGs are committed |
| `ANALYZE=true` / `build:analyze` | Heavy; only for bundle investigation |
| `npm ci` | Reinstalls deps; CI uses it on clean runners — locally use when lockfile changes |

---

## Brain / MAP sync

If you add new scripts or CI steps, update this file and `.cursor/brain/PROJECT_CONTEXT.md` → Dev Tooling. If entry points, routes, or `src/lib` layout change, align `.cursor/brain/MAP.md` (and `.cursor/brain/SKELETONS.md` if new hazard).
