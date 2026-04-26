import type { FunctionComponent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { usePwaUpdateToast } from './usePwaUpdateToast';

export const PwaUpdateToast: FunctionComponent = () => {
    const { t } = useTranslation('common');
    const { isVisible, handleUpdate, handleDismiss } = usePwaUpdateToast();

    if (!isVisible) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className="fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-4 shadow-lg md:left-auto md:right-4 md:w-80"
        >
            <p className="text-sm text-foreground">{t('pwa.updateAvailable')}</p>
            <div className="flex shrink-0 gap-2">
                <Button size="sm" onClick={handleUpdate}>
                    {t('pwa.refresh')}
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDismiss}
                    aria-label={t('pwa.dismiss')}
                >
                    ×
                </Button>
            </div>
        </div>
    );
};
