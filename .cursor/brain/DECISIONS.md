# Architectural Decisions

## [2026-05] Magic strings → constants (Zustand keys + TanStack Query factory + PWA session keys)

**Decision**: extract magic strings used in 2+ places OR carrying external contract to named constants. Apply selectively. NOT blanket extraction.

**Extraction sites added this commit**:
- `src/store/keys.ts` — STORAGE_KEYS (Zustand persist localStorage), DEVTOOLS_NAMES + per-store ACTION constants
- `src/lib/queryKeys.ts` — TanStack Query key factory (Dorfmeister pattern)
- `src/lib/pwa/keys.ts` — PWA_SESSION_KEYS (e.g. SW update toast dismiss key) — PWA cache survives deploys, renaming session key without migration = silent UX regression for existing users

**Pattern**: `as const` objects, NOT `enum`. Type via `typeof OBJ[keyof typeof OBJ]`.

**PWA-specific rationale**: SW + cache survival across deploys means localStorage/sessionStorage rename = silent breakage. Constants enforce single-source rename across all reads/writes.

**When NOT to extract**: single-use logger tags, test selectors, self-documenting at use site, i18n keys, prototype scope.

**Revisit trigger**: if consumer fork adds >3 stores or >5 query keys without factories, drop seed pattern.

## [2026-05] Boundary validation via Zod safeFetch wrapper (PWA-aware)

**Decision**: validate ALL API responses at boundary using Zod schemas via `src/lib/api/safeFetch.ts`. Reference example: `src/lib/api/greeting.queries.ts`. Pattern adopted as template seed because PWA cache survival creates structural drift risk (see Why below).

**Why (PWA-specific)**: Workbox precache + runtime cache survive deploys. After BE schema change, old cached response keeps serving from cache until invalidation — application code expects new shape, gets old. `safeFetch` parses on every read = early detection. Standard SPA Zod-boundary pattern PLUS this Workbox-cache-survival use case = template ships pattern by default (not just doc reference).

**Scope**:
- TanStack Query `queryFn` → `safeFetchQueryFn(url, schema)`
- Direct fetch → `safeFetch(url, schema)`
- Workbox cache hit (handled transparently — same `safeFetch` runs on cache reads)
- localStorage reads → `Schema.safeParse(JSON.parse(raw))`

**Trade-offs**:
- +0 KB bundle (Zod already in deps)
- ~50-200μs parse per response (negligible)
- Schemas duplicate BE types

**Pairs with**: `src/lib/devGuards.ts installDevGuards()` (dev-only AbortError suppression). `safeFetchQueryFn` re-throws AbortError unchanged so TanStack Query handles cancellation correctly.

**Revisit trigger**: if consumer fork removes safeFetch pattern from 3+ endpoints in same fork = signal pattern doesn't fit their context, drop from template seed.

## [2026-05] `size-limit` per-chunk brotli budget — `ci:local` gate

**Decision**: add `size-limit@^12.1.0` + `@size-limit/preset-app@^12.1.0` devDeps + `npm run size:check` script + `.size-limit.json` config with per-chunk brotli budgets. Wired into `ci:local` AFTER `verify:web-vitals-chunks` and BEFORE `perf:ci` (LHCI) — size-limit asserts byte budgets first, LHCI asserts runtime perf. Per /consilium 2026-05-23 APPLY Item 6 (5/6 YES, 1 COND satisfied via pre-flight overlap check).

**Why**: `scripts/check-web-vitals-chunks.mjs` asserts chunk *composition* (subscribeStandard vs subscribeAttribution), NOT chunk *size*. `lighthouserc.json` `total-byte-weight` is total page weight (warn-only ≤800 KB), NOT per-chunk. `chunkSizeWarningLimit: 600` (KB raw) in `vite.config.ts` is Vite *warning*, not CI fail. No per-vendor-chunk byte-budget gate currently exists. `size-limit` 868K weekly DLs ~10× over `bundlesize` (May 2026 npm registry direct).

