#!/usr/bin/env node
/**
 * engines-floor — the declared Node floor admits only Node versions every locked package admits.
 *
 * Why it exists: `.npmrc` sets `engine-strict=true`, so `npm install` refuses a locked package whose
 * `engines.node` the running Node does not satisfy. A root `engines.node` of ">=24.0.0" next to a
 * lockfile that holds jsdom (`^24.15.0`) therefore promises Node 24.0 to 24.14 and then fails the
 * first install on them with EBADENGINE. The floor is a fact of the lockfile, so the gate reads it
 * there instead of a person remembering to raise it after a dependency bump.
 *
 * Findings (each printed as one line; exit 1 when any exists):
 *   engines   package.json `engines.node` admits a Node version, inside the major of its own floor,
 *             that a package in package-lock.json does not admit (optional packages count: the
 *             conservative reading). The line names the floor the lockfile needs and the packages
 *             that set it.
 *   nvmrc     `.nvmrc` could resolve to a Node version `engines.node` rejects. A partial version
 *             ("24") counts as its lowest reading (24.0.0), because `nvm use` picks whatever 24.x is
 *             installed; write the full floor (24.15.0).
 *   shape     `engines.node` is missing, or a range in the manifest or the lockfile is syntax the
 *             range reader refuses (it refuses loudly rather than guessing, like version-holds).
 *
 * Only the major of the declared floor is compared: a later odd, non-LTS major that a dependency
 * does not list (`^22 || ^24.15 || >=26` skips Node 25) is not the template's promise to keep.
 * Ranges are read by scripts/check-version-holds.mjs, so this file has no dependencies of its own
 * and runs before anything is built.
 *
 * Usage: node scripts/check-engines-floor.mjs [--root <dir>]
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { inRange, isWithin, parseRange } from './check-version-holds.mjs';

const MAX_NAMED = 3;

const full = (version) => version.join('.');

const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** The part of each interval that lies inside the window, as merged-order intervals. */
const clip = (intervals, window) =>
    intervals
        .map((interval) => ({
            lo:
                interval.lo === null || compare(interval.lo, window.lo) < 0
                    ? window.lo
                    : interval.lo,
            hi:
                interval.hi === null || compare(interval.hi, window.hi) > 0
                    ? window.hi
                    : interval.hi
        }))
        .filter((interval) => compare(interval.lo, interval.hi) < 0);

/** A `.nvmrc` line as its lowest reading: "24" is 24.0.0, "v24.15" is 24.15.0. */
const parseNvmrc = (text) => {
    const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(text.trim());
    return match ? [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)] : null;
};

const lockedEngines = (lock) => {
    const seen = new Map();
    for (const [key, entry] of Object.entries(lock.packages ?? {})) {
        if (key === '' || typeof entry?.engines?.node !== 'string') continue;
        const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
        seen.set(`${name}@${entry.version ?? '?'}`, {
            id: `${name}@${entry.version ?? '?'}`,
            range: entry.engines.node
        });
    }
    return [...seen.values()];
};

export const checkEngines = ({ manifest, lock, nvmrc }) => {
    const declaredSpec = manifest?.engines?.node;
    if (typeof declaredSpec !== 'string') {
        return ['engines: package.json has no engines.node, so there is no floor to compare'];
    }
    let declared;
    try {
        declared = parseRange(declaredSpec);
    } catch (error) {
        return [`engines: package.json engines.node is not readable: ${error.message}`];
    }
    const floor = declared[0]?.lo;
    if (!floor) {
        return [
            `engines: engines.node "${declaredSpec}" has no lower bound; write a floor (">=24.15.0")`
        ];
    }
    const window = { lo: [floor[0], 0, 0], hi: [floor[0] + 1, 0, 0] };
    const admitted = clip(declared, window);
    const findings = [];

    const offenders = [];
    for (const { id, range } of lockedEngines(lock)) {
        let intervals;
        try {
            intervals = parseRange(range);
        } catch (error) {
            findings.push(
                `shape: ${id} has an engines.node the range reader refuses: ${error.message}`
            );
            continue;
        }
        if (isWithin(admitted, intervals)) continue;
        const own = clip(intervals, window)[0]?.lo ?? null;
        offenders.push({ id, range, own });
    }

    if (offenders.length > 0) {
        const none = offenders.filter((offender) => offender.own === null);
        const needs = offenders.filter((offender) => offender.own !== null);
        const required = needs.reduce(
            (highest, offender) => (compare(offender.own, highest) > 0 ? offender.own : highest),
            floor
        );
        const setBy = needs
            .filter((offender) => compare(offender.own, required) === 0)
            .map((offender) => `${offender.id} (${offender.range})`);
        const named = setBy.slice(0, MAX_NAMED).join(', ');
        const more = setBy.length > MAX_NAMED ? `, +${String(setBy.length - MAX_NAMED)} more` : '';
        if (needs.length > 0) {
            findings.push(
                `engines: engines.node "${declaredSpec}" admits Node ${full(floor)}, but package-lock.json needs Node ${full(required)} or later (set by ${named}${more}); with engine-strict an install on the versions between fails EBADENGINE. Set engines.node to ">=${full(required)}" and .nvmrc to ${full(required)}.`
            );
        }
        for (const offender of none) {
            findings.push(
                `engines: ${offender.id} (${offender.range}) admits no Node ${String(floor[0])}; the template cannot install with it under engine-strict`
            );
        }
    }

    if (typeof nvmrc === 'string') {
        const pinned = parseNvmrc(nvmrc);
        if (!pinned) {
            findings.push(
                `nvmrc: .nvmrc "${nvmrc.trim()}" is not a version this check reads; write a full version such as ${full(floor)}`
            );
        } else if (!inRange(declared, pinned)) {
            findings.push(
                `nvmrc: .nvmrc "${nvmrc.trim()}" can resolve to Node ${full(pinned)}, which engines.node "${declaredSpec}" rejects; write the full floor`
            );
        }
    }
    return findings;
};

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

export const run = ({ root }) => {
    let manifest;
    let lock;
    try {
        manifest = readJson(path.join(root, 'package.json'));
        lock = readJson(path.join(root, 'package-lock.json'));
    } catch (error) {
        return {
            findings: [`shape: package.json or package-lock.json cannot be read: ${error.message}`]
        };
    }
    const nvmrcPath = path.join(root, '.nvmrc');
    const nvmrc = existsSync(nvmrcPath) ? readFileSync(nvmrcPath, 'utf8') : undefined;
    return { findings: checkEngines({ manifest, lock, nvmrc }), engines: manifest.engines?.node };
};

const main = () => {
    const argv = process.argv.slice(2);
    const rootFlag = argv.indexOf('--root');
    const root = rootFlag === -1 ? process.cwd() : path.resolve(argv[rootFlag + 1]);
    const { findings, engines } = run({ root });

    console.log('engines-floor');
    for (const finding of findings) console.log(`  ✖ ${finding}`);
    if (findings.length === 0) {
        console.log(
            `  ✔ engines.node "${String(engines)}" and .nvmrc admit only Node versions package-lock.json admits`
        );
        process.exit(0);
    }
    console.log(
        `\n✖ engines-floor: ${findings.length} finding(s). Raise the floor to what the lockfile needs — never loosen the check.`
    );
    process.exit(1);
};

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
    main();
}
