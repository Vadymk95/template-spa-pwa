# react-spa-pwa-foundation — Project Context

## Purpose

Production-ready React SPA + PWA template. Copy, rename, start building. Includes all the boring setup (DX tooling, i18n, routing, state, testing, CI, **PWA**) so you don't repeat it.

Versions: `AGENTS.md` § Stack and `package.json`. Also in the box: react-hook-form + zod, Husky + commitlint + lint-staged, `@t3-oss/env-core` (`src/env.ts`), Lighthouse-CI, axe-core, a feature-flag seam (`src/lib/features/flags.ts`).

## Architecture

Repo root also ships **`vite-plugins/`**: small custom Vite plugins wired from `vite.config.ts` (dev banner, i18n HMR, HTML optimize, security headers). Entry points, state boundaries and routes: `MAP.md`.

```
src/
  components/
    common/      # ErrorBoundary, RouteErrorBoundary, RouteSkeleton, SkipLink, I18nInitErrorFallback, PwaUpdateToast, ThemeToggle, LanguageSwitcher
    layout/      # Header, Footer, Main (`#main` landmark + route-focus hook)
    ui/          # shadcn/ui primitives
  hocs/          # WithSuspense, ProtectedRoute (auth gate for nested routes)
  hooks/         # a11y/ (useRouteFocus), i18n/, pwa/ (usePwaInstall), theme/, <domain>/ (tests alongside)
  mocks/         # DEV-only MSW worker (handlers from `test/handlers`)
  lib/
    api/         # client, auth, safeFetch.ts (Zod validation of every API response); `greeting.queries.ts` = wired Query (HomePage); `_example.*` = unwired seeds
    i18n/        # i18next setup, constants, resources
    pwa/         # installPromptCapture, keys.ts (storage keys + events)
    webVitals/   # subscribeStandard / subscribeAttribution (loaded from vitals.ts)
    queryClient.ts, queryKeys.ts, devGuards.ts, constants.ts, vitals.ts, logger, utils (cn)
  pages/         # HomePage (index, eager); LoginPage, DashboardPage (behind ProtectedRoute), NotFoundPage (lazy); DevPlayground (DEV-only)
  router/        # index.tsx (createBrowserRouter), modules/ (route modules), routes.ts (path constants)
  store/         # user/ (persisted userStore), utils/ (createSelectors), keys.ts
  test/          # setup.ts, server.ts, handlers.ts, test-utils
  env.ts         # validated public env
```

## Key Patterns

Component, store, page and Tailwind rules: `AGENTS.md` § Critical rules.

### TanStack Query — `queryOptions()` + key factories

New features add a `queries.ts` (or `*.queries.ts`) under `src/lib/api/`: a stable **key factory** and per-query `queryOptions()` factories. Components call `useQuery(...)` with those options directly; add a thin custom hook only when it wraps real logic. Unwired pattern reference: `_example.queries.ts`; wired example on the home route: `greeting.queries.ts`. Boundary validation: `DECISIONS.md` § "Boundary validation via Zod safeFetch wrapper".

### i18n namespace strategy

- All four scaffolded namespaces (`common`, `errors`, `home`, `auth`) are **eager**: `DEFAULT_NAMESPACES` in `src/lib/i18n/constants.ts`; `LAZY_NAMESPACES` is empty.
- Once a namespace exceeds ~5 KB or is route-bounded, move it to `LAZY_NAMESPACES` in the same file.
- Pre-i18n shell: `index.html` `#i18n-boot` + `src/index.css` show a decorative spinner (no translated strings) while `html.i18n-loading`.

### Route focus (a11y)

`useRouteFocus` in `App` takes a ref to `Main` (`#main`, `tabIndex={-1}`); on a pathname change (not the initial mount) focus moves to that landmark (WCAG 2.4.1); `data-route-focus` gates focus-ring styling in CSS.

### Web Vitals

`src/lib/vitals.ts` reports lazily after hydration; `VITE_WEB_VITALS_ATTRIBUTION=true` loads `web-vitals/attribution` via `subscribeAttribution.ts` (the branch reads `import.meta.env`, so Vite drops the unused chunk). Custom backend: `reportWebVitals(yourReporter)`. After changing vitals or env wiring: `npm run verify:web-vitals-chunks`.

### PWA — `generateSW` + prompt-mode update flow

Reference: `PWA.md`. Quick map:

- Manifest + Workbox config in `vite.config.ts` → `VitePWA({...})`; `registerType: 'prompt'`, `devOptions.enabled: false`.
- Update UI: `src/components/common/PwaUpdateToast/` (auto-mounted in `App.tsx`, i18n via `common.pwa.*`).
- Install: `src/hooks/pwa/usePwaInstall.ts` (UI is the consumer's choice); the eager `beforeinstallprompt` capture is `src/lib/pwa/installPromptCapture.ts`, imported from `main.tsx`.
- Icons: placeholder PNGs in `public/icons/` from `scripts/generate-placeholder-icons.mjs`; forks MUST replace them before deploy.
- Build check: `scripts/check-pwa.mjs` (`npm run verify:pwa`, inside `verify`).
- Host contract: `max-age=0, must-revalidate` on `sw.js`, `manifest.webmanifest` and `index.html`, or the update toast goes invisible (`PWA.md`, README).

### Perf and a11y gates

- **Lighthouse-CI**: `lighthouserc.json` holds the assertions (the only copy of the budgets); `npm run perf:ci` runs them against the preview build, the CI `lighthouse` job runs them as one non-required run where every budget but accessibility only warns. Change a budget in the assertions block, never by silently weakening; a relaxed budget gets a `DECISIONS.md` entry.
- **axe**: `e2e/a11y.spec.ts` scans home / login / 404 / `/dashboard` and fails on any `serious` or `critical` violation. Its `scan()` helper opts in the `target-size` rule (WCAG 2.2 SC 2.5.8) and waits for the page `h1` before scanning. A new route is added to that spec in the same change.

### Feature flags — pluggable provider

`src/lib/features/flags.ts` defines the `FEATURE_FLAGS` registry and the `FeatureFlagProvider` interface; the default `EnvFlagProvider` reads `VITE_FF_<NAME>` (truthy: `'true'`, `'1'`, `'yes'`). Forks swap in LaunchDarkly / GrowthBook / OpenFeature with `setFeatureFlagProvider(...)` at boot. Hook: `src/hooks/features/useFeatureFlag.ts`; always synchronous, so an async provider resolves its init before React mounts.

## Dev tooling

The gate, its moments and its scripts: `AGENTS.md` § Commands / the gate (nothing about the gate is repeated here); stage timings: `VERIFICATION.md`; every script: `package.json`.

- Lint: ESLint 10 flat with `settings.react.version` a literal (`DECISIONS.md` § "ESLint 10; `settings.react.version` must be a literal"), type-aware `typescript-eslint` strict + stylistic, `import-x` order and no-cycle; parent-relative imports under `src/**` are restricted (use `@/` or `@locales/`); `vite-plugins/**` may use `../src/**` because it loads before Vite resolves `@/`.
- E2E: Playwright (`e2e/`, `playwright.config.ts`). `npm run test:e2e` starts `vite` dev on port 3000; CI, `test:e2e:prod` and `PLAYWRIGHT_USE_PREVIEW=1` use `vite preview` on 4173 after `build`, under the shipped CSP. Specs import `test` from `e2e/support/fixtures.ts`, which fails a test on a CSP violation. On real `CI` a test that passes only on a retry fails the run (`failOnFlakyTests`).
