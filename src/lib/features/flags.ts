/**
 * Feature flags — provider-agnostic stub.
 *
 * The template ships an `EnvFlagProvider` that reads `VITE_FF_*` env vars
 * (e.g. `VITE_FF_NEW_DASHBOARD=true`). Forks swap in a real provider —
 * LaunchDarkly, GrowthBook, Statsig, OpenFeature, PostHog — by calling
 * `setFeatureFlagProvider(yourProvider)` at app boot, before React mounts.
 *
 * Keep flag definitions in this file so consumers can `useFeatureFlag(FLAGS.X)`
 * with full TypeScript narrowing. New flags: add a key to `FEATURE_FLAGS`,
 * document the rollout plan in the relevant ADR, and remove the key once the
 * flag graduates to default-on (FAANG-style flag-cleanup discipline).
 */

export const FEATURE_FLAGS = {
    /** Sample flag — replace with real ones. Reads `VITE_FF_NEW_DASHBOARD` by default. */
    NEW_DASHBOARD: 'NEW_DASHBOARD'
} as const satisfies Record<string, string>;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export interface FeatureFlagProvider {
    /** Synchronous read. If your provider is async (LaunchDarkly), resolve inside the provider before calling React. */
    isEnabled(flag: FeatureFlag): boolean;
}

/**
 * Default provider — reads `VITE_FF_<FLAG>` from `import.meta.env`.
 * Truthy values: `'true'`, `'1'`, `'yes'`. Anything else (including `undefined`) is `false`.
 *
 * Lives at module scope so SSR / static-export builds pick it up at build time;
 * runtime providers (LaunchDarkly etc.) override via `setFeatureFlagProvider`.
 */
class EnvFlagProvider implements FeatureFlagProvider {
    private readonly truthy = new Set(['true', '1', 'yes']);

    isEnabled(flag: FeatureFlag): boolean {
        const envKey = `VITE_FF_${FEATURE_FLAGS[flag]}`;
        const raw = (import.meta.env as Record<string, string | undefined>)[envKey];
        if (raw === undefined) return false;
        return this.truthy.has(raw.toLowerCase());
    }
}

let provider: FeatureFlagProvider = new EnvFlagProvider();

/**
 * Replace the default provider. Call once at app boot in `main.tsx`, BEFORE the
 * React tree mounts — flag values must be stable during render.
 *
 * For async providers (LaunchDarkly, OpenFeature), resolve init *before* calling
 * this function. Mid-render flag flips cause hydration mismatches.
 */
export const setFeatureFlagProvider = (next: FeatureFlagProvider): void => {
    provider = next;
};

export const isFeatureEnabled = (flag: FeatureFlag): boolean => provider.isEnabled(flag);
