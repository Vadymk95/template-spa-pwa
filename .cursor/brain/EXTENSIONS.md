# Extensions — graduating template → MVP / personal project

This file is the **single source of truth** for "what to add when forking this template into a real project". Phases below are ordered by typical product lifecycle; skip phases you don't need. Every phase names a recommended default + the trade-off + the brain doc / template seed it touches.

Companion docs: [`PWA.md`](./PWA.md) (PWA-specific extras live there, not here), [`TEMPLATE_SEEDS.md`](./TEMPLATE_SEEDS.md) (seeds that graduate at each phase), [`SKELETONS.md`](./SKELETONS.md) (danger zones to keep in mind), [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) (the stack you're extending).

---

## Phase 0 — Cosmetics & identity (before first deploy)

Mandatory — without this the deploy ships as a generic placeholder template.

| Item | File / location | Notes |
|---|---|---|
| App name + short name | `vite.config.ts → VitePWA.manifest.name` / `.short_name` | Reflected in OS install UI. |
| Description | `vite.config.ts → VitePWA.manifest.description`, `index.html` `<meta name="description">` | iOS install sheet + SEO. |
| Theme colour + background colour | `vite.config.ts → VitePWA.manifest.theme_color` / `.background_color`, `index.html` `theme-color` × 2 | Match Tailwind theme tokens in `src/index.css`. |
| `lang` | `vite.config.ts → VitePWA.manifest.lang`, `src/lib/i18n/constants.ts → DEFAULT_LANGUAGE` | Update if not English. |
| iOS title | `index.html` `<meta name="apple-mobile-web-app-title">` | Truncates after ~12 chars on home screen. |
| App icons | `public/icons/{192x192,512x512,apple-touch-icon}.png` | Replace red "REPLACE ME" placeholders with real branding. |
| HTML `<title>` | `index.html` | Surfaces in tab + Lighthouse SEO. |
| Locale strings | `public/locales/en/{common,errors,home,auth}.json` | Especially `common.appName` and `common.pwa.*`. |
| README header | `README.md` | Title + tagline reflect the real product. |

**Verification:** `npm run build && npm run verify:pwa` — manifest fields surface correctly.

### Day-1 shadcn batch (recommended)

The template ships shadcn/ui primitives that the placeholder pages already use (`Button`, `Input`, `Form`, `Card`). For most product apps — admin panels, dashboards, Jira-likes, CRMs — you'll want a wider set on day 1. Install them in one batch so you don't break flow later:

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

After install, run `npm run lint:oxlint && npm run lint` once — shadcn primitives ship with their own conventions and the `src/components/ui/**` lint exemption (see `eslint.config.js`) lets `func-style` differences pass without edits.

---

## Phase 1 — Real backend (week 1 of MVP)

The template ships with a wired **TanStack Query example** (`greeting.queries.ts` + `greeting.ts`) calling a placeholder `/greeting` endpoint at `VITE_API_URL ?? 'http://localhost:3001/api'`. Replace this with a real backend.

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

**Skip** apiClient entirely when using Supabase / Firebase — their SDKs plug into TanStack Query directly via `queryFn: () => supabase.from(...).select()`.

---

## Phase 2 — Auth

Template ships a placeholder `userStore` (Zustand + persist + localStorage `"user-store"`) and a `ProtectedRoute` HOC (`src/hocs/ProtectedRoute/`) gating `/dashboard`. Wire real auth on top.

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

**Pitfall:** never call `persist.clearStorage()` in tests — see SKELETONS.md "userStore — persist middleware".

---

## Phase 3 — Multi-locale i18n

Template ships **English only** (`SUPPORTED_LANGUAGES = ['en']` in `src/lib/i18n/constants.ts`). The `LanguageSwitcher` component (template seed) currently degrades to a static badge; it graduates to a real `<select>` once `SUPPORTED_LANGUAGES.length >= 2`.

### What to wire

1. Mirror `public/locales/en/` to `public/locales/<lng>/` for each new locale. Keep namespaces aligned (`common`, `errors`, `home`, `auth`).
2. Extend `SUPPORTED_LANGUAGES` and update `DEFAULT_LANGUAGE` if the primary changes.
3. Update `manifest.lang` in `vite.config.ts` if the app's primary language changes.
4. Run `/sync-i18n` (skill) periodically to detect key drift across locales.
5. RTL? Add `<html dir="rtl">` toggle in `useI18nReload` or via a separate hook; Tailwind v4 supports `rtl:` variants natively.

### Regional locales (`de-DE`, `pt-BR`, `zh-CN`)

`I18N_LOAD_MODE = 'languageOnly'` in `src/lib/i18n/constants.ts` truncates `de-DE` → `de`, `pt-BR` → `pt`, etc. Implications:

- If you ship only generic `de` / `pt`, regional users get them transparently — fine.
- If you ship region-specific copy (`de-DE` and `de-AT` differ), switch to `'currentOnly'` (or remove the `load` option) AND mirror per-region locale folders. Otherwise both regions silently load the same generic file.

Document the choice in `.cursor/brain/PROJECT_CONTEXT.md` if it changes — silent locale fallback is a class-of-mistake worth a SKELETONS gotcha if it bites.

**Skip** if the product is single-locale forever — the seed `LanguageSwitcher` graduates by being deleted.

---

## Phase 4 — Error monitoring + analytics + observability

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

### What to wire

1. Add `src/lib/analytics/` module with `track(event, payload)` API (mirror `frontend-practice-lab/src/lib/analytics/`).
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
| `robots.txt` | `public/robots.txt` | Crawler rules |
| `sitemap.xml` | `public/sitemap.xml` (or generated) | Search-engine discoverability |
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
| **Cloudflare Pages** | `_headers` file |
| **AWS S3 + CloudFront** | Lambda@Edge / CloudFront Functions for cache rules |
| **nginx** | `location ~ ^/(sw\.js|...)$` blocks |
| **Firebase Hosting** | `firebase.json → hosting.headers` (see `frontend-practice-lab/firebase.json`) |

### Security headers

`SECURITY_REQUIREMENTS.md` covers the full checklist. Critical:

- `Content-Security-Policy` with **nonces** (NOT `'unsafe-inline'`)
- `Strict-Transport-Security` (HSTS) at the edge
- `X-Frame-Options: SAMEORIGIN` or CSP `frame-ancestors`
- `X-Content-Type-Options: nosniff`
- **NOT** `X-XSS-Protection` (deprecated, harmful)

### CSP nonce

Template does NOT ship a nonce-injection strategy. The hosting layer (nginx, Vercel middleware, CloudFront function) generates per-request nonces and injects into both the HTML and the matching CSP header. Keep them in sync.

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
    - Replace `cache: 'npm'` in `actions/setup-node` with a separate `pnpm/action-setup@v3` step before setup-node, then `cache: 'pnpm'`.
- **`.husky/_/`**: husky regenerates on `pnpm prepare`; should work transparently.
- **README**: update Quick Start commands; note `corepack enable` prerequisite.
- **CLAUDE.md / `.cursor/brain/PROJECT_CONTEXT.md`**: replace `npm run X` with `pnpm X` in examples.

### Verify after switch

- `pnpm run ci:local` passes end-to-end (audit, typecheck, lint, format, test:coverage, build, verify:pwa, verify:web-vitals-chunks, **size:check**, perf:ci, e2e — incl `sw-lifecycle.spec.ts`).
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

Document the failing plugin in `DECISIONS.md` so the next attempt has the receipt.

## Cross-references — what to update when graduating

When you graduate any phase, update these files in lockstep so the brain doesn't drift:

- [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) — stack table row + key pattern subsection.
- [`MAP.md`](./MAP.md) — entry points / state boundaries / route table.
- [`SKELETONS.md`](./SKELETONS.md) — new danger zone if the addition introduces one (e.g., Sentry instrumentation must NOT live above `ErrorBoundary`).
- [`TEMPLATE_SEEDS.md`](./TEMPLATE_SEEDS.md) — remove the registry row when a seed graduates into real code.
- [`VERIFICATION.md`](./VERIFICATION.md) — new check to run when touching the new domain.
- [`PWA.md`](./PWA.md) — only when Phase 7 (PWA extras) is touched.
- `README.md` — only if developer-facing scripts / commands change.

If a phase introduces a recurring class of failures, also append to `SKELETONS.md` per the Cat Wu / Boris Cherny harness rule (see `~/.claude/CLAUDE.md` "Learning from failures").

---

## When NOT to use this checklist

- **Single-purpose throwaway prototype.** Skip Phases 1-8; just ship and delete.
- **Internal tool with auth gate.** Skip Phase 5 (SEO).
- **Read-only dashboard.** Skip Phase 6 (payments).
- **B2B internal**: Skip Phase 3 (multi-locale) unless explicitly required.

The template is opinionated; this checklist is a menu, not a mandate. Pick what your product needs.
