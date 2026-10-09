import { QueryClient } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { API_DEFAULT_URL } from '@/lib/constants';
import { server } from '@/test/server';

import { ApiError } from './client';
import { greetingKeys, greetingOptions } from './greeting.queries';
import { SchemaValidationError } from './safeFetch';

const FROZEN_NOW = '2026-10-09T08:00:00.000Z';
const STALE_AFTER_MS = 60_000;
const CUSTOM_API_URL = 'https://api.greeting-test.example/v2';

// The module resolves its URL once, at import time, so each base-URL case needs a fresh
// module instance. Stubbing the env and re-importing is the public way to get one.
const loadGreetingOptions = async (apiUrl: string | undefined): Promise<typeof greetingOptions> => {
    vi.stubEnv('VITE_API_URL', apiUrl);
    vi.resetModules();
    return (await import('./greeting.queries')).greetingOptions;
};

const serveGreeting = (greeting = 'Hello from the test'): string[] => {
    const requestedUrls: string[] = [];
    server.use(
        http.get('**/greeting', ({ request }) => {
            requestedUrls.push(request.url);
            return HttpResponse.json({ greeting });
        })
    );
    return requestedUrls;
};

describe('greetingKeys', () => {
    it('roots every greeting query under the "greeting" namespace', () => {
        expect(greetingKeys.all).toEqual(['greeting']);
    });

    it('nests the detail key under the root, so invalidating the root reaches it', () => {
        expect(greetingKeys.detail()).toEqual(['greeting', 'detail']);
        expect(greetingKeys.detail().slice(0, greetingKeys.all.length)).toEqual(greetingKeys.all);
    });
});

describe('greetingOptions', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
    });

    it('is keyed by the detail key, so cache reads and invalidation line up', () => {
        expect(greetingOptions().queryKey).toEqual(greetingKeys.detail());
    });

    describe('fetching', () => {
        it('resolves with the greeting payload when the response matches the schema', async () => {
            serveGreeting('Hello from the test');
            const client = new QueryClient();

            await expect(client.query(greetingOptions())).resolves.toEqual({
                greeting: 'Hello from the test'
            });
        });

        it('rejects with SchemaValidationError when the greeting is not a string', async () => {
            server.use(http.get('**/greeting', () => HttpResponse.json({ greeting: 42 })));
            const client = new QueryClient();

            const error = await client.query(greetingOptions()).catch((caught: unknown) => caught);

            expect(error).toBeInstanceOf(SchemaValidationError);
        });

        it('rejects with SchemaValidationError when the greeting field is missing', async () => {
            server.use(http.get('**/greeting', () => HttpResponse.json({})));
            const client = new QueryClient();

            const error = await client.query(greetingOptions()).catch((caught: unknown) => caught);

            expect(error).toBeInstanceOf(SchemaValidationError);
        });

        it('rejects with an ApiError carrying the status on a non-2xx response', async () => {
            server.use(
                http.get('**/greeting', () =>
                    HttpResponse.json({ message: 'down' }, { status: 503 })
                )
            );
            const client = new QueryClient();

            const error = await client.query(greetingOptions()).catch((caught: unknown) => caught);

            expect(error).toBeInstanceOf(ApiError);
            expect((error as ApiError).status).toBe(503);
        });

        it('keeps nothing in the cache after a failed fetch', async () => {
            server.use(http.get('**/greeting', () => HttpResponse.json({}, { status: 500 })));
            const client = new QueryClient();

            await client.query(greetingOptions()).catch(() => undefined);

            expect(client.getQueryData(greetingKeys.detail())).toBeUndefined();
        });
    });

    describe('the request URL', () => {
        it('falls back to the default API base URL when none is configured', async () => {
            const requestedUrls = serveGreeting();
            const options = await loadGreetingOptions(undefined);

            await new QueryClient().query(options());

            expect(requestedUrls).toEqual([`${API_DEFAULT_URL}/greeting`]);
        });

        it('uses the configured API base URL in place of the default', async () => {
            const requestedUrls = serveGreeting();
            const options = await loadGreetingOptions(CUSTOM_API_URL);

            await new QueryClient().query(options());

            expect(requestedUrls).toEqual([`${CUSTOM_API_URL}/greeting`]);
        });
    });

    describe('freshness', () => {
        const fetchAt = async (client: QueryClient, offsetMs: number): Promise<void> => {
            vi.setSystemTime(new Date(Date.parse(FROZEN_NOW) + offsetMs));
            await client.query(greetingOptions());
        };

        it('serves a repeat read from cache until the data is 60 seconds old', async () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            const requestedUrls = serveGreeting();
            const client = new QueryClient();

            await fetchAt(client, 0);
            await fetchAt(client, STALE_AFTER_MS - 1);

            expect(requestedUrls).toHaveLength(1);
        });

        it('refetches once the data has been stale for the full 60 seconds', async () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            const requestedUrls = serveGreeting();
            const client = new QueryClient();

            await fetchAt(client, 0);
            await fetchAt(client, STALE_AFTER_MS);

            expect(requestedUrls).toHaveLength(2);
        });
    });
});
