# react-spa-pwa-foundation — agent guide

Production-ready React 19 + Vite 8 (Rolldown) PWA template — vite-plugin-pwa (Workbox), routing, Zustand + TanStack Query, i18next, Tailwind v4, Vitest + Playwright pre-configured.

## Start here

1. Read `.cursor/brain/PROJECT_CONTEXT.md` before any task, then open `.cursor/brain/READING_INDEX.md`: it maps a situation ("about to change a shared primitive") to the two or three files that answer it. Depth: `.cursor/brain/MAP.md` (architecture), `.cursor/brain/SKELETONS.md` (danger zones), `.cursor/brain/VERIFICATION.md` (what to run per change), `.cursor/brain/PWA.md`, `.cursor/brain/TEMPLATE_SEEDS.md` (do NOT remove as dead code), `.cursor/brain/EXTENSIONS.md` (graduation checklist), `.cursor/brain/DECISIONS.md` (decisions in force; history is `git log -p`), `examples/auth-bearer-pattern/README.md` (auth alternatives).
2. `.cursor/rules/*.mdc` are **binding for the files they cover**: read the ones for the area you touch before the first edit.
3. Before building, check the work is still needed (`git log --oneline -15` plus one grep for what the task names). LOOK instead of inferring (`npm run probe`). When you dispatch work to another agent, name the files.
4. **This file is the canonical guide for every tool**: Cursor and Codex load it natively, Claude Code through the one-line import in `CLAUDE.md`. Edit THIS file; never grow the shim. Code is ground truth: if a line here conflicts with the code, follow the code and fix the stale line in the same session.

## Stack

React 19 · TypeScript 6.0 strict · Vite 8 (Rolldown) · Tailwind **v4** · shadcn/ui · Zustand 5 · TanStack Query 5 · React Router 7 · i18next · Vitest 4.1 · vite-plugin-pwa 2.x (Workbox, generateSW + prompt-mode)

## Critical rules

