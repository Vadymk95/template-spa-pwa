// Centralized named constants. This file is the ONE place magic numbers live —
// it is exempt from `@typescript-eslint/no-magic-numbers` (see eslint.config.js).
// Logic files must import from here instead of scattering literals.

// ─── Query cache timing ───────────────────────────────────────────────────
export const QUERY_STALE_TIME_MS = 5 * 60 * 1000; // 5 minutes
export const QUERY_GC_TIME_MS = 30 * 60 * 1000; // 30 minutes (25 min grace over stale)
export const QUERY_MAX_RETRIES = 2;

// ─── HTTP status ──────────────────────────────────────────────────────────
export const HTTP_UNAUTHORIZED = 401;
export const HTTP_SERVER_ERROR_MIN = 500; // 5xx = retryable server error

// ─── Auth ─────────────────────────────────────────────────────────────────
export const MIN_PASSWORD_LENGTH = 8;
