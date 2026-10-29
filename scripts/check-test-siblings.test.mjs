// The EXEMPT list is the part of this gate people actually edit, and every edit
// widens it — usually to get one commit moving. These cases pin what the exemptions
// are FOR, so a widening that changes the policy fails here instead of silently
// letting untested logic land.
//
// `exists` is injected, so the specs describe the decision, not the tree. The last two blocks run
// the script itself against a real git repository, because what the gate READS (the index, the
// head tree) is the part an injected `exists` cannot test.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { findMissingSiblings, isSrcLogic, siblingCandidates } from './check-test-siblings.mjs';

const nothingExists = () => false;

describe('isSrcLogic', () => {
    it.each([
        'src/lib/utils.ts',
        'src/hooks/usePwaUpdate.ts',
        'src/store/auth/authStore.ts',
        'src/components/common/PwaUpdateToast/PwaUpdateToast.tsx'
    ])('treats %s as logic that needs a test', (file) => {
        expect(isSrcLogic(file)).toBe(true);
    });

    it.each([
        ['a test file', 'src/lib/utils.test.ts'],
        ['a type declaration', 'src/types/global.d.ts'],
        ['the vite env shim', 'src/vite-env.d.ts'],
        ['a barrel', 'src/pages/HomePage/index.ts'],
        ['a constants table', 'src/store/auth/constants.ts'],
        // Declaration-only route map: an `as const` object of literals and a derived type.
        ['a route map', 'src/router/routes.ts'],
        ['the app entry', 'src/main.tsx'],
        ['the root component', 'src/App.tsx'],
        ['validated env', 'src/env.ts'],
        ['a generated shadcn primitive', 'src/components/ui/button.tsx'],
        ['an MSW handler', 'src/mocks/handlers.ts'],
        ['a test util', 'src/test/test-utils.tsx'],
        ['a template seed', 'src/lib/api/_exampleQuery.ts'],
        // Dev-only and already excluded from the coverage report — exempting it here
        // is alignment with that decision, not a weakening of the gate.
        ['the dev playground', 'src/pages/DevPlayground/DevPlayground.tsx']
    ])('exempts %s', (_label, file) => {
        expect(isSrcLogic(file)).toBe(false);
    });

    it('ignores files outside src entirely', () => {
        expect(isSrcLogic('scripts/audit-gate.mjs')).toBe(false);
        expect(isSrcLogic('e2e/pwa.spec.ts')).toBe(false);
        expect(isSrcLogic('vite.config.ts')).toBe(false);
    });

    it('ignores non-TypeScript files under src', () => {
        expect(isSrcLogic('src/index.css')).toBe(false);
    });

    it('does not exempt a path that merely CONTAINS an exempt segment name', () => {
        // The `^src/...` exemptions are anchored on purpose: they name specific
        // directories, not any directory with that name. Each path below contains
        // the segment somewhere OTHER than the start, which is what makes these
        // cases catch an un-anchoring.
        expect(isSrcLogic('src/features/editor/components/ui/Toolbar.tsx')).toBe(true);
        expect(isSrcLogic('src/features/editor/mocks/fixtures.ts')).toBe(true);
        expect(isSrcLogic('src/features/editor/test/helpers.ts')).toBe(true);
        expect(isSrcLogic('src/features/demo/pages/DevPlayground/Panel.tsx')).toBe(true);
        // `constants.ts$` is an exact filename, not a prefix.
        expect(isSrcLogic('src/lib/constantsFactory.ts')).toBe(true);
    });
});

describe('siblingCandidates', () => {
    it('probes both extensions for an ordinary module', () => {
        expect(siblingCandidates('src/lib/utils.ts')).toEqual([
            'src/lib/utils.test.ts',
            'src/lib/utils.test.tsx'
        ]);
    });

    it('accepts the directory-named test for a component written as index.tsx', () => {
        expect(siblingCandidates('src/components/layout/Header/index.tsx')).toEqual([
            'src/components/layout/Header/index.test.ts',
            'src/components/layout/Header/index.test.tsx',
            'src/components/layout/Header/Header.test.tsx',
            'src/components/layout/Header/Header.test.ts'
        ]);
    });

    it('does not invent a directory-named candidate for a non-index file', () => {
        // Otherwise `Header/useHeader.ts` would be satisfied by `Header/Header.test.tsx`, and one test
        // would cover every module in the folder.
        expect(siblingCandidates('src/components/layout/Header/useHeader.ts')).toEqual([
            'src/components/layout/Header/useHeader.test.ts',
            'src/components/layout/Header/useHeader.test.tsx'
        ]);
    });
});

