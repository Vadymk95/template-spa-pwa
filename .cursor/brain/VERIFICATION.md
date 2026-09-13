# Verification — when to run what (agents & humans)

**Goal:** match checks to the MOMENT. The tier law itself lives in `AGENTS.md` § Commands / the gate —
one place, everything else points. This file holds the mechanics, the phase table, and the tracer.

## Phases — what a push proves, and the trigger that adds more

`scripts/gate-tiers.json` `"phase"` decides; `scripts/verify-push.mjs` dispatches; the skip is printed
on every phase-0 push. `GATE_PHASE=full` overrides per run (how gate machinery itself is pushed). CI
always runs the full chain — the phase gates only the LOCAL hook.

| Check | Runs at phase 0 (scaffold) | Added when (the trigger) |
| --- | --- | --- |
| audit, hooks-check, oxlint, format, tsc, lint, coverage | yes — every push, seconds | day one |
| production build in the gate | no | the FIRST DEPLOY: flip `"phase": 1` in its own commit |
| `verify:pwa`, web-vitals chunks, `size:check` | no | same flip — they all measure a built artefact |
| prod-mode e2e (`vite preview`) | no | same flip — a prod boundary now exists |
| dev-server smoke (content variance) | CI `dev-smoke` job, every PR | unchanged by phases |
| mutation score, Lighthouse | weekly CI / outside the gate | unchanged by phases |

Measured here (`.gate-trace.log`, 2026-08-30 to 2026-09-11): a phase-0 push 15-20 s; the full chain
(`GATE_PHASE=full`, or phase 1) 32-47 s over six passing runs, p90 47 s — plus ~20 % headroom that is the
60 s `push` budget in `gate-tiers.json` (the one 131 s row is a failed run, not a measurement);
`verify:iter` 3.9-11.5 s; `verify:measure` 5.6-6.0 s; the mutation run 2m54s (`mutation.yml`).

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
The push gate's preflight takes `--kill-port` (SIGTERM, re-probe, refuse if it will not die).

## What each chain contains (mechanics — WHEN to run them is the tier law)

- **`npm run verify:iter`** — `lint:oxlint` → `typecheck` (incremental via `tsc -b`) →
  `vitest run --changed --passWithNoTests`. Two deliberate properties: while `package.json` or a
  vite/vitest config is dirty, `--changed` runs the FULL suite (force-rerun triggers); and
  `--changed` follows the import graph only, so cross-cutting suites surface at the push chain.
- **`npm run verify`** — every **offline** check. Stage order: the `verify:inner` script; the superset
  rule and the push/CI split: `AGENTS.md` § the gate; why: `DECISIONS.md` [2026-07].
- **`npm run verify:ci`** — `audit:gate && verify`; the audit gate needs the network, which is why it
  sits outside `verify`. **`npm run verify:full`** — `verify:ci && smoke:dev`, where `smoke:dev`
  measures the content-variance fixture (mounted only under `import.meta.env.DEV`, so it is
  unreachable from the `vite preview` run and needs its own server); CI runs it as the mandatory
  `dev-smoke` job. **`npm run ci:local`** — `verify:ci` plus Lighthouse, outside the gate on cost.

---

## Minimal check by task type

- **Docs only** (`*.md` in repo root / `README`, brain markdown) — `npm run format:check`
- **Docs, rules, commands, brain, tier data** (`*.md`, `*.mdc`, `scripts/gate-tiers.json`) — `npm run docs:check` (the pre-commit hook runs it when such files are staged; `--weekly` adds past revisit dates; it also refuses a focused test and an unconditional skip without `quarantine until YYYY-MM-DD` + reason)
- **Styling only** (`*.css`, `*.scss`, `*.styled.*`) — `npm run format:check` + `npm run lint` (if CSS is in ESLint scope)
- **i18n copy only** (value edits in `public/locales/**/*.json`) — `npm run format:check`; wrapping for
  new copy lengths is the content-variance tier's job, not a per-edit run
