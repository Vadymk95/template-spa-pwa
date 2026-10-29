#!/usr/bin/env node
// TDD-gate (deterministic): every changed src LOGIC file must have a co-located
// *.test.* sibling that is TRACKED by git. Enforces "tests EXIST" — not "tests-first" (ordering
// can't be hook-forced; that stays an advisory practice). Blocks (exit 1) on a missing
// sibling so a model that skips tests cannot land untested logic.
//
// A sibling counts only once git holds it: in staged mode the INDEX decides, in range mode the
// head TREE does. A test file that exists only untracked in the working tree is not part of
// the commit, so it must not satisfy the gate (it did, when this read the disk).
//
// Usage:
//   node scripts/check-test-siblings.mjs                 # staged files vs the index (pre-commit)
//   node scripts/check-test-siblings.mjs --range         # base...HEAD vs the HEAD tree (CI, push)
//       [--base <ref>] [--head <ref>]                    #   base: --base, else HEAD~1 under CI,
//                                                        #   else the merge base with origin/master
//   node scripts/check-test-siblings.mjs <file> [file…]  # given files vs the working tree (tests)
//
// Exit 0 clean, 1 offenders, 2 the state could not be read (never a silent pass).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { isEntryPoint } from './is-entry-point.mjs';

// Exempt: tests themselves, type decls, barrels, constants, app shell, generated UI,
// MSW mocks, test utils. These have no unit-testable logic of their own.
//
// `src/router/routes.ts` is a declaration-only route map — an `as const` object of
// literals and a derived type, exactly the class `constants.ts` is exempt for. A test
// there would assert that a literal equals itself. Pinned in the spec, so this
// widening is a recorded decision rather than a convenience.
//
// `index.ts` ONLY, never `index.tsx`. The exemption is for barrels, and in this
// template a barrel is `index.ts` (a `lazy()` re-export) while `index.tsx` is the
// component ITSELF. A pattern of `index.tsx?$` therefore exempted every component
// in `src/components/**` from the gate. An exemption written for one file shape
// must not be spelled loosely enough to cover another.
//
// `src/pages/DevPlayground/` and the `_example*` seeds are exempt because this repo
// already excludes both from coverage in `vitest.config.ts` — dev tooling and
// documented pattern seeds respectively. Keeping the two lists aligned matters: a
// file the coverage config says is untested by design should not be a file the
// commit gate demands a test for.
const EXEMPT =
    /(\.test\.[tj]sx?$|\.d\.ts$|\/index\.ts$|constants\.ts$|\/routes\.ts$|\/main\.tsx$|\/App\.tsx$|vite-env\.d\.ts$|\/env\.ts$|^src\/pages\/DevPlayground\/|\/_example[^/]*$|^src\/components\/ui\/|^src\/mocks\/|^src\/test\/)/;

export const isSrcLogic = (file) => /^src\/.+\.(ts|tsx)$/.test(file) && !EXEMPT.test(file);

/**
 * Pure decision half, so the EXEMPT list can be tested without a git index or a
 * real tree. `exists` is injected for the same reason: this is the piece most
 * likely to be edited later (usually to widen an exemption), so it is the piece
 * that needs a spec.
 */
export const siblingCandidates = (file) => {
    const base = file.replace(/\.(ts|tsx)$/, '');
    const candidates = [`${base}.test.ts`, `${base}.test.tsx`];

    const componentDirectory = /^(.*)\/index\.tsx$/.exec(file)?.[1];
    if (componentDirectory) {
        const name = componentDirectory.split('/').at(-1);
        candidates.push(
            `${componentDirectory}/${name}.test.tsx`,
            `${componentDirectory}/${name}.test.ts`
        );
    }

    return candidates;
};

export const findMissingSiblings = (files, exists) =>
    files.filter(
        (file) => isSrcLogic(file) && !siblingCandidates(file).some((path) => exists(path))
    );

/* ------------------------------------------------------------------------ git */

