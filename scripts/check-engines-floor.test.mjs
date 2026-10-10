// Runner-agnostic on purpose: the templates run their script tests under different runners (vitest
// with globals, or `node --test`). Unlike check-version-holds.test.mjs this file is NOT shared:
// each template implements the check its own way (different exports, different packages counted),
// so the copies differ.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { checkEngines, run } from './check-engines-floor.mjs';

const { describe, it } = globalThis.describe ? globalThis : await import('node:test');

// Resolved from the repo root, not from `import.meta.url`: vitest serves this module over its own
// URL scheme, so a URL-relative path cannot work there; `node --test` runs from the root as well.
const SCRIPT = path.resolve(process.cwd(), 'scripts/check-engines-floor.mjs');

const JSDOM = '^22.22.2 || ^24.15.0 || >=26.0.0';

const lockWith = (packages = {}) => ({
    lockfileVersion: 3,
    packages: {
        '': { engines: { node: '>=24.0.0' } },
        'node_modules/react': { version: '19.2.0' },
        'node_modules/vite': { version: '8.0.0', engines: { node: '^20.19.0 || >=22.12.0' } },
        'node_modules/jsdom': { version: '30.0.1', engines: { node: JSDOM } },
        ...packages
    }
});

const manifestWith = (node) => ({ engines: { node, npm: '>=10.0.0' } });

const check = ({ node = '>=24.15.0', lock = lockWith(), nvmrc } = {}) =>
    checkEngines({ manifest: manifestWith(node), lock, nvmrc });

describe('engines.node against the lockfile', () => {
    it('passes when the floor is the strictest locked floor', () => {
        assert.deepEqual(check({ node: '>=24.15.0' }), []);
    });

    it('passes when the floor is above the strictest locked floor', () => {
        assert.deepEqual(check({ node: '>=24.16.0' }), []);
    });

    it('fails when the floor is below a locked package, naming the floor and the package', () => {
        const findings = check({ node: '>=24.0.0' });
        assert.equal(findings.length, 1);
        assert.match(findings[0], /^engines: engines\.node ">=24\.0\.0" admits Node 24\.0\.0, but/);
        assert.match(findings[0], /needs Node 24\.15\.0 or later/);
        assert.match(
            findings[0],
            /jsdom@30\.0\.1 \(\^22\.22\.2 \|\| \^24\.15\.0 \|\| >=26\.0\.0\)/
        );
        assert.match(findings[0], /Set engines\.node to ">=24\.15\.0" and \.nvmrc to 24\.15\.0/);
    });

    it('takes the highest floor when several packages differ', () => {
        const lock = lockWith({
            'node_modules/babel-core': { version: '7.0.0', engines: { node: '>=24.11.0' } },
            'node_modules/css-color': { version: '5.0.0', engines: { node: '^24.17.0 || >=26' } }
        });
        const findings = check({ node: '>=24.0.0', lock });
        assert.equal(findings.length, 1);
        assert.match(findings[0], /needs Node 24\.17\.0 or later \(set by css-color@5\.0\.0/);
    });

    it('names at most three packages and counts the rest', () => {
        const same = (name) => [
            `node_modules/${name}`,
            { version: '1.0.0', engines: { node: '^24.15.0' } }
        ];
        const lock = lockWith(Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map(same)));
        const [finding] = check({ node: '>=24.0.0', lock });
        assert.match(finding, /\+3 more/);
    });

    it('counts a nested copy and an optional package like any other', () => {
        const lock = lockWith({
            'node_modules/a/node_modules/lzma': {
                version: '1.0.0',
                optional: true,
                engines: { node: '^24.18.0' }
            }
        });
        assert.match(check({ node: '>=24.15.0', lock })[0], /needs Node 24\.18\.0 or later/);
    });

    it('ignores a package with no engines.node and the root entry', () => {
        const lock = lockWith({ 'node_modules/left-pad': { version: '1.3.0' } });
        assert.deepEqual(check({ node: '>=24.15.0', lock }), []);
    });

    it('does not hold the template to a later major a dependency skips', () => {
        // jsdom lists ^22, ^24.15 and >=26: Node 25 is outside it, but the floor is in major 24.
        assert.deepEqual(check({ node: '>=24.15.0' }), []);
    });

    it('fails on a package that admits no Node of the floor major', () => {
        const lock = lockWith({
            'node_modules/old': { version: '1.0.0', engines: { node: '^20.19.0 || ^22.12.0' } }
        });
        const findings = check({ node: '>=24.15.0', lock });
        assert.equal(findings.length, 1);
        assert.match(findings[0], /old@1\.0\.0 .* admits no Node 24/);
    });

    it('fails loudly on a locked range it cannot read instead of skipping it', () => {
        const lock = lockWith({
            'node_modules/odd': { version: '1.0.0', engines: { node: '20 - 22' } }
        });
        const findings = check({ node: '>=24.15.0', lock });
        assert.equal(findings.length, 1);
        assert.match(
            findings[0],
            /^shape: odd@1\.0\.0 has an engines\.node the range reader refuses/
        );
    });

    it('fails when engines.node is missing or has no lower bound', () => {
        assert.match(
            checkEngines({ manifest: {}, lock: lockWith() })[0],
            /^engines: package\.json has no engines\.node/
        );
        assert.match(check({ node: '<25' })[0], /has no lower bound/);
        assert.match(check({ node: '20 - 22' })[0], /is not readable/);
    });
});

