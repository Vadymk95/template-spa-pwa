import { isFeatureEnabled, type FeatureFlag } from '@/lib/features/flags';

/**
 * Read a feature flag in a React component.
 *
 * Synchronous by design — if your provider is async (LaunchDarkly etc.),
 * resolve init inside the provider BEFORE mounting React (see `setFeatureFlagProvider`
 * in `@/lib/features/flags`). Returning a stable boolean keeps hooks ordering
 * predictable and avoids hydration mismatches.
 *
 * For per-render reactive flags (live A/B variant flips), wrap your provider
 * in a Zustand store and read it via `useStore` — that's a deliberate consumer
 * decision, not the template default.
 */
export const useFeatureFlag = (flag: FeatureFlag): boolean => isFeatureEnabled(flag);
