// vitest coverage `exclude` and Stryker `mutate` describe ONE scope in two
// files: everything excluded from coverage for being untestable-by-design must
// also stay out of mutation, for the same reasons (see DECISIONS.md, "Mutation
// testing"). Two hand-maintained lists describing one scope is a known drift
// class — an edit lands in one file and the weekly mutation job silently
// measures (or skips) the wrong code.
//
// Unlike audit-gate.test.mjs, these specs read the LIVE configs on purpose:
// the failure this guard exists for IS "one file edited without the other",
// so inline fixtures would defeat it. The cost is deliberate — adding a
// coverage exclude means adding its `!` twin to stryker.config.json in the
// same commit.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import vitestConfig from '../vitest.config.ts';

const coverageExcludes = vitestConfig.test?.coverage?.exclude ?? [];
const strykerConfig = JSON.parse(readFileSync(join(process.cwd(), 'stryker.config.json'), 'utf8'));
const negations = (strykerConfig.mutate ?? [])
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => pattern.slice(1));

// Production-code exclusions are the src-scoped entries. Repo-wide infra
// patterns (`**/*.d.ts`, `**/*.config.{ts,js}`) are handled by the repo-wide
// rule below instead of demanding a literal twin.
const srcScoped = coverageExcludes.filter((pattern) => pattern.startsWith('src/'));

// Test files need no coverage counterpart: they are the measuring instrument,
// kept out of coverage by vitest itself rather than by this exclude list.
const isTestFilePattern = (pattern) => /\.(test|spec)\./.test(pattern);

// Coverage speaks repo-wide where mutate can only speak src-scoped (its base
// glob is `src/**`): coverage `**/*.d.ts` justifies mutate `!src/**/*.d.ts`.
const repoWideEquivalent = (pattern) => pattern.replace(/^src\/\*\*\//, '**/');

describe('stryker mutate mirrors the coverage excludes', () => {
    it('actually read both scope lists', () => {
        // Fail closed: if a refactor moves or renames either list, this guard
        // must break instead of passing vacuously over empty arrays.
        expect(srcScoped.length, 'no src-scoped coverage excludes found').toBeGreaterThan(0);
        expect(negations.length, 'no negations found in stryker mutate').toBeGreaterThan(0);
    });

    it('negates every src-scoped coverage exclude in mutate', () => {
        const missing = srcScoped.filter((pattern) => !negations.includes(pattern));

        expect(
            missing,
            `coverage excludes with no "!" twin in stryker.config.json mutate: ${missing.join(', ')}`
        ).toEqual([]);
    });

    it('justifies every production negation in mutate by a coverage exclude', () => {
        const unjustified = negations
            .filter((pattern) => !isTestFilePattern(pattern))
            .filter((pattern) => !coverageExcludes.includes(pattern))
            .filter((pattern) => !coverageExcludes.includes(repoWideEquivalent(pattern)));

        expect(
            unjustified,
            `mutate negations with no coverage exclude to justify them: ${unjustified.join(', ')}`
        ).toEqual([]);
    });
});
