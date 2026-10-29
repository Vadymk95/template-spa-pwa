# Verification — when to run what (agents & humans)

**Goal:** match checks to the MOMENT. The tier law itself lives in `AGENTS.md` § Commands / the gate —
one place, everything else points. This file holds the mechanics, the phase table, and the tracer. The stages
each gate script runs: `scripts/gate-tiers.json` (`checks.<name>.chain`), not repeated here.

## Phases — what a push proves, and the trigger that adds more

`scripts/gate-tiers.json` `"phase"` decides; `scripts/verify-push.mjs` dispatches; the skip is printed
on every phase-0 push. `GATE_PHASE=full` overrides per run (how gate machinery itself is pushed). CI
always runs the full chain — the phase gates only the LOCAL hook.

| Check | Runs at phase 0 (scaffold) | Added when (the trigger) |
| --- | --- | --- |
| the phase-0 push gate (`verify:scaffold:push`) | yes — every push, seconds | day one |
| production build in the gate | no | the FIRST DEPLOY: flip `"phase": 1` in its own commit |
| the checks that read the built artefact | no | same flip — they all measure a built artefact |
| prod-mode e2e (`vite preview`) | no | same flip — a prod boundary now exists |
| dev-server smoke (content variance) | CI `dev-smoke` job, every PR | unchanged by phases |
| mutation score | weekly CI / outside the gate | unchanged by phases |
| Lighthouse | CI `lighthouse` job, every PR; not required | unchanged by phases |

Measured here (`.gate-trace.log`, 2026-08-30 to 2026-09-11): a phase-0 push 15-20 s; the full chain
(`GATE_PHASE=full`, or phase 1) 32-47 s over six passing runs, p90 47 s — plus ~20 % headroom that is the
60 s `push` budget in `gate-tiers.json` (the one 131 s row is a failed run, not a measurement);
`verify:measure` 5.6-6.0 s; the mutation run 2m54s (`mutation.yml`).

`verify:iter` before the ESLint leg and the mutation-scope test: 3.9-11.5 s (`.gate-trace.log`, same dates). The two
legs were measured separately on 2026-10-29, in a git worktree of this repository on 12 cores shared with other work
(load average 9 when the session started, 36 when it ended; three runs per case, so ranges, not medians). ESLint alone,
with the flags of `lint-changed`: one file 4.5-32.8 s cold (a fresh cache) and 1.1-8.6 s warm; ten files 5.6-19.7 s cold
and 1.2-3.1 s warm. The leg over the 42 changed files of that worktree: 7.0 s cold, 1.4 s warm. The mutation-scope test
by name: 1.5-2.6 s. With `package.json` or the vitest config dirty the whole suite runs: 40 s and 52 s through the chain
without its hooks check (90 test files; the 52 s run had one timeout of a test this change does not touch, which the
second run did not repeat). The iterate budget stays 15 s (`scripts/gate-tiers.json`): a cold first run or a dirty
config can pass it on a loaded machine, and `trace:report` lists that as a finding.

## The tracer — how it works (the RULES it enforces are the tier law)

Every `verify*` and `test:e2e` run appends one TSV row to `.gate-trace.log` (gitignored);
`npm run trace:report` turns rows into findings — a forbidden stage run standalone, a run over its
moment's budget, a code check against a docs-only change, a push from a linked worktree. Moments,
budgets and classes are DATA in `scripts/gate-tiers.json`; the analyser names no stage, so the
discipline changes by editing that JSON.

## Ports — the mechanics

`e2e:one` and `verify:measure` route through `scripts/run-on-free-port.mjs`, which probes up from the
base port and exports `PORT` + `PLAYWRIGHT_BASE_URL`; the Playwright config passes that port into its
webServer command, because Vite reads neither variable. Playwright tears down the server it started.
The push gate's preflight takes `--kill-port` (SIGTERM, re-probe, refuse if it will not die). It calls a port busy
only when two looks 150 ms apart both find it busy (`isPortBusy` in `scripts/check-gate-env.mjs`): one look cannot tell
a server from a socket another process holds for a millisecond, and `scripts/run-on-free-port.mjs` binds every port it
walks.

Tests that bind sockets take their ports from `scripts/quiet-ports.mjs`: 10000-19999, below both ephemeral ranges,
one window per checkout and one lane per test file, never `listen(0)` or a fixed number.

