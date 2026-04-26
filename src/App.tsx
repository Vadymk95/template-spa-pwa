import type { FunctionComponent } from 'react';
import { useRef } from 'react';
import { ScrollRestoration } from 'react-router-dom';

import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { PwaUpdateToast } from '@/components/common/PwaUpdateToast';
import { SkipLink } from '@/components/common/SkipLink';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { Main } from '@/components/layout/Main';
import { useRouteFocus } from '@/hooks/a11y/useRouteFocus';
import { useI18nReload } from '@/hooks/i18n/useI18nReload';

export const App: FunctionComponent = () => {
    // Hot reload translations in development mode
    useI18nReload();

    const mainRef = useRef<HTMLElement>(null);
    useRouteFocus(mainRef);

    return (
        <>
            <ErrorBoundary>
                <SkipLink />
                {/* getKey includes pathname + search so /products?cat=a and /products?cat=b
                    don't share a scroll position. Hash-state filters get distinct entries too. */}
                <ScrollRestoration getKey={(location) => location.pathname + location.search} />
                <div className="flex min-h-screen flex-col">
                    <Header />
                    <Main ref={mainRef} />
                    <Footer />
                </div>
            </ErrorBoundary>
            {/* Toast lives OUTSIDE ErrorBoundary so a render error in the app tree
                doesn't swallow the only UI path to apply a pending SW update. */}
            <PwaUpdateToast />
        </>
    );
};
