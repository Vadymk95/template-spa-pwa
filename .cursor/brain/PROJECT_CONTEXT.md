# react-spa-pwa-foundation — Project Context

## Purpose

Production-ready React SPA + PWA template. Copy, rename, start building. Includes all the boring setup (DX tooling, i18n, routing, state, testing, CI, **PWA**) so you don't repeat it.

## Tech Stack

| Layer         | Choice                                                                      | Version                   |
| ------------- | --------------------------------------------------------------------------- | ------------------------- |
| UI            | React                                                                       | 19                        |
| Language      | TypeScript                                                                  | 6.0 strict                |
| Bundler       | Vite + Rolldown (official `vite`)                                           | 8                         |
| Styling       | Tailwind CSS                                                                | **v4** (CSS-based config) |
| Components    | shadcn/ui (new-york)                                                        | latest                    |
| Global State  | Zustand + devtools                                                          | 5                         |
| Server State  | TanStack Query                                                              | 5                         |
| Routing       | React Router                                                                | 7                         |
| Forms         | react-hook-form + zod                                                       | 7 / 4                     |
| i18n          | i18next + react-i18next                                                     | 26 / 17                   |
| Testing       | Vitest + Testing Library                                                    | 4                         |
| Linting       | ESLint 9 flat + Oxlint (staged)                                             | 9 / 1.x                   |
| Formatting    | Prettier                                                                    | 3                         |
| Git hooks     | Husky + commitlint + lint-staged                                            | 9 / 20                    |
| PWA           | vite-plugin-pwa (generateSW + prompt)                                       | 1.x (Workbox)             |
| Perf gate     | Lighthouse-CI (`@lhci/cli`) — Web Vitals + total-byte-weight assertions     | 0.x                       |
| A11y gate     | axe-core via `@axe-core/playwright` (E2E)                                   | 4.x                       |
| Feature flags | `src/lib/features/flags.ts` — pluggable provider (default: `VITE_FF_*` env) | —                         |

## Architecture

Repo root also ships **`vite-plugins/`** — small custom Vite plugins wired from `vite.config.ts` (dev banner, i18n HMR, HTML optimize); tests where needed live alongside.

```
src/
  components/
    common/      # App-level: ErrorBoundary, RouteErrorBoundary, RouteSkeleton, SkipLink, I18nInitErrorFallback, PwaUpdateToast, ThemeToggle, LanguageSwitcher
    layout/      # Header, Footer, Main (`#main` landmark + route-focus hook)
    ui/          # shadcn/ui primitives
  hocs/          # WithSuspense, ProtectedRoute (auth gate for nested routes)
  hooks/
    a11y/        # useRouteFocus — focus `#main` on client navigations (skips first paint)
    i18n/        # useI18nReload (dev HMR)
    pwa/         # usePwaInstall (add-to-homescreen; tests alongside)
    theme/       # useTheme (light / dark / system)
    <domain>/    # Feature hooks with tests alongside
  mocks/
    browser.ts   # DEV-only MSW `setupWorker` (handlers from `test/handlers`)
  lib/
    api/         # client, auth; safeFetch.ts (Zod boundary validation for all API responses — see DECISIONS.md); `greeting.*` = minimal wired Query + transport (HomePage); `_example.*` = unwired pattern seeds
    i18n/        # i18next setup, constants, resources
    pwa/         # installPromptCapture; keys.ts (PWA storage keys + events)
    webVitals/   # subscribeStandard / subscribeAttribution (loaded from vitals.ts)
    queryClient.ts  # TanStack Query client factory
    queryKeys.ts # TanStack Query key-factory registry
    devGuards.ts # dev-only guards (AbortError noise suppression, wired from main.tsx)
    constants.ts # centralized named constants (`no-magic-numbers` exemption)
    env.ts       # @t3-oss/env-core validated public env
    vitals.ts, logger, utils  # observability + cn()
  pages/
    HomePage/       # Index route (not lazy); `index.ts` re-exports `HomePage.tsx`
    LoginPage/      # Auth UI (lazy)
    DashboardPage/  # Behind ProtectedRoute (lazy)
    NotFoundPage/   # Catch-all (lazy)
    DevPlayground/  # DEV-only sandbox
  router/
    index.tsx    # createBrowserRouter assembly
    modules/     # base.routes.tsx (+ future route modules)
    routes.ts    # Path constants (e.g. DevPlayground → /dev/ui)
  store/
    user/        # userStore + tests
    utils/       # createSelectors
    keys.ts      # Zustand persist/devtools key registry
  test/
    setup.ts, server.ts, handlers.ts, test-utils
