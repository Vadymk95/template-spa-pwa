/* What a fork changes before it writes any feature: the app's name, description and colours, and the
   web fonts it self-hosts. The values sit in this file, which no `scripts/gate-files.json` path
   matches, so choosing them is not a change to the gate. `vite.config.ts` reads them at build time;
   nothing under `src/` imports this file.

   `index.html` repeats the name and the colours (`<title>`, `apple-mobile-web-app-title`, the two
   `theme-color` tags) and `public/locales/<lng>/common.json` holds `appName`: change them together. */

/** The PWA manifest's identity fields; `vite.config.ts` spreads them into the manifest. */
export const manifestIdentity = {
    name: 'React SPA + PWA Foundation',
    short_name: 'React PWA',
    description:
        'Production-ready React 19 + Vite 8 + TypeScript SPA + PWA template. Replace this description before shipping.',
    // Match `DEFAULT_LANGUAGE` in `src/lib/i18n/constants.ts`.
    lang: 'en',
    theme_color: '#0a0a0a',
    background_color: '#ffffff'
};

/**
 * Stylesheet URLs of the web fonts to self-host, for example
 * `https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap`. The font plugin
 * downloads each one at build time, so the app requests nothing from the font host. None by default:
 * `--font-sans` in `src/index.css` names Inter first, so it applies only where Inter is installed.
 */
export const webFontUrls: string[] = [];