// A hook chain can export these, and a child git that inherits them answers for the repository
// they name instead of the one at `cwd`. GIT_INDEX_FILE stays: it is not a location, it is the
// very index a `git commit <paths>` hook must read (a temporary one).
const GIT_LOCATION_VARIABLES = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR'];
const MAX_GIT_OUTPUT_BYTES = 256 * 1024 * 1024;
const SHORT_REF_LENGTH = 10;

const gitEnvironment = (environment) =>
    Object.fromEntries(
        Object.entries(environment).filter(([key]) => !GIT_LOCATION_VARIABLES.includes(key))
    );

/** `git(args)` returns stdout, or null when the command fails or git cannot be started. */
const makeGit = (root, env) => (args) => {
    try {
        return execFileSync('git', args, {
            cwd: root,
            env: gitEnvironment(env),
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            maxBuffer: MAX_GIT_OUTPUT_BYTES
        });
    } catch {
        return null;
    }
};

const splitNul = (text) => text.split('\0').filter(Boolean);
const shortRef = (ref) => (/^[0-9a-f]{40,}$/.test(ref) ? ref.slice(0, SHORT_REF_LENGTH) : ref);
const CHANGED_FILTER = '--diff-filter=ACMR';

/* ------------------------------------------------------------------------ what to check */

/** Staged files, and the index as the set of files that exist. */
export const stagedChange = (git) => {
    const changed = git(['diff', '--cached', '--name-only', CHANGED_FILTER, '-z']);
    const tracked = git(['ls-files', '-z']);
    if (changed === null || tracked === null) {
        return { error: 'cannot read the git index (is this a git repository?)' };
    }
    const inIndex = new Set(splitNul(tracked));
    return {
        files: splitNul(changed),
        exists: (file) => inIndex.has(file),
        heading: 'staged source files with no co-located *.test.* sibling in the index:'
    };
};

const BASE_CANDIDATES = ['origin/master', 'origin/main'];
const isCi = (env) => env.CI === 'true' || env.GITHUB_ACTIONS === 'true';

/**
 * The commit a range starts from, chosen like scripts/check-lock-age.mjs: `--base` when given;
 * `<head>~1` under CI (the PR merge commit's first parent is the base tip, which needs
 * `fetch-depth: 2`); otherwise the merge base with origin/master or origin/main. Result: { ref },
 * { root: true } when there is no base commit at all, or { error }.
 */
export const selectBase = ({ git, env, baseRef, headRef }) => {
    const exists = (ref) => git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) !== null;

    let ref = null;
    if (baseRef) {
        if (!exists(baseRef)) {
            return { error: `--base ${baseRef} is not a commit in this repository` };
        }
        ref = baseRef;
    } else if (isCi(env)) {
        ref = exists(`${headRef}~1`) ? `${headRef}~1` : null;
    } else {
        for (const candidate of BASE_CANDIDATES) {
            const mergeBase = git(['merge-base', headRef, candidate])?.trim();
            if (mergeBase && exists(mergeBase)) {
                ref = mergeBase;
                break;
            }
        }
        if (!ref && exists(`${headRef}~1`)) ref = `${headRef}~1`;
    }

    if (ref) return { ref };
    if (git(['rev-parse', '--is-shallow-repository'])?.trim() === 'true') {
        return {
            error: 'shallow clone with no parent commit to compare with: check out with `fetch-depth: 2` (actions/checkout) or run `git fetch --deepen=1`'
        };
    }
    return { root: true };
};