describe('findMissingSiblings', () => {
    it('does NOT exempt a component that happens to be named index.tsx', () => {
        // The barrel exemption is spelled `index.ts` on purpose: here `index.tsx` IS the component.
        expect(isSrcLogic('src/components/layout/Header/index.tsx')).toBe(true);
    });

    it('refuses a component whose folder holds a test for a DIFFERENT module', () => {
        const exists = (path) => path === 'src/components/layout/Header/useHeader.test.ts';

        expect(findMissingSiblings(['src/components/layout/Header/index.tsx'], exists)).toEqual([
            'src/components/layout/Header/index.tsx'
        ]);
    });

    it('accepts a component covered by the directory-named test', () => {
        const exists = (path) => path === 'src/components/layout/Header/Header.test.tsx';

        expect(findMissingSiblings(['src/components/layout/Header/index.tsx'], exists)).toEqual([]);
    });

    it('reports a logic file with no sibling', () => {
        expect(findMissingSiblings(['src/lib/utils.ts'], nothingExists)).toEqual([
            'src/lib/utils.ts'
        ]);
    });

    it('accepts either sibling extension', () => {
        expect(
            findMissingSiblings(['src/lib/utils.ts'], (p) => p === 'src/lib/utils.test.ts')
        ).toEqual([]);
        expect(
            findMissingSiblings(['src/components/Toast/Toast.tsx'], (p) =>
                p.endsWith('Toast.test.tsx')
            )
        ).toEqual([]);
    });

    it('passes an empty change set', () => {
        expect(findMissingSiblings([], nothingExists)).toEqual([]);
    });

    it('never reports an exempt file, even with nothing on disk', () => {
        expect(findMissingSiblings(['src/main.tsx'], nothingExists)).toEqual([]);
    });

    it('reports every offender rather than stopping at the first', () => {
        expect(
            findMissingSiblings(['src/lib/a.ts', 'src/main.tsx', 'src/lib/b.ts'], nothingExists)
        ).toEqual(['src/lib/a.ts', 'src/lib/b.ts']);
    });

    it('probes only paths derived from the file under test', () => {
        const probed = [];
        findMissingSiblings(['src/store/auth/authStore.ts'], (path) => {
            probed.push(path);
            return false;
        });

        expect(probed).toEqual([
            'src/store/auth/authStore.test.ts',
            'src/store/auth/authStore.test.tsx'
        ]);
    });

    it('is not satisfied by a sibling belonging to a different module', () => {
        expect(findMissingSiblings(['src/lib/a.ts'], (p) => p.includes('b.test'))).toEqual([
            'src/lib/a.ts'
        ]);
    });
});

/* ------------------------------------------------------------------------ real repositories */

// Resolved from the repo root: vitest serves this module over its own URL scheme, so a URL-relative
// path would not name the script.
const SCRIPT = path.resolve(process.cwd(), 'scripts/check-test-siblings.mjs');
const LOCATION_VARIABLES = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE'];

// A hook chain exports its repository's location; a fixture git must not inherit it.
const cleanEnvironment = () =>
    Object.fromEntries(
        Object.entries(process.env).filter(
            ([key]) => !LOCATION_VARIABLES.includes(key) && key !== 'CI' && key !== 'GITHUB_ACTIONS'
        )
    );

