# Showcase: Bearer-token auth wiring

This document is the canonical "how the auth wiring in `src/` works, when to keep it, and how to swap it" — for forks deciding their auth strategy.

> **TL;DR:** the template's main `src/` ships a working bearer-token + Zustand-persist + `apiClient`-with-Authorization pattern. **It is showcase**, not a production recommendation. Production apps typically push auth down to the backend (httpOnly cookies). This file enumerates alternatives and removal paths.

---

## What's in `src/` today

The template's main source carries a deliberately wired auth example so forks can see how the pieces fit:

| File                          | Role                                                                                         | Showcase comment                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/store/user/userStore.ts` | Zustand store + `persist` middleware. Holds `{ isLoggedIn, username, token, _hasHydrated }`. | Header comment marks it 🌱 SHOWCASE; `partialize` excludes `token` from `localStorage` (memory-only). |
| `src/lib/api/client.ts`       | `apiClient` reads `getAuthToken()` and attaches `Authorization: Bearer ${token}`.            | `isSafeForAuth` guard refuses to attach Authorization on cross-origin http.                           |
| `src/lib/api/auth.ts`         | `getAuthToken()` accessor — avoids a circular import between `apiClient` and `userStore`.    | —                                                                                                     |
| `src/hocs/ProtectedRoute.tsx` | Gates `<Outlet />` on `isLoggedIn` after `_hasHydrated`.                                     | Comment + SKELETONS gotcha.                                                                           |
| `src/pages/LoginPage/`        | `react-hook-form` + `zod` + `useLoginForm.ts`. Calls `userStore.setUser()` on submit.        | Example pattern (RHF + zod) doubles as form-handling reference.                                       |
| `src/pages/DashboardPage/`    | Behind `<ProtectedRoute />` — demonstrates the redirect contract.                            | —                                                                                                     |

The wiring is correct enough to stand up against MSW handlers in DEV, but it is **not** a production recipe.

---

## Why this is showcase, not production

| Concern               | Bearer + localStorage (showcase)                                                                                                               | Recommended (production)                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **XSS reachability**  | Token persisted to `localStorage` is readable by any script, including injected XSS. (Mitigated here via `partialize` — token is memory-only.) | httpOnly + Secure + SameSite=Lax/Strict cookies set by the auth provider on the same domain. SPA never sees the token. |
| **CSRF**              | Bearer header is immune to CSRF (no automatic browser inclusion).                                                                              | Cookies need `SameSite` + double-submit / synchronizer-token; modern frameworks ship this.                             |
| **Token refresh**     | Manual implementation in `apiClient` + retry queue + race protection.                                                                          | Provider handles refresh transparently via cookie rotation.                                                            |
| **Cross-origin leak** | Mitigated here via `isSafeForAuth` guard. Still a concern if backend sits on a different scheme/host.                                          | Cookies scoped to one domain — nothing to leak.                                                                        |
| **Logout revocation** | Token stays valid until expiry on backend.                                                                                                     | Cookie invalidation on logout, immediate.                                                                              |
| **Pre-render / SSR**  | Token in store = SPA-only rendering.                                                                                                           | Cookies work seamlessly with SSR / RSC / edge functions.                                                               |

---

## Removal / replacement paths

### Path 1 — Supabase (BaaS, fastest)

Drop the bearer wiring entirely; use Supabase's Auth SDK with cookies:

1. `npm i @supabase/supabase-js @supabase/ssr`
2. Delete `src/lib/api/` (or keep `apiClient` for non-Supabase fetches and remove the `Authorization` block).
3. Replace `src/store/user/userStore.ts` token field with `supabase.auth.getSession()` driven via TanStack Query:

    ```ts
    const { data } = useQuery({ queryKey: ['session'], queryFn: () => supabase.auth.getSession() });
    ```

4. `ProtectedRoute` reads `data.session !== null` instead of `isLoggedIn`. Drop `_hasHydrated` (Supabase SDK gives a sync getter after init).
5. `LoginPage` calls `supabase.auth.signInWithPassword({...})` on submit.

### Path 2 — Firebase Auth

Symmetrical to Supabase with Firebase SDK — `getAuth()`, `onAuthStateChanged()`. Replace `userStore` with the Firebase user object via React context or `react-firebase-hooks`.

### Path 3 — Auth0 / Clerk / WorkOS (managed)

These ship React SDKs (`@auth0/auth0-react`, `@clerk/clerk-react`). Their providers wrap the app and expose `useUser()` / `useAuth0()`. Delete `userStore` + `apiClient` Authorization block; their SDK handles cookies.

### Path 4 — Custom backend with httpOnly cookies

If the team owns a backend that issues httpOnly session cookies:

1. `apiClient` adds `credentials: 'include'` to `fetch()` and **drops** the Authorization block. Token never enters JS.
2. `userStore` keeps only `isLoggedIn` + `username` (no token field, no `getAuthToken`).
3. A `/me` query (TanStack Query) drives `isLoggedIn` from the cookie's session — refetches on focus to detect remote logout.
4. `ProtectedRoute` reads the `useQuery` `data` instead of `useUserStore.use.isLoggedIn()`; redirect if 401.
5. CSRF: backend issues a CSRF token cookie + verifies on mutations; `apiClient` echoes it via `X-CSRF-Token` header.

### Path 5 — Keep the bearer pattern (rare)

Only when (a) the backend mandates Bearer and refuses to set cookies, **and** (b) you trust the XSS surface, **and** (c) you've pinned token TTL short and have a refresh queue. In that case:

- Accept `partialize` excludes the token (template default) — accept that reload requires re-auth.
- Or remove `partialize` to persist token (DANGEROUS — XSS-reachable) and add an explicit warning in your team's onboarding docs.

---

## Files to remove / trim per path

| Path                              | Touch list                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Supabase / Firebase / Auth0-style | Remove `src/lib/api/auth.ts`, simplify `src/lib/api/client.ts`, gut `userStore` token field, replace `useLoginForm.ts` body. |
| Custom backend (cookies)          | Same as above, plus `credentials: 'include'` in `apiClient`, add CSRF echo.                                                  |
| Keep bearer                       | No file changes — but document the decision in `.cursor/brain/DECISIONS.md`.                                                 |

---

## Why the showcase stays in `src/` and not in `examples/`

A template fork without working auth wiring forces the consumer to integrate in the dark. By keeping a labeled, defensively-coded showcase in `src/`, forks can:

1. Read the wiring end-to-end (LoginPage → userStore → apiClient → ProtectedRoute).
2. Hit the page, see the round-trip work against MSW.
3. Decide their real strategy with full mental model.

The template's compromise: showcase is **labeled in code** (header comments) AND **sandboxed defensively** (`partialize`, `isSafeForAuth`, `_hasHydrated` gate, no token persistence). Removing it before prod is a deliberate decision, not an accident.

If you've decided your auth path and want a clean slate, the "Removal / replacement paths" above are concrete recipes.

---

## Related

- `.cursor/brain/EXTENSIONS.md` Phase 1 (Backend) and Phase 2 (Auth) — broader migration roadmap.
- `.cursor/brain/SKELETONS.md` "userStore — persist middleware" and "ProtectedRoute + persist rehydration" — danger zones to keep across any refactor.
- `SECURITY_REQUIREMENTS.md` — production header checklist (CSP, HSTS, CSRF).
