# react-spa-pwa-foundation — agent guide

Production-ready React 19 + Vite 8 (Rolldown) PWA template — vite-plugin-pwa (Workbox), routing, Zustand + TanStack Query, i18next, Tailwind v4, Vitest + Playwright pre-configured.

## Start here

1. Read `.cursor/brain/PROJECT_CONTEXT.md` before any task, then open `.cursor/brain/READING_INDEX.md`: it maps a situation ("about to change a shared primitive") to the two or three files that answer it. Depth: `.cursor/brain/MAP.md` (architecture), `.cursor/brain/SKELETONS.md` (danger zones), `.cursor/brain/VERIFICATION.md` (what to run per change), `.cursor/brain/PWA.md`, `.cursor/brain/TEMPLATE_SEEDS.md` (do NOT remove as dead code), `.cursor/brain/EXTENSIONS.md` (graduation checklist), `.cursor/brain/DECISIONS.md` (decisions in force; history is `git log -p`), `examples/auth-bearer-pattern/README.md` (auth alternatives).
2. `.cursor/rules/*.mdc` are **binding for the files they cover**: read the ones for the area you touch before the first edit.
3. Before building, check the work is still needed (`git log --oneline -15` plus one grep for what the task names). LOOK instead of inferring (`npm run probe`). When you dispatch work to another agent, name the files.
4. **This file is the canonical guide for every tool**: Cursor and Codex load it natively, Claude Code through the one-line import in `CLAUDE.md`. Edit THIS file; never grow the shim. Code is ground truth: if a line here conflicts with the code, follow the code and fix the stale line in the same session. A pointer names a path and the symbol in it, never a line number: `docs:check` fails `path:12`.

## Stack

React 19 · TypeScript 6 strict · Vite 8 (Rolldown) · Tailwind **v4** · shadcn/ui · Zustand 5 · TanStack Query 5 · React Router 7 · i18next · Vitest 4 · vite-plugin-pwa 2.x (Workbox, generateSW + prompt-mode)

## Critical rules

