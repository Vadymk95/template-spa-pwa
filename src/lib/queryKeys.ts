/**
 * TanStack Query: key-factory registry.
 *
 * A convention, not wiring: nothing in the template imports `queryKeys` yet. It lists the
 * per-domain key factories in one place, so a fork that has to invalidate a cache slice from
 * outside the owning module (a logout flow, for example) has a single import path:
 *   `queryClient.invalidateQueries({ queryKey: queryKeys.greeting.all })`
 *
 * Per-domain factories STILL live next to their `queryOptions()` (see `_example.queries.ts`
 * for the canonical shape); this file only re-exports them, it is not a parallel source of
 * truth. When adding a new domain, register its factory here as well as exporting it from
 * its own `<domain>.queries.ts` (`.cursor/rules/api.mdc`).
 *
 * Pattern: `as const` registry of factory objects. NEVER inline key arrays here: the factory
 * closures own the parameterisation (e.g. `detail(id)`).
 */

import { exampleKeys } from '@/lib/api/_example.queries';
import { greetingKeys } from '@/lib/api/greeting.queries';

export const queryKeys = {
    /** Showcase / template-seed factory — see `_example.queries.ts`. */
    example: exampleKeys,
    /** Live vertical slice — consumed by HomePage. */
    greeting: greetingKeys
} as const;

export type QueryKeys = typeof queryKeys;
