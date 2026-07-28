import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PwaUpdateToast } from './PwaUpdateToast';

interface ToastState {
    isVisible: boolean;
    handleUpdate: () => void;
    handleDismiss: () => void;
}

const handleUpdate = vi.fn();
const handleDismiss = vi.fn();
// Typed so the factory below returns the hook's real contract rather than `any`,
// which `no-unsafe-return` correctly rejects — and which would let this test keep
// compiling after the hook's shape changed.
const usePwaUpdateToast = vi.fn<() => ToastState>();

vi.mock('./usePwaUpdateToast', () => ({
    usePwaUpdateToast: (): ToastState => usePwaUpdateToast()
}));

// Identity `t` — assert the raw i18n key, decoupled from the copy.
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key })
}));

const withState = (isVisible: boolean): void => {
    usePwaUpdateToast.mockReturnValue({ isVisible, handleUpdate, handleDismiss });
};

describe('PwaUpdateToast', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders nothing while there is no update to offer', () => {
        // The failure that matters: a toast that appears when the hook says not to.
        withState(false);

        const { container } = render(<PwaUpdateToast />);

        expect(container).toBeEmptyDOMElement();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('announces itself politely once an update is available', () => {
        withState(true);

        render(<PwaUpdateToast />);

        const toast = screen.getByRole('status');
        expect(toast).toHaveAttribute('aria-live', 'polite');
        expect(toast).toHaveTextContent('pwa.updateAvailable');
    });

    it('wires refresh to the update handler, not the dismiss handler', async () => {
        // Swapping the two handlers is silent: both buttons still render, both
        // still respond, and the app just stops updating. Pin them separately.
        withState(true);
        const user = userEvent.setup();

        render(<PwaUpdateToast />);
        await user.click(screen.getByRole('button', { name: 'pwa.refresh' }));

        expect(handleUpdate).toHaveBeenCalledTimes(1);
        expect(handleDismiss).not.toHaveBeenCalled();
    });

    it('wires the dismiss control to the dismiss handler and gives it a name', async () => {
        // The dismiss button's visible text is "×", which is not an accessible
        // name — it has to come from aria-label.
        withState(true);
        const user = userEvent.setup();

        render(<PwaUpdateToast />);
        await user.click(screen.getByRole('button', { name: 'pwa.dismiss' }));

        expect(handleDismiss).toHaveBeenCalledTimes(1);
        expect(handleUpdate).not.toHaveBeenCalled();
    });
});
