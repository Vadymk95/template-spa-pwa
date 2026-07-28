# Verification — when to run what (agents & humans)

**Goal:** match checks to the change. Do **not** run the full CI stack for every tiny edit.

- **The gate:** `npm run verify` — every **offline** check: typecheck → oxlint → eslint → format:check → test:coverage → build → **`verify:pwa`** → **`verify:web-vitals-chunks`** → **`size:check`** → `ensure-playwright` → **`test:e2e:prod`**.
- **`npm run verify:ci`** — `audit:gate && verify`. The audit gate needs the network, which is why it is not inside `verify`: an offline implementer can still run the complete offline gate. Husky **pre-push** runs this, and the CI `validate` job is a single step over the same script.
- **`npm run ci:local`** — `verify:ci` plus `perf:ci` (Lighthouse), which stays out of the gate on cost grounds.

**`verify` is a strict superset of the offline checks CI runs**, so a green `verify` predicts a green CI. The rule that keeps this true: **a new check goes into the script, never only into the workflow file.** `verify:pwa` and `size:check` previously lived only in `ci:local` and therefore ran in no pipeline at all.

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
3. **Pre-commit** (`.husky/pre-commit`) — `lint-staged` (oxlint → eslint → prettier) on the **staged** set; then `scripts/check-test-siblings.mjs` (TDD-gate) **blocks** committing a `src` logic file with no co-located `*.test.*`; then **repo-wide** `lint:oxlint` and `format:check`. The repo-wide pass exists because `lint-staged` restores the unstaged hunks of a partially staged file *after* fixing, so formatting drift used to survive the commit and fail at push — leaving files that were already fixed and never committed. Both repo-wide checks run even when the first fails, so one attempt reports everything.
4. **Pre-push** — **`npm run verify:ci`** (the audit gate plus the whole offline gate).
5. **CI** (`.github/workflows/ci.yml`) — a single `npm run verify:ci` step over the same script, plus the browser cache and artifact uploads. **`.github/workflows/security.yml`** runs gitleaks over full history and CodeQL `security-extended` in parallel; its exclusions live in `.github/codeql/codeql-config.yml` with the reason written down.

Rules added 2026-06-05: `@typescript-eslint/no-magic-numbers` (error; named consts in `src/lib/constants.ts`), `import-x/no-restricted-paths` (layer boundaries: `components/hocs/hooks/lib/store` ⇏ `pages`), `i18next/no-literal-string` (warn; hardcoded JSX strings → `t()`).

---

## Local gates (`verify` vs `ci:local`)

- **`npm run verify`** — the gate. Everything offline, listed at the top of this file.
- **`npm run verify:ci`** — `audit:gate && verify`. Pre-push and CI both run this.
- **`npm run ci:local`** — `verify:ci` + `perf:ci`. Lighthouse is the only check outside the gate.
- **`npm run bench:verify`** — the same steps with per-step timings, to attribute a slow gate.
- **`npm run fix`** — the one remedy: `oxlint --fix` → `eslint --fix` → `prettier --write`, repo-wide. Re-run `lint` and `format:check` afterwards to see the residual autofix could not handle; that residual needs a decision, not another `--fix`.

**Do not** run `ci:local` as default for one-line fixes or copy-only brain edits.

---

## Capturing results honestly

```bash
npm run verify > /tmp/verify.log 2>&1; echo $?
```

**Without a pipe.** Piping to `tail` returns the pipe's exit status, so a failed build reads as a pass. This has bitten this project's own tooling work.

Green also means nothing until you have seen the gate go red. When you add or change a check, break it once on purpose — an expired entry in `scripts/audit-allowlist.json`, a raw hex in a component, a staged `src` logic file with no test sibling — confirm it refuses, then revert the sabotage.

The TDD gate proves a test EXISTS, never that it is any good. If mentally reverting a change leaves the suite green, the test is worthless — see the mutation check in `.cursor/rules/agent-pipeline.mdc`.

Never resolve a finding by lowering a severity, adding an `eslint-disable`, moving a coverage threshold, or extending an ignore list. A rule that is genuinely wrong for a whole class of files gets a documented file-scoped override in `eslint.config.js`.

---

## Do not run by default

- **`npm run verify:web-vitals-chunks:full`** — two production builds; only for vitals/env/chunk work
- **`npm run icons:placeholders`** — regenerates placeholder PWA icons; only after editing the generator (PNGs are committed)
- **`ANALYZE=true` / `build:analyze`** — heavy; only for bundle investigation
- **`npm ci`** — reinstalls deps; CI uses it on clean runners — locally when lockfile changes

---

## Brain / MAP sync

If you add new scripts or CI steps, update this file and `.cursor/brain/PROJECT_CONTEXT.md` → Dev Tooling. If entry points, routes, or `src/lib` layout change, align `.cursor/brain/MAP.md` (and `.cursor/brain/SKELETONS.md` if new hazard).