describe('.nvmrc against engines.node', () => {
    it('passes on the full floor, with or without a v prefix and a newline', () => {
        assert.deepEqual(check({ nvmrc: '24.15.0\n' }), []);
        assert.deepEqual(check({ nvmrc: 'v24.15.0' }), []);
        assert.deepEqual(check({ nvmrc: '24.16.2' }), []);
    });

    it('fails on a partial version whose lowest reading is below the floor', () => {
        const findings = check({ nvmrc: '24\n' });
        assert.equal(findings.length, 1);
        assert.match(
            findings[0],
            /^nvmrc: \.nvmrc "24" can resolve to Node 24\.0\.0, which engines\.node/
        );
        assert.deepEqual(check({ nvmrc: '24.15' }), []);
        assert.equal(check({ nvmrc: '24.14' }).length, 1);
    });

    it('fails on a value it does not read, such as an alias', () => {
        assert.match(check({ nvmrc: 'lts/*' })[0], /^nvmrc: \.nvmrc "lts\/\*" is not a version/);
    });

    it('is skipped when there is no .nvmrc', () => {
        assert.deepEqual(check({ nvmrc: undefined }), []);
    });
});

describe('run and the command line', () => {
    const withRoot = ({ node, lock, nvmrc }, body) => {
        const root = mkdtempSync(path.join(tmpdir(), 'engines-floor-'));
        try {
            writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifestWith(node)));
            writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify(lock ?? lockWith()));
            if (nvmrc !== undefined) writeFileSync(path.join(root, '.nvmrc'), nvmrc);
            body(root);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    };

    const cli = (root) =>
        spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });

    it('exits 0 when the floor and .nvmrc match the lockfile', () => {
        withRoot({ node: '>=24.15.0', nvmrc: '24.15.0\n' }, (root) => {
            const result = cli(root);
            assert.equal(result.status, 0, result.stdout);
            assert.match(result.stdout, /✔ engines\.node ">=24\.15\.0"/);
        });
    });

    it('exits 1 and prints the floor when a dependency raises it past engines.node', () => {
        withRoot({ node: '>=24.0.0', nvmrc: '24.0.0\n' }, (root) => {
            const result = cli(root);
            assert.equal(result.status, 1);
            assert.match(result.stdout, /needs Node 24\.15\.0 or later/);
            assert.match(result.stdout, /never loosen the check/);
        });
    });

    it('exits 1 when only .nvmrc is below the floor', () => {
        withRoot({ node: '>=24.15.0', nvmrc: '24\n' }, (root) => {
            const result = cli(root);
            assert.equal(result.status, 1);
            assert.match(result.stdout, /\.nvmrc "24"/);
        });
    });

    it('reports an unreadable manifest as a finding instead of crashing', () => {
        const root = mkdtempSync(path.join(tmpdir(), 'engines-floor-'));
        try {
            assert.match(run({ root }).findings[0], /^shape: package\.json or package-lock\.json/);
            assert.equal(cli(root).status, 1);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