/** The files a range adds or changes, and the head tree as the set of files that exist. */
export const rangeChange = ({ git, env, baseRef, headRef }) => {
    if (git(['rev-parse', '--verify', '--quiet', `${headRef}^{commit}`]) === null) {
        return { error: `--head ${headRef} is not a commit in this repository` };
    }
    const base = selectBase({ git, env, baseRef, headRef });
    if (base.error) return base;
    if (base.root) {
        return {
            files: [],
            exists: () => false,
            note: 'no base commit to compare with (the first commit): nothing to check'
        };
    }

    const range = `${base.ref}...${headRef}`;
    const changed = git(['diff', '--name-only', CHANGED_FILTER, '-z', range]);
    const tree = git(['ls-tree', '-r', '--name-only', '-z', headRef]);
    if (changed === null || tree === null) return { error: `cannot read the git range ${range}` };
    const inHead = new Set(splitNul(tree));
    return {
        files: splitNul(changed),
        exists: (file) => inHead.has(file),
        heading: `source files in ${shortRef(base.ref)}...${headRef} with no *.test.* sibling tracked in ${headRef}:`
    };
};

/* ------------------------------------------------------------------------ arguments */

const USAGE =
    'usage: node scripts/check-test-siblings.mjs [--range [--base <ref>] [--head <ref>] | <file> [file…]]';

export const parseArguments = (argv) => {
    const options = { range: false, baseRef: undefined, headRef: undefined, files: [] };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--range') {
            options.range = true;
        } else if (argument === '--base' || argument === '--head') {
            const value = argv[index + 1];
            // A ref that starts with `-` would be read by git as an option.
            if (value === undefined || value.startsWith('-')) {
                return { error: `${argument} needs a ref` };
            }
            options[argument === '--base' ? 'baseRef' : 'headRef'] = value;
            index += 1;
        } else if (argument.startsWith('-')) {
            return { error: `unknown option ${argument}` };
        } else {
            options.files.push(argument);
        }
    }
    if (options.range && options.files.length > 0) {
        return { error: '--range takes no file arguments' };
    }
    if (!options.range && (options.baseRef !== undefined || options.headRef !== undefined)) {
        return { error: '--base and --head need --range' };
    }
    return { options };
};

/* ------------------------------------------------------------------------ the check */

const failure = (message) => ({ code: 2, lines: [`✖ TDD-gate: ${message}`, USAGE] });

/**
 * The whole check without process exit. Returns { code, lines, ok } where `ok` lines go to stdout
 * and the rest to stderr in `main`; `git` is injectable.
 */
export const run = ({
    argv = [],
    env = process.env,
    root = process.cwd(),
    git = makeGit(root, env)
} = {}) => {
    const parsed = parseArguments(argv);
    if (parsed.error) return failure(parsed.error);
    const { options } = parsed;

    let change;
    if (options.files.length > 0) {
        change = { files: options.files, exists: existsSync, heading: null };
    } else if (options.range) {
        change = rangeChange({
            git,
            env,
            baseRef: options.baseRef,
            headRef: options.headRef ?? 'HEAD'
        });
    } else {
        change = stagedChange(git);
    }
    if (change.error) return failure(change.error);

    if (change.note) return { code: 0, lines: [`  ✔ ${change.note}`], ok: true };

    const missing = findMissingSiblings(change.files, change.exists);
    if (missing.length === 0) {
        const lines = options.range
            ? [
                  `  ✔ ${String(change.files.length)} changed file(s): every source file has a tracked test sibling`
              ]
            : [];
        return { code: 0, lines, ok: true };
    }

    const lines = [
        `\n✖ TDD-gate: ${change.heading ?? 'source files with no co-located *.test.* sibling:'}`
    ];
    for (const file of missing) {
        const ext = file.endsWith('.tsx') ? 'tsx' : 'ts';
        lines.push(`  - ${file}  → add ${file.replace(/\.(ts|tsx)$/, `.test.${ext}`)}`);
    }
    lines.push(
        '\nTests must exist alongside source, and only a tracked file counts (`git add` the test). Add the test, or if genuinely exempt extend EXEMPT in scripts/check-test-siblings.mjs.\n'
    );
    return { code: 1, lines };
};

const main = () => {
    const result = run({ argv: process.argv.slice(2) });
    const print = result.ok ? console.log : console.error;
    for (const line of result.lines) print(line);
    if (result.code !== 0) process.exit(result.code);
};

// Guarded so importing this module for a test does not shell out to git.
if (isEntryPoint(import.meta.url)) {
    main();
}
