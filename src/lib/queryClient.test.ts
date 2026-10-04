import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { safeFetchQueryFn } from '@/lib/api/safeFetch';
import { QUERY_GC_TIME_MS, QUERY_MAX_RETRIES, QUERY_STALE_TIME_MS } from '@/lib/constants';
import { server } from '@/test/server';

import { createQueryClient } from './queryClient';

// Retry is `number | false` in options, but the default is a (failureCount, error) predicate.
type RetryFn = (failureCount: number, error: unknown) => boolean;

describe('createQueryClient', () => {
    it('applies constant defaults to the query cache', () => {
        const queries = createQueryClient().getDefaultOptions().queries;

        expect(queries?.staleTime).toBe(QUERY_STALE_TIME_MS);
        expect(queries?.gcTime).toBe(QUERY_GC_TIME_MS);
        expect(queries?.refetchOnWindowFocus).toBe(true);
    });

    it('lets option overrides win over the defaults', () => {
        const queries = createQueryClient({
            staleTime: 0,
            gcTime: 1,
            refetchOnWindowFocus: false,
            retry: 0
        }).getDefaultOptions().queries;

        expect(queries?.staleTime).toBe(0);
        expect(queries?.gcTime).toBe(1);
        expect(queries?.refetchOnWindowFocus).toBe(false);
        expect(queries?.retry).toBe(0);
    });

    describe('default retry predicate', () => {
        const getRetry = () => createQueryClient().getDefaultOptions().queries?.retry as RetryFn;

        it('does not retry 4xx client errors', () => {
            const retry = getRetry();
            expect(retry(0, { status: 400 })).toBe(false);
            expect(retry(0, { status: 401 })).toBe(false);
            expect(retry(0, { status: 404 })).toBe(false);
        });

        it('retries 5xx server errors up to QUERY_MAX_RETRIES', () => {
            const retry = getRetry();
            const error = { status: 500 };

            expect(retry(QUERY_MAX_RETRIES - 1, error)).toBe(true);
            expect(retry(QUERY_MAX_RETRIES, error)).toBe(false);
        });

        it('retries network errors with no status up to QUERY_MAX_RETRIES', () => {
            const retry = getRetry();
            const error = new Error('Network request failed');

            expect(retry(QUERY_MAX_RETRIES - 1, error)).toBe(true);
            expect(retry(QUERY_MAX_RETRIES, error)).toBe(false);
        });
    });

    describe('default retry through safeFetchQueryFn', () => {
        const URL = 'https://retry.e2e-test/probe';
        const Schema = z.object({ value: z.number() });

        // Counts requests that reach the endpoint; retryDelay 0 keeps the retried case fast.
        const runQuery = async (status: number): Promise<number> => {
            let calls = 0;
            server.use(
                http.get(URL, () => {
                    calls += 1;
                    return HttpResponse.json({}, { status });
                })
            );

            await expect(
                createQueryClient().query({
                    queryKey: ['retry-probe', status],
                    queryFn: safeFetchQueryFn(URL, Schema),
                    retryDelay: 0
                })
            ).rejects.toBeInstanceOf(Error);

            return calls;
        };

        it('requests a 404 once: a client error is not retried', async () => {
            expect(await runQuery(404)).toBe(1);
        });

        it('requests a 500 once plus QUERY_MAX_RETRIES retries', async () => {
            expect(await runQuery(500)).toBe(QUERY_MAX_RETRIES + 1);
        });
    });
});
