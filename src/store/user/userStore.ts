import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import { createSelectors } from '@/store/utils/createSelectors';

/**
 * 🌱 SHOWCASE — auth wiring DEMONSTRATION, not a production pattern.
 *
 * This store demonstrates how Zustand + persist + the apiClient `Authorization:
 * Bearer ${token}` pattern look together in a SPA. **Real production apps
 * should keep auth on the backend** (httpOnly + Secure + SameSite cookies set
 * by the auth provider) so the SPA never sees the token at all. In that model:
 *
 * - Drop the `token` field entirely.
 * - `isLoggedIn` is derived from a `/me` query (TanStack Query) — not persisted.
 * - `username` may be persisted for instant header rendering, or fetched fresh.
 *
 * **What this store actually does to be safe even in showcase mode:**
 *
 * - `partialize` excludes `token` from `localStorage`. Even when forks wire a
 *   real backend that returns a token, the persisted snapshot only carries UI
 *   state (`isLoggedIn`, `username`). The token lives in memory and is lost on
 *   reload — by design. (XSS-reachable bearer tokens in `localStorage` are an
 *   anti-pattern; the SPA must re-authenticate via cookie / refresh flow.)
 * - `_hasHydrated` flag prevents `ProtectedRoute` from redirecting to `/login`
 *   during the brief window where persist hasn't finished reading
 *   `localStorage` yet.
 *
 * See `.cursor/brain/EXTENSIONS.md` Phase 2 for replacement strategies.
 */

interface UserState {
    isLoggedIn: boolean;
    username: string | null;
    /** Memory-only. NOT persisted (see partialize). Showcase-mode only — real apps use httpOnly cookies. */
    token: string | null;
    /** True after persist has finished reading localStorage. Gates ProtectedRoute against the redirect race. */
    _hasHydrated: boolean;
    setUser: (username: string, token: string) => void;
    logout: () => void;
    _setHasHydrated: (value: boolean) => void;
}

// devtools ships Redux DevTools bridge code even with `enabled: false`.
// Gate the whole middleware behind import.meta.env.DEV so the tree-shaker drops it in prod,
// keeping showcase-mode auth state out of the DevTools extension surface for end users.
// The `as typeof devtools` cast preserves the enhanced `set(state, replace, action)` signature
// used below; the extra action arg is silently ignored by the underlying setter in prod.
const withDevtools = (import.meta.env.DEV ? devtools : <T>(fn: T): T => fn) as typeof devtools;

const useUserStoreBase = create<UserState>()(
    withDevtools(
        persist(
            (set) => ({
                isLoggedIn: false,
                username: null,
                token: null,
                _hasHydrated: false,
                setUser: (username: string, token: string) => {
                    set({ isLoggedIn: true, username, token }, false, {
                        type: 'user-store/user/setUser'
                    });
                },
                logout: () => {
                    set({ isLoggedIn: false, username: null, token: null }, false, {
                        type: 'user-store/user/logout'
                    });
                },
                _setHasHydrated: (value: boolean) => {
                    set({ _hasHydrated: value }, false, {
                        type: 'user-store/user/setHasHydrated'
                    });
                }
            }),
            {
                name: 'user-store',
                // Persist UI state only. Token stays in memory — see header comment.
                partialize: (state) => ({
                    isLoggedIn: state.isLoggedIn,
                    username: state.username
                }),
                onRehydrateStorage: () => (state, error) => {
                    if (error) {
                        // Hydration failed — leave hasHydrated false so ProtectedRoute
                        // continues to gate; logger can be wired in by consumers.
                        return;
                    }
                    state?._setHasHydrated(true);
                }
            }
        ),
        { name: 'user-store' }
    )
);

export const useUserStore = createSelectors(useUserStoreBase);

// Read-only accessor for apiClient — avoids circular imports (store does not import apiClient).
// In showcase mode this returns `null` after a reload (token isn't persisted); apiClient calls
// will fire without an `Authorization` header. Production: replace this with cookie-aware fetch.
export const getAuthToken = (): string | null => useUserStoreBase.getState().token;