- **Tailwind v4** — no `tailwind.config.ts`; the theme lives in `src/index.css` (`@theme inline {}`); dark mode via the `.dark` class; animations via `tw-animate-css`.
- **Components** — logic in a `useComponentName.ts` hook beside the component; explicit in/out types (`FunctionComponent<Props>` or an explicit return type); property-style interface callbacks. Enforced by `explicit-function-return-type` and `method-signature-style`.
- **Pages and stores** — pages lazy by default (`PageName.tsx` + `index.ts` with `lazy()`, wrapped in `WithSuspense` in the router); Zustand stores use `createSelectors`, live in `src/store/<domain>/`, tests alongside.
- **i18n** — no hardcoded strings: every user-visible string goes through `t()`. English-only surfaces (i18n-init fallbacks, dev tooling) carry documented eslint overrides.
- **Imports** — `@/` alias only, no `../../`; order by `eslint-plugin-import-x`; `components/hocs/hooks/lib/store` must not import `pages` (`import-x/no-restricted-paths`).
- **No magic numbers** — named constants in `src/lib/constants.ts` (`@typescript-eslint/no-magic-numbers`, error).
- **Testing (TDD)** — vertical slices: one test → its implementation → repeat; test behaviour through public interfaces. `scripts/check-test-siblings.mjs` (pre-commit) blocks a `src` logic file with no co-located `*.test.*`.
- **PWA** — manifest and Workbox config in `vite.config.ts`; update toast in `src/components/common/PwaUpdateToast/`; install hook `src/hooks/pwa/usePwaInstall.ts`. Do not flip `registerType` post-deploy, drop the `apple-mobile-web-app-capable` meta tag or enable `devOptions.enabled`. Threat model: `.cursor/brain/PWA.md`.
- **Security headers** come from ONE definition, `vite-plugins/security-headers.ts` (it feeds `dist/_headers` and `vite preview`). The CSP has no `unsafe-*`: a new inline script, third-party origin or `data:` source changes the policy in that file, never in a host config. A CSP violation fails a preview-mode e2e spec. Host recipes: `SECURITY_REQUIREMENTS.md`.
- **Reuse first, consistency beats preference** — search for an existing function, util, component or constant before creating one, and extend it; match the surrounding file.
- **Content variance** — anything that renders authored copy is proven in a real browser against content it has NOT seen (text: minimal / typical / long / unbroken; collections: none / one / many). Add a case to `/dev/ui/content-stress` (dev-only; `e2e/dev/content-stress.spec.ts`) with every content-bearing component. The range of widths a guard covers is part of its spec, and a wrap class with no red-to-green proof is deleted. Engines disagree on intrinsic sizing, font metrics and scrollbar gutters: measure (`CROSS_BROWSER=1` adds Firefox and WebKit), never predict.
- **Zero warnings, a complexity ratchet** — `eslint --max-warnings 0`, `oxlint --deny-warnings`. Fix the cause; never downgrade a rule or sprinkle `eslint-disable`. A suppression that stays says why on the same comment, and a rule wrong for a class of files gets a documented file-scoped override in `eslint.config.js`. The complexity limits there sit above the measured ceiling: a hit is new drift, so split the function; raising a number needs a fresh measurement and a `DECISIONS.md` update.
- **Pre-commit is repo-scoped** — `lint-staged`, the TDD sibling gate, then `lint:oxlint`, `format:check` and `typecheck` over the whole repo; the remedy for any failure is `npm run fix && git add -u`.
- **Bootstrap after clone** — `npm run prepare` once (`.npmrc` disables lifecycle scripts as a supply-chain guard, so husky does not install itself; `verify` fails loudly without hooks). `.npmrc` `min-release-age=3` (DAYS) holds a brand-new release back: an urgent patch needs `npm install <pkg> --min-release-age=0`. The lockfile obeys the same cooldown: `npm run lock:age` (in `verify:ci`) fails a changed `name@version` younger than `min-release-age`; a deliberate bypass bump is listed with a reason and an expiry in `scripts/lock-age-allowlist.json`.
- **Machine-agnostic configs** — no absolute local paths (the VS Code i18next extension rewrites `i18next.i18nPaths`; keep them relative) and no DURATION measured on one machine: `scripts/gate-tiers.json` holds a ratio and a sample size, and the gate calibrates its own baseline into the gitignored `.gate-budget.json`.

## Commands / the gate

The gate and iteration commands (`README.md` lists the rest). Agent commands `/onboard` `/feat` `/test` `/review` `/docs` live in `.claude/commands/`, mirrored by shims in `.cursor/commands/`.

```bash
npm run dev           # Vite dev server
npm run verify:iter   # iteration tier: oxlint → tsc → vitest --changed (seconds; run per change)
npm run verify:measure # MEASURE moment: build + look; add `-- e2e/<f>.spec.ts` for one preview-mode spec
npm run e2e:one -- <spec> # one Playwright spec, FREE port, through the tracer (`test:e2e:prod` = all, against vite preview)
npm run test:one -- <file> # one unit test file, through the tracer (not around it)
npm run probe -- <route> [widths] # LOOK: render with classic scrollbars drawn, screenshot per width, print measured quantities (an instrument, never a gate)
npm run trace:report  # findings from .gate-trace.log (forbidden moments, budgets, worktrees); `bench:verify` times the gate stage by stage
npm run docs:check    # docs class: paths, scripts, sentinels, versions, command table, dead docs, section pointers, test quarantines, agent-memory imports (pre-commit when docs are staged; weekly CI adds --weekly)
npm run verify:push   # what pre-push runs: phase-aware (scripts/gate-tiers.json)
npm run verify        # THE gate: preflight → oxlint → format → typecheck → eslint (cached) → coverage → build
                      # → verify:pwa → web-vitals chunks → size-limit → playwright → e2e   (preflight = hooks, version holds, engines floor, gate env)
npm run verify:ci     # verify + `audit:gate` (fail-closed audit, self-expiring allowlist) + `lock:age` (lockfile vs the cooldown): the CI chain; the push runs it in phase 1
npm run verify:full   # verify:ci + `smoke:dev` (the content-stress fixture against `vite dev`)
npm run ci:local      # verify:ci + perf:ci (Lighthouse); CI runs Lighthouse as its own `lighthouse` job
npm run fix           # oxlint --fix → eslint --fix → prettier --write, repo-wide (the one remedy)
npm run test:mutation # StrykerJS strength gate, weekly `mutation.yml`, NOT in verify; `thresholds.break` is a measured floor: raise it, never lower it
```

