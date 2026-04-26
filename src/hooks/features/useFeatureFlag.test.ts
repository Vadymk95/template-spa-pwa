import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setFeatureFlagProvider } from '@/lib/features/flags';

import { useFeatureFlag } from './useFeatureFlag';

describe('useFeatureFlag', () => {
    beforeEach(() => {
        setFeatureFlagProvider({ isEnabled: () => false });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('returns false when the active provider says disabled', () => {
        setFeatureFlagProvider({ isEnabled: () => false });
        const { result } = renderHook(() => useFeatureFlag('NEW_DASHBOARD'));
        expect(result.current).toBe(false);
    });

    it('returns true when the active provider says enabled', () => {
        setFeatureFlagProvider({ isEnabled: () => true });
        const { result } = renderHook(() => useFeatureFlag('NEW_DASHBOARD'));
        expect(result.current).toBe(true);
    });

    it('forwards the flag identifier to the provider verbatim', () => {
        const provider = { isEnabled: vi.fn().mockReturnValue(true) };
        setFeatureFlagProvider(provider);
        renderHook(() => useFeatureFlag('NEW_DASHBOARD'));
        expect(provider.isEnabled).toHaveBeenCalledWith('NEW_DASHBOARD');
    });
});
