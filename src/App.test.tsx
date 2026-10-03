import { screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/test-utils';

import { App } from './App';

const Bomb = () => {
    throw new Error('Boom');
};

// PwaUpdateToast (rendered by App, outside the error boundary on purpose) reads this virtual
// module through usePwaUpdateToast. It only exists under the Vite PWA plugin's real runtime, so
// every test that renders App mocks it — same shape as usePwaUpdateToast.test.ts.
const mockSetter = vi.fn();
vi.mock('virtual:pwa-register/react', () => ({
    useRegisterSW: vi.fn(() => ({
        needRefresh: [false, mockSetter],
        offlineReady: [false, mockSetter],
        updateServiceWorker: vi.fn()
    }))
}));

const { useRegisterSW } = await import('virtual:pwa-register/react');

describe('App', () => {
    beforeEach(() => {
        // ThemeToggle (rendered inside Header) reads useTheme, which reads matchMedia; jsdom lacks it.
        vi.stubGlobal(
            'matchMedia',
            vi.fn(() => ({
                matches: false,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn()
            }))
        );
        // useI18nReload's HMR wiring only exists under the real Vite dev server; Vitest exposes a
        // partial `import.meta.hot` (has `on`, lacks `off`) — see useI18nReload.test.ts. Forcing
        // DEV false keeps this test about the error boundary, not that unrelated, already-documented gap.
        vi.stubEnv('DEV', false);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('shows the error-boundary fallback when a routed child throws', () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // The real App, wired the way the production router wires it: App is the root route
        // element and the throwing page sits behind its own <Outlet/>, exactly where a real page
        // would throw.
        const router = createMemoryRouter(
            [
                {
                    path: '/',
                    element: <App />,
                    children: [{ index: true, element: <Bomb /> }]
                }
            ],
            { initialEntries: ['/'] }
        );

        renderWithProviders(<RouterProvider router={router} />);

        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();

        consoleErrorSpy.mockRestore();
    });

    it('keeps the PWA update toast visible when a routed child throws', () => {
        // The toast lives outside ErrorBoundary on purpose (see App.tsx) so a render error
        // elsewhere never hides the only path to apply a pending update. Moving the toast
        // inside ErrorBoundary must turn this red.
        //
        // `mockReturnValue` (persistent), not `...Once`: this tree re-renders PwaUpdateToast
        // more than once per commit, and a one-shot value left the trailing render on the
        // mock's default (false) — restored in `finally` so it doesn't leak to later tests.
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.mocked(useRegisterSW).mockReturnValue({
            needRefresh: [true, mockSetter],
            offlineReady: [false, mockSetter],
            updateServiceWorker: vi.fn()
        });

        const router = createMemoryRouter(
            [
                {
                    path: '/',
                    element: <App />,
                    children: [{ index: true, element: <Bomb /> }]
                }
            ],
            { initialEntries: ['/'] }
        );

        try {
            renderWithProviders(<RouterProvider router={router} />);

            expect(screen.getByRole('alert')).toBeInTheDocument();
            expect(screen.getByRole('status')).toBeInTheDocument();
        } finally {
            vi.mocked(useRegisterSW).mockReturnValue({
                needRefresh: [false, mockSetter],
                offlineReady: [false, mockSetter],
                updateServiceWorker: vi.fn()
            });
            consoleErrorSpy.mockRestore();
        }
    });
});
