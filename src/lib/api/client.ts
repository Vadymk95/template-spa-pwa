/**
 * Base API Client — 🌱 SHOWCASE.
 *
 * Demonstrates `Authorization: Bearer ${token}` wiring with TanStack Query.
 * Real production apps should keep auth on the backend (httpOnly cookies),
 * making this client redundant — see `.cursor/brain/EXTENSIONS.md` Phase 1
 * (Backend) and Phase 2 (Auth) for replacement strategies.
 *
 * - Using Supabase / Firebase / tRPC: remove this folder; their SDKs plug into
 *   TanStack Query directly.
 * - Building a custom REST backend: extend this client with your contracts.
 */

import { env } from '@/env';
import { getAuthToken } from '@/store/user/userStore';

// Backend API URL — configure VITE_API_URL in .env (validated by src/env.ts via t3-env + zod)
const API_BASE_URL = env.VITE_API_URL ?? 'http://localhost:3001/api';

/**
 * Cross-origin token-leak guard. Bearer tokens must NEVER ride to:
 *   - cross-origin destinations over plain http (network sniffing)
 *   - opaque schemes (data:, blob:) — meaningless for an HTTP API
 *
 * Same-origin requests are always safe. https:// is always safe. http:// is
 * only allowed for loopback (localhost / 127.0.0.1) so dev backends work.
 *
 * Returning `false` means the request still fires, but without `Authorization`.
 */
const isSafeForAuth = (resolvedUrl: URL): boolean => {
    if (typeof window !== 'undefined' && resolvedUrl.origin === window.location.origin) {
        return true;
    }
    if (resolvedUrl.protocol === 'https:') return true;
    if (
        resolvedUrl.protocol === 'http:' &&
        (resolvedUrl.hostname === 'localhost' || resolvedUrl.hostname === '127.0.0.1')
    ) {
        return true;
    }
    return false;
};

// Proper Error subclass so instanceof checks and only-throw-error rule work correctly
export class ApiError extends Error {
    // Declared separately: parameter properties are forbidden with erasableSyntaxOnly
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

const extractErrorMessage = (data: unknown): string | null => {
    if (data === null || typeof data !== 'object') return null;
    const obj = data as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.error === 'string') return obj.error;
    if (obj.error !== null && typeof obj.error === 'object') {
        const nested = obj.error as Record<string, unknown>;
        if (typeof nested.message === 'string') return nested.message;
    }
    return null;
};

export const apiClient = async <T>(endpoint: string, options?: RequestInit): Promise<T> => {
    const token = getAuthToken();
    const url = `${API_BASE_URL}${endpoint}`;
    const resolvedUrl = new URL(
        url,
        typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    );
    const attachAuth = token !== null && isSafeForAuth(resolvedUrl);
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(attachAuth ? { Authorization: `Bearer ${token}` } : {}),
            // Cast: HeadersInit can be string[][] but our callers pass Record<string, string>
            ...(options?.headers as Record<string, string> | undefined)
        }
    });

    if (!response.ok) {
        let errorMessage = response.statusText || 'Unknown error';

        try {
            const errorData: unknown = await response.json();
            errorMessage =
                (extractErrorMessage(errorData) ?? response.statusText) ||
                `HTTP ${String(response.status)}`;
        } catch {
            errorMessage = response.statusText || `HTTP ${String(response.status)}`;
        }

        throw new ApiError(response.status, errorMessage);
    }

    return response.json() as Promise<T>;
};
