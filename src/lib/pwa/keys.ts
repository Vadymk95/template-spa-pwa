/**
 * PWA-specific storage keys and events.
 *
 * Why a separate file (not folded into `src/store/keys.ts`):
 *   - These keys are PWA-runtime concerns (Service Worker lifecycle,
 *     `beforeinstallprompt` flow) — they have nothing to do with Zustand.
 *     Co-locating with `src/lib/pwa/*` keeps the PWA layer self-contained.
 *   - Service Worker + Workbox precache survive deploys. Renaming any of
 *     these keys WITHOUT a migration silently regresses UX for existing
 *     installed users (e.g. a "dismissed update" flag becomes "show toast
 *     forever" if the key changes). The constant enforces a single-source
 *     rename across every read/write — including tests.
 *   - The `-v1` suffix in `UPDATE_DISMISSED_V1` is intentional: if we ever
 *     change the dismiss semantics (per-version vs forever), bump to v2 so
 *     installed clients see the new behaviour cleanly instead of inheriting
 *     a stale flag.
 *
 * Sibling symmetry: shape consistent across template forks. This file is
 *   PWA-only and has no counterpart in non-PWA templates — that asymmetry
 *   is intentional.
 *
 * Pattern: `as const` objects, NOT `enum`. See `src/store/keys.ts` rationale.
 */

export const PWA_SESSION_KEYS = {
    /** Dismiss flag for the SW update toast. Bump suffix on semantics change. */
    UPDATE_DISMISSED_V1: 'pwa-update-dismissed-v1'
} as const;

export type PwaSessionKey = (typeof PWA_SESSION_KEYS)[keyof typeof PWA_SESSION_KEYS];
