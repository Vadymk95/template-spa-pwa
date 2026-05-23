/**
 * First real TanStack Query module — mirrors the pattern captured in
 * `_example.queries.ts`. Consumed by `src/pages/HomePage/useHomePage.ts` and
 * MSW-served via `src/test/handlers.ts`.
 *
 * The `_example.queries.ts` seed stays as the canonical reference so new
 * domains can be scaffolded by copy-paste; this file is the live vertical
 * slice that also demonstrates Zod boundary validation via `safeFetchQueryFn`
 * (see `src/lib/api/safeFetch.ts` for the PWA-cache-survival rationale).
 */
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { env } from '@/env';

import { safeFetchQueryFn } from './safeFetch';

const GreetingSchema = z.object({
    greeting: z.string()
});

export type Greeting = z.infer<typeof GreetingSchema>;

const GREETING_URL = `${env.VITE_API_URL ?? 'http://localhost:3001/api'}/greeting`;

export const greetingKeys = {
    all: ['greeting'] as const,
    detail: () => [...greetingKeys.all, 'detail'] as const
};

export const greetingOptions = () =>
    queryOptions({
        queryKey: greetingKeys.detail(),
        queryFn: safeFetchQueryFn(GREETING_URL, GreetingSchema),
        staleTime: 60_000
    });
