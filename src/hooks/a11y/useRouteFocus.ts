import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Moves focus to the main landmark on client-side navigations (WCAG 2.4.1).
 * Skips the initial mount so hydration / first paint is unchanged.
 *
 * Implementation note: tracks the previous pathname in a ref instead of an
 * "isInitialMount" flag so React 19 StrictMode's double-invoke (mount → cleanup
 * → mount) cannot flip the flag mid-render and trigger an unintended initial
 * focus. The ref persists across the StrictMode cycle; the equality check
 * naturally no-ops when pathname doesn't change.
 */
export const useRouteFocus = (mainRef: RefObject<HTMLElement | null>) => {
    const location = useLocation();
    const prevPath = useRef<string | null>(null);

    useLayoutEffect(() => {
        const path = location.pathname;
        if (prevPath.current === null) {
            // First effect run — record baseline, do not move focus.
            prevPath.current = path;
            return;
        }
        if (prevPath.current === path) {
            // StrictMode re-run with no actual navigation — skip.
            return;
        }
        prevPath.current = path;

        const el = mainRef.current;
        if (!el) return;

        // Suppress the huge focus ring only for programmatic route focus. Browsers
        // may still set :focus-visible here; skip-link / hash focus has no attribute.
        el.setAttribute('data-route-focus', '');
        el.focus({ preventScroll: true });

        const onBlur = () => {
            el.removeAttribute('data-route-focus');
        };
        el.addEventListener('blur', onBlur);

        return () => {
            el.removeEventListener('blur', onBlur);
            el.removeAttribute('data-route-focus');
        };
    }, [location.pathname, mainRef]);
};
