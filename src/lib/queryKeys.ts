/**
 * TanStack Query — central key-factory registry.
 *
 * Aggregates per-domain factories under one import so consumers can write
 *   `queryClient.invalidateQueries({ queryKey: queryKeys.greeting.all })`
 * from anywhere without hunting down which file owns the factory. Per-domain
 * factories STILL live next to their `queryOptions()` (Dorfmeister pattern —
 * see `_example.queries.ts` for the canonical shape); this file is a thin
 * re-export, not a parallel source of truth.
 *
 * Why centralised:
 *   - Cache invalidation from outside the owning module (logout flow,
 *     route-change clear, dev-tools panel) needs one stable import path.
 *   - Reviewers can grep `queryKeys\.` to see every cache slice the app
 *     touches without walking the `lib/api/` tree.
 *
 * Sibling symmetry: shape mirrors template-1 / template-rn / template-next-seo.
 *   When adding a new domain, register it here as well as exporting the local
 *   factory — both, not either.
 *
 * Pattern: `as const` registry of factory objects. NEVER inline key arrays
 *   here — the factory closures own the parameterisation (e.g. `detail(id)`).
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
