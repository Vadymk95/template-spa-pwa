import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { MIN_PASSWORD_LENGTH } from '@/lib/constants';
import { RoutesPath } from '@/router/routes';

import { useLoginForm } from './useLoginForm';

const navigate = vi.fn();
const setUser = vi.fn();

vi.mock('@/lib/api/auth', () => ({
    authApi: { login: vi.fn() }
}));

vi.mock('react-router-dom', () => ({
    useNavigate: () => navigate
}));

// Identity `t` — assert the raw i18n key the hook passes, decoupled from copy.
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key })
}));

vi.mock('@/store/user/userStore', () => ({
    useUserStore: { use: { setUser: () => setUser } }
}));

const VALID_PASSWORD = 'p'.repeat(MIN_PASSWORD_LENGTH);

interface FormResult {
    current: ReturnType<typeof useLoginForm>;
}

// Read errors via getFieldState (public API) rather than formState.errors:
// the formState proxy only tracks fields read during render, so a renderHook
// snapshot never materializes errors. getFieldState reads live state directly.
const fieldError = (result: FormResult, name: 'email' | 'password' | 'root') =>
    result.current.form.getFieldState(name as 'email').error?.message;

const submit = async (result: FormResult, values?: { email: string; password: string }) => {
    if (values) {
        act(() => {
            result.current.form.setValue('email', values.email);
            result.current.form.setValue('password', values.password);
        });
    }
    // onSubmit fires form.handleSubmit (async): validation + the login promise
    // settle on later microtasks. Await inside act so RHF state flushes before we read it.
    await act(async () => {
        result.current.onSubmit();
        await Promise.resolve();
    });
};

describe('useLoginForm', () => {
    beforeEach(() => {
        vi.mocked(authApi.login).mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('validation', () => {
        it('flags a required and an invalid email', async () => {
            const { result } = renderHook(() => useLoginForm());

            await submit(result, { email: '', password: VALID_PASSWORD });
            expect(fieldError(result, 'email')).toMatch(/required/i);

            await submit(result, { email: 'notanemail', password: VALID_PASSWORD });
            expect(fieldError(result, 'email')).toMatch(/valid email/i);

            expect(vi.mocked(authApi.login)).not.toHaveBeenCalled();
        });

        it('rejects a password shorter than MIN_PASSWORD_LENGTH', async () => {
            const { result } = renderHook(() => useLoginForm());

            await submit(result, {
                email: 'user@example.com',
                password: 'p'.repeat(MIN_PASSWORD_LENGTH - 1)
            });

            expect(fieldError(result, 'password')).toMatch(/at least/i);
            expect(vi.mocked(authApi.login)).not.toHaveBeenCalled();
        });
    });

    describe('submit', () => {
        const credentials = { email: 'user@example.com', password: VALID_PASSWORD };

        it('stores the user and navigates to Root on success', async () => {
            vi.mocked(authApi.login).mockResolvedValue({ username: 'alice', token: 'tok-123' });

            const { result } = renderHook(() => useLoginForm());
            await submit(result, credentials);

            expect(vi.mocked(authApi.login)).toHaveBeenCalledWith(credentials);
            expect(setUser).toHaveBeenCalledWith('alice', 'tok-123');
            expect(navigate).toHaveBeenCalledWith(RoutesPath.Root);
            expect(fieldError(result, 'root')).toBeUndefined();
        });

        it('sets the invalidCredentials root error on a 401 ApiError', async () => {
            vi.mocked(authApi.login).mockRejectedValue(new ApiError(401, 'Unauthorized'));

            const { result } = renderHook(() => useLoginForm());
            await submit(result, credentials);

            await waitFor(() => {
                expect(fieldError(result, 'root')).toBe('auth:login.error.invalidCredentials');
            });
            expect(setUser).not.toHaveBeenCalled();
            expect(navigate).not.toHaveBeenCalled();
        });

        it('sets the unknown root error on any other failure', async () => {
            vi.mocked(authApi.login).mockRejectedValue(new ApiError(500, 'Server error'));

            const { result } = renderHook(() => useLoginForm());
            await submit(result, credentials);

            await waitFor(() => {
                expect(fieldError(result, 'root')).toBe('errors:api.unknown');
            });
        });
    });
});