- **Tailwind v4** — no `tailwind.config.ts`; the theme lives in `src/index.css` (`@theme inline {}`); dark mode via the `.dark` class; animations via `tw-animate-css`.
- **Components** — logic in a `useComponentName.ts` hook beside the component; explicit in/out types (`FunctionComponent<Props>` or an explicit return type); property-style interface callbacks. Enforced by `explicit-function-return-type` and `method-signature-style`.
- **Pages and stores** — pages lazy by default (`PageName.tsx` + `index.ts` with `lazy()`, wrapped in `WithSuspense` in the router); Zustand stores use `createSelectors`, live in `src/store/<domain>/`, tests alongside.
- **i18n** — no hardcoded strings: every user-visible string goes through `t()`. English-only surfaces (i18n-init fallbacks, dev tooling) carry documented eslint overrides.
- **Imports** — `@/` alias only, no `../../`; order by `eslint-plugin-import-x`; `components/hocs/hooks/lib/store` must not import `pages` (`import-x/no-restricted-paths`).
- **No magic numbers** — named constants in `src/lib/constants.ts` (`@typescript-eslint/no-magic-numbers`, error).
- **Testing (TDD)** — vertical slices: one test → its implementation → repeat; test behaviour through public interfaces. `scripts/check-test-siblings.mjs` (pre-commit, and over the whole branch in `verify`) blocks a `src` logic file with no tracked or staged co-located `*.test.*`.
- **PWA** — manifest and Workbox config in `vite.config.ts`; update toast in `src/components/common/PwaUpdateToast/`; install hook `src/hooks/pwa/usePwaInstall.ts`. Do not flip `registerType` post-deploy, drop the `apple-mobile-web-app-capable` meta tag or enable `devOptions.enabled`. Threat model: `.cursor/brain/PWA.md`.
- **Security headers** come from ONE definition, `vite-plugins/security-headers.ts` (it feeds `dist/_headers` and `vite preview`). The CSP has no `unsafe-*`: a new inline script, third-party origin or `data:` source changes the policy in that file, never in a host config. A CSP violation fails a preview-mode e2e spec. Host recipes: `SECURITY_REQUIREMENTS.md`.
- **Reuse first, consistency beats preference** — search for an existing function, util, component or constant before creating one, and extend it; match the surrounding file.
- **Content variance** — anything that renders authored copy is proven in a real browser against content it has NOT seen (text: minimal / typical / long / unbroken; collections: none / one / many). Add a case to `/dev/ui/content-stress` (dev-only; `e2e/dev/content-stress.spec.ts`) with every content-bearing component, as a `test.step` or an extra assertion in the existing test, never a new `test(` (the suite ceiling in `gate-tiers.json` counts those calls). The range of widths a guard covers is part of its spec, and a wrap class with no red-to-green proof is deleted. Engines disagree on intrinsic sizing, font metrics and scrollbar gutters: measure (`CROSS_BROWSER=1` adds Firefox and WebKit), never predict.
- **Zero warnings, a complexity ratchet** — `eslint --max-warnings 0`, `oxlint --deny-warnings`. Fix the cause; never downgrade a rule or sprinkle `eslint-disable`. A suppression that stays says why on the same comment, and a rule wrong for a class of files gets a documented file-scoped override in `eslint.config.js`. The complexity limits there sit above the measured ceiling: a hit is new drift, so split the function; raising a number needs a fresh measurement and a `DECISIONS.md` update.
- **Pre-commit is repo-scoped** — `lint-staged`, the TDD sibling gate, then the cheap checks (the list is `.husky/pre-commit`) over the whole repo; the remedy for any failure is `npm run fix && git add -u`.
- **Bootstrap after clone** — `npm run prepare` once (`.npmrc` disables lifecycle scripts as a supply-chain guard, so husky does not install itself; `verify:iter` and `verify` fail loudly without hooks, and a push from a clone without them runs no gate). `.npmrc` `min-release-age=3` (DAYS) holds a brand-new release back: an urgent patch needs `npm install <pkg> --min-release-age=0`. The lockfile obeys the same cooldown: `npm run lock:age` (a network-bound check) fails a changed `name@version` younger than `min-release-age`. Prefer waiting out the cooldown. An agent never runs the `--min-release-age=0` install and never edits `scripts/lock-age-allowlist.json` (an agent's classifier refuses both); the operator runs the bypass install and lists the row (reason, expiry no later than the day the version is old enough on its own).
- **Machine-agnostic configs** — no absolute local paths (the VS Code i18next extension rewrites `i18next.i18nPaths`; keep them relative) and no DURATION measured on one machine: `scripts/gate-tiers.json` holds a ratio and a sample size, and the gate calibrates its own baseline into the gitignored `.gate-budget.json`.

## Commands / the gate

The gate and iteration commands (`README.md` lists the rest; the stages each gate script runs: `scripts/gate-tiers.json`, `checks.<name>.chain`). A `# [<role>]` at the start of a comment says which role of the tier law the command plays. Agent commands `/onboard` `/feat` `/test` `/review` `/docs` live in `.claude/commands/`, mirrored by shims in `.cursor/commands/`.

```bash
npm run dev           # Vite dev server
npm run verify:iter   # [iterate command] the seconds-long check, run per change
npm run verify:measure # [measure command] build + look; add `-- e2e/<f>.spec.ts` for one preview-mode spec
npm run e2e:one -- <spec> # [single-spec command] one Playwright spec, FREE port, through the tracer (`test:e2e:prod` = all, against vite preview)
npm run test:one -- <file> # [single-test command] one unit test file, through the tracer (not around it)
npx --no-install eslint <path> # lint one path from the repo root; npm exec --prefix keeps the caller's cwd
npm run probe -- <route> [widths] [--signed-in] [--theme=dark] # [probe command] render with classic scrollbars drawn, screenshot per width, print measured quantities (an instrument, never a gate)
npm run trace:report  # [trace report command] findings from .gate-trace.log (forbidden moments, budgets, worktrees), then the last 20 pushes
npm run bench:verify  # [bench command] times the gate stage by stage; `-- --run <script>` runs a script's steps as the push does
npm run docs:check    # [docs-drift command] docs class: paths against the files git lists, line pointers, scripts, sentinels, versions, command table, dead docs, section pointers, the DECISIONS shape, test quarantines, agent-memory imports, the gate chain view, its strict flags and any retelling or composition of it (pre-commit when docs are staged and inside verify; weekly CI adds --weekly)
npm run verify:push   # [push command] what pre-push runs: phase-aware (scripts/gate-tiers.json)
npm run verify        # [gate command] THE gate: every offline check; the push/CI chain, not a desk tool
npm run verify:ci     # [CI gate command] the CI gate; the push runs it in phase 1
npm run verify:full   # predicts the whole CI pipeline, the dev-smoke job included (the content-stress fixture against `vite dev`)
npm run ci:local      # a local dry run of CI, Lighthouse included; CI runs Lighthouse as its own `lighthouse` job
npm run fix           # [fix command] the one remedy: repo-wide autofix, then format
npm run test:mutation # StrykerJS strength gate, weekly `mutation.yml`, NOT in verify; `thresholds.break` is a measured floor: raise it, never lower it
# What the law leaves to this table (one line each, no role tag):
# worker cap: vitest `--maxWorkers=2`; Playwright `--workers=2`
# re-run after a red push: name the failed spec files; Playwright's `--last-failed` also re-runs the tests a capped run never reached, so use it only on a red that finished under the cap; vitest has no such record
# directory option for a lane that does not `cd`: `npm run --prefix <dir> <script>`
# the gate trace log: `.gate-trace.log` (gitignored)
```

<!-- shared-harness:begin -->
<!-- This block is synced from the gatelaw kit into every repository that takes the gate harness from it, and is the same in all of them: change it in the kit, never in a repository. It names command ROLES, never commands: the repo's command table above tags each command line with its role, and the stack-specific facts (ports, runner flags, what is skipped and why, timings) live OUTSIDE this block, in that table and in `.cursor/brain/VERIFICATION.md`; the stages each gate script runs live in `scripts/gate-tiers.json`. -->

### The tier law - this section is the ONLY place it lives

Every other file (rules, commands, brain, README, a tool's instruction file) points here and restates
nothing. A restated pipeline rule goes stale in place. `scripts/gate-tiers.json` is the machine-readable
form (expected and forbidden scripts per moment, budgets, phase) and the one readable list of the stages
each gate script runs (`checks.<name>.chain`, checked against the repo's script manifest by the docs-drift
command); when this prose and that file disagree, the file wins and the prose is fixed in the same commit.

**Command roles.** This law names what a command is for, never the command. The repo's command table (the
fenced list in `AGENTS.md` outside this block) tags each command line with its role in a comment that opens
`# [<role>]`; that table is where a role turns into a command, and where a runner's own flags and examples
are written. A role marked optional may have no row in a repo that has no such thing. The roles:

- **iterate command** - the seconds-long check, run per change.
- **measure command** (optional) - builds and looks at a rendered result.
- **probe command** (optional) - renders a route and prints measured quantities.
- **single-spec command** (optional) - one browser spec on a free port, through the tracer.
- **single-test command** - one unit test file, through the tracer.
- **fix command** - the one remedy: repo-wide autofix, then format.
- **push command** (optional) - what the pre-push hook runs, where that is a script of its own; phase-aware.
- **gate command** - every offline check; the push and CI chain, not a desk tool.
- **CI gate command** - the gate CI runs; the push runs it from phase 1.
- **docs-drift command** - mechanical doc drift: paths, scripts, versions, the chain view and more.
- **bench command** (optional) - the gate step by step, with timings.
- **trace report command** - findings from the gate trace log, then the last pushes.

**Four moments, and one that is not a gate.**

- **Iterate** - per change, seconds. Run the iterate command, then the single-test command on each test file
  the change touched or added, never the suite. Where the change touches a surface that has its own spec
  and the repo has a browser lane, run that ONE spec through the single-spec command. Nothing heavier. A
  command that takes a file list runs nothing, and says so, when the list is empty.
- **Measure** - whenever only a rendered result can answer the question: the measure command (build +
  look) or the probe command, where the repo has them. Legal at any time, in any lane, never a violation.
  Measuring is not verifying: it runs no lint, no types, no tests.
- **Commit** - the pre-commit hook owns it: staged autofix, the TDD sibling gate, then the repo-wide cheap
  checks. Nothing to run by hand; on refusal the hook prints the remedy. The commit-message hook
  also rejects any body or footer line over 100 characters (the header cap is 96): wrap the body.
- **Push** - the pre-push hook runs the gate ONCE, never shortened by what the diff touched. Where the repo
  has heavy stages (the ones that need a build), the push command is phase-aware: phase 0 (scaffold, before
  the first deploy) runs the offline checks and loudly SKIPS the heavy stages; phase 1 (from the first
  deploy) runs the full CI gate command. A skipped stage is printed, never silent; flip the phase in one
  commit at the first deploy. A repo whose gate has no heavy stage runs the full CI gate command at push and
  records in `gate-tiers.json` that a phase switch would gate nothing. With no remote there is no push
  moment: the lead hand-runs the push chain once per slice on the main checkout; an implementer never does.
- **CI** - phase-blind: always the full CI gate command, plus what only CI can do (the security workflow,
  the scheduled mutation job, a mandatory dev-smoke job where the repo has one).

**Prohibitions, stated as such.** An implementer or a reviewer NEVER runs the gate command, a fuller variant
of it, a production build or a browser suite by hand: the full chain belongs to the push hook and CI, and a
result an agent cannot act on is not worth its minutes. A review round gets the diff plus the iterate
command; acceptance does not re-run the gate, the push does. Parallel lanes never run heavy stages (one
machine, shared caches): heavy work serialises at the push. Individual scripts (one stage run alone, one
test file, the fix command) are drill-downs on a specific failure; none of them is a moment. Every test
command an agent runs names a worker cap (the runner's own option for it; the command table's notes name
it), and a lane starts nothing heavy while the 1-minute load average is at or above the core count
(`sysctl -n hw.ncpu` or `nproc`).

**A red push costs one fix, not another round of the whole gate.** Where the repo has a browser suite, it
stops after a capped number of failures on the gate run and in CI instead of running every remaining test
into its timeouts. After a red push, whoever pushes fixes the cause, rebuilds only when the failing stage
runs against a build, re-runs only the tests that failed until they pass, then pushes again; the push still
runs the whole gate and reaches whatever the cap stopped short of. Name the failed spec files from the red
output: a re-run that would also re-run tests a capped run never reached is not a drill-down, and a
runner's re-run-the-failed record can be exactly that (it holds the tests the capped run never reached as
well, which is most of the suite), so it fits only a red that finished under the cap; a record that holds
only what failed has no such catch (the command table's notes say which runner keeps which). That re-run is
a drill-down on a known failure, so it is the one sanctioned hand-run of a build or of browser tests, and
it never replaces the push. Each browser config writes to its own output folder, so that record always
belongs to the suite that failed.

**What earns a browser test.** The browser suite is counted in INVARIANTS, not in screens. A new route
or a new component earns a browser test only when it brings an invariant the existing specs do not
already measure: a different layout shell, an engine-dependent behaviour, the first instance of a flow
class. Everything else is a unit test against a mocked network, which runs in the iterate moment and
costs the push nothing. `gate-tiers.json` declares the suite's ceiling and the docs-drift command reports a
suite that outgrew it, so that number moves on a measurement and a `DECISIONS.md` line, never on habit.

**The gate command is a strict superset of the offline checks CI runs**, so a green gate command predicts
a green CI. Keeping that true is a rule: a new check goes into the script, never only into the workflow
file. The network-bound checks sit in the CI chain rather than in the gate command because they need the
network, so an offline agent can still run the whole offline gate. The bench command derives its step list
from the gate command's script; a hand-written second list has already drifted once.

**A cache is not a verdict.** A cached result is valid only when its key holds everything the verdict reads
(a formatter's key: the file, its options, the tool version); type-aware lint reads other files, so it runs
uncached in the gate command and in CI.

**Every gate run is traced** to the gate trace log; the trace report command turns the log into findings
(forbidden moments, blown budgets, gate runs from a worktree). After a push, gate output in the terminal is
part of the contract: **silence is a failure, not a pass** - a push that printed no gate ran no gate,
whatever the exit code says. A line that starts with `ACT` asks a person to act; the push prints it on
every run until that is done.

**Ports.** A busy port means MOVE, never kill a server you did not start. A script that goes through the
free-port wrapper takes the next free port; a script that pins its port (a strict-port option, or a fixed
URL in a browser-test config) fails when the port is busy (free it by stopping YOUR server, never
someone else's). Only the push gate clears its own port.

### Lanes - who runs what

- **Main agent, inline.** Iterate and measure while working; the push runs the chain, never a hand-run.
- **Implementer subagent.** Works in a hand-made `git worktree` OUTSIDE the repo directory, on its own port,
  with its own dependency tree or, if linked, its own tool cache directory. Iterate and measure only; the
  gate never runs from a worktree. The lead removes the worktree, checks the branch out in the main checkout
  and pushes from there, so the gate runs once, at the push, for every writer. A lane never waits on a
  prompt: it writes only in its worktree and its scratch folder (a planner or gate file change goes in the
  report as exact lines, which the lead applies with the operator), reads with Read and Grep, and runs
  `git -C <dir>` and the package manager's own directory option (the command table's notes name it) instead
  of `cd`, with no shell variable or `;` chain. Lane rules: `.cursor/templates/LANE.md`.
- **Delegated agent (hosted or remote).** Hand-over is a fully specified issue (goal as behaviour, paths in
  scope, acceptance, out of scope; use `.github/ISSUE_TEMPLATE/agent-task.yml` where the repo ships it). It
  works on its own branch and opens a draft pull request. Task class: verifiable by the gate, under ~400
  changed lines, contract stated in the issue, nothing on the mandatory-human-review list.
- **Review, any lane.** The diff plus the iterate command, never a re-run of the gate. Findings are
  correctness, test strength, security, readability; style belongs to the linters. A non-author human
  approves; an agent's own green is not an approval. A gate or suppression change stays red until a reviewer
  adds the `gate-change` label, never the author (`scripts/check-gate-integrity.mjs` lists the change).
- **One file for every tool.** `AGENTS.md` is the one file every agent tool reads, which is why the law lives
  here and each tool's own entry file is a pointer to it.
- **What an agent may not do.** These bind every writer, whatever its tool and settings: no reading .env
  files other than the example, no force push (a `+branch` refspec too), no `--no-verify` or `-n` on a
  commit, no `--no-verify` on a push, no `git reset --hard`, no `git clean -f`, no edit of the file that
  holds the agent-side limits. Ask before every edit of a gate file, the documented edits included (the
  phase flip, a raised mutation threshold). A tool that has a limits file denies the bans there, and its
  entry file names it. A deny rule matches the command or path as an agent usually writes it and is not a
  security boundary: `sh -c`, a full binary path, a `git -C` or `git -c` prefix, a bundled flag such as
  `-uf`, or a command that reads a file without naming it (`grep -r`) walks past it. The boundary is the
  required CI check on the default branch. To change a guarded file, edit it yourself or change the rule in
  a reviewed commit.

### Before code - spec and plan

Work of **two or more slices**, or work that touches a `SKELETONS.md` danger zone, gets two tracked files
under `.cursor/<feature-slug>/` before the first edit: `SPEC.md` (WHAT and WHY: evidence per claim with
its source kind, acceptance criteria as Given / When / Then, open questions with `blocking` and
`evidence tried` - an unknown is parked there, never invented) and `PLAN.md` (HOW: changes per file with
the code that was read, what is reused, sequencing in 2-7 slices each under ~400 changed lines, a test per
acceptance criterion, risks, danger zones). Copy both from `.cursor/templates/`. Approval is a non-author
review of the pull request that adds or changes them, never a phrase in a chat recorded by an agent.
`/feat` starts from the plan; a plan that lives only in a conversation is not a plan.

Work that fits **one slice** (under ~400 changed lines, no danger zone) needs no separate files and no
approval round: its acceptance criteria, as Given / When / Then, open the pull request description, and
the review of that pull request is the approval. An unknown that blocks it is still asked as one question,
never invented.

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

- Weakening the verify gate, a lint severity or a coverage threshold to get green; a Node engine bump (`engines.node`).
- PWA update flow (`registerType`, update toast semantics): read `.cursor/brain/PWA.md` first.
- Removing template scaffolding listed in `.cursor/brain/TEMPLATE_SEEDS.md`.

## Pull requests and commits

Changes reach master through a pull request: branch, run the gate, push the branch, open a PR, merge when CI is green. Here `master` carries a ruleset requiring the checks in `.github/ruleset.json`; a fork gets the files but not the settings, so nothing stops a direct push until you set them up (`README.md` § "What your fork does not inherit"). Commit format: `type(scope): description`, max 96 chars; types `feat` `fix` `chore` `docs` `style` `refactor` `perf` `test` `revert`. Add a rule to this file when an agent makes the same mistake twice, and prune stale lines.
