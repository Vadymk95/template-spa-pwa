import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from './support/fixtures';

/**
 * The preview server must send exactly the headers `dist/_headers` ships to Netlify / Cloudflare Pages,
 * `Cross-Origin-Opener-Policy` included. Both come from `vite-plugins/security-headers.ts`, so this spec is
 * what fails when the plugin is dropped from `vite.config.ts` or stops writing the file: the other specs
 * would then still pass, with no policy applied at all.
 *
 * Same switch as `playwright.config.ts`: the dev server sends no policy, so there is nothing to compare.
 */
const USES_PREVIEW = Boolean(process.env.CI) || process.env.PLAYWRIGHT_USE_PREVIEW === '1';

const shippedHeaders = (): Record<string, string> => {
    const file = readFileSync(resolve('dist', '_headers'), 'utf8');
    const rule = file.split('\n').filter((line) => /^\s+\S/.test(line));
    return Object.fromEntries(
        rule.map((line) => {
            const [name = '', ...value] = line.trim().split(': ');
            return [name.toLowerCase(), value.join(': ')];
        })
    );
};

test.describe('Security headers (preview only)', () => {
    test.skip(!USES_PREVIEW, 'the dev server sends no policy; run through the preview build');

    test('ships a CSP, and the page and its assets are served with the shipped set', async ({
        request
    }) => {
        const shipped = shippedHeaders();
        expect(Object.keys(shipped)).toContain('content-security-policy');
        expect(shipped['cross-origin-opener-policy']).toBe('same-origin');

        for (const path of ['/', '/theme-boot.js']) {
            const served = (await request.get(path)).headers();
            for (const [name, value] of Object.entries(shipped)) {
                expect(served[name], `${name} on ${path}`).toBe(value);
            }
        }
    });
});
