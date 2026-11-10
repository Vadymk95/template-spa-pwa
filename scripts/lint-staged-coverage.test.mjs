import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';

/* The commit hook formats the staged files that match a `lint-staged` glob; the push gate runs
   `prettier --check .`, which reads every tracked file prettier can parse and `.prettierignore` does
   not exclude. A file the second sees and the first never matches is a file the hook leaves
   misformatted, and the push then fails on a file nobody was told about. This asserts the class:
   every tracked file prettier would check matches at least one glob.

   Globs are matched the way lint-staged matches them: `lib/matchFiles.js` in the installed
   lint-staged (the `picomatch(pattern, {...})` call, lines 10 to 19) passes `dot: true` and turns on
   `matchBase` when the pattern has no `/`, so `*.mjs` also matches `scripts/x.mjs`. The same
   picomatch that lint-staged loads is used here, with the same options. */

const ROOT = process.cwd();

// A hook chain can export these, and a child git that inherits them reads the repository they name
// instead of the one at `cwd`.
const GIT_LOCATION_VARIABLES = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE'];

const gitEnvironment = () =>
    Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !GIT_LOCATION_VARIABLES.includes(key))
    );

const trackedFiles = () =>
    execFileSync('git', ['-c', 'core.quotepath=off', 'ls-files', '-z'], {
        cwd: ROOT,
        env: gitEnvironment(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024
    })
        .split('\0')
        .filter(Boolean);

const requireFromLintStaged = createRequire(createRequire(import.meta.url).resolve('lint-staged'));
const picomatch = requireFromLintStaged('picomatch');

const globMatcher = (pattern) =>
    picomatch(pattern, {
        cwd: ROOT,
        dot: true,
        matchBase: !pattern.includes('/'),
        posixSlashes: true,
        strictBrackets: true
    });

const readGlobs = () =>
    Object.keys(JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))['lint-staged']);

const checkedByPrettier = async (file) => {
    const info = await prettier.getFileInfo(path.join(ROOT, file), {
        ignorePath: [path.join(ROOT, '.gitignore'), path.join(ROOT, '.prettierignore')],
        withNodeModules: false
    });
    return !info.ignored && info.inferredParser !== null;
};

describe('the commit hook formats every file the push gate checks for format', () => {
    it('matches every tracked file prettier checks against a lint-staged glob', async () => {
        const matchers = readGlobs().map(globMatcher);
        const files = trackedFiles();
        const checked = [];
        for (const file of files) {
            if (await checkedByPrettier(file)) checked.push(file);
        }

        const unmatched = checked.filter((file) => !matchers.some((isMatch) => isMatch(file)));

        expect(checked.length, 'prettier must check some tracked files').toBeGreaterThan(0);
        expect(unmatched, 'tracked files no lint-staged glob matches').toEqual([]);
    });

    // The assertion above is only as good as the matcher: pin that it reads globs the way lint-staged
    // does, so a matcher that quietly matched everything cannot make the class check pass.
    it('matches a slash-less glob in every folder and nothing it does not name', () => {
        const isMatch = globMatcher('*.{mjs,cjs}');

        expect(isMatch('probe.mjs')).toBe(true);
        expect(isMatch('scripts/probe.cjs')).toBe(true);
        expect(isMatch('scripts/probe.ts')).toBe(false);
        expect(isMatch('scripts/mjs')).toBe(false);
    });
});
