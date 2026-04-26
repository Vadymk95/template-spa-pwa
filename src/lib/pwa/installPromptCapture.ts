// Captures `beforeinstallprompt` at module load — must run before the event fires.
// Chrome dispatches the event ~30s after first paint when install criteria are met.
// If the listener attaches lazily (inside a hook called from a deferred component),
// the event is gone forever (Chromium spec: dispatched once, no retry).
//
// Side-effect import from `main.tsx`: `import '@/lib/pwa/installPromptCapture'`.
// The hook in `@/hooks/pwa/usePwaInstall` reads from `getInstallPromptEvent()`.

export interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    prompt(): Promise<void>;
}

let captured: BeforeInstallPromptEvent | null = null;
const subscribers = new Set<(event: BeforeInstallPromptEvent | null) => void>();

const handler = (event: Event) => {
    event.preventDefault();
    captured = event as BeforeInstallPromptEvent;
    for (const fn of subscribers) fn(captured);
};

const installedHandler = () => {
    captured = null;
    for (const fn of subscribers) fn(null);
};

if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);
}

export const getInstallPromptEvent = (): BeforeInstallPromptEvent | null => captured;

export const subscribeInstallPrompt = (
    fn: (event: BeforeInstallPromptEvent | null) => void
): (() => void) => {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
};

export const clearInstallPromptEvent = (): void => {
    captured = null;
    for (const fn of subscribers) fn(null);
};
