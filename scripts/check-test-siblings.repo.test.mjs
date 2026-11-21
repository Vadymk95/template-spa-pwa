// The isSrcLogic cases of check-test-siblings.test.mjs, run against the exempt list this repository
// declares under `siblings.exempt` in scripts/gate-tiers.json. The list is the part of the gate people
// edit, and the kit's script keeps its own default; these cases pin what this repository's list is FOR
// (the dev playground is exempt, a store or PWA keys file is not). The rest of that file lives in gatelaw.
import { describe, expect, it } from 'vitest';

import { isSrcLogic as isSrcLogicWith, readPolicy } from './check-test-siblings.mjs';

const { policy, error } = readPolicy(process.cwd());
const isSrcLogic = (file) => isSrcLogicWith(file, policy);

describe('the policy of this repository', () => {
    it('reads from scripts/gate-tiers.json without an error', () => {
        expect(error).toBeUndefined();
    });

    it.each(['src/store/keys.ts', 'src/lib/pwa/keys.ts'])(
        'does not exempt %s, which holds storage keys the app depends on',
        (file) => {
            expect(isSrcLogic(file)).toBe(true);
        }
    );
});

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