`npm run probe` starts its own server the same way: the first free port from `PORT` (3000 for `--dev`, 4273 for the
build) with `--strictPort`, in a process group of its own, and it stops that whole group on every way out, signals
included. A probe killed outright (SIGKILL, a power cut) leaves the group behind: the record in `.probe/server.json`
lets the next run stop it, but only when the recorded start time and command prove it is the same server
(`scripts/server-group.mjs`). A busy port still means MOVE: the probe never signals a server it did not start.

## What each chain contains (mechanics — WHEN to run them is the tier law)

- **`npm run verify:iter`** — the hooks check first (a clone without git hooks fails here, not at a push that runs no gate), the cheap
  static checks (the type check is incremental; the push tiers run it forced), then ESLint, type-aware, on the files the working tree changed
  (tracked changes against HEAD and untracked files, deleted ones left out; `scripts/lint-changed.mjs`), then only the
  tests reachable from the uncommitted diff, then the mutation-scope test by name (stages: `scripts/gate-tiers.json`).
  Deliberate properties:
    - while `package.json` or a vite/vitest config is dirty, `--changed` runs the FULL suite. The force-rerun triggers
      are literal paths anchored at the repository root (`forceRerunTriggersFor` in `vitest.config.ts`): the runner's
      defaults never match a config file, and a `**` stops at a dot-directory such as `.worktrees/`, where not even
      `package.json` fired. That edit alone costs the whole suite, over the 15 s iterate budget by design;
    - `--changed` follows the import graph only, so cross-cutting suites surface at the push chain. The one exception
      is `scripts/mutation-scope.test.mjs`: it reads `stryker.config.json` as text, nothing imports that file, so the
      chain runs it by name;
    - the ESLint cache follows the Tailwind stylesheet. Both Tailwind rule families open `src/index.css` themselves and
      the cache keys on the file and the resolved config only, so `eslint.config.js` puts a fingerprint of that
      stylesheet, the local files it `@import`s and the installed version of each package it imports (`tailwindcss`,
      `tw-animate-css`) into `settings` for `**/*.tsx` (`scripts/css-fingerprint.mjs`). A stylesheet edit or a package
      upgrade re-lints those files and nothing else, so there is no `.eslintcache` to delete by hand. The package's
      files are not hashed: a patched copy with the same version is not seen;
    - `.cursor/` is ignored by both linters: it is tracked for the brain, rules, commands and templates, and an agent's
      scratch script there would otherwise red the chain.
- **`npm run verify`** — every **offline** check. Stage order: `scripts/gate-tiers.json`; the superset
  rule and the push/CI split: `AGENTS.md` § the gate; why: `DECISIONS.md` § "The gate is `verify`; `verify` is a superset of CI".
- **`npm run verify:ci`** — the CI gate. Its network-bound checks need the network, which is why they
  sit outside `verify`. **`npm run verify:full`** — predicts the whole CI pipeline, the dev-smoke job included. `smoke:dev`
  measures the content-variance fixture (mounted only under `import.meta.env.DEV`, so it is
  unreachable from the `vite preview` run and needs its own server); CI runs it as the mandatory
  `dev-smoke` job. **`npm run ci:local`** — a local dry run of CI, Lighthouse included; CI runs Lighthouse as its own `lighthouse` job.

---

## Minimal check by task type

