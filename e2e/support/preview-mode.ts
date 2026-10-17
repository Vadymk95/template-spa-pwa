/**
 * Whether the browser run targets the production build served by `vite preview` (true) or the dev
 * server (false). This is the one definition: `playwright.config.ts` picks the server from it, and a
 * spec that only works against the preview build asks it too. The answer comes from these two
 * switches and never from the port: `PORT` moves the server, so a port says nothing about what is
 * behind it.
 *
 * GitHub Actions sets `CI`; `PLAYWRIGHT_USE_PREVIEW=1` matches a post-build `vite preview` (for
 * example `ci:local` after `npm run build`).
 */
export const isPreviewRun = (env: Record<string, string | undefined>): boolean =>
    Boolean(env.CI) || env.PLAYWRIGHT_USE_PREVIEW === '1';
