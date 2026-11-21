// The cases of probe.test.mjs that read this repository's own files: the storage keys the probe copies
// from the app, the user store it seeds (the seed `probe.userSeed` in scripts/gate-tiers.json declares)
// and the folder `.gitignore` already covers. The rest of that file lives in gatelaw.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
    GROUP_FILE,
    OUT_DIR,
    THEME_KEY,
    USER_STORE_KEY,
    buildStorageSeed,
    readProbeConfig
} from './probe.mjs';

describe('the state it seeds before the page runs', () => {
    /* A protected route sends a visitor who is not signed in to the login page, and the theme is read
       from storage before first paint, so neither can be looked at unless the state is in place before
       the page's own scripts run. The two storage keys are the app's contract: the probe keeps a copy
       because a script cannot import TypeScript, and the cases below pin the copy to the source. */
    const read = (file) => readFileSync(resolve(process.cwd(), file), 'utf8');
    const storageKey = (name) => {
        const block = /export const STORAGE_KEYS = \{([^}]*)\}/.exec(
            read('src/store/keys.ts')
        )?.[1];
        return new RegExp(`\\b${name}:\\s*'([^']+)'`).exec(block ?? '')?.[1];
    };
    // The theme has no registry entry: the script that runs before first paint and the hook that runs
    // after mount each spell the literal out, and the app is only themed when the two agree.
    const themeBootKey = () => /getItem\('([^']+)'\)/.exec(read('public/theme-boot.js'))?.[1];
    const useThemeKey = () =>
        /const STORAGE_KEY = '([^']+)'/.exec(read('src/hooks/theme/useTheme.ts'))?.[1];
    // The seed this repository's gate-tiers.json declares, which is what `--signed-in` writes.
    const configuredSeed = () => {
        const { config, error } = readProbeConfig(resolve(process.cwd(), 'scripts'));

        expect(error).toBeUndefined();
        return buildStorageSeed({ signedIn: true, theme: null, userSeed: config.userSeed });
    };

    it('keeps the storage keys the app reads, so a renamed key fails here and not in a silent probe', () => {
        expect(USER_STORE_KEY).toBe(storageKey('USER'));
        expect(THEME_KEY).toBe(themeBootKey());
        expect(THEME_KEY).toBe(useThemeKey());
    });

    it('seeds only fields the user store persists, and no persist version', () => {
        const source = read('src/store/user/userStore.ts');
        const partialize = /partialize:\s*\(state\)\s*=>\s*\(\{([^}]*)\}\)/.exec(source)?.[1] ?? '';
        const persisted = [...partialize.matchAll(/(\w+):\s*state\.\1\b/g)].map(
            ([, field]) => field
        );
        const seed = configuredSeed();
        const fields = Object.keys(JSON.parse(seed[USER_STORE_KEY]).state);

        expect(
            persisted,
            'no field list was found in the `partialize` of the user store'
        ).not.toEqual([]);
        // The token is memory-only: a seed that carries it describes a store that does not exist.
        for (const field of fields) {
            expect(persisted, field).toContain(field);
        }
        expect(source).not.toMatch(/\bversion:/);
    });
});

describe('clearScreenshots', () => {
    it('keeps the record inside the folder the repository already ignores', () => {
        const ignored = readFileSync(resolve(process.cwd(), '.gitignore'), 'utf8')
            .split('\n')
            .map((line) => line.trim());

        expect(dirname(GROUP_FILE)).toBe(OUT_DIR);
        expect(ignored).toContain(`${OUT_DIR}/`);
    });
});
