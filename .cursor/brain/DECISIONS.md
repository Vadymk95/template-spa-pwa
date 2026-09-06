# Architectural Decisions

## [2026-09] Test toolchain majors: vitest 5, Stryker 10, jsdom 30

**Decision**: take the three majors in one pass, one commit each, measured on the same tree. TypeScript stays `~6.0.x` because `typescript-eslint@8.69` still peers `<6.1.0`.

**What moved**: vitest 5 exposes `document` as a getter-only global in the jsdom environment, so a plain `globalThis.document = stub` throws — `scripts/probe.test.mjs` now uses `vi.stubGlobal` / `vi.unstubAllGlobals`. Stryker 10 changes the mutant set: the same tree scored 45.20 on 9.6.1 (baseline, 2026-08-09) and 42.93 on 10.0.0, still above the `thresholds.break` floor of 40, which stays where it is (a floor is raised after a good run, never moved to fit a tool). jsdom 30 requires Node `^24.15.0`; `.nvmrc` says `24`, so `nvm use` resolves to the newest installed 24.x and the hooks run there — a machine on an older 24.x fails `engine-strict` at install, which is the intended signal, not a bug.

**Why**: Dependabot kept opening grouped major bumps that the audit gate refused for unrelated reasons (new transitive advisories, a stale allowance). Taking the majors deliberately, with the mutation run and the coverage gate as proof, closes that queue instead of ignoring it.

---

## [2026-07] The gate is `verify`; `verify` is a superset of CI

**Decision.** Every check lives in `package.json`, never only in a workflow file. `verify` holds all
offline checks — including `verify:pwa`, `verify:web-vitals-chunks` and `size:check`, which previously
lived only in `ci:local`. `verify:ci` is `audit:gate && verify` and is what both `.husky/pre-push` and
the CI `validate` job run. The CI job is one step over that script.

**Why.** CI listed its own steps, and two of them (`npm audit`, `verify:web-vitals-chunks`) were absent
from `verify`, while `verify:pwa` and `size:check` ran in `ci:local` only — that is, in no pipeline at
all. So a green local gate did not predict a green CI, and two gates gated nothing anywhere.

**`perf:ci` (Lighthouse) stays outside both.** It was rejected on cost cascade and remains in `ci:local`
for deliberate use. `ci:local` is now exactly `verify:ci` + `perf:ci`.

**`audit:gate` is in `verify:ci`, not `verify`,** because it needs the network. An implementer working
offline must still be able to run the complete offline gate. It fails closed: on every high or critical
advisory, on an expired allowance, on an allowance whose advisory has disappeared, and on its own
inability to complete. `scripts/audit-gate.test.mjs` covers those paths — a security gate that reports
success when it cannot run is worse than no gate.

**An allowance is the last resort, not the first.** `GHSA-mh99-v99m-4gvg` (brace-expansion, unbounded
expansion → OOM) was allowlisted on the reading that `minimatch@3` is pinned by eslint's own
dependencies and by `eslint-plugin-react` / `eslint-plugin-jsx-a11y`, so nothing could be bumped. True of
the *direct* dependencies, wrong about the *transitive* one: `brace-expansion@5.0.8` is outside the
advisory range `<=5.0.7`, so a root override `"brace-expansion": ">=5.0.8"` closes it with `minimatch@3`
untouched — 5.0.8 is dual-published, so `require()` still resolves a CommonJS build. What made the
allowance look inevitable was npm's own suggested remediation: `eslint-plugin-react@7.22.0`, a
semver-major **downgrade**. Read the advisory's fixed range directly instead of trusting `fixAvailable`.

**Removing an allowance and adding the override are ONE commit.** The moment the override lands the
advisory disappears from the audit, which makes the allowance **stale**, which fails the gate by design.
That is the stale check working — it is what stops allowances outliving the problem they described.

