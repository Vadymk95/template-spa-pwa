export const RoutesPath = {
    Root: '/',
    Login: '/login',
    Dashboard: '/dashboard',
    /**
     * ⚠️ DEV-ONLY route. The element is mounted only under `import.meta.env.DEV`
     * (see `src/router/modules/base.routes.tsx`). The constant itself is always
     * exported, so do **not** link to it from production UI (Footer / Header /
     * shortcuts / sitemap) — the route is absent in the prod build and the link
     * will 404 via NotFoundPage.
     */
    DevPlayground: '/dev/ui',
    NotFound: '*'
} as const;

export type RoutePath = (typeof RoutesPath)[keyof typeof RoutesPath];