- **TS/TSX / tests** (logic, components, hooks, stores) — `npm run verify:iter`
- **E2E / Playwright** (`e2e/**`, `playwright.config.ts`, routing/flows) — `npm run e2e:one -- <spec>` (free port, traced); the whole suite runs at the push, never by hand
- **Touches `src/env.ts`, `vite.config.ts`, `src/lib/vitals.ts`, `src/lib/webVitals/`** — Above + `npm run build && node scripts/check-web-vitals-chunks.mjs`
- **PWA** (`vite.config.ts → VitePWA`, `index.html` PWA meta, `public/icons/**`, `src/components/common/PwaUpdateToast/**`, `src/hooks/pwa/**`, `src/lib/pwa/**`) — `npm run verify:iter && npm run build && npm run verify:pwa`
- **Perf budget** (any change that could move LCP/CLS/TBT — vendor chunks, fonts, route-loaded code, third-party deps) — `npm run build && npm run perf:ci` (Lighthouse vs `vite preview`; `lighthouserc.json`)
- **A11y** (`src/components/common/**`, `src/components/ui/**`, `src/pages/**` UI, `index.html` semantics) — Above + `npm run verify:measure -- e2e/a11y.spec.ts` (axe scan, preview mode)
- **Feature flag wiring** (`src/lib/features/**`, `src/hooks/features/**`, provider swap in `main.tsx`) — `npm run verify:iter`
- **MSW** (`src/mocks/**`, `test/handlers.ts`, MSW wiring in `main.tsx`) — `npm run verify:iter` (smoke dev manually if handlers changed)
- **Suspected bundle size / duplicate deps** — `npm run build:analyze` → open `dist/bundle-analysis.html` (do not commit HTML)
- **Regressions in standard vs attribution web-vitals chunks** — `npm run verify:web-vitals-chunks:full` (two full builds — use sparingly); bare `verify:web-vitals-chunks` = single-build assert on existing `dist/`
- **Vendor chunk byte budget** (touched `vite.config.ts` `codeSplitting.groups`, added a vendor dep, or heavier `build` output) — `npm run build && npm run size:check`
- **PWA Service Worker lifecycle** (`vite.config.ts → VitePWA`, `removeMswPlugin`, `workbox`, icons) — `npm run verify:measure -- e2e/sw-lifecycle.spec.ts` (preview-mode only — dev disables PWA SW)

---

## Deterministic enforcement layers (added 2026-06-05; pre-push updated 2026-07)

Quality is enforced by **code, not advisory rules** — so a cheap model (Cursor Auto/Composer) can't skip it. Layers, earliest → latest:

1. **Session start** — Cursor `session-init.sh` + Claude `brain-loader.sh` inject this repo's brain pointers + SKELETONS danger-zones + a "read before editing" mandate into context (`~/.claude/hooks/brain-digest.sh`). Unskippable, unlike `/init`.
2. **On edit (Cursor)** — `auto-format.sh` (prettier) + `lint-surface.sh` (postToolUse) run `eslint --fix` and inject remaining errors back into context immediately.
3. **Pre-commit** (`.husky/pre-commit`) — `lint-staged` (oxlint → eslint → prettier) on the **staged** set; then `scripts/check-test-siblings.mjs` (TDD-gate) **blocks** committing a `src` logic file with no co-located `*.test.*`; then **repo-wide** `lint:oxlint`, `format:check` and `typecheck`; all three run even when one fails, so one attempt reports everything. Why the repo-wide pass exists: `DECISIONS.md` [2026-07] § Pre-commit is repo-scoped. Remedy on refusal: `npm run fix && git add -u`.
4. **Pre-push** — **`npm run verify:push`**, phase-aware (see the phase table above): the audit gate always, plus the offline gate at phase 0 and the whole chain from phase 1.
5. **CI** (`.github/workflows/ci.yml`) — a single `npm run verify:ci` step over the same script, plus the browser cache and artifact uploads, plus the `dev-smoke` job (content-variance fixture on a dev server) and the `cross-browser` job (Firefox + WebKit on the geometry specs). **`.github/workflows/security.yml`** runs gitleaks over full history and CodeQL `security-extended` in parallel; its exclusions live in `.github/codeql/codeql-config.yml` with the reason written down.

Rules added 2026-06-05: `@typescript-eslint/no-magic-numbers` (error; named consts in `src/lib/constants.ts`), `import-x/no-restricted-paths` (layer boundaries: `components/hocs/hooks/lib/store` ⇏ `pages`), `i18next/no-literal-string` (warn; hardcoded JSX strings → `t()`).

---

## Local gates (`verify` vs `ci:local`)

- **`npm run verify`** — the gate. Everything offline; the stage order is the `verify:inner` script.
- **`npm run verify:ci`** — `audit:gate && verify`. CI always runs this; pre-push runs it in phase 1 (see § Phases above).
- **`npm run ci:local`** — `verify:ci` + `perf:ci`. Lighthouse is the only check outside the gate.
- **`npm run bench:verify`** — the same steps with per-step timings, to attribute a slow gate.
- **`npm run fix`** — the one remedy: `oxlint --fix` → `eslint --fix` → `prettier --write`, repo-wide. Re-run `lint` and `format:check` afterwards to see the residual autofix could not handle; that residual needs a decision, not another `--fix`.

**Do not** run `ci:local` as default for one-line fixes or copy-only brain edits.

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
§ Content variance is measured in a browser; the cross-engine measurement: `DECISIONS.md` § Cross-engine
coverage. The "under which condition would this green have been red" shapes: `agent-pipeline.mdc` § 4.1a.