**Pre-commit is repo-scoped.** `lint-staged` fixes and re-stages the staged set, but for a partially
staged file it restores the unstaged hunks *after* fixing, so formatting drift survived the commit and
only failed at push, leaving files that were already fixed and never committed. The hook now also runs
the TDD sibling gate and then repo-wide `lint:oxlint` + `format:check`, collecting both failures so one
attempt reports everything. **Not adopted:** a hook that commits for you — it would sweep whatever else
is dirty into the commit and has no honest message to use.

**`ensure-playwright.mjs` asks Playwright instead of guessing.** The previous version checked whether a
directory starting with `chromium` existed, which fails OPEN across a Playwright bump: the stale build
satisfies the name check, the install is skipped, and e2e dies with "Executable doesn't exist". It now
parses `Install location:` out of `playwright install --dry-run`, and an unreadable plan installs rather
than assuming the cache is good. `scripts/ensure-playwright.test.mjs` pins the stale-cache case.

**Revisit trigger:** if `verify` crosses roughly five minutes locally, move e2e into its own CI job and
out of the pre-push hook — but out of `verify` only together with the workflow, never one alone.

## [2026-07] ESLint 10; `settings.react.version` must be a literal

**Decision.** ESLint 10, ahead of the 9.x end of life on 2026-08-06. Three plugins still cap their
`eslint` peer below 10 — `eslint-plugin-react` at `^9.7`, `eslint-plugin-jsx-a11y` at `^9`, and
`eslint-plugin-import` transitively — so each gets an `overrides` entry mapping its peer to `$eslint`.
`npm install` and `npm ci` both succeed with **no `--legacy-peer-deps`**; the blanket flag was rejected
as a permanent posture in a repo with a hardened `.npmrc`.

**`settings.react.version` is `'19.2'`, never `'detect'`.** `eslint-plugin-react` resolves `'detect'`
through `detectReactVersion` -> `resolveBasedir`, which calls the `context.getFilename()` API that
ESLint 10 removed; every react rule needing the version then throws at load. A trailing config object
with no `files` key repeats the pin so no shared config can reintroduce `'detect'`.

**The green was checked for fail-open**, because a silent no-op looks identical to a clean run: 1252
rules declared, 237 active, 10 plugins loaded on a real source file. ESLint 10 also caught a dead store
in `src/lib/api/client.ts` that 9.x did not — an error message initialised and then unconditionally
overwritten in both branches below it.

**`@types/node` returned to 24.x.** It had drifted to 26 against this repo's own documented hold, which
exists so the types do not promise APIs that `engines.node >= 24` cannot deliver. Typecheck is clean at
24.13.3.

## [2026-07] Tailwind class hygiene + raw-hex ban (the deferred propagation, landed)

**Decision.** Four Tailwind rules block in the gate: `no-contradicting-classname`, `classnames-order`,
`enforces-shorthand`, `no-unnecessary-arbitrary-value`. Plus a raw-hex ban via `no-restricted-syntax`
scoped to `src/components/**` and `src/pages/**`.

**Rejected, do not re-propose:** `no-custom-classname` (crashes on `cva` callees and `tw-animate-css`)
and `no-arbitrary-value` (bans the Radix `data-[state=…]` selectors the design system requires).

**One documented carve-out.** `I18nInitErrorFallback` keeps raw hex in inline styles on purpose: it
renders when `index.css` may not have loaded, so a design token would resolve to nothing. The reason is
in the component and in the override block.

**Why it was stuck.** The change was written, autofixed clean, and then held in a stash for a week
because the TDD sibling gate blocked the commit on two files with no tests. Resolved by writing a real
render test for `PwaUpdateToast` (its logic already had one, the shell did not) and by exempting
`src/pages/DevPlayground/` — which `vitest.config.ts` already excludes from coverage, so demanding a
test for it contradicted a decision the repo had already taken.


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

**Why**: `scripts/check-web-vitals-chunks.mjs` asserts chunk _composition_ (subscribeStandard vs subscribeAttribution), NOT chunk _size_. `lighthouserc.json` `total-byte-weight` is total page weight (warn-only ≤800 KB), NOT per-chunk. `chunkSizeWarningLimit: 600` (KB raw) in `vite.config.ts` is Vite _warning_, not CI fail. No per-vendor-chunk byte-budget gate currently exists. `size-limit` 868K weekly DLs ~10× over `bundlesize` (May 2026 npm registry direct).

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

