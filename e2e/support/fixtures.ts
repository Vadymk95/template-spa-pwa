import { expect, test as base } from '@playwright/test';

import {
    CSP_REPORT_FUNCTION,
    formatCspViolation,
    isCspConsoleFinding,
    isCspEventFinding,
    listenForCspViolations,
    type CspViolationEvent
} from './csp-guard';

/**
 * `test` for every spec that runs against the production preview: the same API as Playwright's, plus
 * an automatic check that the page raised no Content-Security-Policy violation.
 *
 * `vite preview` sends the policy from `vite-plugins/security-headers.ts`, but a browser does not fail a
 * page for breaking it: it blocks the resource, writes one console line and carries on. Without this
 * check a new inline script, a third-party origin or a data: font the policy does not allow would still
 * pass every functional spec while being blocked in production. It listens on the CONTEXT, so a popup
 * or a second page a spec opens is covered too.
 *
 * Two signals feed the check, because engines disagree on which one they raise: the console, and the
 * standard `securitypolicyviolation` event, forwarded to Node through an exposed function (which, unlike
 * an array kept on `window`, survives navigations). `./csp-guard.ts` holds the matching, the formatting
 * and the one engine-specific exclusion (WebKit's own report of a native `<select>`); it is unit-tested
 * there, and this file only wires it to a context.
 *
 * The dev server sends no policy (HMR needs inline scripts), so the guard finds nothing there and
 * `eslint.config.js` keeps `e2e/dev/**` on plain `@playwright/test`.
 */
export const test = base.extend<{ cspGuard: undefined }>({
    cspGuard: [
        async ({ context, browserName }, use) => {
            const violations: string[] = [];
            context.on('console', (message) => {
                if (isCspConsoleFinding(browserName, message.type(), message.text())) {
                    violations.push(message.text());
                }
            });
            await context.exposeFunction(CSP_REPORT_FUNCTION, (event: CspViolationEvent) => {
                if (isCspEventFinding(browserName, event)) {
                    violations.push(formatCspViolation(event));
                }
            });
            await context.addInitScript(listenForCspViolations, CSP_REPORT_FUNCTION);
            await use(undefined);
            expect(violations, 'the page broke its Content-Security-Policy').toEqual([]);
        },
        { auto: true }
    ]
});

export { expect };
