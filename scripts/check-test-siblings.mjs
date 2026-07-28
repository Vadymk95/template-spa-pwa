#!/usr/bin/env node
// TDD-gate (deterministic): every staged src LOGIC file must have a co-located
// *.test.* sibling. Enforces "tests EXIST" — not "tests-first" (ordering can't be
// hook-forced; that stays an advisory practice). Blocks the commit (exit 1) on a
// missing sibling so a model that skips tests cannot land untested logic.
//
// Usage:
//   node scripts/check-test-siblings.mjs                 # checks staged files (pre-commit)
//   node scripts/check-test-siblings.mjs <file> [file…]  # checks given files (for tests)
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// Exempt: tests themselves, type decls, barrels, constants, app shell, generated UI,
// MSW mocks, test utils. These have no unit-testable logic of their own.
//
// `src/pages/DevPlayground/` and the `_example*` seeds are exempt because this repo
// already excludes both from coverage in `vitest.config.ts` — dev tooling and
// documented pattern seeds respectively. Keeping the two lists aligned matters: a
// file the coverage config says is untested by design should not be a file the
// commit gate demands a test for.
const EXEMPT =
    /(\.test\.[tj]sx?$|\.d\.ts$|\/index\.tsx?$|constants\.ts$|\/main\.tsx$|\/App\.tsx$|vite-env\.d\.ts$|\/env\.ts$|^src\/pages\/DevPlayground\/|\/_example[^/]*$|^src\/components\/ui\/|^src\/mocks\/|^src\/test\/)/;

const isSrcLogic = (f) => /^src\/.+\.(ts|tsx)$/.test(f) && !EXEMPT.test(f);

const argvFiles = process.argv.slice(2);
const files = argvFiles.length
    ? argvFiles
    : execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' })
          .split('\n')
          .filter(Boolean);

const missing = [];
for (const f of files) {
    if (!isSrcLogic(f)) continue;
    const base = f.replace(/\.(ts|tsx)$/, '');
    if (!existsSync(`${base}.test.ts`) && !existsSync(`${base}.test.tsx`)) {
        missing.push(f);
    }
}

if (missing.length) {
    console.error('\n✖ TDD-gate: staged source files with no co-located *.test.* sibling:');
    for (const m of missing) {
        const ext = m.endsWith('.tsx') ? 'tsx' : 'ts';
        console.error(`  - ${m}  → add ${m.replace(/\.(ts|tsx)$/, `.test.${ext}`)}`);
    }
    console.error(
        '\nTests must exist alongside source. Add the test, or if genuinely exempt extend EXEMPT in scripts/check-test-siblings.mjs.\n'
    );
    process.exit(1);
}