**Initial budgets (brotli)** — matched to template-1 for symmetry; recalibrate per fork. PWA-specific: SW (`dist/sw.js`) and workbox runtime (`dist/workbox-*.js`) NOT budgeted — vite-plugin-pwa owns their size; budget would brittlely chase workbox patch bumps.

- `react-vendor`: 90 KB
- `i18n-vendor`: 22 KB
- `state-vendor`: 15 KB
- `ui-vendor`: 12 KB
- `index` entry: 25 KB

**Conditions** (Pragma + Mini /consilium): budgets in standalone `.size-limit.json` (not `package.json` `"size-limit"` key) for diff isolation. Pre-flight verified zero overlap with `verify:web-vitals-chunks.mjs` (different verification axis).

**Revisit trigger (60-day, 2026-07-23)**: if a fork hits ≥3 false-positive budget bumps from legitimate feature work in 60 days, recalibrate to p75 of fork distribution OR move size-limit to PR-comment-only.

## [2026-05] Playwright SW lifecycle E2E (minimal subset)

**Decision**: add `e2e/sw-lifecycle.spec.ts` with 3 assertions — (a) SW registers and reaches `activated` state, (b) `/manifest.webmanifest` returns 200 with `application/manifest+json` or `application/json` MIME + valid shape, (c) icons (`192x192`, `512x512`, `apple-touch-icon`) return 200 + `image/png`. Per /consilium 2026-05-23 APPLY Item 9 (5/6 YES, 1 COND mitigated via minimal subset). **Skipped in dev mode** (`PLAYWRIGHT_USE_PREVIEW=1` required — vite-plugin-pwa `devOptions.enabled: false`).

**Why**: PWA template's load-bearing primitive is the SW. Zero SW-aware E2E assertions currently exist in `e2e/{a11y,routes,smoke}.spec.ts`. SW registration failure is the #1 PWA support cost class; manifest MIME drift and icon 404 are recurring deploy-host bugs.

