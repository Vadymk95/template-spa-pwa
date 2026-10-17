import { describe, expect, it } from 'vitest';

import { isPreviewRun } from './preview-mode';

/**
 * Preview build or dev server? `playwright.config.ts` decides it from two environment switches, and a
 * spec that only makes sense against one of them has to reach the same answer. Deciding it from the
 * port breaks as soon as `PORT` moves the server, which is how several lanes share one machine: the
 * spec then skips on a wrong guess, runs nothing, and the suite stays green.
 */
describe('isPreviewRun', () => {
    it('is true on CI', () => {
        expect(isPreviewRun({ CI: 'true' })).toBe(true);
    });

    it('is true when the preview build is asked for', () => {
        expect(isPreviewRun({ PLAYWRIGHT_USE_PREVIEW: '1' })).toBe(true);
    });

    it('is false for the dev server: neither switch is set', () => {
        expect(isPreviewRun({})).toBe(false);
    });

    it('is false when the preview switch is anything but 1', () => {
        for (const value of ['0', 'true', '']) {
            expect(isPreviewRun({ PLAYWRIGHT_USE_PREVIEW: value }), `value ${value}`).toBe(false);
        }
    });

    it('stays true when the preview build is served on a moved port', () => {
        for (const port of ['4173', '4193', '5183', '8097']) {
            expect(
                isPreviewRun({
                    PLAYWRIGHT_USE_PREVIEW: '1',
                    PORT: port,
                    PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${port}`
                }),
                `preview on port ${port}`
            ).toBe(true);
        }
    });

    it('stays false when the dev server happens to sit on the preview default port', () => {
        expect(isPreviewRun({ PORT: '4173', PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:4173' })).toBe(
            false
        );
    });
});
