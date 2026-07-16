import { QueryClient } from '@tanstack/react-query';

import {
    HTTP_SERVER_ERROR_MIN,
    QUERY_GC_TIME_MS,
    QUERY_MAX_RETRIES,
    QUERY_STALE_TIME_MS
} from '@/lib/constants';

import type { ApiError } from './api/client';

// staleTime: how long until data is considered stale (triggers background refetch)
// gcTime: how long stale/unused data stays in memory before GC
// Rule: gcTime must be >> staleTime to allow serving cached data during refetch
const DEFAULTS = {
    STALE_TIME: QUERY_STALE_TIME_MS,
    GC_TIME: QUERY_GC_TIME_MS
} as const;

// Do not retry client errors (4xx) — they will not resolve on retry
const shouldRetry = (failureCount: number, error: unknown): boolean => {
    const apiError = error as ApiError;
    if (typeof apiError.status === 'number' && apiError.status < HTTP_SERVER_ERROR_MIN)
        return false;
    return failureCount < QUERY_MAX_RETRIES;
};

export const createQueryClient = (options?: {
    staleTime?: number;
    gcTime?: number;
    refetchOnWindowFocus?: boolean;
    retry?: number | false;
}): QueryClient => {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: options?.staleTime ?? DEFAULTS.STALE_TIME,
                gcTime: options?.gcTime ?? DEFAULTS.GC_TIME,
                retry: options?.retry ?? shouldRetry,
                refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
                refetchOnReconnect: true,
                refetchOnMount: true
            },
            mutations: {
                retry: 0
            }
        }
    });
};

export const queryClient = createQueryClient();