- **Docs only** (`*.md` in repo root / `README`, brain markdown) — `npm run format:check`
- **Docs, rules, commands, brain, tier data** (`*.md`, `*.mdc`, `scripts/gate-tiers.json`) — `npm run docs:check` (the pre-commit hook runs it when such files are staged; `--weekly`, the scheduled Docs workflow's flag, runs the same checks so a quarantine that expires while nobody pushes still turns it red; it also refuses a focused test, an unconditional way to switch a test off (`.skip`, `.fixme`, an expected failure such as `.fails` or `.failing`, a constant `.skipIf(true)`) without `quarantine until YYYY-MM-DD` + reason, a quarantine date more than 30 days out, a quarantine whose date has arrived (red ON the date, UTC, not the day after), a gate chain view in `scripts/gate-tiers.json` that differs from `package.json`, a gate command that lost a strict flag (the linters' `--max-warnings 0` and `--deny-warnings`, a test run that does not run once) or carries `--passWithNoTests` outside the iterate chain, a path that names an emptied folder, an ignored file or a line number (cite the symbol), a `DECISIONS.md` entry without an index row, a row without an entry, or an entry over 30 lines, a hand-written retelling or composition of the chain (a line naming three or more of its stages, or two parts of one script), and an agent-memory import: an `@` pointer in `CLAUDE.md` or `AGENTS.md` that names a file, which Claude Code would load into every session; write it as a backticked path instead). The same check runs inside `verify` and `verify:scaffold`, so doc drift fails a push, not only a commit
- **Proposing a new browser spec** — the suite is counted in invariants, not screens (`AGENTS.md` § the gate), by the `test(` and `it(` calls in the spec files, so a second subject of an invariant that already has a case becomes a `test.step` or an extra assertion in that case, never a new `test(`; the ceiling is raised only with a measurement and a `DECISIONS.md` line. `npm run docs:check` prints the suite's measurement and reports it against the ceiling in `scripts/gate-tiers.json` § suites
- **Styling only** (`*.css`, `*.scss`, `*.styled.*`) — `npm run format:check`; `npm run lint` too if CSS is in ESLint scope
- **i18n copy only** (value edits in `public/locales/**/*.json`) — `npm run format:check`; wrapping for
  new copy lengths is the content-variance tier's job, not a per-edit run
- **TS/TSX / tests** (logic, components, hooks, stores) — `npm run verify:iter`
- **A type error the editor does not show, or a `tsconfig*.json` edit** — `npm run typecheck`. It is incremental: each of the four projects (app, node, vitest and the browser specs) keeps its state in a file under `.tsbuild/` (git-ignored, outside `node_modules`), so an unchanged run takes about 0.1 s and a one-file change 0.7 to 2.0 s (measured here: 0.07 s unchanged, 0.7 s after one browser-spec file, 0.9 to 2.0 s after one `src` file; the plain run took 2.6 to 3.5 s every time before). A plain `tsc -b` follows the project's own files only and does not see a dependency that changed in `node_modules` (measured in a sibling template: a changed dependency type file left it at exit 0, `tsc -b --force` at exit 2),
  so the push tiers run it forced (`npm run typecheck:force`), and an iterate run after `npm ci` or a lockfile change wants `npx tsc -b --force` once
- **A new hook or util** (`src/hooks/**`, `src/lib/**`) — after `npm run verify:iter`, a file-scoped mutation run: `npx stryker run --mutate <file>` (`npx stryker run --help`: `--mutate` selects one file or a subset, `--testFiles` limits the test files that run). Measured in a fork: one minute over a new hook found three tests that looked complete and were not, which a green unit run hides. It stays outside `verify:iter`, `verify` and the push gate (`DECISIONS.md` § Mutation testing)
- **E2E / Playwright** (`e2e/**`, `playwright.config.ts`, routing/flows) — `npm run e2e:one -- <spec>` (free port, traced); the whole suite runs at the push, never by hand. Both Playwright configs block service workers, because `page.route` cannot see a request a worker answers (MSW's on the dev server, Workbox's on the preview); `e2e/sw-lifecycle.spec.ts` opts back in with `test.use`. A plain local `npm run test:e2e` (no `PLAYWRIGHT_USE_PREVIEW`) attaches to a dev server already listening on its port (`reuseExistingServer: true` in `playwright.config.ts`), so a server left running from another branch is what gets measured _(inference from the config and from the comment in `playwright.dev.config.ts`)_; the preview run and the dev-smoke config always start their own
- **Touches `src/env.ts`, `vite.config.ts`, `src/lib/vitals.ts`, `src/lib/webVitals/`** — Above + `node scripts/check-web-vitals-chunks.mjs` on a fresh `dist/`
- **PWA** (`vite.config.ts → VitePWA`, `app.config.ts`, `index.html` PWA meta, `public/icons/**`, `src/components/common/PwaUpdateToast/**`, `src/hooks/pwa/**`, `src/lib/pwa/**`) — `npm run verify:iter`, then `npm run verify:pwa` on a fresh `dist/`
- **Perf budget** (any change that could move LCP/CLS/TBT — vendor chunks, fonts, route-loaded code, third-party deps) — `npm run perf:ci` on a fresh `dist/` (Lighthouse vs `vite preview`; `lighthouserc.json`)
- **A11y** (`src/components/common/**`, `src/components/ui/**`, `src/pages/**` UI, `index.html` semantics) — Above + `npm run verify:measure -- e2e/a11y.spec.ts` (axe scan, preview mode)
- **Feature flag wiring** (`src/lib/features/**`, `src/hooks/features/**`, provider swap in `main.tsx`) — `npm run verify:iter`
- **MSW** (`src/mocks/**`, `test/handlers.ts`, MSW wiring in `main.tsx`) — `npm run verify:iter` (smoke dev manually if handlers changed)
- **Suspected bundle size / duplicate deps** — `npm run build:analyze` → open `dist/bundle-analysis.html` (do not commit HTML)
- **Regressions in standard vs attribution web-vitals chunks** — `npm run verify:web-vitals-chunks:full` (two full builds — use sparingly); bare `verify:web-vitals-chunks` = single-build assert on existing `dist/`
- **Vendor chunk byte budget** (touched `vite.config.ts` `codeSplitting.groups`, added a vendor dep, or heavier `build` output) — `npm run size:check` on a fresh `dist/`
- **PWA Service Worker lifecycle** (`vite.config.ts → VitePWA`, `removeMswPlugin`, `workbox`, icons) — `npm run verify:measure -- e2e/sw-lifecycle.spec.ts` (preview-mode only — dev disables PWA SW)
- **Security headers / CSP** (`vite-plugins/security-headers.ts`, an inline `<script>` in `index.html`, a new third-party origin, `API_DEFAULT_URL`) — `npm run test:one -- vite-plugins/security-headers.test.ts` + `npm run verify:measure -- e2e/smoke.spec.ts e2e/security-headers.spec.ts` (preview serves the policy; any preview-mode spec fails on a CSP violation (a console message or a `securitypolicyviolation` event))

