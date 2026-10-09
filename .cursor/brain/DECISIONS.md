# Architectural Decisions

Only decisions that are true and in force today. History lives in `git log -p -- .cursor/brain/DECISIONS.md` and the
linked PRs (Vadymk95/template-spa-pwa). An entry is at most 30 lines: context, decision, consequences, status, evidence.
A superseded or dead decision is deleted, not archived. Dependency holds live in `scripts/version-holds.json`.

| Entry                                                                                    | Date    | Status   |
| ---------------------------------------------------------------------------------------- | ------- | -------- |
| Default CSP and security headers ship with the template                                  | 2026-10 | in force |
| Lighthouse CI runs in CI as its own job                                                  | 2026-10 | in force |
| Dependency holds are a checked file                                                      | 2026-10 | in force |
| `safeFetch` throws `ApiError`, so a 404 is no longer retried                             | 2026-10 | in force |
| A flaky pass fails CI, and the Firefox navigation flake is fixed at its cause            | 2026-10 | in force |
| zizmor audits the workflow files in CI                                                   | 2026-10 | in force |
| Every GitHub Action is SHA-pinned                                                        | 2026-10 | in force |
| Guard and coverage audit fixes                                                           | 2026-10 | in force |
| Override floors carry a major cap                                                        | 2026-10 | in force |
| Playwright `maxFailures: 10` on the gate run and in CI                                   | 2026-10 | in force |
| Agent limits in a committed `.claude/settings.json`; one Dependabot group; release token | 2026-09 | in force |
| Test toolchain: Stryker 10 and jsdom 30, vitest held                                     | 2026-09 | in force |
| `size-limit` per-chunk brotli budget                                                     | 2026-09 | in force |
| The gate is `verify`; `verify` is a superset of CI                                       | 2026-07 | in force |
| ESLint 10; `settings.react.version` must be a literal                                    | 2026-07 | in force |
| Tailwind class hygiene and the raw-hex ban                                               | 2026-07 | in force |
| Content variance is measured in a browser, not asserted in jsdom                         | 2026-08 | in force |
| The 44px touch floor is a ratchet                                                        | 2026-08 | in force |
| `outline-hidden`, never `outline-none`                                                   | 2026-08 | in force |
| Gate hygiene: fail-open shapes closed                                                    | 2026-08 | in force |
| Cross-engine coverage is opt-in and scoped                                               | 2026-08 | in force |
| Complexity ratchet                                                                       | 2026-08 | in force |
| Mutation testing                                                                         | 2026-08 | in force |
| Magic strings → constants                                                                | 2026-05 | in force |
| Boundary validation via Zod safeFetch wrapper (PWA-aware)                                | 2026-05 | in force |
| Playwright SW lifecycle E2E (minimal subset)                                             | 2026-05 | in force |
| REJECT list: explicit non-adoption                                                       | 2026-05 | in force |
| Security workflow separate from build CI                                                 | 2026-04 | in force |
| MSW browser worker with a dev opt-out                                                    | 2026-04 | in force |
| i18n init failure: English-only fallback                                                 | 2026-04 | in force |
| Web Vitals chunk split: automated check                                                  | 2026-04 | in force |
| eslint-import-resolver-typescript: single solution `tsconfig`                            | 2026-04 | in force |
| TypeScript 6                                                                             | 2026-04 | in force |
| Component pattern: arrow function + FunctionComponent                                    | 2026-04 | in force |
| Tailwind v4                                                                              | 2026-03 | in force |
| Vite 8 with Rolldown, plugin-react 6 and vendor chunks                                   | 2026-03 | in force |
| No FSD architecture in this template                                                     | 2026-03 | in force |
| Zustand for client state, TanStack Query for server state                                | 2026-03 | in force |

## [2026-10] Default CSP and security headers ship with the template

**Context**: the template told a fork to set CSP on its host. A browser blocks a CSP violation with one console line
and fails no test, so a new inline script or third-party origin passes every functional spec and breaks in production.