```

## Key Patterns

### TanStack Query — `queryOptions()` + key factories

New features add a `queries.ts` (or `*.queries.ts`) under `src/lib/api/`: a stable **key factory** and **per-query** `queryOptions()` factories. Components call `useQuery(...)` with those options directly; add a thin custom hook only when it wraps real logic (not for every fetch). Unwired pattern reference: `_example.queries.ts`; minimal wired example used on the home route: `greeting.queries.ts`.

### Tailwind v4 (IMPORTANT — no tailwind.config.ts)

- Config lives in `src/index.css` via `@theme inline {}`
- Dark mode via `@custom-variant dark (&:where(.dark, .dark *))`
- Animations via `tw-animate-css` (import in CSS, not a JS plugin)
- Custom animations defined as `@keyframes` + `--animate-*` in `@theme`

### Components: presentational + hook

Feature components use a folder per component: UI in `ComponentName.tsx`, logic in `useComponentName.ts`, tests alongside. Layout and shared pieces follow the same idea where it applies.

### Stores: Zustand + createSelectors

`createSelectors` enables `useStore.use.field()` auto-selectors; the standard callback selector remains available. See `src/store/user/` for the persisted user store pattern.

### Pages: lazy by default

Non-index routes use `PageName.tsx` plus `index.ts` with `lazy(() => import('./PageName'))`; the router wraps lazy pages in `WithSuspense`. The home index route stays eager.

### i18n namespace strategy

- `common` — always loaded (buttons, labels)
- `errors` — always loaded (API/validation errors)
- `home` — loaded with HomePage
- Feature namespaces — lazy loaded on demand

### Route focus (a11y)

- `useRouteFocus` in `App` receives a ref to `Main` (`#main`, `tabIndex={-1}`); on pathname change (not initial mount) focus moves to the landmark for WCAG 2.4.1; `data-route-focus` gates focus-ring styling in CSS.

### Web Vitals

- `src/lib/vitals.ts` — lazy reporting after hydration; optional `VITE_WEB_VITALS_ATTRIBUTION=true` loads `web-vitals/attribution` via `subscribeAttribution.ts` (flag also in `src/env.ts` for Zod/docs; **branch uses `import.meta.env`** so Vite drops the unused chunk). Load failures: `logger.warn` with context.
- Custom backend: pass `reportWebVitals(yourReporter)`.
- **Re-verify chunk split:** after `npm run build`, `node scripts/check-web-vitals-chunks.mjs` (CI runs this on `dist/`). Full regression (two builds: default + attribution): `npm run verify:web-vitals-chunks`.

### Pre-i18n shell

- `index.html` `#i18n-boot` + `src/index.css`: decorative spinner while `html.i18n-loading` (no translated strings — i18n not ready).

### PWA — `generateSW` + prompt-mode update flow

Full reference: `.cursor/brain/PWA.md`. Quick map:

- Manifest + Workbox config in `vite.config.ts → VitePWA({...})`. `registerType: 'prompt'`, `devOptions.enabled: false`.
- Update UI: `src/components/common/PwaUpdateToast/` (auto-mounted in `App.tsx`, i18n via `common.pwa.*`, sessionStorage dismiss).
- Install hook: `src/hooks/pwa/usePwaInstall.ts` — UI is consumer's choice. Eager `beforeinstallprompt` capture lives in `src/lib/pwa/installPromptCapture.ts` (side-effect imported from `main.tsx`).
- Icons: placeholder PNGs in `public/icons/` generated by `scripts/generate-placeholder-icons.mjs`. Forks MUST replace before deploy.
- Type surface: `src/vite-env.d.ts` triple-slash references `vite-plugin-pwa/client` + `/react`.
- Build verification: `npm run verify:pwa` (`scripts/check-pwa.mjs`) — wired into `ci:local`.
- Cache-policy contract for the host: documented in `PWA.md` and README. Without `max-age=0, must-revalidate` on `sw.js` / `manifest.webmanifest` / `index.html`, update toast goes invisible.