<!-- shared-harness:begin -->
<!-- This block is byte-identical in all four templates (template-1, template-spa-pwa, template-next-seo, template-rn). Change it in every template in the same commit, or not at all. Stack-specific facts (which stages `verify` runs, ports, what is skipped and why, timings) live OUTSIDE this block: in the command table above and in `.cursor/brain/VERIFICATION.md`. -->

### The tier law - this section is the ONLY place it lives

Every other file (rules, commands, brain, README, Copilot instructions) points here and restates nothing.
A restated pipeline rule goes stale in place; a stale copy cost a sibling repo a day of 40-minute rounds
because five copies still demanded the full chain before the first report. `scripts/gate-tiers.json` is
the machine-readable form (expected and forbidden scripts per moment, budgets, phase); when this prose and
that file disagree, the file wins and the prose is fixed in the same commit.

**Four moments, and one that is not a gate.**

- **Iterate** - per change, seconds. Run `verify:iter`. Where the change touches a surface that has its
  own spec and the repo has a browser lane, run that ONE spec through the traced single-spec script (see
  the command table). Nothing heavier.
- **Measure** - whenever only a rendered result can answer the question: the measure script (build +
  look) or the probe, where the repo has them. Legal at any time, in any lane, never a violation.
  Measuring is not verifying: it runs no lint, no types, no tests.
- **Commit** - the pre-commit hook owns it: staged autofix, the TDD sibling gate, then the repo-wide cheap
  checks. Nothing to run by hand; on refusal the hook prints the remedy. The commit-msg hook (commitlint)
  also rejects any body or footer line over 100 characters (the header cap is 96): wrap the body.
- **Push** - the pre-push hook runs the gate ONCE, never shortened by what the diff touched. Where the
  repo has heavy stages (build, size, e2e), the push script is phase-aware: phase 0 (scaffold, before the
  first deploy) runs the offline checks and loudly SKIPS the heavy stages; phase 1 (from the first deploy)
  runs the full `verify:ci`. A skipped stage is printed, never silent; flip the phase in one commit at the
  first deploy. A repo whose gate has no heavy stage runs the full `verify:ci` at push and records in
  `gate-tiers.json` that a phase switch would gate nothing.
- **CI** - phase-blind: always the full `verify:ci` (`audit:gate` + `lock:age` + `verify`), plus what only CI can do
  (the security workflow, the scheduled mutation job, a mandatory dev-smoke job where the repo has one).

**Prohibitions, stated as such.** An implementer or a reviewer NEVER runs `verify`, `verify:ci`,
the fuller `verify:*` variants, `build` or the e2e suite by hand: the full chain belongs to the push hook and CI, and a
result an agent cannot act on is not worth its minutes. A review round gets the diff plus `verify:iter`;
acceptance does not re-run the gate, the push does. Parallel lanes never run heavy stages (one machine,
shared caches): heavy work serialises at the push. Individual scripts (`typecheck`, `lint`, `test`, `fix`)
are drill-downs on a specific failure; none of them is a moment.