**Decision**: `vite-plugins/security-headers.ts` is the one definition of the response headers. `closeBundle` writes
`dist/_headers` from the final `dist/index.html`; `configurePreviewServer` sends the same set on `vite preview`.
`script-src 'self'` plus a `sha256` per inline script of the built page; no `unsafe-*` source; `connect-src` is `'self'`
plus the origin of `VITE_API_URL`; `object-src` and `frame-ancestors` are `'none'`. HSTS has no `preload` (hard to undo,
the domain owner's call). COOP is `same-origin`. The dev server sends no policy: HMR needs inline scripts.

**Consequences**:

- `connect-src` allows the localhost API origin unless `VITE_API_URL` is set for the production build.
- zod 4 probes JIT with `new Function('')`, which the policy reports. `z.config({ jitless: true })` in `src/env.ts`
  switches the probe off; never add `'unsafe-eval'`.
- Playwright 1.63.0's Firefox (build 1543) intermittently never finishes `page.goto` on a COOP page: 2 timeouts in
  3 rounds of 40 by default, 0 with `browser.tabs.remote.useCrossOriginOpenerPolicy` off, which the `firefox` project
  in `playwright.config.ts` sets. The header stays sent. Lift condition: SKELETONS.md.

**Guards**: `API_DEFAULT_URL` in `src/lib/constants.ts` feeds both API call sites and the plugin;
`vite-plugins/security-headers.test.ts` pins the header set; `e2e/support/fixtures.ts` fails a preview spec on a CSP
violation (ESLint bans importing `test` from `@playwright/test` in `e2e/*.spec.ts`); `e2e/security-headers.spec.ts`
compares `vite preview` with `dist/_headers`.

**Status**: in force. **Evidence**: PR #75; `vite-plugins/security-headers.ts`.

## [2026-10] Lighthouse CI runs in CI as its own job

**Context**: `perf:ci` existed and ran in no pipeline, so the Lighthouse budgets gated nothing (the shape of the
`verify:pwa` hole in "The gate is `verify`").

**Decision**: `ci.yml` has a `lighthouse` job: build, then `npm run perf:ci` against `vite preview` with the budgets in
`lighthouserc.json`. It runs parallel to the other jobs, is NOT a required check, and stays out of `verify` and
`verify:ci`, so the push gate pays nothing. `--no-sandbox` is a CLI argument in CI only. `startServerReadyPattern` is
`Local`, not `Local:`: vite colours the label, so `Local:` never matched under CI colours and every run waited out the
30 s ready timeout.

**Consequences**: one run on a shared runner has variance, so every budget except accessibility is `warn`. A red
accessibility score is a finding; a yellow performance number is a signal (artifact `lighthouse-reports`, 7 days). If
accessibility fails with no change that explains it, raise `numberOfRuns` to 3 on one URL before relaxing the budget.
Three runs over several URLs and form factors stays rejected (REJECT list).

**Status**: in force. **Evidence**: PR #75; `.github/workflows/ci.yml` (`lighthouse` job), `lighthouserc.json`.

## [2026-10] Dependency holds are a checked file

**Context**: holds (a package kept below a major) lived as prose in three places, and nothing stopped an agent from
bumping a held package by hand: a Dependabot `ignore` stops only the bot.

**Decision**: `scripts/version-holds.json` is the one list (package, held range, reason, lift condition, evidence,
optional `reviewBy`). `scripts/check-version-holds.mjs`, inside `verify` and `verify:scaffold`, fails when a manifest
range or the lockfile version leaves the range, when `.github/dependabot.yml` lacks the matching npm `ignore`, or when
an entry's package is absent. Held today: `typescript`, `eslint`, `@eslint/js`, `@types/node`, `vitest`,
`@vitest/coverage-v8`, `msw`. A lift is one commit: the hold entry, the Dependabot ignore and the bump together.

**Consequences**: three pins are not holds and stay outside the file.

- `oxlint` is tilde-pinned and moves in lockstep with `eslint-plugin-oxlint`.
- `proxy-agent` is a root devDependency only to satisfy the optional peer that the `@puppeteer/browsers` security floor
  brings (`@lhci/cli` pins its own nested 6.x); nothing imports it. Remove it when `@lhci/cli` moves to `proxy-agent` 8
  or `@puppeteer/browsers` widens the peer.
- `eslint.config.js` turns `no-unsafe-enum-assignment` off for `src/store/utils/createSelectors.ts` only, because
  typescript-eslint 8.71 false-fires on a computed `keyof` key (typescript-eslint #12966). Delete the block when the
  issue is closed and `npm run lint` passes without it.

The release-age cooldown is `min-release-age=3` (days) in `.npmrc`. A deliberate younger install passes
`--min-release-age=0` on that one command; `.npmrc` is never edited for it.

**Status**: in force. **Evidence**: PR #74; `scripts/check-version-holds.mjs`.

## [2026-10] `safeFetch` throws `ApiError`, so a 404 is no longer retried

**Context**: a non-2xx response in `src/lib/api/safeFetch.ts` threw a plain `Error` with no status, while `shouldRetry`
in `src/lib/queryClient.ts` skips 4xx only when the error carries a numeric `status`. Every HTTP error through
`safeFetchQueryFn` was retried `QUERY_MAX_RETRIES` times, a 404 included.

**Decision**: `safeFetch` throws the existing `ApiError` from `src/lib/api/client.ts` (same message, plus `.status`).
No second error type: the retry policy and `useLoginForm` already read `ApiError.status`.

**Consequences**: a 404 reaches the endpoint once; a 500 still reaches it `QUERY_MAX_RETRIES + 1` times.

**Guards**: `src/lib/queryClient.test.ts` and `src/lib/api/safeFetch.test.ts` (reverting `safeFetch.ts` turns them red).

**Status**: in force. **Evidence**: PR #73.

## [2026-10] A flaky pass fails CI, and the Firefox navigation flake is fixed at its cause

**Context**: a test that failed and then passed on a retry was reported "flaky" and counted as a green run, so the
flake merged unnoticed. `e2e/layout-geometry.spec.ts` in Firefox hit `page.goto: NS_BINDING_ABORTED` on the second
route in two of 23 CI runs, each green only because the retry passed.

**Decision**: both Playwright configs set `failOnFlakyTests` on real `CI`, next to `retries: 2`; on the desk run
`retries` is 0 and the flag is off. The spec opens one fresh page per route and closes it once measured, instead of
navigating one page through three routes. Cause (probe, 50 iterations each): after `load` the app is still fetching
locale files and lazy chunks and registering the service worker, and a navigation issued then cancels that work. A
fixed pause or a network-idle wait also cured it but costs time; a fresh page costs about 0.2 s per test.

**Consequences**: the link between the probe and the two CI failures is inference (the real spec never aborted locally
in 540 Firefox runs). If the flake returns, `failOnFlakyTests` turns it red; the next step is then a dated quarantine,
not another guess.

**Guard**: `scripts/check-playwright-gate-config.test.mjs` pins both values for both configs.

**Status**: in force. **Evidence**: PR #69.

## [2026-10] zizmor audits the workflow files in CI

**Context**: the SHA pins ("Every GitHub Action is SHA-pinned") are only as good as the check that notices the next
unpinned `uses:`; nothing did, and `persist-credentials` appeared 0 times against 7 checkouts.

**Decision**: `security.yml` has a third job, `Workflow audit (zizmor)`, on the workflow's existing triggers. It runs
`zizmorcore/zizmor-action` (SHA-pinned, zizmor `version: 1.30.1`), audits `.github/workflows` online, reads
`.github/zizmor.yml`, writes annotations, and fails on `min-severity: medium`. The job name is a required context in
`.github/ruleset.json`. Every `actions/checkout` carries `persist-credentials: false`.

**Consequences**:

- Online zizmor grades `artipacked` Low and offline grades it Medium, so `.github/zizmor.yml` remaps it to medium: one
  config, one verdict, for the job and for the local `uvx zizmor@1.30.1 .github/workflows`.
- `adhoc-packages` is ignored for the whole of `ci.yml` (the deliberate `npm install -g npm@^11.14.0` steps); no other
  ignore entry.
- Dependabot moves the action's SHA, not its `version:` input. A newer zizmor is a deliberate edit of `version`.

**Guard**: `docs:check` keeps the job name and `.github/ruleset.json` consistent (`rulesetContexts`).

**Status**: in force. **Evidence**: PR #69; `.github/zizmor.yml`.

## [2026-10] Every GitHub Action is SHA-pinned

**Context**: a floating `@vN` tag stays movable; GitHub's immutable releases protect only releases whose publisher
opted in (of the six pinned releases on 2026-10-04, four were not immutable, `release-please-action` among them, and it
runs with a write token).

**Decision**: every `uses:` in `.github/workflows/*.yml` is pinned to a full 40-hex commit SHA with the released version
as a trailing comment (`uses: actions/checkout@<sha> # v7.0.1`). Dependabot's `github-actions` ecosystem rewrites the
SHA and the comment together. `release.yml` and `security.yml` default to `permissions: contents: read`; only the job
that needs write grants it.

**Consequences**: `SECURITY.md` carries the disclosure policy. zizmor (above) enforces the pin on every PR.

**Status**: in force. **Evidence**: PR #68.

## [2026-10] Guard and coverage audit fixes

**Context**: two audit rounds sabotaged the guards and found holes that a green suite hid. Each fix has a test that is
red without it.

**Decision** (one line per fix; the guard is the source of truth):

- `docs:check` ciSteps: every `run:` step in a PR-triggered workflow, including each line of a block scalar, is in
  `gate-tiers.json` § `ci.allowedRunSteps` or the check names the file:line.
- `docs:check` rulesetContexts: every required check in `.github/ruleset.json` resolves to a workflow job, or is in
  `ci.rulesetContextAllowlist`; a context GitHub renders only at runtime prints one non-failing line.
- `.size-limit.json` has a total-JS entry (187 KB brotli), so a dynamically imported chunk under a new name cannot ship
  unseen.
- `e2e/layout-geometry.spec.ts` asserts `scrollbar-gutter: stable` on `<html>`.
- `src/App.test.tsx` covers the error-boundary wiring and the PWA update toast staying outside `ErrorBoundary`.
- `src/lib/api/client.test.ts` covers every branch of `isSafeForAuth` (the cross-origin token-leak guard);
  `ProtectedRoute`'s hydration gate and the `partialize` token exclusion in `userStore` have tests.
- `e2e/a11y.spec.ts` scans `/dashboard` with an explicit fourth `test()`; the suite ceiling is `suites.e2e.max` in
  `gate-tiers.json`, so a route list loop is not used (it collapses to one call site).
- The dead `cross-fetch` shim is gone; `scripts/mutation-scope.test.mjs` flags a Stryker or coverage entry for a missing
  file.

**Status**: in force. **Evidence**: PR #66, PR #67.

## [2026-10] Override floors carry a major cap

**Context**: an `overrides` floor is the fix for a fresh advisory, and an uncapped one (`>=5.0.8`) ages into the next
advisory's range and turns the audit gate red itself. Two of ours did (`brace-expansion`, `fast-uri`).

**Decision**: every floor in `package.json` `overrides` is `>=fixed <next-major`, raised when a new advisory lands.
Two-major consumers get one floor per major (`js-yaml@^3`, `js-yaml@^4`), keyed by package, not by parent. A floor is
never removed to quiet npm. `basic-ftp` is closed by a root floor `>=6.2.1 <7`, a major past `get-uri`'s own range.

**Consequences**: no guard checks the cap; it is a review rule. `audit:gate` fails closed on any high or critical
advisory, so a stale floor shows up there. An audit allowance is the last resort (see "The gate is `verify`").

**Status**: in force. **Evidence**: 7bdf539, 348e8b5; `package.json` `overrides`.

## [2026-10] Playwright `maxFailures: 10` on the gate run and in CI

**Context**: in a sibling product forked from this template, 22 of 60 pushes in 30 days went red, and a red push ran up
to 21 minutes against about 5 for a green one, because every failing test waited out its own timeout.

**Decision**: `playwright.config.ts` caps `maxFailures` at 10 when `usePreview` is true (CI or
`PLAYWRIGHT_USE_PREVIEW=1`); the desk run against the dev server stays uncapped. Each config writes to its own
`outputDir` (`test-results/e2e`, `test-results/dev`) so `--last-failed` never reads the other suite's record.

**Consequences**: measured on one broken shared invariant (630 tests, six workers): uncapped, 7.5 min and 55 failures;
capped at 10, 21 s; capped at 5, 15 s with half the failing neighbours reported. 10 is the value that settled.

**Status**: in force. **Evidence**: a12c2db; `playwright.config.ts:48`.

## [2026-09] Agent limits in a committed `.claude/settings.json`; one Dependabot group; release token

**Decision**: `.claude/settings.json` is tracked. In every permission mode it denies reading `.env` files other than the
example, editing itself, force pushes, `--no-verify`, `git reset --hard` and `git clean -f`; it asks before edits of the
gate files. The rule text lives in `AGENTS.md` § Lanes. It is not a security boundary: a Bash rule matches the command
as written, so `sh -c`, a full binary path or a `git -C` prefix walks past it. The boundary stays the required CI check.
Cursor and Codex do not read the file.

**Dependabot**: one `minor-and-patch` group carries every non-major update (two groups rewrote `package-lock.json` and
the second PR conflicted); a major still opens its own PR. **Release token**: `release.yml` passes
`secrets.RELEASE_PLEASE_TOKEN || github.token`; with the secret absent, release PR runs wait in `action_required` for one
approval, with a fine-grained PAT they get CI like any PR.

**Consequences**: `-uf` and a trailing `-n` still get past the git rules; more wildcards would catch commit messages,
so they stay documented, not chased.

**Status**: in force. **Evidence**: 2bb9b58.

## [2026-09] Test toolchain: Stryker 10 and jsdom 30, vitest held

**Decision**: Stryker 10 and jsdom 30 are taken; vitest stays on 4.x (`scripts/version-holds.json` has the reason and
the lift). A mutation floor is raised after a good run, never moved to fit a tool: `thresholds.break` stays 40.

**Consequences**:

- vitest 5 makes `document` a getter-only global in jsdom, so `scripts/probe.test.mjs` uses `vi.stubGlobal`.
- jsdom 30 needs Node `^24.15.0`; `.nvmrc` says `24`, so a machine on an older 24.x fails `engine-strict` at install.
  That is the intended signal.
- A mutation score measured with Stryker's incremental report present never represents CI's fresh checkout: delete
  `reports/stryker-incremental.json` before any measurement that decides something.

**Status**: in force. **Evidence**: 15751e9, PR #74.

## [2026-09] `size-limit` per-chunk brotli budget

**Context**: `check-web-vitals-chunks.mjs` asserts chunk composition, Lighthouse asserts total page weight, and Vite's
`chunkSizeWarningLimit` only warns. Nothing gated per-chunk bytes.

**Decision**: `size-limit` with `@size-limit/file` only (the time plugin cost 15 to 19 s per CI run and measured nothing
a budget used) and budgets in `.size-limit.json`, brotli: react-vendor 90 KB, i18n-vendor 22 KB, state-vendor 15 KB,
ui-vendor 12 KB, index entry 28 KB, total JS 187 KB. `npm run size:check` runs inside `verify`. The service worker and
the workbox runtime are not budgeted: `vite-plugin-pwa` owns their size.

**Consequences**: a budget moves once, with the cause named (the entry chunk went 25 to 26 to 28 KB on dependency
minors, `zod` 4.6 alone +1.5 kB); the next unexplained growth is a hunt, not another bump. Recalibrate per fork.

**Status**: in force. **Evidence**: 60b0ccd, 488a89a, 739e556; `.size-limit.json`.

## [2026-07] The gate is `verify`; `verify` is a superset of CI

**Context**: CI listed its own steps, and `verify:pwa`, `size:check` and the chunk check each sat in only one pipeline
or none, so a green local gate did not predict a green CI.

**Decision**: every check lives in `package.json`, never only in a workflow file. `verify` holds all offline checks,
e2e included (preview-mode e2e catches SW and CSP regressions before CI). `verify:ci` is `audit:gate && verify`; it is
what the CI `validate` job runs, and `.husky/pre-push` runs the phase-aware `verify:push` (`scripts/gate-tiers.json`;
tier law in `AGENTS.md` § Commands). `audit:gate` needs the network, so it is in `verify:ci` only; it fails closed (high
or critical advisory, expired or stale allowance, its own failure) and `scripts/audit-gate.test.mjs` covers those paths.

**Consequences**:

- An audit allowance is the last resort: read the advisory's fixed range before trusting `fixAvailable`. Removing an
  allowance and adding the override that closes it are ONE commit, or the stale check fails the gate by design.
- Pre-commit is repo-scoped: `lint-staged` restores unstaged hunks after fixing, so drift survived the commit. The hook
  also runs the TDD sibling gate, then repo-wide `lint:oxlint`, `format:check` and `typecheck`. A hook that commits for
  you is not adopted: it would sweep other dirty files into the commit.
- `scripts/ensure-playwright.mjs` parses `Install location:` from `playwright install --dry-run`, because a name check
  fails open across a Playwright bump; `scripts/ensure-playwright.test.mjs` pins the stale-cache case.

**Status**: in force. **Evidence**: bbe22b6 (PR #25), bb485c6; `package.json` `verify` scripts.

## [2026-07] ESLint 10; `settings.react.version` must be a literal

**Context**: `eslint-plugin-react` caps its `eslint` peer at `^9.7` and `eslint-plugin-jsx-a11y` at `^9`; ESLint 9 ends
life 2026-08-06.

**Decision**: ESLint 10. Each capped plugin gets an `overrides` entry mapping its peer to `$eslint`, so `npm install`
and `npm ci` succeed with no `--legacy-peer-deps` (rejected as a permanent posture in a repo with a hardened `.npmrc`).
`settings.react.version` is a literal, never `'detect'`: `eslint-plugin-react` resolves `'detect'` through
`context.getFilename()`, which ESLint 10 removed, so every rule needing the version throws at load. A trailing config
object with no `files` key repeats the pin so no shared config reintroduces `'detect'`.

**Consequences**: a green lint run can be a silent no-op, so it was checked for fail-open (1252 rules declared, 237
active, 10 plugins on a real file). The hold on `eslint` and `@eslint/js` is in `scripts/version-holds.json`.

**Status**: in force. **Evidence**: bb485c6; `eslint.config.js` (`settings.react.version`).

## [2026-07] Tailwind class hygiene and the raw-hex ban

**Decision**: the `tailwindcss` plugin blocks four rules in the gate: `no-contradicting-classname`, `classnames-order`,
`enforces-shorthand`, `no-unnecessary-arbitrary-value`. `better-tailwindcss` adds `no-deprecated-classes` and
`enforce-canonical-classes`; its `no-unknown-classes` stays off because it would false-positive on the first
hand-written CSS class a fork adds. A raw-hex ban (`no-restricted-syntax`) covers `src/components/**` and
`src/pages/**`.

**Consequences**:

- Rejected, do not re-propose: `no-custom-classname` (crashes on `cva` callees and `tw-animate-css`) and
  `no-arbitrary-value` (bans the Radix `data-[state=…]` selectors the design system requires).
- One carve-out: `I18nInitErrorFallback` keeps raw hex in inline styles, because it renders when `index.css` may not
  have loaded. `src/pages/DevPlayground/` is exempt from the TDD sibling gate (coverage already excludes it).

**Status**: in force. **Evidence**: bb485c6; `eslint.config.js`.

## [2026-08] Content variance is measured in a browser, not asserted in jsdom

**Context**: jsdom has no layout, so a unit test can pin a class string and nothing more. The first browser run found
172 px of overflow from a 40-character unbroken token at 390, a button row 1161 px wide in a 798 px container at 1440,
and 28 px of horizontal document scroll from the header on every route at 390.

**Decision**: every content-bearing primitive renders once per content state on the dev-only route
`/dev/ui/content-stress` and is MEASURED by Playwright at 390 / 640 / 768 / 1024 / 1440. The invariants are pure
predicates in `e2e/support/geometry.ts`, shared with `e2e/layout-geometry.spec.ts` (which measures the assembled
pages): two consumers, one definition. States are `minimal` / `typical` / `long` / `unbroken` for text and
`none` / `one` / `many` for collections; `unbroken` is the load-bearing one. No RTL state: no RTL locale ships here.

**Consequences**:

- The fixture is dev-only, so `vite preview` cannot reach it: it runs under `verify:full` and the `dev-smoke` CI job.
  `playwright.config.ts` MUST keep `dev/**` in `testIgnore`, or the production project collects the dev spec and the
  coverage becomes an illusion that reports a pass.
- Counts are derived, never literal: the fixture publishes `data-stress-total` and the spec compares what it found.

**Status**: in force. **Evidence**: 6d70127; `e2e/dev/content-stress.spec.ts`.

## [2026-08] The 44px touch floor is a ratchet

**Context**: across every route and content state exactly two rendered sizes sit below 44: 40 (`Button`, `h-10`) and 36
(`Input`, `h-9`). Both are shadcn's default scale. Raising the kit to 44 would change the visual scale of every app
scaffolded from here, which is the consuming app's design decision.

**Decision**: `e2e/support/control-targets.ts` accepts those two EXACT sizes with a reason and an exit condition; any
other size below the floor fails the gate. Keying on the exact size keeps it a ratchet: a 38 px control matches nothing.

**Consequences**: an acceptance list fails by wrongly accepting, which sabotage never shows, so
`e2e/support/control-targets.test.ts` is all near-misses (37, 38, 39, 41, 42 refused; an icon-only control refused at an
accepted height but a narrow width).

**Status**: in force. **Evidence**: 6d70127; `e2e/support/control-targets.ts`.

## [2026-08] `outline-hidden`, never `outline-none`

**Context**: Tailwind's `.outline-hidden` emits `outline-style: none` plus a forced-colors fallback
(`outline: 2px solid transparent`); `.outline-none` emits only the first. Every focusable control pairs the reset with
a `ring-*`, which is a `box-shadow`, and forced-colors suppresses box-shadows, so `outline-none` left a Windows
high-contrast user with no focus indicator (WCAG 2.4.7).

**Decision**: `outline-hidden` everywhere (`button.tsx`, `input.tsx`, `SkipLink`).

**Consequences**: on every Tailwind minor bump, read the release notes for renamed utilities: the build emits no
warning and only the lint rule catches a rename that is already known.

**Guards**: `better-tailwindcss/no-deprecated-classes`; `focus-indicator.test.tsx` and `SkipLink.test.tsx` pin the class
strings; `e2e/forced-colors.spec.ts` emulates the mode.

**Status**: in force. **Evidence**: 6d70127.

## [2026-08] Gate hygiene: fail-open shapes closed

**Decision**: a gate must fail closed. Five shapes were closed, each by a guard:

- **Coverage dropout**: with an unparseable file in scope vitest prints `Failed to parse <file>. Excluding it from
  coverage.` and exits 0. `scripts/check-coverage.mjs` wraps the run and refuses on that marker (a marker, not a
  file-count baseline: a baseline in a template would record the count of an empty scaffold).
- **A second list of the gate's steps always drifts narrower**: `scripts/bench-verify.mjs` derives its steps from the
  `verify` script and throws on a segment it cannot parse.
- **`npx` without `--no-install`** in `ensure-playwright.mjs` would fetch the newest Playwright on an incomplete
  `node_modules`.
- **A tool's temp directory belongs in every ignore list the gate reads**: `.stryker-tmp` is in `.gitignore`,
  `.prettierignore` and ESLint's global ignores, or a crashed Stryker run reddens the gate for an unrelated change.
- **A test budget is set by what the test does**: the `verify-push` CLI cases boot node, npm, node and carry a 20 s
  budget; a `skip` was rejected because a silent pass is what they prevent.

**Status**: in force. **Evidence**: 3e0a3b0, 2a6df41; `scripts/check-coverage.mjs`.

## [2026-08] Cross-engine coverage is opt-in and scoped

**Context**: three engines on every spec triple the local e2e wall-clock, and a WebKit font-metric difference in an
unrelated spec would fail a push for a reason unconnected to the change.

**Decision**: `CROSS_BROWSER=1` adds Firefox and WebKit projects, `testMatch`-scoped to the geometry specs. Not in the
default run. It earned its place at once: Firefox reports `clientWidth: 0` for an inline `<label>` (CSSOM gives
non-replaced inline elements a zero client box) while Chromium reports a box; the overflow rule now exempts exactly
`display: inline` and is tested in both directions.

**Consequences**: a `testMatch` that matches nothing collects zero tests and reports success, so
`scripts/check-cross-browser-selection.mjs` asks Playwright whether every configured project has work and fails closed
on a report it cannot read.

**Status**: in force. **Evidence**: 6d70127; `scripts/check-cross-browser-selection.mjs`.

## [2026-08] Complexity ratchet

**Context**: an ESLint API probe with every rule at warn-zero measured the ceiling of `src/**` on 2026-08-09:
complexity 10 (`lib/api/client.ts`), depth 2, params 3, 89 lines per function, 142 per file.

**Decision**: five core rules gate `src/**` excluding tests and mocks: `complexity` 12, `max-depth` 3, `max-params` 4,
`max-lines-per-function` 120, `max-lines` 200. Thresholds sit above the measured ceiling, so the gate is clean on day
one and fires on drift; complexity is 12 not 10 because a threshold equal to the ceiling fires on the next legitimate
branch (a tripwire, not a ratchet). Tests and mocks are exempt on purpose: a `describe` block is one function to these
rules, and indexing the ratchet on test style killed this rule set in a sibling repo's review.

**Consequences**: when a threshold fires, split the function. Raising a number needs a fresh measurement recorded in
this entry.

**Status**: in force. **Evidence**: 7bdf539; `eslint.config.js:549`.

## [2026-08] Mutation testing

**Context**: coverage says what ran, not whether the tests would catch a wrong implementation. Baseline on 2026-08-09:
45.20 % (325 of 719 mutants killed) against a green coverage floor.

**Decision**: `npm run test:mutation` (StrykerJS and the vitest runner) is a weekly strength gate (`mutation.yml`, cron
plus dispatch), deliberately outside `verify` and pre-push: a full run costs about 3 minutes locally. `thresholds.break`
is 40, a floor-of-record: raise it after a good run, never lower it to go green. Scope mirrors the coverage excludes
(`scripts/mutation-scope.test.mjs` checks the drift). `.stryker-tmp` and `reports` are gitignored and `ignorePatterns`
keeps `.env*` out of Stryker's sandbox copy. If the runner's tree ever carries a high advisory, the remedy is an
override floor with a major cap, not an allowlist entry.

**Consequences**: two known limits. The vitest runner sees only what unit and RTL tests see, so a defect only Playwright
or the service worker would catch is invisible. And mutation measures the KILL side only: an over-strict test that
rejects a legitimate implementation stays with review.

**Status**: in force. **Evidence**: 7bdf539, ff01af0; `stryker.config.json`.

## [2026-05] Magic strings → constants

**Decision**: extract a magic string used in 2+ places OR carrying an external contract to a named constant, as an
`as const` object (not `enum`), typed `typeof OBJ[keyof typeof OBJ]`. Sites: `src/store/keys.ts` (persist keys,
devtools names, action constants), `src/lib/queryKeys.ts` (the TanStack Query key factory), `src/lib/pwa/keys.ts` (PWA
session keys: the service worker and cache survive deploys, so renaming a key without a migration is a silent
regression for existing users).

**Consequences**: not blanket. Do not extract single-use logger tags, test selectors, i18n keys or prototype scope. A
fork that adds more than 3 stores or 5 query keys without factories should drop the seed pattern.

**Status**: in force. **Evidence**: 7e279d8; `src/store/keys.ts`.

## [2026-05] Boundary validation via Zod safeFetch wrapper (PWA-aware)

**Context**: Workbox precache and runtime cache survive deploys. After a backend schema change an old cached response
keeps serving, and the app expects the new shape.

**Decision**: validate every API response at the boundary with a Zod schema through `src/lib/api/safeFetch.ts`.
TanStack Query `queryFn` uses `safeFetchQueryFn(url, schema)`, direct fetches use `safeFetch(url, schema)`, localStorage
reads use `Schema.safeParse(JSON.parse(raw))`. Reference: `src/lib/api/greeting.queries.ts`. `safeFetchQueryFn`
re-throws `AbortError` unchanged so TanStack Query handles cancellation; `installDevGuards()` in `src/lib/devGuards.ts`
suppresses the dev-only AbortError noise.

**Consequences**: zero bundle cost (zod is already a dependency), 50 to 200 μs per parse, and schemas duplicate backend
types. A fork that removes the pattern from 3+ endpoints is the signal that it does not fit; drop it from the seed.

**Status**: in force. **Evidence**: de8df11; `src/lib/api/safeFetch.test.ts`.

## [2026-05] Playwright SW lifecycle E2E (minimal subset)

**Context**: the service worker is the template's load-bearing primitive, and registration failure, manifest MIME drift
and icon 404s are the recurring deploy-host bugs of a PWA.

**Decision**: `e2e/sw-lifecycle.spec.ts` has three assertions: the SW registers and reaches `activated`;
`/manifest.webmanifest` returns 200 with a JSON manifest MIME and a valid shape; the 192, 512 and apple-touch icons
return 200 `image/png`. It needs `PLAYWRIGHT_USE_PREVIEW=1` (`devOptions.enabled` is false).

**Consequences**: deferred until a regression is observed (Playwright SW flakiness, microsoft/playwright#32230): the
`vite:preloadError` stale-chunk flow and the update-toast `'prompt'` flow. A fork that hits a SW regression the minimal
subset missed promotes them with `expect.poll`, an extended timeout and a retry quirk.

**Status**: in force. **Evidence**: 60b0ccd; `e2e/sw-lifecycle.spec.ts`.

## [2026-05] REJECT list: explicit non-adoption

Do not re-litigate without the stated lift. Each lifts on an event, not a date.

- **React Compiler**: vetoed (facebook/react#35105 and #35644, silent bailouts; the PWA bottleneck is the service worker
  and the MSW × Workbox layers, not render thrash; Babel-in-Vite gives up Oxc's gains). `eslint-plugin-react-hooks` 7
  already runs the Compiler's correctness rules as lint. Lift: both bugs closed, a named >100K-MAU Compiler-enabled
  Vite app, and the Vite team blessing the Babel path.
- **Lighthouse `numberOfRuns` 3, multi-route, mobile** (4 URLs × 3 runs × 2 form factors = 12 to 24 min): rejected on
  cost, the gate would become skip-tempting. Lift: a fork sees a perf regression a single run missed; then 3 runs × 1
  URL × desktop only.
- **React Doctor PR gate** (`--fail-on warning`): rejected. Lift: React Doctor 1.0 plus a dated bug it would have caught.
- **memlab**: skipped by default (no published GitHub releases). Lift: formal 2.0 releases plus a named React app case
  study. **why-did-you-render**: a consumer's choice, not a default.
- **Zstd compression plugin**: skipped; `vite-plugin-compression` already does brotli. Lift: caniuse Zstd above 80/100.
- **`vite-plugin-bundlesize`**: skipped, `size-limit` covers it.

**Status**: in force. **Evidence**: /consilium of 2026-05-23; 60b0ccd.

## [2026-04] Security workflow separate from build CI

**Decision**: `.github/workflows/security.yml` runs gitleaks, CodeQL (JavaScript / TypeScript, `security-extended`) and
the zizmor job on PR, push to `master` and a weekly schedule. It does not duplicate `ci.yml`.

**Consequences**: slow, policy-heavy scans do not couple to every `ci.yml` run, yet still gate merges and catch drift.

**Status**: in force. **Evidence**: fe054f5; `.github/workflows/security.yml`.

## [2026-04] MSW browser worker with a dev opt-out

**Decision**: DEV-only MSW uses `setupWorker` in `src/mocks/browser.ts`, handlers shared with Vitest. `main.tsx` starts
the worker when `import.meta.env.DEV` and `VITE_ENABLE_MSW !== 'false'` (default on in dev; `env.VITE_ENABLE_MSW` itself
is unused).

**Consequences**: one handler list for Node and browser, and mocks can be turned off without removing code. Dropping
the `import.meta.env.DEV` gate ships an MSW chunk in production; the total-JS budget in `.size-limit.json` catches it.

**Status**: in force. **Evidence**: `src/main.tsx:108`.

## [2026-04] i18n init failure: English-only fallback

**Decision**: if `i18nInitPromise` rejects, `main.tsx` removes `html.i18n-loading`, logs via `logger.error`, and renders
`I18nInitErrorFallback` in fixed English (`t()` is not available in this branch).

**Consequences**: the app can no longer sit on an empty tree when locale JSON fails to load.

**Status**: in force. **Evidence**: `src/main.tsx`.

## [2026-04] Web Vitals chunk split: automated check

**Decision**: `scripts/check-web-vitals-chunks.mjs` asserts `dist/assets` after build: the default bundle holds only
`subscribeStandard` and the standard `web-vitals` chunk; `npm run verify:web-vitals-chunks:full` runs two builds and
asserts the attribution variant too.

**Consequences**: branching on `env` from `@/env` pulls both dynamic imports into the graph;
`import.meta.env.VITE_WEB_VITALS_ATTRIBUTION` is required for dead-code elimination.

**Status**: in force. **Evidence**: `scripts/check-web-vitals-chunks.mjs`.

## [2026-04] eslint-import-resolver-typescript: single solution `tsconfig`

**Decision**: `createTypeScriptImportResolver` uses `./tsconfig.json` only (the solution file with `references`), not an
array of `tsconfig.*.json`.

**Consequences**: the resolver warns on multiple `project` entries; with one file it sets `references: 'auto'` and
follows `tsconfig.app`, `tsconfig.node` and `tsconfig.vitest` like `tsc -b`.

**Status**: in force. **Evidence**: `eslint.config.js`.

## [2026-04] TypeScript 6

**Decision**: TypeScript `~6.0.3` (the hold is in `scripts/version-holds.json`). `baseUrl` is deprecated in TS 6, so it
is removed from `tsconfig.json` and `tsconfig.app.json`; `paths` works without it.

**Consequences**: do not reintroduce `baseUrl`.

**Status**: in force. **Evidence**: `tsconfig.json`.

## [2026-04] Component pattern: arrow function + FunctionComponent

**Decision**: every React component is `const X: FunctionComponent<Props> = () => {}`; no `FC`, no function declarations
for components. `FC` is an alias, and the full name makes the type relationship explicit.

**Guards**: ESLint `no-restricted-imports` bans `FC` and `func-style: expression` bans declarations (exception:
`src/components/ui/`, which is shadcn-generated).

**Status**: in force. **Evidence**: `eslint.config.js`.

## [2026-03] Tailwind v4

**Decision**: Tailwind v4 with config in `src/index.css` (`@theme inline`) and the Vite-native `@tailwindcss/vite`
plugin, no PostCSS build dependency. `tw-animate-css` replaces `tailwindcss-animate`.

**Consequences**: the `container` utility has no JS `center` or `padding` option; apply utilities directly.

**Status**: in force. **Evidence**: `src/index.css`.

## [2026-03] Vite 8 with Rolldown, plugin-react 6 and vendor chunks

**Decision**: `vite@^8` ships Rolldown (no `rolldown-vite` alias, no `overrides`); `@vitejs/plugin-react@^6` matches its
peer range. `build.rolldownOptions.output.codeSplitting.groups` makes the vendor chunks, and the `state-vendor` group
includes `zustand`, `@tanstack/react-query` and `@tanstack/query-core` (analyzer runs showed `query-core` splitting out
when only `react-query` matched).

**Consequences**: React Compiler is not enabled (REJECT list).

**Status**: in force. **Evidence**: `vite.config.ts`.

## [2026-03] No FSD architecture in this template

**Decision**: a simple folder structure (`components/`, `hooks/`, `store/`, `lib/`, `pages/`) instead of FSD layers.

**Consequences**: FSD adds onboarding friction for a template meant to be cloned and extended; a fork can layer it on.

**Status**: in force. **Evidence**: `.cursor/brain/PROJECT_CONTEXT.md` § Architecture.

## [2026-03] Zustand for client state, TanStack Query for server state

**Decision**: a hard boundary: no Zustand for server data, no TanStack Query for pure UI state.

**Consequences**: mixing the two leads to cache inconsistency and double-refetch bugs. Zustand with devtools gives
observability for client state; TanStack Query owns the async lifecycle (loading, error, stale, refetch).

**Status**: in force. **Evidence**: `src/store/`, `src/lib/queryClient.ts`.