## [2026-04] ESLint 9 hold (NOT bumping to 10) — SUPERSEDED

**Superseded by "[2026-07] ESLint 10" below.** The hold was lifted before the 2026-08-06 end of life:
the plugin peers still cap below 10, but three `overrides` entries resolve that without
`--legacy-peer-deps`, and the one real crash path turned out to be
`settings.react.version: 'detect'`. Kept for the reasoning, not as current guidance.

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

**Superseded in part (2026-08-30)**: `.husky/pre-push` now runs `verify:push`, which is phase-aware (`scripts/gate-tiers.json`): phase 0 skips build, PWA/web-vitals checks, size and e2e until the first deploy, phase 1 runs the full `verify:ci`; CI always runs the full chain. The e2e-inside-`verify` half of this decision stands. Tier law: `AGENTS.md` § Commands / the gate.

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

## [2026-04] ESLint 9 (not 10) — intentional hold — SUPERSEDED

**Superseded by "[2026-07] ESLint 10" below.** The hold was lifted before the 2026-08-06 end of life:
the plugin peers still cap below 10, but three `overrides` entries resolve that without
`--legacy-peer-deps`, and the one real crash path turned out to be
`settings.react.version: 'detect'`. Kept for the reasoning, not as current guidance.

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

## Content variance is measured in a browser, not asserted in jsdom

**Decision.** Every content-bearing primitive is rendered once per content state on a dev-only route
(`/dev/ui/content-stress`) and MEASURED by Playwright at 390 / 640 / 768 / 1024 / 1440. The invariants
live as pure predicates in `e2e/support/geometry.ts`, shared by that spec and by
`e2e/layout-geometry.spec.ts`, which measures the assembled pages instead of the primitives. Two
consumers, one definition — two copies of a rule is the defect the module exists to prevent.

**Why a browser.** jsdom has no layout, so a unit test can pin a class string and nothing more. The
defects this found on the first run were all invisible to the unit suite: 172px of overflow from a
40-character unbroken token at 390, a button row 1161px wide inside a 798px container at 1440 (so NOT a
narrow-viewport problem), and 28px of horizontal DOCUMENT scroll from the header on every route at 390.

**Why the fixture is dev-only.** A stress page in the production bundle would be the wrong trade. That
choice has a consequence worth stating: the fixture is unreachable from the `vite preview` run inside
`verify`, so it needs its own server and its own rung — `verify:full`, plus a mandatory `dev-smoke` CI
job. `playwright.config.ts` MUST keep `dev/**` in `testIgnore`: without it the production project
collects the dev spec, runs it against `vite preview` where the route 404s, and the coverage becomes an
illusion that still reports a pass.

**Counts are derived, never literal.** The fixture publishes `data-stress-total` /
`data-stress-components` from its own case list and the spec compares what it FOUND against those, with a
floor and a named state set. A hardcoded `toHaveCount(32)` means adding a component silently requires
editing the spec, and the version that forgets is green.

**States: `minimal` / `typical` / `long` / `unbroken` for text, `none` / `one` / `many` for collections.**
`unbroken` is the load-bearing one — a long sentence wraps on its spaces and hides a missing wrap guard.
`minimal` is one character rather than the empty string, because an unreadable label is a content bug and
not a layout one. **Not included, deliberately:** an RTL state, because no RTL locale ships here and
adding one is a product decision, not a fixture decision.

## The 44px touch floor is a ratchet here, not a redesign

**Measured:** exactly two rendered sizes sit below the floor across every route and content state — 40
(`Button`, from `h-10` and `size-10`) and 36 (`Input`, from `h-9`). Both are shadcn's default scale, which
this template ships unaltered.