**A red push costs one fix, not another round of the whole gate.** Where the repo has a browser suite, it
stops after a capped number of failures on the gate run and in CI (`maxFailures`) instead of running every
remaining test into its timeouts. After a red push, whoever pushes fixes the cause, rebuilds only when the
failing stage runs against a build, re-runs only the tests that failed until they pass, then pushes again;
the push still runs the whole gate and reaches whatever the cap stopped short of. Name the failed spec files
from the red output: Playwright's `--last-failed` also re-runs every test a capped run never reached, which
is most of the suite, so it fits only a red that finished under the cap (Jest's `--onlyFailures` has no such
catch). That re-run is a drill-down on a known failure, so it is the one sanctioned hand-run of a build or of
browser tests, and it never replaces the push. Each browser config writes to its own output folder, so the
last-failed record always belongs to the suite that failed.

**What earns a browser test.** The browser suite is counted in INVARIANTS, not in screens. A new route
or a new component earns a browser test only when it brings an invariant the existing specs do not
already measure: a different layout shell, an engine-dependent behaviour, the first instance of a flow
class. Everything else is a unit test against a mocked network, which runs in the iterate moment and
costs the push nothing. `gate-tiers.json` declares the suite's ceiling and `docs:check` reports a suite
that outgrew it, so that number moves on a measurement and a `DECISIONS.md` line, never on habit.

**`verify` is a strict superset of the offline checks CI runs**, so a green `verify` predicts a green CI.
Keeping that true is a rule: a new check goes into the script, never only into the workflow file.
`audit:gate` and `lock:age` sit in `verify:ci` rather than `verify` because they need the network, so an offline agent can
still run the whole offline gate. `bench:verify` derives its step list from the `verify` script; a
hand-written second list has already drifted once.

**Every gate run is traced** to `.gate-trace.log`; `trace:report` turns the log into findings (forbidden
moments, blown budgets, gate runs from a worktree). After a push, gate output in the terminal is part of
the contract: **silence is a failure, not a pass** - a push that printed no gate ran no gate, whatever the
exit code says.

**Ports.** A busy port means MOVE, never kill a server you did not start; the single-spec and measure
scripts take the next free port. Only the push gate clears its own port.

### Lanes - who runs what

- **Main agent, inline.** Iterate and measure while working; the push runs the chain. Never the full gate
  by hand.
- **Implementer subagent.** Works in a hand-made `git worktree` OUTSIDE the repo directory, on its own
  port, with `node_modules` symlinked from the main checkout. Iterate and measure only; the gate never
  runs from a worktree (the tracer records it as a finding). The lead removes the worktree, checks the
  branch out in the main checkout and pushes from there, so the gate runs once, at the push, for every
  writer.
- **Copilot coding agent.** Hand-over is a fully specified issue (goal as behaviour, paths in scope,
  acceptance, out of scope; use `.github/ISSUE_TEMPLATE/agent-task.yml` where the repo ships it), assigned
  to Copilot. It works on its own branch and opens a draft pull request; workflows on that PR start only
  after a human approves the run. Task class: verifiable by the gate, under ~400 changed lines, contract
  stated in the issue, nothing on the mandatory-human-review list. Its review context is
  `.github/copilot-instructions.md`, which points here for the gate.
- **Review, any lane.** The diff plus `verify:iter`, never a re-run of the gate. Findings are correctness,
  test strength, security, readability; style belongs to the linters. A non-author human approves; an
  agent's own green is not an approval.
- **Two tools, one file.** Claude Code reads `CLAUDE.md` -> `AGENTS.md` -> the brain files this guide
  points at (read on demand; nothing beyond `AGENTS.md` is `@`-imported); Cursor reads `AGENTS.md` plus
  every `alwaysApply: true` rule; Copilot reads `.github/copilot-instructions.md`. `AGENTS.md` is the only
  file all of them read, which is why the law lives here and everything else is a pointer.
