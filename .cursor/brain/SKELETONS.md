# Skeletons — Danger Zones

## Tailwind v4 — NO tailwind.config.ts

**There is no `tailwind.config.ts`.** All theme config is in `src/index.css`.

- Adding TW config file will conflict with `@tailwindcss/vite` plugin
- Dark mode is `@custom-variant dark`, NOT `darkMode: 'class'` in JS config
- `container` is no longer configured via JS — apply utilities directly

## i18n Init Race

`main.tsx` has a `isI18nReady` gate — app renders `null` until i18next resolves. If `i18nInitPromise` rejects, `html.i18n-loading` is removed in the error path and `I18nInitErrorFallback` is shown (English-only copy — `t()` is unavailable).

- Don't call `t()` outside the `I18nextProvider` subtree
- Don't add async providers between `I18nextProvider` and `RouterProvider` without updating the gate
- The pre-i18n shell `#i18n-boot` (with the spinner) is what the user sees during the gate; deleting it from `index.html` produces a flash-of-nothing on every cold load
- `I18nInitErrorFallback` uses inline styles so it stays visible even if `index.css` itself failed — do NOT swap them out for shadcn `Button` or Tailwind-only classes

## MSW handler coverage in dev (`onUnhandledRequest`)

`main.tsx` configures the MSW DEV worker with `onUnhandledRequest: 'bypass'` — unmocked requests pass through to the real network silently. `src/test/server.ts` (Vitest / Node MSW) configures `'error'` instead — tests fail loudly on unmocked fetches.

The asymmetry is intentional (dev shouldn't break when you `fetch()` something MSW doesn't mock yet) but does mean: a fetch that "works in dev" can suddenly explode on first test run. When triaging "tests fail with MSW handler missing", the dev path is not your reference; check `src/test/handlers.ts` against the failing URL.

## Lazy Pages + Suspense

Lazy pages MUST be wrapped with `WithSuspense` in the route definition.
Missing `WithSuspense` = uncaught Suspense boundary = blank screen.

## ProtectedRoute + `persist` rehydration

`ProtectedRoute` gates on `useUserStore.use._hasHydrated()` before reading `isLoggedIn`. Zustand `persist` can report `isLoggedIn: false` until async rehydration finishes — redirecting before `_hasHydrated` sends authenticated users to `/login` with no recovery.

- Do not remove the hydration gate or use raw `isLoggedIn` for auth redirects
- `null` while hydrating is intentional (consumers may swap in a skeleton)

## Main landmark + route focus

`Main` exposes `#main` with `tabIndex={-1}`; `App` passes its ref to `useRouteFocus`. Do not drop the pairing or strip `data-route-focus` handling in CSS without an accessibility review — programmatic focus after navigation is intentional.

## DevPlayground — DEV-only by contract

`src/pages/DevPlayground/` and its `/dev/ui` route are mounted only under
`import.meta.env.DEV`. The env guard lives in `src/router/modules/base.routes.tsx`
and must stay there — removing it leaks a shadcn kitchen-sink page into
production bundles. This is a **template seed** (see
`.cursor/brain/TEMPLATE_SEEDS.md`); do not delete it during "remove unused
code" sweeps.

## createSelectors — no direct store subscription in tests

Tests for stores use the base store directly (`useUserStoreBase`), not the selector wrapper.
Selector wrapper relies on React context and will throw outside component tree.

## Vite 8 + Rolldown

Production builds use **Rolldown** via the official **`vite`** package (Vite 8+), not the legacy `rolldown-vite` npm alias.

