import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from './support/fixtures';

const SEVERE: ('serious' | 'critical')[] = ['serious', 'critical'];

// `target-size` (WCAG 2.2 SC 2.5.8) is disabled by default in axe-core, so it has to be opted in.
const scan = async (page: Page) => {
    const results = await new AxeBuilder({ page })
        .options({ rules: { 'target-size': { enabled: true } } })
        .analyze();
    return results.violations.filter((v) => SEVERE.includes(v.impact as 'serious' | 'critical'));
};

// The SPA renders after the document loads: scan only once the page's own heading is on screen.
const waitForPageHeading = (page: Page) =>
    expect(page.getByRole('heading', { level: 1 })).toBeVisible();

/**
 * Seeds the zustand-persisted auth shape directly into localStorage, matching
 * `STORAGE_KEYS.USER` in `src/store/keys.ts` and the `partialize` shape in
 * `src/store/user/userStore.ts` (`isLoggedIn` + `username`, no `token`).
 *
 * This is independent of the MSW-mocked login flow (`src/test/handlers.ts`),
 * which only runs under `import.meta.env.DEV` and is absent against
 * `vite preview` — the mode CI gates with. Seeding storage works in both.
 */
const seedAuth = (page: Page) =>
    page.addInitScript(() => {
        window.localStorage.setItem(
            'user-store',
            JSON.stringify({ state: { isLoggedIn: true, username: 'E2E User' }, version: 0 })
        );
    });

test.describe('A11y (axe-core)', () => {
    test('home: no serious or critical violations', async ({ page }) => {
        await page.goto('/');
        await waitForPageHeading(page);
        const violations = await scan(page);
        expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    });

    test('login: no serious or critical violations', async ({ page }) => {
        await page.goto('/login');
        await waitForPageHeading(page);
        const violations = await scan(page);
        expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    });

    test('404: no serious or critical violations', async ({ page }) => {
        await page.goto('/this-route-definitely-does-not-exist');
        await waitForPageHeading(page);
        const violations = await scan(page);
        expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    });

    test('dashboard (authenticated): no serious or critical violations', async ({ page }) => {
        await seedAuth(page);
        await page.goto('/dashboard');
        // Protected + lazy-loaded: wait past the route skeleton so axe scans the
        // real page, not the Suspense fallback.
        await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
        const violations = await scan(page);
        expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    });
});