- **What an agent may not do.** `.claude/settings.json` holds the agent-side limits; they bind Claude Code
  only (Cursor, Copilot and Codex do not read that file). Denied in every permission mode, bypass
  included: reading .env files other than the example, editing `.claude/settings.json` itself, a force
  push (a `+branch` refspec too), `--no-verify` or `-n` on a commit, `--no-verify` on a push,
  `git reset --hard`, `git clean -f`. Asked before every edit of the gate files, the documented edits
  included (the phase flip, a raised mutation threshold): `.husky/`, `.github/workflows/`,
  `.github/ruleset.json`, `scripts/gate-tiers.json`, `stryker.config.json`, `.npmrc`. A rule matches the
  command or path as an agent usually writes it and is not a security boundary: `sh -c`, a full binary
  path, a `git -C` or `git -c` prefix, a bundled flag such as `-uf`, or a command that reads a file
  without naming it (`grep -r`) walks past it. The boundary is the required CI check on the default
  branch. To change a guarded file, edit it yourself or change the rule in a reviewed commit.

### Before code - spec and plan

A task bigger than a one-sentence diff gets two tracked files under `.cursor/<feature-slug>/` before the
first edit: `SPEC.md` (WHAT and WHY: evidence per claim with its source kind, acceptance criteria as
Given / When / Then, open questions with `blocking` and `evidence tried` - an unknown is parked there,
never invented) and `PLAN.md` (HOW: changes per file with the code that was read, what is reused,
sequencing in 2-7 slices each under ~400 changed lines, a test per acceptance criterion, risks, danger
zones). Copy both from `.cursor/templates/`. Approval is a non-author review of the pull request that
adds or changes them, never a phrase in a chat recorded by an agent. `/feat` starts from the plan; a plan
that lives only in a conversation is not a plan.

<!-- shared-harness:end -->

## Version holds (do not "fix" by bumping)

Range, reason, lift condition and evidence per package live in `scripts/version-holds.json`; `verify` goes red on a bump past a hold, and on a `.github/dependabot.yml` `ignore` that disagrees with it.

- `typescript` `~6.0.x` — `typescript-eslint`'s peer stops below 6.1, so a bump breaks `npm ci` (ERESOLVE).
- `eslint` and `@eslint/js` `10.x` — two plugins cap their `eslint` peer below 10, so `overrides` map it to `$eslint`: keep them, no `--legacy-peer-deps`. `settings.react.version` stays a literal, never `'detect'`.
- `@types/node` `24.x` — the types match `engines.node >= 24`.
- `vitest` and `@vitest/coverage-v8` `4.1.x` — the Stryker vitest runner does not clear the mutation floor under vitest 5.
- `msw` `2.x` — `@vitest/mocker` imports `msw/core/http`, which msw 3 does not export.
- Not holds, no guard: `oxlint` tilde-tracks `eslint-plugin-oxlint` (lockstep releases); `proxy-agent` is a root devDependency only to satisfy an optional peer of the `@puppeteer/browsers` floor.
- `no-unsafe-enum-assignment` is off for `src/store/utils/createSelectors.ts` only (typescript-eslint #12966); delete that block in `eslint.config.js` when the issue closes and `npm run lint` passes without it.
- `overrides` in `package.json` are security floors WITH a major cap (`>=fixed <next-major`): never write an uncapped floor, it ages into the advisory's vulnerable range.

## Out of scope (ask before touching)

- Weakening the verify gate, lint severities or coverage thresholds to get green; a Node engine bump (`engines.node`).
- PWA update flow (`registerType`, update toast semantics): read `.cursor/brain/PWA.md` first.
- Removing template scaffolding listed in `.cursor/brain/TEMPLATE_SEEDS.md`.

## Pull requests and commits

Changes reach master through a pull request: branch, run the gate, push the branch, open a PR, merge when CI is green. Here `master` carries a ruleset requiring the checks in `.github/ruleset.json`; a fork gets the files but not the settings, so nothing stops a direct push until you set them up (`README.md` § "What your fork does not inherit").

Commit format: `type(scope): description`, max 96 chars; types `feat` `fix` `chore` `docs` `style` `refactor` `perf` `test` `revert`. Add a rule to this file when an agent makes the same mistake twice, and prune stale lines.