- Follow [Vite 8 migration](https://vite.dev/guide/migration): prefer `build.rolldownOptions` and `output.codeSplitting.groups` over deprecated `rollupOptions` / `manualChunks`
- CJS default export interop and chunking behavior can differ from Rollup-era Vite — see migration guide if a dependency breaks
- Some plugins may still assume Rollup-only hooks — test new plugins on `npm run build`

## tw-animate-css vs tailwindcss-animate

This project uses `tw-animate-css` (CSS import, no PostCSS plugin).
`tailwindcss-animate` (the old PostCSS plugin) will NOT work with `@tailwindcss/vite`.
Don't add `tailwindcss-animate` as a dependency — it's a breaking conflict.

## husky + commitlint

Pre-commit: lint + format on staged files (lint-staged)
Commit-msg: commitlint (`type(scope): subject`, max 96 chars)
Pre-push: TypeScript project check via `npx tsc -b --force --noEmit`

Skipping hooks (`--no-verify`) bypasses all checks — don't do it.

## ESLint flat config

`eslint.config.js` is the only ESLint config. Do not add a legacy `.eslintrc.*` — flat config owns all rules; a second config file risks confusion and stale docs.

CI and lint-staged also run **Oxlint** (`.oxlintrc.json`) before ESLint — fast structural checks; ESLint remains authoritative for TypeScript- and React-specific rules.

## userStore — persist middleware

`userStore` uses Zustand `persist` with `localStorage` key `"user-store"`.

- In tests: `logout()` in `beforeEach` resets in-memory state AND persists null values — test isolation is maintained
- If you add a new domain store with `persist`, do the same: call the reset action in `beforeEach`, or mock `localStorage` in `setup.ts`
- Do not call `persist.clearStorage()` in tests — it leaves the store in an uninitialized state and breaks subsequent tests in the same file

## PWA — `vite-plugin-pwa` Vite 8 peer dep override

`vite-plugin-pwa@1.2.0` caps its Vite peer at `^7.0.0`; `package.json` ships `overrides.vite-plugin-pwa.vite: $vite` to force-resolve against Vite 8.

Removing the override re-introduces a peer-dep conflict and `npm install` fails with `ERESOLVE`.

Drop-when, tracking link, full rationale: see [`PWA.md` → "Known TODO / future work"](./PWA.md#known-todo--future-work). Single source of truth — do not duplicate the issue/PR number across brain files.

## PWA — MSW × Workbox precache trap

The template ships **two** Service Workers, intentionally never coexisting:

- `public/mockServiceWorker.js` — MSW, DEV-only (gated by `if (import.meta.env.DEV)` in `src/main.tsx`).
- `dist/sw.js` — vite-plugin-pwa, PROD-only (`devOptions.enabled: false`).

Two failure modes the build must defend against:

1. `vite.config.ts` registers `removeMswPlugin()` BEFORE `VitePWA(...)` so that `removeMswPlugin.closeBundle` deletes `dist/mockServiceWorker.js` before VitePWA's precache scan finalizes. **Reordering them ships MSW's worker as a dead precache entry → 404 storm on every install.**
2. Defence-in-depth: `workbox.globIgnores: ['**/mockServiceWorker.js', '**/mockServiceWorker.js.br']` keeps MSW out of the Workbox manifest even if plugin order regresses.

`scripts/check-pwa.mjs` greps `dist/sw.js` for `mockServiceWorker.js` and fails the build if found. Do not bypass.

## PWA — `apple-mobile-web-app-capable` is officially deprecated, still required

MDN flags `apple-mobile-web-app-capable` as deprecated in favour of `mobile-web-app-capable`. iOS Safari **still** silently breaks home-screen splash screens without it (next.js [#70272](https://github.com/vercel/next.js/issues/70272), [#74524](https://github.com/vercel/next.js/issues/74524)). Ship BOTH meta tags in `index.html`. Do not "clean up" the duplicate.

## PWA — `registerType: 'prompt'` is decided once

Switching `registerType` from `'prompt'` → `'autoUpdate'` (or back) post-deploy is destructive (vite-plugin-pwa [#228](https://github.com/vite-pwa/vite-plugin-pwa/issues/228), [#438](https://github.com/vite-pwa/vite-plugin-pwa/pull/438)). The toast/no-toast contract leaks into production caches. Pick before launch and stick with it.

Auto-update silently force-reloads tabs and destroys mid-session form state. The template defaults to `'prompt'` for that reason; if a fork is content-only and idempotent, flipping to `'autoUpdate'` is fine but only on day one.
