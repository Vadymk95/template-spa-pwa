import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    clearInstallPromptEvent,
    getInstallPromptEvent,
    subscribeInstallPrompt
} from './installPromptCapture';

// The module attaches its window listeners at import time (by design — the
// event fires once and is gone), so tests drive it through real DOM events.
const fireBeforeInstallPrompt = (): Event => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    window.dispatchEvent(event);
    return event;
};

describe('installPromptCapture', () => {
    afterEach(() => {
        clearInstallPromptEvent();
    });

    it('captures the beforeinstallprompt event and prevents its default', () => {
        const event = fireBeforeInstallPrompt();

        expect(getInstallPromptEvent()).toBe(event);
        expect(event.defaultPrevented).toBe(true);
    });

    it('notifies subscribers on capture and supports unsubscribe', () => {
        const listener = vi.fn();
        const unsubscribe = subscribeInstallPrompt(listener);

        const event = fireBeforeInstallPrompt();
        expect(listener).toHaveBeenCalledWith(event);

        unsubscribe();
        fireBeforeInstallPrompt();
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('clears the captured event when the app gets installed', () => {
        fireBeforeInstallPrompt();

        window.dispatchEvent(new Event('appinstalled'));

        expect(getInstallPromptEvent()).toBeNull();
    });

    it('clearInstallPromptEvent resets state and notifies subscribers with null', () => {
        const listener = vi.fn();
        subscribeInstallPrompt(listener);
        fireBeforeInstallPrompt();

        clearInstallPromptEvent();

        expect(getInstallPromptEvent()).toBeNull();
        expect(listener).toHaveBeenLastCalledWith(null);
    });
});
