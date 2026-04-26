import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    clearInstallPromptEvent,
    getInstallPromptEvent,
    subscribeInstallPrompt
} from '@/lib/pwa/installPromptCapture';

import { usePwaInstall } from './usePwaInstall';

vi.mock('@/lib/pwa/installPromptCapture', () => ({
    getInstallPromptEvent: vi.fn(),
    subscribeInstallPrompt: vi.fn(),
    clearInstallPromptEvent: vi.fn()
}));

const buildPromptEvent = (outcome: 'accepted' | 'dismissed') => ({
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
    platforms: ['web']
});

describe('usePwaInstall', () => {
    beforeEach(() => {
        vi.mocked(getInstallPromptEvent).mockReturnValue(null);
        vi.mocked(subscribeInstallPrompt).mockReturnValue(() => {});
        vi.mocked(clearInstallPromptEvent).mockClear();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('reports isAvailable false before any prompt event', () => {
        const { result } = renderHook(() => usePwaInstall());
        expect(result.current.isAvailable).toBe(false);
    });

    it('reports isAvailable true once event is captured', () => {
        vi.mocked(getInstallPromptEvent).mockReturnValue(buildPromptEvent('accepted') as never);
        const { result } = renderHook(() => usePwaInstall());
        expect(result.current.isAvailable).toBe(true);
    });

    it('install() returns "unavailable" if no captured event', async () => {
        const { result } = renderHook(() => usePwaInstall());
        const outcome = await act(async () => result.current.install());
        expect(outcome).toBe('unavailable');
    });

    it('install() prompts, awaits userChoice, clears the event', async () => {
        const event = buildPromptEvent('accepted');
        vi.mocked(getInstallPromptEvent).mockReturnValue(event as never);

        const { result } = renderHook(() => usePwaInstall());
        const outcome = await act(async () => result.current.install());

        expect(event.prompt).toHaveBeenCalledTimes(1);
        expect(outcome).toBe('accepted');
        expect(vi.mocked(clearInstallPromptEvent)).toHaveBeenCalledTimes(1);
    });

    it('install() relays "dismissed" outcome', async () => {
        const event = buildPromptEvent('dismissed');
        vi.mocked(getInstallPromptEvent).mockReturnValue(event as never);

        const { result } = renderHook(() => usePwaInstall());
        const outcome = await act(async () => result.current.install());

        expect(outcome).toBe('dismissed');
    });

    it('subscribes on mount, unsubscribes on unmount', () => {
        const unsubscribe = vi.fn();
        vi.mocked(subscribeInstallPrompt).mockReturnValue(unsubscribe);

        const { unmount } = renderHook(() => usePwaInstall());
        expect(vi.mocked(subscribeInstallPrompt)).toHaveBeenCalledTimes(1);

        unmount();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});
