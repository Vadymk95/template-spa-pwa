import { expect, test } from '@playwright/test';

/**
 * SW lifecycle smoke (minimal subset per /consilium 2026-05-23 APPLY Item 9 with conditions).
 *
 * Scope: registration succeeds + manifest reachable with correct MIME + icons fetchable.
 * Deferred (until observed regression): `vite:preloadError` recovery flow + update-toast flow.
 * Reason: Playwright SW assertions can flake on `serviceWorker.controller` race
 * ([microsoft/playwright#32230](https://github.com/microsoft/playwright/issues/32230));
 * minimal subset keeps signal-to-flake favourable.
 *
 * REQUIRES preview-mode (`PLAYWRIGHT_USE_PREVIEW=1`) — dev server intentionally
 * disables vite-plugin-pwa via `devOptions.enabled: false`. Skip when running
 * against dev server.
 */

test.describe('PWA service worker lifecycle (preview only)', () => {
    test.skip(
        ({ baseURL }) => !baseURL?.includes(':4173'),
        'PWA SW only registers in preview build (vite-plugin-pwa devOptions.enabled: false)'
    );

    test('registers SW + reaches activated state', async ({ page }) => {
        await page.goto('/');

        // Wait for SW to register and become active. vite-plugin-pwa with
        // injectRegister:'inline' attaches the registration script in <head>,
        // so registration starts before React boots.
        // `serviceWorker.ready` resolves with an ACTIVE worker whose state may
        // still be 'activating' (activate handler running, e.g. precache
        // cleanup) — explicitly wait for the 'activated' statechange.
        const registration = await page.evaluate(async () => {
            const reg = await navigator.serviceWorker.ready;
            const worker = reg.active;
            if (worker && worker.state !== 'activated') {
                await new Promise<void>((resolve) => {
                    worker.addEventListener('statechange', () => {
                        if (worker.state === 'activated') resolve();
                    });
                });
            }
            return {
                scope: reg.scope,
                hasActive: Boolean(reg.active),
                scriptURL: reg.active?.scriptURL ?? null,
                state: reg.active?.state ?? null
            };
        });

        expect(registration.hasActive).toBe(true);
        expect(registration.scope).toMatch(/\/$/);
        expect(registration.scriptURL).toMatch(/\/sw\.js$/);
        expect(registration.state).toBe('activated');
    });

    test('manifest.webmanifest serves with correct MIME', async ({ request, baseURL }) => {
        const response = await request.get(`${baseURL}/manifest.webmanifest`);
        expect(response.status()).toBe(200);

        const contentType = response.headers()['content-type'] ?? '';
        // Per W3C App Manifest spec — accept application/manifest+json or
        // application/json (vite preview defaults to the latter for unknown
        // extensions; production hosts SHOULD set application/manifest+json).
        expect(contentType).toMatch(/(application\/manifest\+json|application\/json)/);

        const manifest = (await response.json()) as Record<string, unknown>;
        expect(manifest.name).toBeTruthy();
        expect(manifest.start_url).toBe('/');
        expect(Array.isArray(manifest.icons)).toBe(true);
    });

    test('icon assets resolve (192/512/apple-touch)', async ({ request, baseURL }) => {
        const icons = ['/icons/192x192.png', '/icons/512x512.png', '/icons/apple-touch-icon.png'];

        for (const icon of icons) {
            const response = await request.get(`${baseURL}${icon}`);
            expect(response.status(), `icon missing: ${icon}`).toBe(200);
            expect(
                response.headers()['content-type'] ?? '',
                `unexpected content-type for ${icon}`
            ).toMatch(/image\/png/);
        }
    });
});
