import { useCallback, useEffect, useState } from 'react';

import {
    clearInstallPromptEvent,
    getInstallPromptEvent,
    subscribeInstallPrompt,
    type BeforeInstallPromptEvent
} from '@/lib/pwa/installPromptCapture';

interface UsePwaInstallReturn {
    isAvailable: boolean;
    install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

export const usePwaInstall = (): UsePwaInstallReturn => {
    const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(getInstallPromptEvent);

    useEffect(() => subscribeInstallPrompt(setEvent), []);

    const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
        if (!event) return 'unavailable';
        await event.prompt();
        const result = await event.userChoice;
        clearInstallPromptEvent();
        return result.outcome;
    }, [event]);

    return { isAvailable: event !== null, install };
};
