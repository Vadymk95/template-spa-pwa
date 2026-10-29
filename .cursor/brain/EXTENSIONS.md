# Extensions — graduating template → MVP / personal project

This file is the **single source of truth** for "what to add when forking this template into a real project". Phases below are ordered by typical product lifecycle; skip phases you don't need. Every phase names a recommended default + the trade-off + the brain doc / template seed it touches.

Companion docs: [`PWA.md`](./PWA.md) (PWA-specific extras live there, not here), [`TEMPLATE_SEEDS.md`](./TEMPLATE_SEEDS.md) (seeds that graduate at each phase), [`SKELETONS.md`](./SKELETONS.md) (danger zones to keep in mind), [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) (the stack you're extending).

**Priority order when the fork becomes a real product** (the phases below are the detail): auth on the shipped `ProtectedRoute` + `userStore` (Phase 2) → error monitoring into `ErrorBoundary` + `logger.ts` (Phase 4) → Playwright specs for the critical flows (login → redirect → logout, the core journey, error states; the suite and the gate already exist) → analytics (Phase 4) → feature flags once real users see releases (Phase 4) → Storybook when the team grows past two (Phase 9) → data tables when an admin view appears (Phase 9).

---

## Phase 0 — Cosmetics & identity (before first deploy)

Mandatory — without this the deploy ships as a generic placeholder template.

| Item | File / location | Notes |
|---|---|---|
| App name + short name | `app.config.ts → manifestIdentity.name` / `.short_name` | Reflected in OS install UI. |
| Description | `app.config.ts → manifestIdentity.description`, `index.html` `<meta name="description">` | iOS install sheet + SEO. |
| Theme colour + background colour | `app.config.ts → manifestIdentity.theme_color` / `.background_color`, `index.html` `theme-color` × 2 | Match Tailwind theme tokens in `src/index.css`. |
| `lang` | `app.config.ts → manifestIdentity.lang`, `src/lib/i18n/constants.ts → DEFAULT_LANGUAGE` | Update if not English. |
| iOS title | `index.html` `<meta name="apple-mobile-web-app-title">` | Truncates after ~12 chars on home screen. |
| App icons | `public/icons/{192x192,512x512,apple-touch-icon}.png` | Replace red "REPLACE ME" placeholders with real branding. |
| HTML `<title>` | `index.html` | Surfaces in tab + Lighthouse SEO. |
| Locale strings | `public/locales/en/{common,errors,home,auth}.json` | Especially `common.appName` and `common.pwa.*`. |
| README header | `README.md` | Title + tagline reflect the real product. |
| Decisions file | `.cursor/brain/DECISIONS.md` | Replace the template's entries with your own, starting from a first line that points to the template's history (its repository and `git log -p -- .cursor/brain/DECISIONS.md`); keep the format (decisions in force, at most 30 lines each, an index row, a superseded entry deleted). |
| Version holds | `scripts/version-holds.json`, `.github/dependabot.yml` | Keep the file: `verify` fails on a bump past a hold or an `ignore` that disagrees. At the first Dependabot PRs, re-check every hold against the fork's own PRs; lift a hold only by editing the file and its `ignore` together, and delete an entry whose package you removed. |

**Verification:** `npm run verify:pwa` on a fresh `dist/` — manifest fields surface correctly.

### Day-1 shadcn batch (recommended)

The template ships shadcn/ui primitives that the placeholder pages already use (`Button`, `Input`). For most product apps — admin panels, dashboards, Jira-likes, CRMs — you'll want a wider set on day 1. Install them in one batch so you don't break flow later:

```bash
npx shadcn@latest add dialog alert-dialog dropdown-menu sheet sidebar table tabs sonner skeleton popover calendar select tooltip scroll-area
```

Recommended payload by purpose:

| Primitive | What it unblocks |
|---|---|
| `dialog` + `alert-dialog` | Confirmations, "Are you sure?", form modals |
| `dropdown-menu` | Row actions, header user menu, contextual actions |
| `sheet` | Mobile nav drawer, side filters, edit panels |
| `sidebar` | Persistent left navigation (admin / dashboard layouts) |
| `table` | Lists with sort / filter / pagination — pair with `@tanstack/react-table` for state |
| `tabs` | Settings panels, multi-section views |
| `sonner` | Toast notifications for action feedback (separate from `PwaUpdateToast`) |
| `skeleton` | List / detail loading states matching your real UI shape |
| `popover` + `calendar` | Date pickers, info popovers |
| `select` | Form dropdowns (RHF + zod-friendly) |
| `tooltip` | Compact icon buttons need tooltips for a11y discoverability |
| `scroll-area` | Sidebar / list overflow that respects design tokens |

Skip what your domain doesn't need (e.g. drop `calendar` if you have no date inputs). Re-running the command later to add more is safe — shadcn writes idempotently into `src/components/ui/`.

After install, run `npm run lint:oxlint`; then `npm run lint`, once — shadcn primitives ship with their own conventions and the `src/components/ui/**` lint exemption (see `eslint.config.js`) lets `func-style` differences pass without edits.

Traps a fork measured once Radix-based widgets were in use. The template ships none (only `@radix-ui/react-slot`), so each line is a lead to confirm in your own tree, not a recipe; the symptom comes first and the remedy after:

- **A Radix `RadioGroup` chooses on arrow focus only while the key is held**, and user-event releases a key at once: hold it (`{ArrowDown>}`, wait for the choice, `{/ArrowDown}`). **A list mounted open makes axe report `aria-hidden-focus`**, because Radix hides the rest of the page while the trigger inside it stays focusable: turn that one rule off only for the check that mounts the list open, with a comment saying why.
- **A Radix layer (`dialog`, `popover`, `select`) focuses its first tab stop in the commit after its content mounts**, so a conditional tab stop (a scroll region) that appears in that commit takes the focus. Delay the first measure of it by one microtask.
- **The `tooltip` runs its open side effects before a consumer's `onOpenChange`.** A consumer can refuse an open only after those effects, or by cancelling the focus event, which reaches roving items and tabs. Check for a veto option at each Radix bump.

---

## Phase 1 — Real backend (week 1 of MVP)

The template ships with a wired **TanStack Query example** (`greeting.queries.ts`) calling a placeholder `/greeting` endpoint at `VITE_API_URL ?? 'http://localhost:3001/api'`. Replace this with a real backend.

### Choose one

| Option | Pros | Cons | When to pick |
|---|---|---|---|
| **Supabase** | Postgres + Auth + Storage + Realtime in one SDK; row-level security; generous free tier; hosted | Vendor lock-in (Postgres-flavoured); SQL skills required | SaaS MVPs, B2B apps, anything with relational data; default pick for solo founders |
| **Firebase** | Best-in-class auth providers; Firestore is fast for nested data; mobile-friendly | NoSQL surprises; pricing surprises at scale; vendor lock-in | Mobile-first apps, real-time chat, prototypes |
| **Custom REST / GraphQL** | Full control, no vendor; pairs with any backend (Hono, Nest, FastAPI, Go) | Build auth + storage + realtime yourself | When the team owns a backend already |
| **tRPC** | End-to-end typesafe via TanStack Query; zero schema duplication | Requires a TS backend; learning curve | TS monorepos, internal tools |

### What to wire

1. Set `VITE_API_URL` in `.env` (or delete `src/lib/api/` entirely if going BaaS-SDK-only).
2. **Graduate the seed** (`.cursor/brain/TEMPLATE_SEEDS.md`): copy `_example.queries.ts` → `<domain>.queries.ts`; copy `_example.ts` → `<domain>.ts`. Remove the seed row from the registry.
3. Replace `apiClient` with the BaaS SDK if relevant — keep `getAuthToken()` exported from `src/lib/api/auth.ts` to avoid circular imports.
4. Update `.env.example` so forkers know what to set.
5. Update [`MAP.md`](./MAP.md) "State Boundaries" if topology changes.
6. **Same-origin dev proxy (optional)** _(a recipe recorded in a fork that shipped it as a small dev plugin; not built in this template, so untested here)_. `server` in `vite.config.ts` has only `port` and `cors` today. A `server.proxy` key also reaches `vite preview` (and so the gate's preview-mode e2e run): `preview.proxy` falls back to `server.proxy` when it is unset (`resolvePreviewOptions` in the installed Vite 8.3.4), so set `preview: { proxy: {} }` to keep the preview server unproxied, or register the proxy from a plugin's `configureServer` hook, which runs for the dev server only. One `server.proxy` key per backend prefix, written as a regular expression that ends at a path-segment boundary: a key that starts with `^` is read as a RegExp and any other key as a plain prefix, so a bare `'/api'` would also proxy `/apiary`; the key is tested against `req.url`, which carries the query string, so the boundary accepts `/`, `?` or the end (both read in the installed Vite 8.3.4 source). `changeOrigin: false`, so the backend sees the `Host` the browser used _(inference: what a cookie session and an `Origin` check expect)_. `ws: true` only on the one prefix that carries a websocket, and never `rewriteWsOrigin`, which can leave websocket proxying open to cross-site request forgery (the warning on that option in the installed Vite typings). A carve-out for every client route that shares the prefix, so the dev server answers it and the backend never sees it. A table test of path to target (or to none), with a prefix look-alike, a path with a query string and the carved-out client route among the rows, pins the keys. With the proxy the client calls its own origin: the CSP `connect-src` needs no extra origin and a cookie session needs no CORS, but `VITE_API_URL` is `z.url().optional()` in `src/env.ts` today, so the schema has to accept a path first. Production needs the same prefix routed by the host (a rewrite or a reverse proxy), which this recipe does not cover. **Approval Law** (API contract).

**Skip** apiClient entirely when using Supabase / Firebase — their SDKs plug into TanStack Query directly via `queryFn: () => supabase.from(...).select()`.

---

## Phase 2 — Auth

Template ships a placeholder `userStore` (Zustand + persist + localStorage `"user-store"`) and a `ProtectedRoute` HOC (`src/hocs/ProtectedRoute.tsx`) gating `/dashboard`. Wire real auth on top.

### Choose one

| Option | Pros | Cons | When to pick |
|---|---|---|---|
| **Supabase Auth** | Magic link / OAuth / password / OTP; row-level security pairs with DB | Locked to Supabase | If Phase 1 chose Supabase |
| **Firebase Auth** | Most providers (Google, Apple, phone, GitHub, anonymous); battle-tested | Locked to Firebase | If Phase 1 chose Firebase; mobile auth flows |
| **Auth0 / Clerk / WorkOS** | Best UX out-of-box; SAML / SSO / org management; compliance | $0.02-$0.10 per active user/month | B2B / SaaS with org tenancy |
| **Custom JWT** | Full control; no vendor cost | Build refresh, revoke, rate-limit yourself | Existing backend with auth in place |

### What to wire

1. Replace the placeholder `userStore` shape (`username`, `email`, `isAuthenticated`) with the real user model. Keep the `persist` middleware — `localStorage` survives refresh by design.
2. Set the real auth token in `getAuthToken()` (`src/lib/api/auth.ts`) — `apiClient` uses it for `Authorization: Bearer …`.
3. Wire login / logout / refresh into `LoginPage` (already has `react-hook-form` + `zod` + `useLoginForm.ts`).
4. Extend `ProtectedRoute` with role / permission checks if the product needs them — current contract is binary (`isAuthenticated` true/false).
5. Add new `auth.json` translation keys per provider.
6. Update [`SKELETONS.md`](./SKELETONS.md) if a new persist key collides with `"user-store"`.
7. **Multi-tenant apps** _(a pattern recorded in a fork; nothing of it ships here, because the starter has one demo query and no tenant)_: put the active membership id (or tenant id) first in every query key, so two memberships never share a cache entry and a prefix invalidation stays inside one; handle a 401 once, in the transport (`src/lib/api/`), not at each call site; and drop the whole query cache when the active membership changes and on logout (`queryClient.clear()`). _(Inference: the previous membership's data should not outlive the switch, and after a logout another person may use the tab.)_ The starter's transport has no 401 handling (only the login form reads a 401, for its own message) and `logout()` in the persisted `userStore` touches no query cache, so each is a change to add. **Approval Law** (API and store contracts).

**Pitfall:** never call `persist.clearStorage()` in tests — see SKELETONS.md "userStore — persist middleware".

---

## Phase 3 — Multi-locale i18n

Template ships **English only** (`SUPPORTED_LANGUAGES = ['en']` in `src/lib/i18n/constants.ts`). The `LanguageSwitcher` component (template seed) currently degrades to a static badge; it graduates to a real `<select>` once `SUPPORTED_LANGUAGES.length >= 2`.

### What to wire

1. Mirror `public/locales/en/` to `public/locales/<lng>/` for each new locale. Keep namespaces aligned (`common`, `errors`, `home`, `auth`).
2. Extend `SUPPORTED_LANGUAGES` and update `DEFAULT_LANGUAGE` if the primary changes.
3. Update `manifestIdentity.lang` in `app.config.ts` if the app's primary language changes.
4. Run `/sync-i18n` (skill) periodically to detect key drift across locales.
5. RTL? Add `<html dir="rtl">` toggle in `useI18nReload` or via a separate hook; Tailwind v4 supports `rtl:` variants natively.

### Regional locales (`de-DE`, `pt-BR`, `zh-CN`)

`I18N_LOAD_MODE = 'languageOnly'` in `src/lib/i18n/constants.ts` truncates `de-DE` → `de`, `pt-BR` → `pt`, etc. Implications:

- If you ship only generic `de` / `pt`, regional users get them transparently — fine.
- If you ship region-specific copy (`de-DE` and `de-AT` differ), switch to `'currentOnly'` (or remove the `load` option) AND mirror per-region locale folders. Otherwise both regions silently load the same generic file.

Document the choice in `.cursor/brain/PROJECT_CONTEXT.md` if it changes — silent locale fallback is a class-of-mistake worth a SKELETONS gotcha if it bites.

**Skip** if the product is single-locale forever — the seed `LanguageSwitcher` graduates by being deleted.

---

## Phase 4 — Error monitoring, analytics, feature flags

Template wires **`web-vitals`** reporting (`src/lib/vitals.ts`) with optional attribution chunk gated by `VITE_WEB_VITALS_ATTRIBUTION`. `ErrorBoundary` calls `logger.error` with structured context. Bring your own transport.

### Error monitoring

| Option | Strengths | When to pick |
|---|---|---|
| **Sentry** | Industry default; perf traces + replays; React-aware error context | Most products |
| **Bugsnag / Rollbar / Honeybadger** | Sentry alternatives; differentiated by pricing / UX | Sentry-allergic teams |
| **Self-hosted GlitchTip** | Sentry-compatible OSS | Privacy-strict / on-prem |
| **None** (logger only) | Zero cost | Internal tools, alpha pre-prod |

### Analytics

| Option | Strengths | When to pick |
|---|---|---|
| **Plausible / Simple Analytics** | Cookie-less, GDPR-easy, lightweight | EU products, marketing sites |
| **PostHog** | Product analytics + feature flags + session replays | SaaS, B2B |
| **GA4** | Free, ubiquitous, Google ecosystem | Consumer, ads-driven |
| **Vercel / Netlify Analytics** | Zero-config if hosted there | Quick wins |

### Feature flags (when shipping to real users)

Flags buy trunk-based development, gradual rollouts and kill switches; add them at the first release real users can see, not before.

| Option | Strengths | When to pick |
|---|---|---|
| **PostHog flags** | Same SDK as the analytics above; no second vendor | If Phase 4 chose PostHog |
| **GrowthBook / Unleash** | Open source, self-hostable, React SDKs | Privacy-strict or on-prem |
| **LaunchDarkly** | Industry standard; best tooling; expensive | Enterprise with a budget |
| **Vercel Flags** | Edge-evaluated, zero infra | If deployed on Vercel |

### What to wire

1. Add an analytics module under `src/lib/` with a `track(event, payload)` API (mirror `frontend-practice-lab/src/lib/analytics/`).
2. Pass a custom reporter to `reportWebVitals(yourReporter)` in `main.tsx`.
3. Wire Sentry SDK via `ErrorBoundary` — its `componentDidCatch` already exposes a hook.
4. Add `VITE_*` env vars (DSN, write key) to `src/env.ts` and `.env.example`.
5. Wire `analytics.track('pwa_update_applied')` inside `PwaUpdateToast`'s `handleUpdate` (the template intentionally leaves this to the consumer).

---

## Phase 5 — SEO + social previews

The template ships description + viewport meta only. SEO assets are product-specific.

### What to add

| Asset | Where | Why |
|---|---|---|
| Open Graph meta (`og:title`, `og:description`, `og:image`) | `index.html` | Slack / Discord / iMessage previews |
| Twitter cards (`twitter:card`, `twitter:image`) | `index.html` | Same for Twitter / X |
| `robots.txt` | under `public/` | Crawler rules |
| `sitemap.xml` | under `public/` (or generated) | Search-engine discoverability |
| JSON-LD structured data | `index.html` `<script type="application/ld+json">` | Rich snippets in Google |
| `react-helmet-async` | `npm i react-helmet-async` | If meta tags must change per route |
| Pre-rendering / SSG | Out-of-scope for SPA — migrate to Next.js / Remix / Astro | If SEO is critical for many routes |

**Skip** static SEO if the product is an authenticated app (login wall makes SEO irrelevant).

---

## Phase 6 — Payments

Pure SPA payments work via Checkout-redirect or hosted Elements. Don't host card forms yourself unless PCI is in scope.

| Option | When to pick |
|---|---|
| **Stripe Checkout / Stripe Elements** | Default for cards globally; supports subscriptions, marketplaces, EU/US/UK |
| **Paddle / Lemon Squeezy** | Merchant-of-record (MoR) — they handle EU VAT / tax / invoicing | Solo founders / global SaaS |
| **RevenueCat** | iOS / Android subscription management | If wrapped via Capacitor / TWA |
| **PayPal / Braintree** | Required in some markets | Niche only |

Wire price IDs / product IDs in `.env`. Webhook handlers live on the **backend**, never in this SPA.

---

## Phase 7 — PWA extras (when branding lands)

Full PWA reference: [`PWA.md`](./PWA.md) "Known TODO / future work". Items below are intentionally deferred from Phase 0 because they need real assets / use cases.

- **Maskable icon** — commission a 512×512 with safe-zone padding (≈10%); add as a second `icons[]` entry with `purpose: 'maskable'`. Never `purpose: 'any maskable'` on a single asset (anti-pattern).
- **Screenshots** — capture 1×wide (`form_factor: 'wide'`, e.g. 1920×1080) + 1×narrow (`form_factor: 'narrow'`, e.g. 540×720). Spec requires consistent dimensions per form factor — mismatch = manifest validation error.
- **`shortcuts`** — manifest field for long-press / right-click menu items (e.g., "Compose", "Inbox").
- **`share_target`** — register the PWA as a system share target (Android / Chromium).
- **Push notifications** — iOS 18.4+ supports declarative web push for installed PWAs only; Android works since Chrome 42. Requires a backend push service (FCM / APNs proxy) — out-of-scope for this template.
- **Background sync** — Chromium-only; offline write queue. Requires `injectManifest` mode (template ships `generateSW`).
- **Periodic background sync** — Chromium-only, behind permission. Niche.

~~Drop the `vite-plugin-pwa` Vite-8 peer override when v1.3+ ships~~ — **done 2026-05-09**: 1.3.0 lifted the peer cap to `^8.0.0`, override removed from `package.json`. See [`PWA.md` → "Known TODO / future work"](./PWA.md#known-todo--future-work).

---

## Phase 8 — Deployment hardening

The template is host-agnostic; pick your host and bring its config.

### Cache-policy contract (load-bearing for PWA)

Defined in `PWA.md` — the **`sw.js` / `manifest.webmanifest` / `index.html` must be `max-age=0, must-revalidate`**, hashed JS / CSS / fonts / images = `max-age=31536000, immutable`. Without this the update toast goes invisible.

### Examples (also in README)

| Host | File |
|---|---|
| **Vercel** | `vercel.json` with `headers[]` array |
| **Netlify** | `netlify.toml` with `[[headers]]` blocks |
| **Cloudflare Pages** | `_headers` file (the build already writes `dist/_headers`) |
| **AWS S3 + CloudFront** | Lambda@Edge / CloudFront Functions for cache rules |
| **nginx** | `location ~ ^/(sw\.js|...)$` blocks |
| **Firebase Hosting** | `firebase.json → hosting.headers` (see `frontend-practice-lab/firebase.json`) |

### Security headers

The template ships a default CSP and headers: `vite-plugins/security-headers.ts` is the one definition, `dist/_headers` is written at build, `vite preview` sends the same, and `SECURITY_REQUIREMENTS.md` has the Vercel and nginx recipes. What a fork does at this phase is adapt, not add:

- Keep the CSP free of `unsafe-*`; a new third-party origin (analytics, error monitoring, fonts) is added to the matching directive in that file, and the e2e CSP guard (`e2e/support/fixtures.ts`) shows which one.
- Set `VITE_API_URL` for the production build so `connect-src` follows the real API origin.
- Add `preload` to HSTS only when the domain owner decides to submit the domain.
- **NOT** `X-XSS-Protection` (deprecated, harmful).

### CSP: hashes, not nonces

The one inline script is the service-worker registration (`injectRegister: 'inline'`), allowed by a `sha256` hash computed from the built `index.html`, so the shipped policy needs no per-request nonce. If a fork adds another inline `<script>` to the page, its hash is added at build automatically; if a fork moves to a nonce strategy, the hosting layer (nginx, Vercel middleware, CloudFront function) must inject the nonce into the HTML and the matching header and keep them in sync.

---

## Phase 9 — Optional capabilities

Things you'd add for specific needs, not by default.

| Capability | Library | When |
|---|---|---|
| SVG-as-React-component | `vite-plugin-svgr` | Heavy custom-icon set; see README "Removed in v3.1.0" for restore steps |
| File-based routing | `@tanstack/react-router` | 50+ routes / large team / type-safe links across files |
| CSS-in-JS | `@emotion/react` / `styled-components` | Truly dynamic theming Tailwind can't express; rare |
| Storybook | `@storybook/react-vite` | Design-system work; supersedes `DevPlayground` template seed at scale |
| Animation framework | `framer-motion` / `motion` | Complex orchestrated animations; Tailwind `tw-animate-css` covers most |
| Charts | `recharts` / `tremor` / `visx` / `echarts-for-react` | Dashboards |
| Tables | `@tanstack/react-table` | Sortable / filterable / virtualised tables |
| Forms (advanced) | already wired (`react-hook-form` + `zod`) | Add `@hookform/devtools` only if forms get gnarly |
| Offline-first sync | `RxDB` / `WatermelonDB` / `Dexie` + custom sync | Real offline-first apps; significant complexity |
| Realtime | Supabase Realtime / Firebase / `socket.io-client` / `partykit` | Chat, collaboration, live dashboards |
| Date / time | `date-fns` (preferred over `dayjs` for tree-shaking) | When `Intl.DateTimeFormat` isn't enough |

### Intentionally NOT recommended

- **Redux / Redux Toolkit** — Zustand covers global UI state; TanStack Query covers server state; Redux is over-engineering here.
- **Axios** — `fetch` is built-in; Axios adds 13 KB and a CVE history. The template explicitly removed the axios CVE override in v3.1.0.
- **Moment.js** — bundle-killer; deprecated since 2020; use `date-fns` or native `Intl`.
- **Lodash (full bundle)** — tree-shakes poorly; pick named imports from `lodash-es` or write the helper.
- **`rolldown-vite` npm alias** — legacy; use the official `vite` package on Vite 8+ (see SKELETONS.md "Vite 8 + Rolldown").
- **`tailwindcss-animate`** (the PostCSS plugin) — incompatible with `@tailwindcss/vite`. Template uses `tw-animate-css` (CSS import).

---

## Phase 10 — Scale-out (when team / product grows)

Things to consider once a single SPA stops being enough.

| Pattern | Trigger | Notes |
|---|---|---|
| **FSD architecture** ([`feature-sliced.design`](https://feature-sliced.design)) | 3+ engineers, 10+ features | Already conceptually compatible (`hooks/<domain>`, `store/<domain>`, `components/<domain>`); formalise via path aliases (`@/features`, `@/entities`). |
| **Monorepo** (Turborepo / Nx / pnpm workspaces) | 2+ deployable apps share code | Promote `src/lib/*` to `packages/shared/*`. |
| **Module federation / micro-frontends** | Independent team velocity, different release cadence | Avoid until inter-team pain is observed. |
| **Migrate to Next.js / Remix / Astro** | SEO-critical pages, SSR / RSC needs, marketing-heavy | This template is SPA-only. Migration is a rewrite of routing + entry, not a refactor. |
| **Switch package manager (npm → pnpm)** | Monorepo joins, shared `node_modules` across forks, faster cold installs, strict dependency tree | See "pnpm migration" recipe below — only switch if the **target environment uses pnpm**, otherwise the lockfile change is friction without payoff. |
| **TanStack Start / Tanstack Router** | Type-safe routing without the SSR cost | Drop-in replacement for React Router 7 once stable. |
| **Mobile via Capacitor** | Need an iOS / Android app from this PWA | Wraps the PWA; keeps the same codebase. |
| **Mobile via React Native** | Native UI is required | Separate codebase; share `src/lib/api/` schema definitions only. |

---

## pnpm migration (when target environment is pnpm)

**Don't migrate "because pnpm is better."** Migrate only when the host (monorepo, employer's stack, ecosystem) uses pnpm — switching here while the parent uses npm/yarn doubles the lockfile-conversion churn.

### When to switch

- Joining a monorepo / Turborepo / Nx workspace that already runs pnpm.
- Disk-pressure pain: many forks of the same template share machine and `node_modules` dwarfs the source tree.
- Phantom-dep bugs surfaced (`apiClient` accidentally imports a transitive dep that's not in `package.json`) — pnpm's strict tree catches these.

### When NOT to switch

- Solo template, no monorepo intent, no observed pnpm-team alignment yet.
- Active CI/CD runners pinned to npm (some hosted CI providers still default to npm caching).
- Mid-feature branch — wait for a quiet PR window. Lockfile conversion + audit re-run cleanly only on a green main.

### Migration recipe

```bash
# 1. Pick a pnpm version via corepack (Node 24 ships it; no separate install).
corepack enable
corepack prepare pnpm@latest --activate

# 2. Remove npm artefacts; pnpm creates pnpm-lock.yaml.
rm -rf node_modules package-lock.json

# 3. Install (pnpm reads engines.node, ignores engines.npm).
pnpm install

# 4. Verify the same gates pass on the new resolver.
pnpm run ci:local
```

### Manual touch-ups

- **`package.json`**:
    - Remove `engines.npm` (pnpm doesn't use it). Optionally add `engines.pnpm: ">=9"`.
    - **`overrides` syntax change.** npm uses top-level `"overrides": { ... }`; pnpm uses `"pnpm": { "overrides": { ... } }`. Move the block:
        ```json
        "pnpm": {
            "overrides": {
                "qs": ">=6.15.2",
                "serialize-javascript": ">=7.0.5",
                "tmp": ">=0.2.4",
                "uuid": ">=13.0.1",
                "ws": ">=8.21.0"
            },
            "peerDependencyRules": {
                "allowAny": ["vite"]
            }
        }
        ```
        Mirror the current top-level `overrides` in `package.json` at migration time — the list drifts with audit fixes.
    - As of vite-plugin-pwa 1.3.0 (May 2026) the `vite-plugin-pwa.vite: $vite` override is no longer needed — the plugin's peer accepts `^8`. If you fork an older snapshot that still ships the override, the npm-syntax form translates to `peerDependencyRules.allowAny: ["vite"]` in pnpm.
- **`.github/workflows/*.yml`**:
    - Replace `npm ci --ignore-scripts` with `pnpm install --frozen-lockfile --ignore-scripts`.
    - Replace `cache: 'npm'` in `actions/setup-node` with a separate `pnpm/action-setup@a3252b78c470c02df07e9d59298aecedc3ccdd6d # v3.0.0` step (SHA-pinned like every other action here) before setup-node, then `cache: 'pnpm'`.
- **Husky's generated helper directory** (gitignored, created by its install hook, not present in a fresh checkout): regenerates on `pnpm prepare`; should work transparently.
- **README**: update Quick Start commands; note `corepack enable` prerequisite.
- **CLAUDE.md / `.cursor/brain/PROJECT_CONTEXT.md`**: replace `npm run X` with `pnpm X` in examples.

### Verify after switch

- `pnpm run ci:local` passes end-to-end, the `size:check` budget and `sw-lifecycle.spec.ts` included.
- `pnpm-lock.yaml` is committed (deleted `package-lock.json` is staged for removal).
- `pnpm why <package>` works for a sample dep — if it errors, the install didn't complete cleanly.
- CI green on the conversion PR.

### Roll-back plan

If the pnpm switch surfaces a hostile interaction (rare but happens with Vite plugins assuming npm-style flat `node_modules`):

```bash
rm -rf node_modules pnpm-lock.yaml
git checkout -- package.json package-lock.json
npm ci
```

Record the failing plugin in a `DECISIONS.md` entry (at most 30 lines) so the next attempt has the receipt.

## Cross-references — what to update when graduating

When you graduate any phase, update these files in lockstep so the brain doesn't drift:

- [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) — a key pattern subsection (and the "Also in the box" line when it is a dependency).
- [`MAP.md`](./MAP.md) — entry points / state boundaries / route table.
- [`SKELETONS.md`](./SKELETONS.md) — new danger zone if the addition introduces one (e.g., Sentry instrumentation must NOT live above `ErrorBoundary`).
- [`TEMPLATE_SEEDS.md`](./TEMPLATE_SEEDS.md) — remove the registry row when a seed graduates into real code.
- [`VERIFICATION.md`](./VERIFICATION.md) — new check to run when touching the new domain.
- [`PWA.md`](./PWA.md) — only when Phase 7 (PWA extras) is touched.
- `README.md` — only if developer-facing scripts / commands change.

If a phase introduces a recurring class of failures, also append it to `SKELETONS.md`: a mistake made twice earns a written danger-zone line, the way `AGENTS.md` asks for a rule after the second repeat.

---

## When NOT to use this checklist

- **Single-purpose throwaway prototype.** Skip Phases 1-8; just ship and delete.
- **Internal tool with auth gate.** Skip Phase 5 (SEO).
- **Read-only dashboard.** Skip Phase 6 (payments).
- **B2B internal**: Skip Phase 3 (multi-locale) unless explicitly required.

The template is opinionated; this checklist is a menu, not a mandate. Pick what your product needs.

---

## Appendix — traps when a fork adds Storybook or a Radix-based UI kit

Trigger: a fork adds a story runner (Storybook, its stories run through the Vitest browser mode) or a UI kit built on Radix primitives. This template ships neither a story runner nor a Radix widget, so nothing below is exercised here. Every line is a trap measured in one fork that added both: a lead to confirm in your own tree, not a recipe, the symptom first and the remedy after. A line says so when the source recorded no remedy. The Radix traps for the widgets the Day-1 batch installs sit with that batch (Phase 0, "Day-1 shadcn batch"); only the one that needs a story viewport is here.

### The story runner

- **A story project in the Vitest config is also run by everything else.** A bare `vitest`, coverage, `--changed` and the mutation run would all execute the browser story project too: the Vitest measured (4.1.11) documents no config-level default project, only `--project` selects one. Keep the story project behind an environment switch from the start.
- **A link followed in a play navigates the host window.** Storybook's preview head carries `<base target="_parent">`, so following a link drops the browser connection. Set `target="_self"` on the link before the click.
- **A failure frame can name the wrong line.** A 130-line file was reported at line 188, an excerpt came from another story of the same file, a frame pointed into a child component, and the message was right each time: read the message, not the frame.
- **A whole-suite story run can stall silently.** Nothing was printed for over 8 minutes; elsewhere a run sat at 0 % CPU with every file at "0 test"; no cause was found. Run it with `--reporter=verbose` and a hard time bound, so a stall is visible and ends.
- **The first story run of a fresh checkout can reload mid-run.** Vite's dependency optimiser finds a package late, reloads, and the files in flight fail at "0 test"; Vitest names the fix (`optimizeDeps.include`). List every package the stories import, one that only a dynamic `import()` loads included. The optimiser cache sits under `node_modules/.cache/storybook/<version>/<hash>/sb-vitest`, keyed by the hash of the Storybook config path, so each checkout has its own; the story runs also fetch their fonts from the network.
- **Locale JSON imported from `public/` in a story helper warns on every run** (three times per story run): "Assets in public directory cannot be imported from JavaScript". Vite's own message gives the remedy: import the file from `src/`, or use its URL.
- **`parameters.layout: 'centered'` does nothing in the story runner.** An overlay or placement story brings its own fixed, centred box and measures against the scrim, never `innerWidth`: the runner window carries an 11 px scrollbar.
- **`userEvent.click` throws on an element with `pointer-events: none`** (a loading button, a disabled tab). Assert `toBeDisabled`, or press with the keyboard.
- **The story-test types are thin.** `toHaveBeenCalledExactlyOnceWith` is missing and `MockInstance` is not exported: use `toHaveBeenCalledTimes(1)` plus `toHaveBeenCalledWith`, and have a helper return the call count instead of a typed spy.
- **A story window cannot press a real mouse**, so code that branches on `:focus-visible` (a trigger that scripts `focus()` on click, such as a Select) needs a stub of `Element.prototype.matches` in a shared helper under `src/test/`. Importing the browser-mode entry of Vitest for a real pointer is no way out: Storybook's own UI loads every story file.
- **A story cannot send a real Tab.** Prove keyboard order with the synthetic Tab plus `focus()` on the elements that must refuse it (the platform refuses focus on inert nodes), and measure the real key order once in a probe outside the story tree. In Firefox, with two story files in sibling iframes, a `focus()` from the frame without the window focus takes the window focus and moves no element focus, so a counted Tab press does nothing: press until the focus arrives (a `tabTo` helper).
- **An `IntersectionObserver` with no root measures the runner page**, whose story window sits scaled and above it. Give it an explicit root through a shim, and keep a short stub observer in `src/test/` as the unit-test seam for any component that reads an observer's report.
- **A bulk migration of a test idiom by regex needs the three-engine run before review:** one of 54 sites was synchronous on purpose.
- **Two `<header>` elements in one story fail axe `landmark-no-duplicate-banner`**, so a width comparison takes two stories; a story that mounts a sheet cannot size it, only fill it.
- **Story files count against the 200-line `max-lines` cap** (`src/**`, tests exempt), so data and helpers move to a fixtures file and every extra story file repeats its meta and decorators: export the decorators once per component.

### Radix primitives in a story

- **A viewport global plus a layer that closes on window resize (Select) races in Firefox.** It sends the phone frame's resize after the first render, and a list mounted open closes under the play. Open the list in the play and assert `data-state="open"`; refuse a `defaultOpen` Select under a viewport global.

### Styling and lint in a kit

- **`cn` knows a design-token name only once tailwind-merge is told it.** With this template's plain `cn`, `h-menu-item h-auto` keeps both classes (run here); register the token names so that `h-auto` replaces `h-menu-item` in a merge.
- **An unnamed container query reads the nearest container**, so a density lift keyed to an unnamed container variant (`@max-<size>:`) fires inside any component that is itself a container, such as a card narrower than the breakpoint on a desktop. Name the frame container and key the lift to that name from the start.
- **The base layer's `overflow-wrap: break-word` makes a wrap class red only in a flex row or a grid:** unlike `anywhere`, it leaves the min-content size alone (the comment in `src/index.css`), so a content story for such a class puts the component there.
- **The unbroken stress token sized for a 280 px box fits a 640 px phone frame without breaking**, so a layer story proves nothing with it: a layer story needs a token sized to the layer.
- **`jsx-a11y/no-noninteractive-tabindex` cannot see spread props**, so a conditional region is written as a spread object, an idiom the rule does not check at all.
- **`better-tailwindcss/no-unknown-classes` reads a map key inside `cn()` as a class** (four false hits, such as a tone lookup with a `?? 'neutral'` fallback). The rule has an `ignore` option, a list of regular expressions for names to skip (read in the installed plugin); this template enables only `no-deprecated-classes` and `enforce-canonical-classes`.
