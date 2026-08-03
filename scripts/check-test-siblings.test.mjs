// The EXEMPT list is the part of this gate people actually edit, and every edit
// widens it — usually to get one commit moving. These cases pin what the exemptions
// are FOR, so a widening that changes the policy fails here instead of silently
// letting untested logic land.
//
// `exists` is injected, so the specs describe the decision, not the tree.
import { describe, expect, it } from 'vitest';

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