---

## Deterministic enforcement layers (added 2026-06-05; pre-push updated 2026-07)

Quality is enforced by **code, not advisory rules** — so a cheap model (Cursor Auto/Composer) can't skip it. Layers, earliest → latest:

1. **Pre-commit** (`.husky/pre-commit`) — `lint-staged` (the tools it runs: `package.json`) on the **staged** set; then `scripts/check-test-siblings.mjs` (TDD-gate) **blocks** committing a `src` logic file with no co-located `*.test.*` that is tracked or staged (it reads the git index, not the disk, so an untracked or unstaged test does not count; the first commit of a repository, with no HEAD yet, is not judged); the gate repeats the check over everything the branch changed (`--range`, inside `verify` and `verify:scaffold`), so a `--no-verify` commit is caught at the push; then the **repo-wide** cheap checks (the list is `.husky/pre-commit`); all of them run even when one fails, so one attempt reports everything. Why the repo-wide pass exists: `DECISIONS.md` [2026-07] § Pre-commit is repo-scoped. Remedy on refusal: `npm run fix && git add -u`.
2. **Pre-push** — **`npm run verify:push`**, phase-aware (see the phase table above): the phase-0 push gate before the first deploy, `verify:ci` from phase 1.
3. **CI** (`.github/workflows/ci.yml`) — a single `npm run verify:ci` step over the same script, plus the browser cache and artifact uploads, plus the `dev-smoke` job (content-variance fixture on a dev server) and the `cross-browser` job (Firefox + WebKit on the geometry specs). **`.github/workflows/security.yml`** runs gitleaks over full history, CodeQL `security-extended` and zizmor (workflow files, fails on medium and above; config in `.github/zizmor.yml`, local command `uvx zizmor@1.30.1 .github/workflows`) in parallel, all three required checks; its exclusions live in `.github/codeql/codeql-config.yml` with the reason written down.

Rules added 2026-10-08: `@eslint-community/eslint-comments/require-description` + `no-unlimited-disable` (a suppression carries `-- reason` and names its rule); `no-restricted-imports` on `e2e/*.spec.ts` (import `test` from `./support/fixtures`, whose automatic fixture fails a test on a CSP violation (a console message or a `securitypolicyviolation` event)).

Rules added 2026-06-05: `@typescript-eslint/no-magic-numbers` (error; named consts in `src/lib/constants.ts`), `import-x/no-restricted-paths` (layer boundaries: `components/hocs/hooks/lib/store` ⇏ `pages`), `i18next/no-literal-string` (warn; hardcoded JSX strings → `t()`).

---

## Local gates: the offline gate and `ci:local`

