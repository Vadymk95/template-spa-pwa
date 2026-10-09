import { expect, test as base } from '@playwright/test';

/**
 * `test` for every spec that runs against the production preview: the same API as Playwright's, plus
 * an automatic check that the page raised no Content-Security-Policy violation.
 *
 * `vite preview` sends the policy from `vite-plugins/security-headers.ts`, but a browser does not fail a
 * page for breaking it: it blocks the resource, writes one console line and carries on. Without this
 * check a new inline script, a third-party origin or a data: font the policy does not allow would still
 * pass every functional spec while being blocked in production. It reads the console on the CONTEXT, so
 * a popup or a second page a spec opens is covered too.
 *
 * Two signals feed the check, because engines disagree on which one they raise. Firefox and WebKit write a
 * console line; Chromium raises a `securitypolicyviolation` event and writes NO console line for some
 * violations (an eval probe, for one), so a console-only guard stays green there. An init script on the
 * context turns every such event, in every frame, into a console line the matcher below catches.
 *
 * Matched on the policy's name, not on one engine's sentence: Chromium and WebKit write "Refused to ...
 * Content Security Policy", Firefox writes "Content-Security-Policy: ...".
 *
 * The dev server sends no policy (HMR needs inline scripts), so the guard finds nothing there and
 * `eslint.config.js` keeps `e2e/dev/**` on plain `@playwright/test`.
 */
const CSP_MESSAGE = /content[- ]security[- ]policy/i;

export const test = base.extend<{ cspGuard: undefined }>({
    cspGuard: [
        async ({ context }, use) => {
            const violations: string[] = [];
            await context.addInitScript(() => {
                document.addEventListener('securitypolicyviolation', (event) => {
                    // eslint-disable-next-line no-console -- the console is the channel Playwright's `console` event reads
                    console.error(
                        `Content-Security-Policy violation: ${event.violatedDirective} ${event.blockedURI}`
                    );
                });
            });
            context.on('console', (message) => {
                if (CSP_MESSAGE.test(message.text())) violations.push(message.text());
            });
            await use(undefined);
            expect(violations, 'the page broke its Content-Security-Policy').toEqual([]);
        },
        { auto: true }
    ]
});

export { expect };