const git = (cwd, ...args) =>
    execFileSync(
        'git',
        [
            '-c',
            'user.name=Fixture',
            '-c',
            'user.email=fixture@example.com',
            '-c',
            'commit.gpgsign=false',
            '-c',
            'core.hooksPath=/dev/null',
            ...args
        ],
        { cwd, env: cleanEnvironment(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();

const tempRoots = [];

afterEach(() => {
    for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const write = (root, files) => {
    for (const [file, content] of Object.entries(files)) {
        const target = path.join(root, file);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, content);
    }
};

/** A repository on `main` with no commit yet. */
const initRepo = () => {
    const root = mkdtempSync(path.join(tmpdir(), 'test-siblings-'));
    tempRoots.push(root);
    git(root, 'init', '-q', '--initial-branch=main');
    return root;
};

/** A repository on `main` whose first commit holds `files`. */
const createRepo = (files = { 'README.md': '# fixture\n' }) => {
    const root = initRepo();
    const repo = {
        root,
        write: (changes) => write(root, changes),
        stage: (changes) => {
            write(root, changes);
            git(root, 'add', '-A');
        },
        commit: (changes, message = 'change') => {
            repo.stage(changes);
            git(root, 'commit', '-q', '--allow-empty', '-m', message);
            return git(root, 'rev-parse', 'HEAD');
        }
    };
    repo.commit(files, 'base');
    return repo;
};

const LOGIC = 'export const value = 1;\n';
const TEST = "import { it } from 'vitest';\nit('works', () => undefined);\n";

const gate = (repo, args = [], env = {}) => {
    const result = spawnSync(process.execPath, [SCRIPT, ...args], {
        cwd: repo.root,
        env: { ...cleanEnvironment(), ...env },
        encoding: 'utf8'
    });
    return {
        code: result.status,
        text: `${result.stdout}${result.stderr}`
    };
};

describe('staged mode reads the git index, not the disk', () => {
    it('passes a staged source file whose sibling is staged with it', () => {
        const repo = createRepo();
        repo.stage({ 'src/lib/value.ts': LOGIC, 'src/lib/value.test.ts': TEST });

        expect(gate(repo).code).toBe(0);
    });

    it('passes a staged source file whose sibling is already tracked', () => {
        const repo = createRepo({ 'src/lib/value.test.ts': TEST });
        repo.stage({ 'src/lib/value.ts': LOGIC });

        expect(gate(repo).code).toBe(0);
    });

    it('refuses a staged source file whose sibling only exists untracked on disk', () => {
        const repo = createRepo();
        repo.stage({ 'src/lib/value.ts': LOGIC });
        repo.write({ 'src/lib/value.test.ts': TEST });

        const { code, text } = gate(repo);

        expect(code).toBe(1);
        expect(text).toContain('src/lib/value.ts');
    });

    it('refuses a source file whose tracked sibling is staged for deletion', () => {
        const repo = createRepo({ 'src/lib/value.ts': LOGIC, 'src/lib/value.test.ts': TEST });
        git(repo.root, 'rm', '-q', 'src/lib/value.test.ts');
        repo.stage({ 'src/lib/value.ts': `${LOGIC}export const other = 2;\n` });

        expect(gate(repo).code).toBe(1);
    });

    it('checks a renamed source file under its new name', () => {
        const repo = createRepo({ 'src/lib/old.ts': LOGIC, 'src/lib/old.test.ts': TEST });
        git(repo.root, 'mv', 'src/lib/old.ts', 'src/lib/renamed.ts');

        const { code, text } = gate(repo);

        expect(code).toBe(1);
        expect(text).toContain('src/lib/renamed.ts');
    });

    it('passes when nothing is staged or only exempt files are', () => {
        const repo = createRepo();
        expect(gate(repo).code).toBe(0);

        repo.stage({ 'src/main.tsx': LOGIC, 'docs/notes.md': 'x\n' });
        expect(gate(repo).code).toBe(0);
    });

    // A fork's first commit is the whole template, starter files with no sibling included, and there is
    // no earlier commit to compare with, so nothing is judged (range mode does the same).
    it('says so, and passes, on the first commit of a repository', () => {
        const root = initRepo();
        write(root, { 'src/lib/starter.ts': LOGIC });
        git(root, 'add', '-A');

        const { code, text } = gate({ root });

        expect(code).toBe(0);
        expect(text).toMatch(/the first commit/);
    });

    it('judges the second commit again', () => {
        const repo = createRepo({ 'src/lib/starter.ts': LOGIC });
        repo.stage({ 'src/lib/added.ts': LOGIC });

        const { code, text } = gate(repo);

        expect(code).toBe(1);
        expect(text).toContain('src/lib/added.ts');
        expect(text).not.toContain('src/lib/starter.ts');
    });

    it('is not fooled by the repository location a hook chain exports', () => {
        const repo = createRepo();
        repo.stage({ 'src/lib/value.ts': LOGIC });
        const elsewhere = createRepo();

        const { code } = gate(repo, [], { GIT_DIR: path.join(elsewhere.root, '.git') });

        expect(code).toBe(1);
    });

    it('reads the index a hook points it at (GIT_INDEX_FILE), not the default one', () => {
        const repo = createRepo();
        const alternate = path.join(repo.root, '.git', 'alternate-index');
        write(repo.root, { 'src/lib/value.ts': LOGIC });
        execFileSync('git', ['add', 'src/lib/value.ts'], {
            cwd: repo.root,
            env: { ...cleanEnvironment(), GIT_INDEX_FILE: alternate },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        expect(gate(repo).code).toBe(0);
        expect(gate(repo, [], { GIT_INDEX_FILE: alternate }).code).toBe(1);
    });

    it('fails, rather than passing, when it cannot read an index at all', () => {
        const notARepository = mkdtempSync(path.join(tmpdir(), 'test-siblings-bare-'));
        tempRoots.push(notARepository);

        const { code, text } = gate({ root: notARepository });

        expect(code).toBe(2);
        expect(text).toMatch(/cannot read/i);
    });

    it('still judges explicit files against the working tree', () => {
        const repo = createRepo();
        repo.write({ 'src/lib/value.ts': LOGIC, 'src/lib/value.test.ts': TEST });

        expect(gate(repo, ['src/lib/value.ts']).code).toBe(0);
        expect(gate(repo, ['src/lib/missing.ts']).code).toBe(1);
    });
});

describe('range mode checks what a branch added, against the head tree', () => {
    const branchWith = (changes, files) => {
        const repo = createRepo(files);
        git(repo.root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
        git(repo.root, 'checkout', '-q', '-b', 'feature');
        repo.commit(changes);
        return repo;
    };

    it('refuses an added source file with no tracked sibling', () => {
        const repo = branchWith({ 'src/lib/orphan.ts': LOGIC });

        const { code, text } = gate(repo, ['--range']);

        expect(code).toBe(1);
        expect(text).toContain('src/lib/orphan.ts');
    });

    it('passes an added source file committed together with its sibling', () => {
        const repo = branchWith({ 'src/lib/value.ts': LOGIC, 'src/lib/value.test.ts': TEST });

        expect(gate(repo, ['--range']).code).toBe(0);
    });

    it('refuses an added source file whose sibling exists only untracked on disk', () => {
        const repo = branchWith({ 'src/lib/orphan.ts': LOGIC });
        repo.write({ 'src/lib/orphan.test.ts': TEST });

        expect(gate(repo, ['--range']).code).toBe(1);
    });

    it('checks a modified source file too, as the commit hook does', () => {
        const repo = branchWith(
            { 'src/lib/legacy.ts': `${LOGIC}export const more = 2;\n` },
            { 'src/lib/legacy.ts': LOGIC }
        );

        expect(gate(repo, ['--range']).code).toBe(1);
    });

    it('does not judge source files the branch did not touch', () => {
        const repo = branchWith({ 'README.md': '# changed\n' }, { 'src/lib/legacy.ts': LOGIC });

        expect(gate(repo, ['--range']).code).toBe(0);
    });

    it('judges the whole branch against the merge base, not only its last commit', () => {
        const repo = branchWith({ 'src/lib/orphan.ts': LOGIC });
        repo.commit({ 'src/lib/value.ts': LOGIC, 'src/lib/value.test.ts': TEST });

        const { code, text } = gate(repo, ['--range']);

        expect(code).toBe(1);
        expect(text).toContain('src/lib/orphan.ts');
        expect(text).not.toContain('src/lib/value.ts');
    });

    it('judges only the last commit under CI, where the base is the parent', () => {
        const repo = branchWith({ 'src/lib/orphan.ts': LOGIC });
        repo.commit({ 'src/lib/value.ts': LOGIC, 'src/lib/value.test.ts': TEST });

        expect(gate(repo, ['--range'], { CI: 'true' }).code).toBe(0);
    });

    it('honours --base and --head', () => {
        const repo = branchWith({ 'src/lib/orphan.ts': LOGIC });
        const orphan = git(repo.root, 'rev-parse', 'HEAD');
        repo.commit({ 'src/lib/value.ts': LOGIC, 'src/lib/value.test.ts': TEST });

        expect(gate(repo, ['--range', '--base', orphan]).code).toBe(0);
        expect(gate(repo, ['--range', '--base', 'origin/main', '--head', orphan]).code).toBe(1);
    });

    it('says so, and passes, when there is no base commit to compare with', () => {
        const repo = createRepo({ 'src/lib/orphan.ts': LOGIC });

        const { code, text } = gate(repo, ['--range']);

        expect(code).toBe(0);
        expect(text).toMatch(/first commit/);
    });

    it('fails on a shallow clone that hides the parent instead of passing', () => {
        const origin = branchWith({ 'src/lib/orphan.ts': LOGIC });
        const clone = mkdtempSync(path.join(tmpdir(), 'test-siblings-clone-'));
        tempRoots.push(clone);
        git(clone, 'clone', '-q', '--depth', '1', `file://${origin.root}`, '.', '-b', 'feature');

        const { code, text } = gate({ root: clone }, ['--range'], { CI: 'true' });

        expect(code).toBe(2);
        expect(text).toMatch(/shallow/i);
    });

    it('fails on a base that is not a commit', () => {
        const repo = branchWith({ 'src/lib/orphan.ts': LOGIC });

        const { code, text } = gate(repo, ['--range', '--base', 'no-such-ref']);

        expect(code).toBe(2);
        expect(text).toContain('no-such-ref');
    });

    it('is not fooled by the repository location a hook chain exports', () => {
        const repo = branchWith({ 'src/lib/orphan.ts': LOGIC });
        const elsewhere = createRepo();

        const { code } = gate(repo, ['--range'], { GIT_DIR: path.join(elsewhere.root, '.git') });

        expect(code).toBe(1);
    });
});

describe('arguments', () => {
    it.each([
        ['an unknown option', ['--rnage']],
        ['a ref option with no value', ['--range', '--base']],
        ['a ref that looks like an option', ['--range', '--base', '--output=x']],
        ['a ref option without --range', ['--base', 'main']],
        ['files together with --range', ['--range', 'src/lib/value.ts']]
    ])('rejects %s instead of treating it as a file', (_label, args) => {
        const repo = createRepo();

        expect(gate(repo, args).code).toBe(2);
    });
});