**Decision.** `e2e/support/control-targets.ts` accepts those two EXACT sizes with a stated reason and an
exit condition; every other size below the floor fails the gate. Raising the whole kit to 44 would change
the visual scale of every app scaffolded from here, which is the consuming app's design decision. Keying
on the exact size is what keeps this a ratchet: a 38px control matches nothing in the list.

An acceptance list is the one gate component that fails by wrongly ACCEPTING, and sabotage never points
that way, so `control-targets.test.ts` is all near-misses: 37/38/39/41/42 refused, an icon-only control
refused at an accepted height but a narrow width, and the input entry proven unable to excuse an
icon-only control.

## `outline-hidden`, never `outline-none` — an accessibility change wearing a rename's clothes

**Compiled from the installed Tailwind rather than recalled:** `.outline-hidden` emits
`outline-style: none` PLUS `@media (forced-colors: active) { outline: 2px solid transparent;
outline-offset: 2px }`; `.outline-none` emits only the first. Every focusable control here pairs the
outline reset with a `ring-*`, which is a `box-shadow`, and `forced-colors` suppresses box-shadows. So
with `outline-none` a Windows high-contrast user had NO focus indicator at all (WCAG 2.4.7).

Swept in `button.tsx`, `input.tsx` and `SkipLink`. Pinned three ways, because no single one is enough:
class-string assertions (`focus-indicator.test.tsx`, `SkipLink.test.tsx`), a committed browser test that
emulates the mode (`e2e/forced-colors.spec.ts`), and `better-tailwindcss/no-deprecated-classes`. Mutation
check: restoring `outline-none` makes the browser test report `outline=none shadow=none` and the unit test
fail. **On every Tailwind minor bump, read the release notes for renamed utilities** — the build emits no
warning and only the lint rule can catch a rename that is already known.

## Tailwind class hygiene: two rules adopted on a pre-flight, one refused

`no-deprecated-classes` 2 findings / 2 genuine · `enforce-canonical-classes` 0 · `no-unknown-classes` 0.
The first two are enabled; `no-unknown-classes` is NOT, despite scoring zero, because its failure mode in
a TEMPLATE is a false positive on the first hand-written CSS class a consumer adds, and this repo already
applies `i18n-loading` imperatively rather than through a `className` the rule can see. Zero findings
today is not evidence it is safe for whatever gets scaffolded from here. Both plugins stay — the rule sets
do not overlap.

## Gate hygiene: three fail-open shapes closed

- **Coverage dropout.** Measured: with an unparseable file inside the coverage scope, vitest prints
  `Failed to parse <file>. Excluding it from coverage.` and **exits 0**, so the percentage describes a
  smaller set of files and can even go up. `scripts/check-coverage.mjs` wraps the run and refuses on that
  marker; proven in both directions. Marker-based rather than a file-count baseline on purpose — a
  baseline in a template would record the file count of an empty scaffold.
- **`bench:verify` had drifted from the gate it claimed to mirror**, missing the `check-hooks` and
  `ensure-playwright` steps while its own header said "same steps as `npm run verify`". The step list is
  now DERIVED from the `verify` script and throws on a segment it cannot parse, so a step cannot silently
  disappear from the benchmark. A second list claiming the gate's scope always drifts narrower than the
  gate; the fix is to have no second list.
- **`npx` without `--no-install`** in `ensure-playwright.mjs`: with an incomplete `node_modules`, npx
  fetches the newest Playwright and installs browsers for a version this repo does not pin.

## Cross-engine coverage is opt-in and scoped, and it earned its place immediately

`CROSS_BROWSER=1` adds Firefox and WebKit projects, `testMatch`-scoped to the geometry specs. Not in the
default run: three engines on every spec triples the local e2e wall-clock, and a WebKit font-metric
difference in an unrelated spec would fail a push for a reason unconnected to the change.

**What it found on the first run, which no amount of reasoning had:** Firefox reports `clientWidth: 0`
for an inline `<label>` — CSS `overflow` does not apply to inline non-replaced elements and CSSOM defines
their client box as zero — while Chromium reports a box. Every `<label>` on the page read as a 176px
overflow in one engine and as nothing in the other. The engine difference is real; the defect was in the
rule, which now exempts exactly `display: inline` and is tested in both directions.

