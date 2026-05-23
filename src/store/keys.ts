/**
 * Zustand store identifiers — single source for persist + devtools naming.
 *
 * Why centralised:
 *   - `STORAGE_KEYS` are EXTERNAL CONTRACTS: renaming any value silently drops
 *     all existing users' persisted state at next deploy (Zustand persist falls
 *     back to defaults if the key is missing). For PWA forks this is amplified —
 *     Service Worker + Workbox cache survive deploys, so the old client may
 *     keep running for hours / days after a rename.
 *   - `DEVTOOLS_NAMES` keep the Redux DevTools panel labels stable so the
 *     timeline stays grep-able across refactors.
 *   - Per-store `ACTION` constants (e.g. `USER_ACTIONS`) give devtools entries
 *     a structured `<store>/<slice>/<verb>` shape; collecting them here lets
 *     reviewers grep for any action used across the app without opening each
 *     store file.
 *
 * Pattern: `as const` objects (NOT `enum`). Type via
 *   `typeof OBJ[keyof typeof OBJ]`. Enum-free TS keeps erasableSyntaxOnly happy
 *   and avoids the runtime bidirectional map a TS `enum` would emit.
 *
 * Sibling symmetry: shape mirrors template-1 / template-rn / template-next-seo
 *   for forks switching between templates. Do NOT diverge without updating
 *   siblings — see `.cursor/brain/DECISIONS.md` "Magic strings → constants".
 */

export const STORAGE_KEYS = {
    USER: 'user-store'
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export const DEVTOOLS_NAMES = {
    USER: 'user-store'
} as const;

export type DevtoolsName = (typeof DEVTOOLS_NAMES)[keyof typeof DEVTOOLS_NAMES];

/**
 * userStore devtools action labels. `<store>/<slice>/<verb>` shape keeps the
 * DevTools timeline readable when multiple stores dispatch in the same frame.
 */
export const USER_ACTIONS = {
    SET_USER: 'user-store/user/setUser',
    LOGOUT: 'user-store/user/logout',
    SET_HAS_HYDRATED: 'user-store/user/setHasHydrated'
} as const;

export type UserAction = (typeof USER_ACTIONS)[keyof typeof USER_ACTIONS];
