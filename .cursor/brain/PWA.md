# PWA

This template ships as an installable Progressive Web App via `vite-plugin-pwa`. This file is the authoritative reference for the wiring, the deliberate omissions, and the cache-policy contract a host must satisfy.

## Stack

- `vite-plugin-pwa` 1.x (Workbox under the hood, `generateSW` mode)
- Vite 8 + Rolldown bundler — `rolldownOptions` in build config (vite-plugin-pwa is compatible via the Rollup-API compat shim)
- CSR SPA — no SSR
- Host-agnostic: any static host that honours the cache-policy contract below

## Source of truth

| Concern                  | File                                                              |
| ------------------------ | ----------------------------------------------------------------- |
| Plugin config + manifest | `vite.config.ts` → `VitePWA({...})`                               |
| SW registration          | Inlined `<script>` in `index.html` via `injectRegister: 'inline'` (no separate `registerSW.js`) |
| Update UI                | `src/components/common/PwaUpdateToast/`                           |
| Install hook             | `src/hooks/pwa/usePwaInstall.ts` (UI is consumer's choice)        |
| Install event capture    | `src/lib/pwa/installPromptCapture.ts` (eager, side-effect import) |
| iOS / Android meta       | `index.html`                                                      |
| Icons                    | `public/icons/{192x192,512x512,apple-touch-icon}.png`             |
| Type surface             | `src/vite-env.d.ts` (triple-slash refs for `vite-plugin-pwa/*`)   |
| Build verification       | `scripts/check-pwa.mjs` (wired into `ci:local`)                   |

Generated at build: `dist/manifest.webmanifest`, `dist/sw.js`, `dist/workbox-*.js`.

## Update strategy — `prompt` (not `autoUpdate`)

`registerType: 'prompt'` is chosen deliberately. Reasoning:

- `autoUpdate` mode forces `workbox.skipWaiting = true` + `clientsClaim = true` and reloads tabs without asking — incompatible with a `needRefresh`-driven toast and destroys mid-session form state.
- `prompt` exposes `needRefresh`, `PwaUpdateToast` shows, user clicks → `updateServiceWorker(true)` triggers skipWaiting + reload in one controlled step.
- Switching prompt → autoUpdate post-prod is destructive (vite-plugin-pwa #228, #438). Pick before launch.

**Do not** set `skipWaiting: true` or `clientsClaim: true` in `workbox: {}` — `prompt` mode requires them off; the toast handler is the activation gate.

## Caching strategy — precache only

`workbox.globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest,json}']`

All build-versioned assets including `public/locales/*.json` are precached with content-hash revisions. No `runtimeCaching` routes — content-addressable bundles don't need a TTL cache.

**Add `runtimeCaching` only for:**

- Third-party APIs that survive offline (a small CacheFirst layer).
- Cross-origin images / fonts / CDN assets.
- Anything fetched at runtime that is NOT in `dist/`.

**`globIgnores: ['**/mockServiceWorker.js', '**/mockServiceWorker.js.br']`** — defence-in-depth so `removeMswPlugin` ordering bugs cannot ship MSW's worker as a dead precache entry.

## Manifest fields shipped

| Field             | Value                                | Reason                                                 |
| ----------------- | ------------------------------------ | ------------------------------------------------------ |
| `id`              | `/`                                  | Stable PWA identity (decouples from `start_url`)       |
| `scope`           | `/`                                  | Explicit navigation boundary                           |
| `start_url`       | `/`                                  | Home on launch                                         |
| `name` / `short_name` | `React SPA + PWA Foundation` / `React PWA` | Install UI, home screen                          |
| `description`     | (placeholder)                        | Rich install sheet body                                |
| `lang`            | `en`                                 | Default app locale                                     |
| `display`         | `standalone`                         | No browser chrome when launched                        |
| `display_override`| `['standalone', 'minimal-ui']`       | Cross-browser-safe order; honoured on Chromium         |
| `orientation`     | `any`                                | Template-agnostic — consumer locks if they need to     |
| `theme_color`     | `#0a0a0a`                            | Standalone-mode browser tint (single-value field)      |
| `background_color`| `#ffffff`                            | Splash screen base                                     |
| `icons`           | 192 + 512 + 180 (apple-touch)        | Minimum viable for installability + iOS                |
| `handle_links`    | `'auto'`                             | **NOT `'preferred'`** — auth-flow forks must not auto-hijack deep links; consumer opts in |
| `launch_handler`  | `{ client_mode: 'navigate-existing' }` | Reuse existing PWA window vs spawning a new one      |

### Deliberate omissions

- **Maskable icon** — single-icon `purpose: 'any maskable'` is documented anti-pattern (Chrome warns; icons without a safe zone look clipped — web.dev/articles/maskable-icon). A proper maskable icon needs a dedicated render with ~10% padding. Out-of-scope for placeholder template assets — TODO when consumer commissions a brand mark.
- **`screenshots`** — spec requires consistent dimensions per `form_factor`. Consumer ships their own and adds the array.
- **`shortcuts` / `share_target` / `file_handlers`** — domain-specific actions; consumer adds when content exists.
- **`edge_side_panel`** — Edge-only sidebar UI. Adds a field consumers will copy without understanding. Consumer adds if they ship a side-panel mode.
- **`monochrome` icon** — only useful for notification badging; this template emits no notifications.
- **`categories` / `dir` / `prefer_related_applications`** — noise for a generic template.

## iOS + Android meta in `index.html`

All tags serve a concrete installability or splash-screen purpose. None are decorative.

- **`description`** — SEO + install sheet body.
- **`theme-color` × 2 with `media="(prefers-color-scheme: light|dark)"`** — address-bar tint swap matching `.dark` class state. Single tag without media is overridden by either query.
- **`mobile-web-app-capable` AND `apple-mobile-web-app-capable`** — ship both. The apple-prefixed one is "deprecated" per MDN but Safari **still** requires it for iOS splash screens (next.js#70272 / #74524). Removing it breaks iOS splash. See SKELETONS.md.
- **`apple-mobile-web-app-status-bar-style: default`** — safest choice; avoids the safe-area layout obligations that `black-translucent` imposes.
- **`apple-mobile-web-app-title`** — overrides page `<title>` on iOS home screen.
- **`<link rel="apple-touch-icon">`** — iOS does not read the manifest for the home-screen icon; this link is mandatory.
- **`<link rel="icon" sizes="192x192">`** — browser tab favicon. Re-uses the manifest 192 PNG.

## Update flow — `PwaUpdateToast`

`src/components/common/PwaUpdateToast/usePwaUpdateToast.ts`:

1. `useRegisterSW` from `virtual:pwa-register/react` subscribes to `needRefresh`.
2. Toast renders i18n-aware copy (`pwa.updateAvailable` / `pwa.refresh` / `pwa.dismiss`) with Refresh / × buttons.
3. Refresh → `updateServiceWorker(true)` — Workbox performs `skipWaiting` + `location.reload()`.
4. Dismiss → `sessionStorage[pwa-update-dismissed-v1] = '1'`. Suppresses re-display until tab closes (intentional: surviving F5 in the same tab is correct for home-screen PWA use).

The toast is auto-mounted in `App.tsx` (after Footer, fixed-positioned). Mounts inside the i18n gate — if i18n init fails (`I18nInitErrorFallback`), the entire app is in error state and the toast does not appear. **SW registration runs independently** via `injectRegister: 'inline'` in `vite.config.ts`: vite-plugin-pwa inlines a `<script>navigator.serviceWorker.register('/sw.js')</script>` tag into `index.html`, which executes during HTML parse — before React boots, before i18n initialises. So the SW boots even when the i18n gate is in error. The user recovers by reloading; on next mount the toast subscribes and the update applies.

Why not `'auto'`? The app imports `virtual:pwa-register/react` for the toast, which makes vite-plugin-pwa silently skip injection in `'auto'` mode. The hook would then become the only registration site — gated on the toast component mounting, gated on the router mounting, gated on i18n. `'inline'` lifts registration out of the React lifecycle entirely.

**Telemetry hook** — the reference repo calls `track('pwa_update_applied')` from a custom analytics module. This template ships none; consumers wire their own logger / analytics inside `handleUpdate` if needed.

## Install flow — `usePwaInstall` hook

`src/lib/pwa/installPromptCapture.ts` registers `beforeinstallprompt` at module load (eager side-effect import from `main.tsx`). **Lazy registration loses the event** — Chromium dispatches it once, ~30s after first paint, no retry.

`src/hooks/pwa/usePwaInstall.ts` returns `{ isAvailable, install }`. Consumer mounts the install button at their chosen moment-of-value (e.g. post-onboarding, post-purchase). Example:

```tsx
const { isAvailable, install } = usePwaInstall();
if (!isAvailable) return null;
return <Button onClick={() => void install()}>{t('pwa.install')}</Button>;
```

iOS Safari has no `beforeinstallprompt` — Safari users install via the Share sheet. The hook simply reports `isAvailable: false` there. No fallback banner shipped — consumer documents the iOS path in their UX if needed.

## Cache-policy contract for the host

PWA correctness depends on the host. Consumers MUST configure these headers wherever `dist/` is served (Vercel, Netlify, S3+CloudFront, nginx, Firebase, Cloudflare Pages):

| File pattern                                              | `Cache-Control`                       | Reason                                     |
| --------------------------------------------------------- | ------------------------------------- | ------------------------------------------ |
| `**/*.@(js\|css)` (content-hashed by Vite)                | `max-age=31536000, immutable`         | Hashed assets are safe forever             |
| `/*.png`, `/*.woff2` (also content-hashed)                | `max-age=31536000, immutable`         | Same reason                                |
| `/index.html`, `/sw.js`, `/manifest.webmanifest` | `public, max-age=0, must-revalidate` | Must reach clients on every deploy — otherwise CDN caching delays SW updates by hours; the "New version available" toast goes invisible. `registerSW.js` is NOT a separate file in this template — registration is inlined into `index.html` via `injectRegister: 'inline'` |

Without the last rule the update toast becomes load-bearing infrastructure that never fires. Verify with DevTools → Network → `sw.js` request: response `Cache-Control` must NOT be a long max-age.

## Verification checklist (after any PWA-related change)

```bash
npm run build                    # vite-plugin-pwa logs precache count + sw.js path
npm run verify:pwa               # scripts/check-pwa.mjs — manifest fields, sw precache, meta tags
```

`verify:pwa` is wired into `ci:local`. It catches three red-team-flagged failure modes: empty precache (Rolldown vs rollupOptions API drift), MSW worker leaking into precache, and `oxc` minifier silently stripping iOS / theme-color meta tags.

Production reality-check (deploy + new tab):

- Chrome DevTools → Application → Manifest: no warnings
- Chrome DevTools → Application → Service Workers: `sw.js` activated, no errors
- Force a deploy, reload: `PwaUpdateToast` appears within ~30-60 s (SW update check interval)
- Lighthouse 13: PWA category was removed in v12 (Apr 2024) — **do not** look for a "PWA score". The single surviving audit is `installable-manifest`.

## Threat model (security)

- **SW scope `/`** — intercepts every fetch on the origin, including auth tokens. Consumers shipping multi-tenant or auth-sensitive flows must scope or harden requests; SW does not re-validate `Authorization` headers.
- **`handle_links: 'auto'`** — chosen over `'preferred'` to avoid auto-hijacking deep links into the installed PWA on Chromium. Forks shipping auth flows MUST keep this; auth deep-link hijack into a stale PWA window is a real exploit class (state leak between users on shared devices).
- **`launch_handler.client_mode: 'navigate-existing'`** — reuses an existing PWA window. Combined with `localStorage` / `sessionStorage` user state, this can leak a previous user's view on shared devices. Consumers shipping user-scoped state must clear it on `visibilitychange` / `focus` if device-sharing is in their threat model.
- **Supply chain** — `vite-plugin-pwa → workbox-build → @rollup/plugin-terser → serialize-javascript` had a CVE chain (high-severity RCE). Mitigation: `package.json` `overrides` pins `serialize-javascript >=7.0.5`. `npm audit --audit-level=moderate` is part of `ci:local`. Re-check on every plugin upgrade.
- **`devOptions.enabled: false`** — keeps the PWA SW out of `vite dev`. MSW's `mockServiceWorker.js` lives at `/` in dev only; flipping `devOptions.enabled: true` breaks MSW. See SKELETONS.md.

## Known TODO / future work

- **Maskable icon** — commission a 512×512 with safe-zone padding; add as a second icon entry with `purpose: 'maskable'`. **Never** `purpose: 'any maskable'` on a single asset.
- **Screenshots** — capture 1×wide (≥1280 width, `form_factor: 'wide'`) + 1×narrow (≤480 width, `form_factor: 'narrow'`) once branding lands.
- **Vite-plugin-pwa Vite 8 peer support** — landed in **v1.3.0** (May 2026). Override `overrides.vite-plugin-pwa.vite: $vite` removed from `package.json` on 2026-05-09. PR: <https://github.com/vite-pwa/vite-plugin-pwa/pull/924>.
- **Update-check cadence** — current reliance on the plugin's built-in periodic check is fine. If staleness becomes painful, add explicit `r.update()` on route change via `registerSW({ onRegisteredSW })`.

## References

External pages drift; verify before quoting in a fork-time decision. Each link below is the **canonical entry** for its concern as of template publish.

- [vite-plugin-pwa — Prompt for update](https://vite-pwa-org.netlify.app/guide/prompt-for-update)
- [vite-plugin-pwa — Auto update](https://vite-pwa-org.netlify.app/guide/auto-update)
- [web.dev — Web App Manifest](https://web.dev/learn/pwa/web-app-manifest)
- [web.dev — Maskable icons (anti-pattern warning)](https://web.dev/articles/maskable-icon)
- [Chrome — Workbox precaching](https://developer.chrome.com/docs/workbox/modules/workbox-precaching)
- [Chrome — Updated install criteria (SW no longer required for menu install)](https://developer.chrome.com/blog/update-install-criteria)
- [Lighthouse v12 PWA category removal](https://github.com/GoogleChrome/lighthouse/issues/15535)
- [Next.js #74524 — apple-mobile-web-app-capable splash regression](https://github.com/vercel/next.js/issues/74524)
- [W3C App Manifest spec](https://www.w3.org/TR/appmanifest/)
- [WICG manifest incubations (display_override / handle_links / launch_handler)](https://wicg.github.io/manifest-incubations/)
- [Firtman — iOS PWA compatibility](https://firt.dev/notes/pwa-ios/)