A `testMatch` that matches nothing collects ZERO tests and reports success, so
`scripts/check-cross-browser-selection.mjs` asks Playwright whether every configured project actually has
work, and fails closed on a report it cannot read.

## Complexity ratchet: thresholds above the measured ceiling, production code only

Five ESLint core rules (`complexity` 12, `max-depth` 3, `max-params` 4, `max-lines-per-function` 120,
`max-lines` 200) gate `src/**` excluding tests and mocks. Thresholds were set from a measurement, not
taste: an ESLint API probe with every rule at warn-zero measured the ceiling at complexity 10
(`lib/api/client.ts`) / depth 2 / params 3 / 89 lines per function / 142 per file (2026-08-09), so the
gate is clean on day one and fires only on future drift. The complexity limit is 12 rather than 10
because the worst function already sits AT 10 — a threshold equal to the ceiling would fire on the next
legitimate branch in that function, which is a tripwire, not a ratchet. **Tests and mocks are exempt on
purpose** — a `describe` block is one function to these rules and table-driven suites are long by
design; indexing the ratchet on test style is the failure mode that killed this rule set in a sibling
repo's review. When a threshold fires, split the function; raising a number requires a fresh
measurement recorded here.

## Mutation testing: weekly strength gate, deliberately outside `verify`

`npm run test:mutation` (StrykerJS 9.6.1 + vitest runner) measures what coverage cannot: whether the
tests would CATCH a wrong implementation. Baseline measured 2026-08-09: **mutation score 45.20%** —
325 of 719 mutants killed, 252 survived, 142 in code no test covers — against a green 65% coverage
floor. `thresholds.break: 40` is a floor-of-record: the weekly `mutation.yml` job (cron + dispatch)
fails only when strength regresses below the measured baseline; raise the floor after a good run,
never lower it to go green. NOT in `verify`/pre-push: a full run costs 2m54s locally and more on CI
runners. Scope mirrors the coverage excludes (DevPlayground, template seeds, MSW mocks, the SW
install-capture singleton and the cross-fetch shim all stay out for the same reasons they are out of
coverage). Hardenings from an external review of this proposal: `.stryker-tmp`/`reports` are
gitignored AND `ignorePatterns` keeps `.env*` out of Stryker's sandbox copy (Stryker does not read
`.gitignore`); the runner's tree enters the fail-closed audit gate — if it ever carries a high
advisory, the remedy is an override floor with a major cap, not an allowlist entry. Known limit:
the vitest runner mutates what unit/RTL tests can see; a defect only Playwright or the Service
Worker runtime would catch is invisible to this score. Second limit: mutation testing measures only
the KILL side — whether the suite would catch a breakage — and cannot detect an over-strict test
that wrongly rejects a legitimate implementation; that direction stays with review discipline, the
same judgment behind this repo's refusing-direction specs.

## Override floors: fresh-advisory sweep of 2026-08-09, and the uncapped-floor class

Fresh high advisories landed on the existing tree at once: `js-yaml` <4.3.1 (commitlint→cosmiconfig)
and <3.15.1 (@lhci/utils — two majors, so two SCOPED floors, a top-level pin would force the 3.x
consumer onto 4.x), `undici` <7.29.0 (jsdom), `nanoid` <5.1.16 / <3.3.17 (estimo / postcss, scoped
for the same two-major reason), `ip-address` <=10.3.0 (@lhci→proxy-agent→socks), `brace-expansion`
<5.0.9, `fast-uri` <4.1.2. Two of the failing floors were our own uncapped ones (`brace-expansion:
">=5.0.8"`, `fast-uri: ">=3.1.4"`) that aged into the vulnerable ranges — the override that once
cleared an advisory became the reason the gate was red. All floors now carry a major cap
(`">=fixed <next-major"`), and the five pre-existing uncapped floors (qs, serialize-javascript, tmp,
uuid, ws) were capped in the same pass before they could age the same way. An uncapped floor is a
delayed regression.
