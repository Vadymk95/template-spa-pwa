import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    isFeatureEnabled,
    setFeatureFlagProvider,
    type FeatureFlag,
    type FeatureFlagProvider
} from './flags';

const restoreProvider = () => {
    setFeatureFlagProvider({ isEnabled: () => false });
};

describe('feature flags — EnvFlagProvider (default)', () => {
    const originalEnv = { ...import.meta.env };

    afterEach(() => {
        // Restore env between cases.
        for (const key of Object.keys(import.meta.env)) {
            if (!(key in originalEnv)) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete (import.meta.env as Record<string, unknown>)[key];
            }
        }
        Object.assign(import.meta.env, originalEnv);
    });

    it('returns false when env var is unset', () => {
        delete (import.meta.env as Record<string, unknown>).VITE_FF_NEW_DASHBOARD;
        expect(isFeatureEnabled('NEW_DASHBOARD')).toBe(false);
    });

    it('returns true for "true"', () => {
        (import.meta.env as Record<string, string>).VITE_FF_NEW_DASHBOARD = 'true';
        expect(isFeatureEnabled('NEW_DASHBOARD')).toBe(true);
    });

    it('returns true for "1"', () => {
        (import.meta.env as Record<string, string>).VITE_FF_NEW_DASHBOARD = '1';
        expect(isFeatureEnabled('NEW_DASHBOARD')).toBe(true);
    });

    it('returns true for "yes" case-insensitively', () => {
        (import.meta.env as Record<string, string>).VITE_FF_NEW_DASHBOARD = 'YES';
        expect(isFeatureEnabled('NEW_DASHBOARD')).toBe(true);
    });

    it('returns false for arbitrary string', () => {
        (import.meta.env as Record<string, string>).VITE_FF_NEW_DASHBOARD = 'maybe';
        expect(isFeatureEnabled('NEW_DASHBOARD')).toBe(false);
    });
});

describe('feature flags — setFeatureFlagProvider', () => {
    beforeEach(() => {
        restoreProvider();
    });

    afterEach(() => {
        restoreProvider();
    });

    it('routes through a custom provider', () => {
        const calls: FeatureFlag[] = [];
        const stub: FeatureFlagProvider = {
            isEnabled: vi.fn((flag: FeatureFlag) => {
                calls.push(flag);
                return true;
            })
        };

        setFeatureFlagProvider(stub);

        expect(isFeatureEnabled('NEW_DASHBOARD')).toBe(true);
        expect(calls).toEqual(['NEW_DASHBOARD']);
    });
});
