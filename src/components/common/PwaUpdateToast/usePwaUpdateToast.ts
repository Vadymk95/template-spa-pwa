import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

import { PWA_SESSION_KEYS } from '@/lib/pwa/keys';

export const usePwaUpdateToast = (): {
    isVisible: boolean;
    handleUpdate: () => void;
    handleDismiss: () => void;
} => {
    const {
        needRefresh: [needRefresh],
        updateServiceWorker
    } = useRegisterSW();

    const [dismissed, setDismissed] = useState(
        () => sessionStorage.getItem(PWA_SESSION_KEYS.UPDATE_DISMISSED_V1) === '1'
    );

    const isVisible = needRefresh && !dismissed;

    const handleUpdate = (): void => {
        void updateServiceWorker(true);
    };

    const handleDismiss = (): void => {
        setDismissed(true);
        sessionStorage.setItem(PWA_SESSION_KEYS.UPDATE_DISMISSED_V1, '1');
    };

    return { isVisible, handleUpdate, handleDismiss };
};
