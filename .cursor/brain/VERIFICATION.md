# Verification — when to run what (agents & humans)

**Goal:** match checks to the change. Do **not** run the full CI stack for every tiny edit.

Full reference: `.github/workflows/ci.yml`.

- **Default commit/push gate:** `npm run verify` (typecheck → lint → format → coverage → build → ensure-playwright → e2e). Husky **pre-push** runs this.
- **Stricter local CI:** `npm run ci:local` (adds audit + verify:pwa + web-vitals chunks + size:check + LHCI on top).

---

## Minimal check by task type

- **Docs only** (`*.md` in repo root / `README`, brain markdown) — `npm run format:check`
- **Styling only** (`*.css`, `*.scss`, `*.styled.*`) — `npm run format:check` + `npm run lint` (if CSS is in ESLint scope)
- **TS/TSX / tests** (logic, components, hooks, stores) — `npm run lint && npm run typecheck && npm test`
- **E2E / Playwright** (`e2e/**`, `playwright.config.ts`, routing/flows) — `npm run test:e2e:prod` (or `npm run build && PLAYWRIGHT_USE_PREVIEW=1 npm run test:e2e`; needs Chromium once)
- **Touches `src/env.ts`, `vite.config.ts`, `src/lib/vitals.ts`, `src/lib/webVitals/`** — Above + `npm run build && node scripts/check-web-vitals-chunks.mjs`
- **PWA** (`vite.config.ts → VitePWA`, `index.html` PWA meta, `public/icons/**`, `src/components/common/PwaUpdateToast/**`, `src/hooks/pwa/**`, `src/lib/pwa/**`) — `npm run lint && npm run typecheck && npm test && npm run build && npm run verify:pwa`
- **Perf budget** (any change that could move LCP/CLS/TBT — vendor chunks, fonts, route-loaded code, third-party deps) — `npm run build && npm run perf:ci` (Lighthouse vs `vite preview`; `lighthouserc.json`)
- **A11y** (`src/components/common/**`, `src/components/ui/**`, `src/pages/**` UI, `index.html` semantics) — Above + `npm run test:e2e:prod -- a11y.spec.ts` (axe scan)
- **Feature flag wiring** (`src/lib/features/**`, `src/hooks/features/**`, provider swap in `main.tsx`) — `npm run lint && npm run typecheck && npm test`
- **MSW** (`src/mocks/**`, `test/handlers.ts`, MSW wiring in `main.tsx`) — `npm run lint && npm run typecheck && npm test` (smoke dev manually if handlers changed)
- **Suspected bundle size / duplicate deps** — `npm run build:analyze` → open `dist/bundle-analysis.html` (do not commit HTML)
- **Regressions in standard vs attribution web-vitals chunks** — `npm run verify:web-vitals-chunks:full` (two full builds — use sparingly); bare `verify:web-vitals-chunks` = single-build assert on existing `dist/`
- **Vendor chunk byte budget** (touched `vite.config.ts` `codeSplitting.groups`, added a vendor dep, or heavier `build` output) — `npm run build && npm run size:check`
- **PWA Service Worker lifecycle** (`vite.config.ts → VitePWA`, `removeMswPlugin`, `workbox`, icons) — `npm run test:e2e:prod -- sw-lifecycle.spec.ts` (preview-mode only — dev disables PWA SW)

---

## Deterministic enforcement layers (added 2026-06-05; pre-push updated 2026-07)

Quality is enforced by **code, not advisory rules** — so a cheap model (Cursor Auto/Composer) can't skip it. Layers, earliest → latest:

1. **Session start** — Cursor `session-init.sh` + Claude `brain-loader.sh` inject this repo's brain pointers + SKELETONS danger-zones + a "read before editing" mandate into context (`~/.claude/hooks/brain-digest.sh`). Unskippable, unlike `/init`.
2. **On edit (Cursor)** — `auto-format.sh` (prettier) + `lint-surface.sh` (postToolUse) run `eslint --fix` and inject remaining errors back into context immediately.
3. **Pre-commit** (`.husky/pre-commit`) — `lint-staged` (oxlint → eslint → prettier) **blocks** on error; then `scripts/check-test-siblings.mjs` (TDD-gate) **blocks** committing a `src` logic file with no co-located `*.test.*`.
4. **Pre-push** — full **`npm run verify`** (typecheck → lint → format → coverage → build → ensure-playwright → e2e).
5. **CI** (`.github/workflows/ci.yml`) — full lint + `test:coverage` + build + e2e (audit + vitals chunk check; no verify:pwa / LHCI).

Rules added 2026-06-05: `@typescript-eslint/no-magic-numbers` (error; named consts in `src/lib/constants.ts`), `import-x/no-restricted-paths` (layer boundaries: `components/hocs/hooks/lib/store` ⇏ `pages`), `i18next/no-literal-string` (warn; hardcoded JSX strings → `t()`).

---

## Local gates (`verify` vs `ci:local`)

- **`npm run verify`** — commit/push gate: typecheck → oxlint → eslint → format → test:coverage → build → `ensure-playwright.mjs` → **`test:e2e:prod`**. Husky **pre-push** runs this.
- **`npm run ci:local`** — stricter superset: audit → same path through build → **`verify:pwa`** → **`verify:web-vitals-chunks`** → **`size:check`** → **`perf:ci`** (LHCI) → ensure-playwright → E2E. GitHub Actions skip `verify:pwa`, `size:check`, and Lighthouse — use `ci:local` when those matter. **`.github/workflows/security.yml`** (gitleaks, CodeQL) is separate.

**Do not** run `ci:local` as default for one-line fixes or copy-only brain edits.

---

## Do not run by default

- **`npm run verify:web-vitals-chunks:full`** — two production builds; only for vitals/env/chunk work
- **`npm run icons:placeholders`** — regenerates placeholder PWA icons; only after editing the generator (PNGs are committed)
- **`ANALYZE=true` / `build:analyze`** — heavy; only for bundle investigation
- **`npm ci`** — reinstalls deps; CI uses it on clean runners — locally when lockfile changes

---

## Brain / MAP sync

If you add new scripts or CI steps, update this file and `.cursor/brain/PROJECT_CONTEXT.md` → Dev Tooling. If entry points, routes, or `src/lib` layout change, align `.cursor/brain/MAP.md` (and `.cursor/brain/SKELETONS.md` if new hazard).
