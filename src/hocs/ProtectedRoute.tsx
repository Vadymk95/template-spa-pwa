import { Navigate, Outlet } from 'react-router-dom';

import { RoutesPath } from '@/router/routes';
import { useUserStore } from '@/store/user/userStore';

/**
 * Wraps routes that require authentication.
 *
 * Usage in router:
 *   { element: <ProtectedRoute />, children: [{ path: '...', element: <Page /> }] }
 *
 * Unauthenticated users are redirected to /login.
 * The `replace` prop prevents the login page from appearing in browser history.
 *
 * Hydration race guard: zustand persist reads `localStorage` asynchronously even when
 * the storage backend is synchronous (per zustand docs). On cold load the store reports
 * `isLoggedIn: false` until rehydrate completes — without `_hasHydrated`, an authenticated
 * user would be redirected to /login mid-rehydrate and never recover.
 */
export const ProtectedRoute = () => {
    const hasHydrated = useUserStore.use._hasHydrated();
    const isLoggedIn = useUserStore.use.isLoggedIn();

    // Gate the redirect until persist has read localStorage. Brief render of
    // `null` is preferable to a wrong-redirect; consumers can swap in a skeleton.
    if (!hasHydrated) return null;

    return isLoggedIn ? <Outlet /> : <Navigate to={RoutesPath.Login} replace />;
};
