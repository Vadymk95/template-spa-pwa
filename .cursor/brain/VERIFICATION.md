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
| **Regressions in standard vs attribution web-vitals chunks** | `npm run verify:web-vitals-chunks:full` (two full builds — use sparingly); bare `npm run verify:web-vitals-chunks` = single-build assert on existing `dist/` |
| **Vendor chunk byte budget** (touched `vite.config.ts` `codeSplitting.groups`, added a vendor dep, or `npm run build` output looks heavier) | `npm run build && npm run size:check` (reads `.size-limit.json` per-chunk brotli budgets) |
| **PWA Service Worker lifecycle** (`vite.config.ts → VitePWA`, `removeMswPlugin`, `workbox` config, `injectRegister`, manifest icons in `public/icons/`) | `npm run build && PLAYWRIGHT_USE_PREVIEW=1 npm run test:e2e -- sw-lifecycle.spec.ts` (verifies SW reg + manifest MIME + icons resolve; preview-mode only — dev disables PWA SW) |

---

## Deterministic enforcement layers (added 2026-06-05)

Quality is enforced by **code, not advisory rules** — so a cheap model (Cursor Auto/Composer) can't skip it. Layers, earliest → latest:

1. **Session start** — Cursor `session-init.sh` + Claude `brain-loader.sh` inject this repo's brain pointers + SKELETONS danger-zones + a "read before editing" mandate into context (`~/.claude/hooks/brain-digest.sh`). Unskippable, unlike `/init`.
2. **On edit (Cursor)** — `auto-format.sh` (prettier) + `lint-surface.sh` (postToolUse) run `eslint --fix` and inject remaining errors back into context immediately.
3. **Pre-commit** (`.husky/pre-commit`) — `lint-staged` (oxlint → eslint → prettier) **blocks** on error; then `scripts/check-test-siblings.mjs` (TDD-gate) **blocks** committing a `src` logic file with no co-located `*.test.*`.
4. **Pre-push** — `tsc -b` typecheck.
5. **CI** (`.github/workflows/ci.yml`) — full lint + `test:coverage` + build + e2e.

Rules added 2026-06-05: `@typescript-eslint/no-magic-numbers` (error; named consts in `src/lib/constants.ts`), `import-x/no-restricted-paths` (layer boundaries: `components/hocs/hooks/lib/store` ⇏ `pages`), `i18next/no-literal-string` (warn; hardcoded JSX strings → `t()`).

---

## Full local CI (`ci:local` vs GitHub)

Run **`npm run ci:local`** for the full pre-push gate. It **aligns** with `.github/workflows/ci.yml` (audit at moderate+ → typecheck through E2E) but is **stricter**: after `build` it runs **`npm run verify:pwa`**, **`npm run verify:web-vitals-chunks`**, **`npm run size:check`** (size-limit per-chunk brotli budgets from `.size-limit.json`), **`npm run perf:ci`** (Lighthouse-CI), then **`node scripts/ensure-playwright.mjs`**, then E2E with **`PLAYWRIGHT_USE_PREVIEW=1`** (the E2E suite includes `sw-lifecycle.spec.ts` which asserts SW registration + manifest MIME + icons). **GitHub Actions** (`ci.yml`) skip `verify:pwa`, `size:check`, and Lighthouse — use `ci:local` or add workflow steps when those gates matter. **`.github/workflows/security.yml`** (gitleaks, CodeQL) is separate and not invoked by `ci:local`. Exact order: `package.json` → `scripts.ci:local`. **Do not** run the full chain for one-line fixes or copy-only brain edits.

---

## Do not run by default

| Command | Why |
|---------|-----|
| `npm run verify:web-vitals-chunks:full` | Two production builds (default + attribution); only for vitals/env/chunk work — bare `verify:web-vitals-chunks` is the cheap single-build assert on `dist/` |
| `npm run icons:placeholders` | Regenerates the placeholder PWA icons; only run after editing the generator script. The output PNGs are committed |
| `ANALYZE=true` / `build:analyze` | Heavy; only for bundle investigation |
| `npm ci` | Reinstalls deps; CI uses it on clean runners — locally use when lockfile changes |

---

## Brain / MAP sync

If you add new scripts or CI steps, update this file and `.cursor/brain/PROJECT_CONTEXT.md` → Dev Tooling. If entry points, routes, or `src/lib` layout change, align `.cursor/brain/MAP.md` (and `.cursor/brain/SKELETONS.md` if new hazard).
