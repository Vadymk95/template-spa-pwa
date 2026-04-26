import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const SEVERE: ('serious' | 'critical')[] = ['serious', 'critical'];

const scan = async (page: Page) => {
    const results = await new AxeBuilder({ page }).analyze();
    return results.violations.filter((v) => SEVERE.includes(v.impact as 'serious' | 'critical'));
};

test.describe('A11y (axe-core)', () => {
    test('home: no serious or critical violations', async ({ page }) => {
        await page.goto('/');
        const violations = await scan(page);
        expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    });

    test('login: no serious or critical violations', async ({ page }) => {
        await page.goto('/login');
        const violations = await scan(page);
        expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    });

    test('404: no serious or critical violations', async ({ page }) => {
        await page.goto('/this-route-definitely-does-not-exist');
        const violations = await scan(page);
        expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    });
});