### Perf gate — Lighthouse-CI

`lighthouserc.json` + `npm run perf:ci` run Lighthouse against the production preview build. Gates: `categories:performance ≥ 0.9`, `categories:accessibility ≥ 0.95`, LCP ≤ 2500 ms, CLS ≤ 0.1, TBT ≤ 200 ms, total bytes ≤ 800 KB. Wired into `ci:local`. Bump targets via the assertions block, not by silently weakening; document in `DECISIONS.md` if a budget is intentionally relaxed.

### A11y gate — axe-core E2E

`e2e/a11y.spec.ts` injects axe via `@axe-core/playwright` against home / login / 404 routes; fails on any `serious` or `critical` violation. Add new routes here when shipping new pages — discipline ratchet, not optional.

### Feature flags — pluggable provider

`src/lib/features/flags.ts` defines the `FEATURE_FLAGS` registry + `FeatureFlagProvider` interface. Default `EnvFlagProvider` reads `VITE_FF_<NAME>` env vars (truthy: `'true'`, `'1'`, `'yes'`). Forks swap to LaunchDarkly / GrowthBook / OpenFeature via `setFeatureFlagProvider(...)` at app boot. Hook: `useFeatureFlag(flag)` from `src/hooks/features/useFeatureFlag.ts`. Always synchronous — async providers must resolve init before mounting React.

## Dev Tooling

- **Which checks to run** — see `.cursor/brain/VERIFICATION.md` (point-in-time vs `verify` / `ci:local`; avoids running audit/build/vitals for every small change).
- `npm run verify` — commit/push gate: typecheck → oxlint → eslint → format → test:coverage → build → ensure-playwright → **`test:e2e:prod`**. Husky **pre-push** runs this.
- `npm run ci:local` — stricter local CI vs `.github/workflows/ci.yml`: after build adds **`verify:pwa`**, **`verify:web-vitals-chunks`**, **`size:check`**, **`perf:ci`** (LHCI), then ensure-playwright + E2E. **GitHub Actions** `ci.yml` runs `verify:web-vitals-chunks` but not `verify:pwa`, `size:check`, or `perf:ci`. **`.github/workflows/security.yml`** runs gitleaks + CodeQL — not part of `ci:local`.
- `npm run test:e2e:prod` — Playwright against `vite preview` (same mode as CI / verify gate).
- `npm run dev` — Vite dev server (`vite.config.ts` pins port 3000). ESLint runs via the IDE extension (recommended in `.vscode/extensions.json`) and as a pre-commit gate in `lint-staged` — no in-Vite linter.
- `npm run build` — `tsc -b` then Vite production build (Rolldown)
- `npm run verify:pwa` — asserts manifest fields, populated SW precache, iOS / theme-color meta tags survived minify (after `npm run build`). Wired into `ci:local`.
- `npm run icons:placeholders` — regenerates `public/icons/{192,512,apple-touch}.png` from `scripts/generate-placeholder-icons.mjs`. Forks replace these with brand assets before deploy.
- `npm run verify:web-vitals-chunks` — asserts standard vs attribution web-vitals chunks (two production builds; use after changing `src/lib/vitals.ts` or env wiring)
- `npm run build:analyze` — bundle visualizer (`ANALYZE=true`)
- `npm run typecheck` — `tsc -b` only (also used in CI before lint)
- `npm run test` — Vitest run
- `npm run lint` — ESLint 9 flat: `typescript-eslint` **strict + stylistic** (type-aware), `import-x` (**order**, **no-cycle**), parent-relative imports under `src/**` restricted (use `@/` or `@locales/` for locale JSON); `vite-plugins/**` may use `../src/**` (loads before Vite resolves `@/`). `lint:oxlint` runs first in CI.
- **E2E** — Playwright (`e2e/`, `playwright.config.ts`): local default `npm run test:e2e` starts **`vite` dev** on port 3000; CI / `test:e2e:prod` / `PLAYWRIGHT_USE_PREVIEW=1` uses **`vite preview`** on 4173 after `build`. Chromium via `ensure-playwright.mjs` in verify / `ci:local`, and CI install step.
- Staged commits: Oxlint fix → ESLint fix → Prettier (see `lint-staged` in package.json)
