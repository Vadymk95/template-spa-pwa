import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const DISMISSED_KEY = 'pwa-update-dismissed-v1';

export const usePwaUpdateToast = () => {
    const {
        needRefresh: [needRefresh],
        updateServiceWorker
    } = useRegisterSW();

    const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISSED_KEY) === '1');

    const isVisible = needRefresh && !dismissed;

    const handleUpdate = () => {
        void updateServiceWorker(true);
    };

    const handleDismiss = () => {
        setDismissed(true);
        sessionStorage.setItem(DISMISSED_KEY, '1');
    };

    return { isVisible, handleUpdate, handleDismiss };
};
