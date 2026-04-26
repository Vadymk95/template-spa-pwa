# react-spa-pwa-foundation

## Navigation

Always read `.cursor/brain/PROJECT_CONTEXT.md` before any task.
Architecture map: `.cursor/brain/MAP.md`
Danger zones: `.cursor/brain/SKELETONS.md`
Verification (what to run per change): `.cursor/brain/VERIFICATION.md`
PWA reference (manifest, update flow, deployment cache-policy contract): `.cursor/brain/PWA.md`
Template seeds (do NOT remove as "dead code"): `.cursor/brain/TEMPLATE_SEEDS.md`
Graduation checklist (template → MVP / personal project): `.cursor/brain/EXTENSIONS.md`
Showcase auth — alternatives + removal recipes: `examples/auth-bearer-pattern/README.md`

## Stack

React 19 · TypeScript 6.0 strict · Vite 8 (Rolldown) · Tailwind **v4** · shadcn/ui · Zustand 5 · TanStack Query 5 · React Router 7 · i18next · Vitest 4.1 · vite-plugin-pwa 1.x (Workbox, generateSW + prompt-mode)

## Critical Rules

**Tailwind v4** — no `tailwind.config.ts`. Theme lives in `src/index.css` (`@theme inline {}`).
Dark mode via `.dark` class. Animations via `tw-animate-css`.

**Components** — always extract logic to `useComponentName.ts` hook alongside the component.

**Pages** — lazy by default (`PageName.tsx` + `index.ts` with `lazy()`), wrap with `WithSuspense` in router.

**Stores** — Zustand with `createSelectors`. Files in `src/store/<domain>/`, tests alongside.

**i18n** — no hardcoded strings. Every user-visible string goes through `t()`.

**Imports** — `@/` alias only, no relative `../../`. Order enforced by eslint-plugin-import.

**PWA** — manifest + Workbox config in `vite.config.ts`; update toast in `src/components/common/PwaUpdateToast/`; install hook in `src/hooks/pwa/usePwaInstall.ts`. **Do not** flip `registerType` post-deploy. **Do not** drop the `apple-mobile-web-app-capable` meta tag. **Do not** remove the `vite-plugin-pwa` Vite-8 peer override. Full reference and threat model: `.cursor/brain/PWA.md`.

## Post-Edit Commands

Pick checks by task — **`.cursor/brain/VERIFICATION.md`**. Typical TS/React change:

```bash
npm run lint && npm run typecheck && npm run test
```

Full local CI (same as GitHub Actions):

```bash
npm run ci:local
```

## Commit Format

`type(scope): description` — max 96 chars
Types: `feat` `fix` `chore` `docs` `style` `refactor` `perf` `test` `revert`