**Deferred until observed regression** (Adversarial 6-month bet on Playwright SW flakiness, [microsoft/playwright#32230](https://github.com/microsoft/playwright/issues/32230)):

- `vite:preloadError` recovery flow simulated via stale-chunk SW mock.
- Update-toast `'prompt'` mode flow (deploy new SW → `needRefresh` fires → toast → user click → `updateServiceWorker(true)` → reload).

**Revisit trigger (60-day, 2026-07-23)**: if a fork experiences SW lifecycle regression that the minimal-subset would have missed (preloadError class, update-toast class), promote deferred tests with explicit flakiness mitigation (`expect.poll` + extended timeout + retry quirk).

## [2026-05] REJECT list — explicit non-adoption (2026-05-23 /consilium)

**Decision**: explicit DO-NOT-ADOPT register so future agents + forks don't re-litigate. Per /consilium 2026-05-23 APPLY Item 14 (6/6 voters YES). Sibling templates carry equivalent sections.

### React Compiler enable in template-spa-pwa (VETOED)

**Status**: skip. **Why**: /consilium 2026-05-23 Item 4 (`babel-plugin-react-compiler@1.0.0` + `@rolldown/plugin-babel`) — 1 YES / 3 NO / 1 COND / 1 NO + **Adversarial killer Q VETO** ("Name one Compiler-enabled production app at >100K MAU where #35105 or #35644 reproducers have been ruled out as of 2026-05-23" — unanswerable) + Ergo "wrong tool for the observed surface" (PWA bottleneck is SW + 3-layer MSW×Workbox, NOT render thrash) + Vite team Mar 2026 blog warning Babel-in-Vite eliminates Oxc gains. Open silent-bailout bugs: [facebook/react#35105](https://github.com/facebook/react/issues/35105), [#35644](https://github.com/facebook/react/issues/35644).
**Revisit (quarterly, 2026-08-23)**: same trigger as sibling template-1 — both bugs closed + named >100K-MAU Compiler-enabled Vite app ruling-out retro + Vite team blesses Babel-Compiler-Vite path. `eslint-plugin-react-hooks@7.1.1` already loaded in `eslint.config.js` — Compiler correctness rules already fire as lint-only signal.

### LHCI bump `numberOfRuns: 1 → 3` + multi-route + mobile preset (REJECTED on cost cascade)

**Status**: skip. **Why**: /consilium 2026-05-23 Item 8 — 3 YES / 3 NO (Mini+Ergo+Econ trifecta). Econ math: 4 URLs × 3 runs × 2 form factors = 24 Lighthouse runs × ~30-60s = 12-24 min per `ci:local` (vs current 30-60s). Ergo: "tripling Lighthouse time in already-long `ci:local` makes the gate skip-tempt, which destroys all gate value." Note: web.dev officially says single-run assertions are flaky AND default `numberOfRuns: 3` median is correct — but nodejs.org production also uses `numberOfRuns: 1` (outlier). Cost cascade wins over theoretical correctness for solo-author forkable template context.
**Revisit (60-day, 2026-07-23)**: if `ci:local` becomes mandatory pre-push gate AND consumer fork observes perf regression that 1-run missed in 30 days, re-evaluate scoped to 3 runs × 1 URL × desktop only (no mobile, no multi-route).

### React Doctor `lint-staged --staged --fail-on warning` PR-gate (REJECTED)

**Status**: skip. **Why**: /consilium 2026-05-23 Item 1 — 0 YES / 4 NO / 2 COND. Pragma+Mini gang-of-two NO + Ergo category error + Adversarial flagged [typicode/husky#1462](https://github.com/typicode/husky/issues/1462) Windows-path issues.
**Revisit (60-day, 2026-07-23)**: same as sibling templates — React Doctor 1.0 ship + dated bug Doctor would have caught.

### memlab (Meta heap-snapshot leak detector)

**Status**: skip by default. **Why**: 158K weekly DLs (May 2026), ZERO published GitHub releases, 0 of 8 React Doctor leaderboard flagship repos use in CI.
**Revisit (90-day, 2026-08-23)**: memlab v2.0+ formal releases + ≥1 named React app at >10K MAU memlab-CI case study.

### why-did-you-render (WDYR)

**Status**: skip as template default; consumer choice. **Why**: WDYR README declares "completely incompatible with React Compiler" — template-spa-pwa doesn't ship Compiler, so WDYR is technically usable. Template stays minimal; consumer adds for re-render audit if needed.
**Revisit (no trigger needed)**: consumer-choice category.

### `react-native-flipper`

**Status**: not applicable (template-spa-pwa is web SPA, not RN). Sunset since RN 0.74.

### Zstd compression plugin

**Status**: skip. **Why**: Safari Zstd landed 26.3 Feb 11, 2026 ([WebKit blog](https://webkit.org/blog/17798/webkit-features-for-safari-26-3/)), caniuse global compat 45/100 — pre-26.3 long-tail huge. Existing `vite-plugin-compression@brotliCompress` covers requirement. PWA precache already brotli-compressed; service worker fetches benefit from Brotli too.
**Revisit (no trigger needed)**: revisit only when caniuse Zstd global crosses 80/100 AND PWA spec gains Zstd-encoding hint.

### `vite-plugin-bundlesize`

**Status**: skip (use `size-limit` instead per Item 6). **Why**: `size-limit@^12.1.0` adopted with broader ecosystem adoption.

## [2026-04] ESLint 9 hold (NOT bumping to 10)

**Decision**: stay on `eslint@^9.x` + `@eslint/js@^9.x` until plugin peer ranges catch up to ESLint 10.

**Snapshot (2026-05-22)**: ESLint 10.0.0 shipped 2026-02-09; latest 10.4.0 shipped 2026-05-15. ESLint 9.x EOL is 2026-08-06 (`maintenance` dist-tag currently `9.39.4`). Two plugins still cap their `eslint` peer below `^10`:

- `eslint-plugin-jsx-a11y@6.10.2` — peer `^3 || ... || ^9` (no `^10`). Last published 2024-10-26. PR #1081 awaiting `ljharb` review since Mar 2026.
- `eslint-plugin-react@7.37.5` — peer `^3 || ... || ^9.7` (no `^10`). Last published 2025-04-03. PR #3979 blocked transitively by `import-js/eslint-plugin-import#3230`. Note: ESLint 10 removed `context.getFilename()` + `sourceCode.isSpaceBetweenTokens` + `sourceCode.getAllComments` + RuleTester `type` field — `eslint-plugin-react@7.x` calls these at runtime (crash, not warning).

`typescript-eslint@8.59`, `eslint-plugin-import-x@4.16`, `eslint-plugin-react-hooks@7.1`, `eslint-plugin-react-refresh@0.5`, `eslint-plugin-prettier@5.5`, `eslint-plugin-oxlint@1.63+` — all declare ESLint 10 support already. Holding back on the two laggers prevents `--legacy-peer-deps` lying to npm about resolution AND prevents runtime crashes from removed-API calls.

**Revisit when**: monthly review starting 2026-07-01 (1-month buffer pre-9.x-EOL 2026-08-06). Either (a) `eslint-plugin-react` ships a release widening peer to include `^10`, OR (b) `eslint-plugin-jsx-a11y@7.x` ships, OR (c) we adopt community forks (see Plan B below).

**Plan B — community forks** (if upstream still blocked by 2026-07-01):

- Replace `eslint-plugin-react` → `@eslint-react/eslint-plugin@5.8.4+` — peer `eslint: ^10.3.0`, requires Node ≥22, NOT drop-in (rule names differ — config rewrite ~3-5h).
- Replace `eslint-plugin-jsx-a11y` → `eslint-plugin-jsx-a11y-x@0.2.0+` (es-tooling org) — peer `^9 || ^10`, drop-in (same rule names).

**Quick checks** before flipping:

```bash
npm view eslint-plugin-react peerDependencies | grep eslint
npm view eslint-plugin-jsx-a11y peerDependencies | grep eslint
npm view @eslint-react/eslint-plugin dist-tags
npm view eslint-plugin-jsx-a11y-x dist-tags
```

**Roll-forward recipe** when official peers update:

```bash
npm install --save-dev eslint@^10 @eslint/js@^10
npm run lint && npm run lint:oxlint  # both must pass
```

---

## [2026-04] `ci:local` stricter than GitHub Actions

**Decision**: `npm run ci:local` runs **`verify:pwa`**, **`perf:ci`** (Lighthouse-CI against the production preview build), **`scripts/ensure-playwright.mjs`**, and sets **`PLAYWRIGHT_USE_PREVIEW=1`** for E2E, on top of the same audit → typecheck → lint → coverage → build → **`verify:web-vitals-chunks`** → E2E path as `.github/workflows/ci.yml`. The workflow file does **not** invoke `verify:pwa` or Lighthouse (PWA + perf budgets are validated locally and in `ci:local` until/unless matching workflow steps are added).

**Why**: Keeps default GitHub CI lean (minutes, browser install) while one pre-push command still catches PWA `dist/` regressions, Web Vitals bundle split, Lighthouse assertions, and preview-mode E2E. `ensure-playwright` skips install when Chromium is already cached.

---

## [2026-04] Security workflow separate from build CI

**Decision**: `.github/workflows/security.yml` runs **gitleaks** and **CodeQL** (JavaScript/TypeScript, `security-extended`) on PR/push to `master` plus a weekly schedule. It does not duplicate or replace `ci.yml` validation.

**Why**: Supply-chain and secret scanning are policy-heavy; keeping them in a dedicated workflow avoids coupling slow security jobs to every `ci.yml` run while still gating merges and catching drift on a schedule.

---

## [2026-04] MSW browser worker — `src/mocks/browser.ts` + dev opt-out

**Decision**: DEV-only MSW uses `setupWorker` in `src/mocks/browser.ts` (handlers shared with Vitest via `test/handlers`). `main.tsx` starts the worker when `import.meta.env.DEV` and `import.meta.env.VITE_ENABLE_MSW !== 'false'` (opt-out; default-on in dev).

**Why**: Keeps the worker setup out of the root file, reuses one handler list for Node and browser, and allows turning mocks off without removing code.

---

## [2026-04] Verification guide (`.cursor/brain/VERIFICATION.md`) + `ci:local`

**Decision**: `.cursor/brain/VERIFICATION.md` defines minimal checks per task type; `npm run ci:local` extends `.github/workflows/ci.yml` with extra gates (see `ci:local` ADR above). Agents should read it and avoid running audit/build/vitals-analyze for every trivial edit.

**Why**: Reduces noise, latency, and false “full audit” habits while keeping a single command for full local CI confidence.

---

## [2026-07] Playwright e2e inside `verify` + pre-push

**Decision**: append build + `ensure-playwright.mjs` + `test:e2e:prod` (`PLAYWRIGHT_USE_PREVIEW=1`) to `npm run verify`, and point `.husky/pre-push` at full `npm run verify` (was typecheck-only). `ci:local` remains the stricter audit / PWA / size / LHCI superset.

**Why**: Catch preview-mode e2e (incl. SW lifecycle) before CI; typecheck-only pre-push left runtime gaps.

**Trade-off**: pre-push is slower. Accepted so e2e cannot be skipped by habit.

---

## [2026-04] i18n init failure — English-only fallback

**Decision**: If `i18nInitPromise` rejects, `main.tsx` removes `html.i18n-loading`, logs via `logger.error('[i18n] …')`, and renders `I18nInitErrorFallback` (fixed English; `t()` is not available).

**Why**: Previously the app could stay on an empty tree forever when locale JSON failed to load. User-facing copy cannot use i18n in this branch.

---

## [2026-04] Web Vitals chunk split — automated check

**Decision**: `scripts/check-web-vitals-chunks.mjs` asserts `dist/assets` after build: default bundle must contain only `subscribeStandard` + standard `web-vitals` chunk; optional `npm run verify:web-vitals-chunks` runs two builds and asserts the attribution variant too.

**Why**: Branching on `env` from `@/env` pulled both dynamic imports into the graph; `import.meta.env.VITE_WEB_VITALS_ATTRIBUTION` is required for dead-code elimination. The script catches regressions without manual bundle inspection.

---

## [2026-03] Tailwind v4 migration

**Decision**: Migrated from Tailwind v3 (config in `tailwind.config.ts`) to Tailwind v4 (config in `src/index.css`).

**Why**: v4 uses a Vite-native plugin (`@tailwindcss/vite`) which is faster and eliminates PostCSS as a build dependency. CSS-based config (`@theme inline`) is more collocated with actual styles.

**Trade-offs**: The `container` utility no longer has a JS-configurable `center`/`padding` option — apply utilities directly. `tailwindcss-animate` replaced by `tw-animate-css` (CSS import, no PostCSS plugin).

---

## [2026-03] Vite 8 with built-in Rolldown

**Decision**: Use the official **`vite@^8`** package. Removed `npm:rolldown-vite` alias and `overrides`.

**Why**: Vite 8 ships Rolldown as the unified bundler ([announcement](https://vite.dev/blog/announcing-vite8)); the separate `rolldown-vite` preview is superseded. Aligns with ecosystem (e.g. `@vitejs/plugin-react` v6, Vitest 4.1 vite peer).

**Config**: `build.rolldownOptions.output.codeSplitting.groups` replaces Rollup `manualChunks` for vendor chunks.

---

## [2026-04] ESLint 9 (not 10) — intentional hold

**Decision**: Holding on ESLint **9.x**. Not upgrading to ESLint **10** yet.

**Why**: `eslint-plugin-react` **7.x** uses `context.getFilename()` which was **removed in ESLint 10**. Runtime crash, not a peer-dep warning. No v8 of the plugin exists. Revisit when `eslint-plugin-react` releases ESLint 10 support.

---

## [2026-04] eslint-import-resolver-typescript — single solution `tsconfig`

**Decision**: `createTypeScriptImportResolver` uses **`./tsconfig.json`** only (solution file with `references`), not an array of `tsconfig.*.json`.

**Why**: The resolver warns when multiple `project` entries are passed; its README recommends one config with project references. With a single file it sets `references: 'auto'` and follows `tsconfig.app` / `tsconfig.node` / `tsconfig.vitest` like `tsc -b`.

---

## [2026-04] TypeScript 6 — upgraded

**Decision**: Running **TypeScript 6.0.x** (`~6.0.3`).

**Why**: `typescript-eslint` 8.58.1+ supports TypeScript 6 (peer relaxed to `<6.1.0`). One breaking change affected our config: `baseUrl` is deprecated in TS6. Fixed by removing `"baseUrl"` from both `tsconfig.json` and `tsconfig.app.json` — `paths` works without it in TS6.

---

## [2026-04] Component pattern: arrow function + FunctionComponent

**Decision**: All React components use `const X: FunctionComponent<Props> = () => {}`. No `FC`, no function declarations for components.

**Why**: `FC` is an alias (`type FC<P> = FunctionComponent<P>`) — writing `FunctionComponent` makes the type relationship explicit. Arrow functions are consistent with hooks/utilities style. ESLint enforces both: `no-restricted-imports` bans `FC`, `func-style: expression` bans function declarations (exception: `src/components/ui/` which is shadcn-generated).

---

## [2026-03] @vitejs/plugin-react v6

**Decision**: `@vitejs/plugin-react@^6` with Vite 8 (Oxc-based refresh; Babel not required for default setup).

**Why**: v6 matches Vite 8 peer range. React Compiler, if needed later, uses `reactCompilerPreset` + `@rolldown/plugin-babel` per plugin docs.

---

## [2026-03] No FSD architecture in this template

**Decision**: Using simple folder structure (`components/`, `hooks/`, `store/`, `lib/`, `pages/`) instead of FSD layers.

**Why**: FSD is powerful but adds onboarding friction for a template. This template is meant to be cloned and extended. FSD can be layered on by the consumer if needed. Vibeten uses FSD and its rules can serve as reference.

---

## [2026-03] Zustand for global state, TanStack Query for server state

**Decision**: Hard boundary — no Zustand for server data, no TanStack Query for pure UI state.

**Why**: Mixing responsibilities leads to cache inconsistency and double-refetch bugs. Zustand + devtools gives Redux-like observability for client state. TanStack Query owns all async lifecycle (loading, error, stale, refetch).

---

## [2026-03] CI: production build + audit + Dependabot

**Decision**: GitHub Actions runs `npm ci` → audit → `typecheck` → `lint:oxlint` → `lint` (ESLint) → `format:check` → `test:coverage` → **`npm run build`** → **`npm run verify:web-vitals-chunks`** → **Playwright E2E** (Chromium; preview on 4173). Triggers on PR and push to `master`. Dependabot opens weekly npm update PRs (capped at 8 open). **`verify:pwa`** and **`perf:ci`** are not in `ci.yml`; use **`npm run ci:local`** for those gates (see [2026-04] `ci:local` stricter than GitHub Actions). Security scanning: **`security.yml`** (gitleaks, CodeQL).

**Why**: Typecheck and dual lint stages catch errors early; coverage in CI enforces thresholds from Vitest config. Production build gates bundler regressions; post-build chunk check catches accidental web-vitals graph coupling. E2E covers critical navigation. Audit at moderate+ fails on registry-reported issues. Dependabot reduces manual drift for security patches.

**Trade-offs**: `audit-level=moderate` may fail on moderate+ advisories that have no fix yet — then pin, ignore with documented exception, or wait for upstream (team choice).

---

## [2026-03] Vendor chunks: `codeSplitting.groups` + `@tanstack/query-core`

**Decision**: Under `build.rolldownOptions.output.codeSplitting.groups`, the **`state-vendor`** group includes paths for `zustand`, `@tanstack/react-query`, and **`@tanstack/query-core`**.

**Why**: Analyzer runs showed `query-core` splitting out when only `react-query` matched. Same cacheable vendor boundary as the previous `manualChunks` logic.
