/**
 * Boundary validation wrapper — parses every API response through a Zod schema
 * before it reaches application code. Pairs with `src/lib/devGuards.ts`
 * (`installDevGuards`) which suppresses dev-only AbortError noise from
 * TanStack Query observers — `safeFetchQueryFn` re-throws `AbortError`
 * unchanged so cancellation still propagates correctly.
 *
 * ─── PWA cache survival (why this wrapper is template-default here) ────────
 *
 * vite-plugin-pwa + Workbox `generateSW` precaches the app shell AND
 * runtime-caches API responses. Both survive across deploys: the user keeps
 * the previous cache until the new SW activates AND the new SW's runtime
 * cache may still serve a stale response until it expires.
 *
 * After a backend schema change, that means:
 *
 *   • Workbox-served response shape = the OLD schema (cached pre-deploy)
 *   • TanStack Query observer/component code = the NEW shape (deployed code)
 *
 * Naive `await fetch(url).then((r) => r.json())` passes the stale shape
 * downstream unchecked — the bug surfaces as a confusing render-time
 * "X is undefined" deep inside a component, far from the boundary.
 *
 * `safeFetch` parses on EVERY read (network OR cache hit — Workbox is
 * transparent to fetch from the caller's perspective), so stale-shape
 * responses fail loud at the boundary with `SchemaValidationError`
 * containing the URL + Zod issues. Caller can then handle (invalidate
 * cache, show "please refresh", etc.) instead of debugging a downstream
 * NPE three components deep.
 *
 * Same pattern works for standard SPAs (no SW); PWA simply makes it
 * load-bearing instead of nice-to-have.
 *
 * See `.cursor/brain/DECISIONS.md` → "Boundary validation via Zod
 * safeFetch wrapper (PWA-aware)" for the full rationale.
 */

import type { z } from 'zod';

/**
 * Thrown when a fetched response fails Zod validation. Carries the URL
 * that produced the bad shape and the structured Zod issue list — useful
 * for logger context, Sentry breadcrumbs, and "show diff" debugging UI.
 */
export class SchemaValidationError extends Error {
    // Declared separately: parameter properties are forbidden with erasableSyntaxOnly
    readonly url: string;
    readonly issues: z.core.$ZodIssue[];

    constructor(url: string, issues: z.core.$ZodIssue[]) {
        super(`Schema validation failed for ${url}`);
        this.name = 'SchemaValidationError';
        this.url = url;
        this.issues = issues;
    }
}

/**
 * Fetch JSON and validate against a Zod schema. Throws `SchemaValidationError`
 * on shape drift (NOT a network/HTTP error — `response.ok` failures still
 * throw as `Error` from the caller's perspective so existing error boundaries
 * keep working).
 *
 * Generic param `T` is inferred from the schema — no need to specify both
 * `<T>(...)` and `schema`. Use `z.infer<typeof Schema>` for the public
 * response type so the runtime check and the static type stay in sync.
 *
 * @example
 *   const GreetingSchema = z.object({ greeting: z.string() });
 *   type Greeting = z.infer<typeof GreetingSchema>;
 *   const data: Greeting = await safeFetch('/api/greeting', GreetingSchema);
 */
export const safeFetch = async <Schema extends z.ZodType>(
    url: string,
    schema: Schema,
    init?: RequestInit
): Promise<z.infer<Schema>> => {
    const response = await fetch(url, init);

    if (!response.ok) {
        throw new Error(`HTTP ${String(response.status)} ${response.statusText} (${url})`);
    }

    const raw: unknown = await response.json();
    const parsed = schema.safeParse(raw);

    if (!parsed.success) {
        throw new SchemaValidationError(url, parsed.error.issues);
    }

    return parsed.data;
};

/**
 * Curried `queryFn` factory for TanStack Query — wires schema validation
 * into `useQuery` / `queryOptions` without repeating the closure shape.
 *
 * Re-throws `AbortError` unchanged so cancellation flows through TanStack
 * Query as expected (pairs with `installDevGuards` which silences the
 * dev-only "signal is aborted without reason" unhandledrejection).
 *
 * @example
 *   const GreetingSchema = z.object({ greeting: z.string() });
 *
 *   export const greetingOptions = () =>
 *       queryOptions({
 *           queryKey: greetingKeys.detail(),
 *           queryFn: safeFetchQueryFn('/api/greeting', GreetingSchema),
 *           staleTime: 60_000
 *       });
 */
export const safeFetchQueryFn =
    <Schema extends z.ZodType>(url: string, schema: Schema) =>
    async ({ signal }: { signal: AbortSignal }): Promise<z.infer<Schema>> => {
        try {
            return await safeFetch(url, schema, { signal });
        } catch (error) {
            // AbortError is structured cancellation, not a runtime failure —
            // re-throw unchanged so TanStack Query's cancellation path works
            // and the dev-guard's unhandledrejection silencer applies.
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw error;
            }
            throw error;
        }
    };
