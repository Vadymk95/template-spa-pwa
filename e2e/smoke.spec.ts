import { expect, test } from './support/fixtures';

test.describe('Smoke', () => {
    test('home loads with app title', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveTitle(/React SPA \+ PWA Foundation/);
    });

    test('home exposes main landmark and the start-page heading', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('main')).toBeVisible();
        await expect(
            page.getByRole('heading', { level: 1, name: /gate already wired/i })
        ).toBeVisible();
    });

    /*
     * A page that loads clean in the production build. The CSP guard in `support/fixtures.ts` reads
     * policy text only, so it stays green for a build that ships a stylesheet inside a script tag:
     * the browser then refuses the file under `X-Content-Type-Options: nosniff`, writes one console
     * error on every page and still renders, so no functional spec fails. Any console error or
     * uncaught exception counts here, and so does a `.css` URL in a script or modulepreload slot.
     */
    for (const { path, heading } of [
        { path: '/', heading: { level: 1, name: /gate already wired/i } },
        { path: '/login', heading: { name: /sign in/i } }
    ] as const) {
        test(`${path} loads without a console error or a stylesheet in a script slot`, async ({
            page
        }) => {
            // The start page asks a demo API that `vite preview` does not serve. Answer it here, or
            // the refused connection would read as a load error and hide a real one.
            await page.route('**/api/greeting', (route) =>
                route.fulfill({ json: { greeting: 'Hello from the e2e stub' } })
            );
            const problems: string[] = [];
            page.on('console', (message) => {
                if (message.type() === 'error') problems.push(`console: ${message.text()}`);
            });
            page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));

            await page.goto(path);
            await expect(page.getByRole('heading', heading)).toBeVisible();

            const stylesheetsAsScripts = await page.evaluate(() =>
                [...document.querySelectorAll('script[src], link[rel="modulepreload"]')]
                    .map((element) => element.getAttribute('src') ?? element.getAttribute('href'))
                    .filter((url): url is string => url !== null)
                    .filter((url) => new URL(url, document.baseURI).pathname.endsWith('.css'))
            );

            expect(stylesheetsAsScripts, 'a stylesheet is loaded as a script').toEqual([]);
            expect(problems, 'the page wrote an error while loading').toEqual([]);
        });
    }
});