- **`npm run verify`** — the gate. Everything offline; the stages, in order: `scripts/gate-tiers.json`.
- **`npm run verify:ci`** — the CI gate. CI always runs this; pre-push runs it in phase 1 (see § Phases above).
- **`npm run ci:local`** — a local dry run of CI, Lighthouse included. Lighthouse is the only check outside the gate; CI runs it as the `lighthouse` job (one run, warn-only budgets except accessibility, not a required check).
- **`npm run bench:verify`** — the same steps with per-step timings, to attribute a slow gate.
- **`npm run fix`** — the one remedy: the autofix of every linter and the formatter (the `fix` script in `package.json`), repo-wide. Re-run the checks that flagged the file to see the residual autofix could not handle; that residual needs a decision, not another `--fix`.

**Do not** run `ci:local` as default for one-line fixes or copy-only brain edits.

### A flaky pass fails CI

CI retries a failing Playwright test twice, so the first failure leaves a trace and a video to read, and
both configs set `failOnFlakyTests` on CI: a test that fails and then passes on a retry is reported as
flaky and **fails the run**. Without the flag a retry turns the flake into a green line and it merges
unseen. The desk run and the push gate never retry (`retries: 0`), so there is nothing for the flag to act
on there. Both settings are pinned in `scripts/check-playwright-gate-config.test.mjs`.

A flaky test is fixed at its cause, or quarantined with `quarantine until YYYY-MM-DD` and the reason in
the line above it; it is never retried into green. The date is the first RED day, so the check fails ON
the date (UTC), not the day after, and it may be at most 30 days from today: a quarantine is a short loan,
so `until 2099-12-31` is red as well. A fix that is not due yet is re-dated with the reason, never
extended by a far date. `docs:check` runs in the gate and in the weekly Docs workflow, so an expired
quarantine turns the next push red even when nobody touches the docs.

A focused test (`it.only`, `describe.only`) is refused twice: `docs:check` reads the source, and
`vitest.config.ts` sets `allowOnly: false`, because Vitest's default permits `.only` outside CI and a
focused suite exits 0 having run one test. To iterate on one test use `npm run test:one -- <file>` or `-t <name>`.

### After a red push: re-run only what failed

Both Playwright configs cap failures (`maxFailures`) on the gate run and in CI, and each writes
`.last-run.json` to its own `outputDir` — see `AGENTS.md` § the gate and `DECISIONS.md` § "Playwright `maxFailures: 10` on the gate run and in CI".
The re-run after a fix, production-mode suite (`npm run build` first in both cases):

- **The red stopped at the cap**: `PLAYWRIGHT_USE_PREVIEW=1 npx playwright test <failed spec files from the red output>`
- **The red finished under the cap**: `PLAYWRIGHT_USE_PREVIEW=1 npx playwright test --last-failed`

Name the files rather than reaching for `--last-failed` by default: after a capped stop,
`.last-run.json` also lists every test the run never reached, so `--last-failed` re-runs most of
the suite instead of only what failed.

- **Dev smoke**: `npx playwright test --config playwright.dev.config.ts --last-failed`

---

## Capturing results honestly

The checklist (exit code without a pipe, prove the gate can go red, mutation-check the tests, name the
condition under which a green would have been red): `.cursor/rules/agent-pipeline.mdc` § 4.1a — one home.

---

## Do not run by default

- **`npm run verify:web-vitals-chunks:full`** — two production builds; only for vitals/env/chunk work
- **`npm run icons:placeholders`** — regenerates placeholder PWA icons; only after editing the generator (PNGs are committed)
- **`ANALYZE=true` / `build:analyze`** — heavy; only for bundle investigation
- **`npm ci`** — reinstalls deps; CI uses it on clean runners — locally when lockfile changes

---

## Brain / MAP sync

If you add or change a script, a hook or a CI step: the `AGENTS.md` command table (the home) and, for mechanics or timings, this file. If entry points, routes, or `src/lib` layout change, align `.cursor/brain/MAP.md` (and `.cursor/brain/SKELETONS.md` if new hazard).

---

## Content variance

The rule: `AGENTS.md` § Critical rules › Content variance. Why and what it found: `DECISIONS.md`
§ "Content variance is measured in a browser, not asserted in jsdom"; the cross-engine measurement:
`DECISIONS.md` § "Cross-engine coverage is opt-in and scoped". The "under which condition would this green have been red" shapes: `agent-pipeline.mdc` § 4.1a.
