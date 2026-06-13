// @vitest-environment jsdom
// UX-T06: Toast action API — action buttons are rendered alongside dismiss,
// clicking an action fires onAction AND dismisses the toast, a11y roles are
// correct, and the existing single-button (no-action) form still works.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ToastCenter } from './ToastCenter';
import { useUiStore } from '../store/uiStore';

function resetToasts() {
  useUiStore.setState({ toasts: [], announcement: '' });
}

describe('ToastCenter — UX-T06 action buttons', () => {
  beforeEach(() => {
    resetToasts();
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (vi.isFakeTimers()) {
      act(() => { vi.runOnlyPendingTimers(); });
      vi.useRealTimers();
    }
    resetToasts();
  });

  it('renders an action button when the toast has actions', () => {
    const onAction = vi.fn();
    render(<ToastCenter />);
    act(() => {
      useUiStore.getState().pushToast('Order posted!', 'success', {
        actions: [{ label: 'View order', onAction }]
      });
    });

    expect(screen.getByRole('button', { name: 'View order' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    // The toast message text is present in the compound widget (as a <p>).
    // Use getAllByText since the text also appears in the sr-only aria-live region.
    const msgNodes = screen.getAllByText('Order posted!');
    expect(msgNodes.length).toBeGreaterThanOrEqual(1);
  });

  it('fires onAction and dismisses the toast when the action button is clicked', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<ToastCenter />);
    act(() => {
      useUiStore.getState().pushToast('Payment logged', 'success', {
        actions: [{ label: 'View payment', onAction }]
      });
    });

    await user.click(screen.getByRole('button', { name: 'View payment' }));

    expect(onAction).toHaveBeenCalledOnce();
    // Toast should be dismissed (button gone).
    expect(screen.queryByRole('button', { name: 'View payment' })).not.toBeInTheDocument();
  });

  it('dismiss button (✕) removes the toast without firing onAction', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<ToastCenter />);
    act(() => {
      useUiStore.getState().pushToast('Bill scheduled', 'success', {
        actions: [{ label: 'View bill', onAction }]
      });
    });

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onAction).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'View bill' })).not.toBeInTheDocument();
  });

  it('renders multiple action buttons when actions array has multiple items', () => {
    render(<ToastCenter />);
    act(() => {
      useUiStore.getState().pushToast('Command failed', 'error', {
        actions: [
          { label: 'Copy details', onAction: vi.fn() },
          { label: 'Open in Recovery', onAction: vi.fn() }
        ]
      });
    });

    expect(screen.getByRole('button', { name: 'Copy details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open in Recovery' })).toBeInTheDocument();
  });

  it('toasts without actions keep the original single-button form (backward compat)', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<ToastCenter />);
    act(() => {
      useUiStore.getState().pushToast('Saved!', 'success');
    });

    // The toast itself is the clickable button (original form).
    const btn = screen.getByRole('button', { name: 'Saved!' });
    expect(btn).toBeInTheDocument();

    await user.click(btn);
    expect(screen.queryByRole('button', { name: 'Saved!' })).not.toBeInTheDocument();
  });

  it('compound toast uses role=status for a11y (not role=button)', () => {
    render(<ToastCenter />);
    act(() => {
      useUiStore.getState().pushToast('Order posted!', 'success', {
        actions: [{ label: 'View order', onAction: vi.fn() }]
      });
    });

    // The container has role=status, not role=button.
    expect(screen.getByRole('status', { name: 'Order posted!' })).toBeInTheDocument();
  });

  it('pushToast with only message (no tone, no opts) still works — backward compat', () => {
    render(<ToastCenter />);
    act(() => {
      useUiStore.getState().pushToast('Info message');
    });

    expect(screen.getByRole('button', { name: 'Info message' })).toBeInTheDocument();
  });
});

describe('uiStore — UX-T06 pushToast with actions', () => {
  beforeEach(() => {
    useUiStore.setState({ toasts: [], announcement: '' });
  });

  it('stores action objects on the toast', () => {
    const onAction = vi.fn();
    useUiStore.getState().pushToast('msg', 'success', {
      actions: [{ label: 'Do it', onAction }]
    });
    const toast = useUiStore.getState().toasts[0];
    expect(toast.actions).toHaveLength(1);
    expect(toast.actions![0].label).toBe('Do it');
  });

  it('does not set actions when opts is undefined', () => {
    useUiStore.getState().pushToast('msg', 'info');
    const toast = useUiStore.getState().toasts[0];
    expect(toast.actions).toBeUndefined();
  });

  it('does not set actions when opts.actions is empty array', () => {
    useUiStore.getState().pushToast('msg', 'info', { actions: [] });
    const toast = useUiStore.getState().toasts[0];
    expect(toast.actions).toBeUndefined();
  });
});
