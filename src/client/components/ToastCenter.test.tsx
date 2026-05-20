// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ToastCenter } from './ToastCenter';
import { useUiStore } from '../store/uiStore';

// Helper to reset the toast slice of the store between tests so timers from a
// prior test cannot leak into the next render.
function resetToasts() {
  useUiStore.setState({ toasts: [], announcement: '' });
}

describe('ToastCenter — sticky error toasts (#21 slice 2)', () => {
  beforeEach(() => {
    resetToasts();
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Flush any pending timers before swapping back to real timers so a queued
    // dismiss doesn't fire against a torn-down tree. A test may have already
    // restored real timers (e.g. the click-dismiss test), in which case the
    // flush call would throw — guard against it.
    if (vi.isFakeTimers()) {
      act(() => {
        vi.runOnlyPendingTimers();
      });
      vi.useRealTimers();
    }
    resetToasts();
  });

  it('auto-dismisses success toasts after 4.2s', () => {
    render(<ToastCenter />);
    act(() => {
      useUiStore.getState().pushToast('Saved!', 'success');
    });
    expect(screen.getByRole('button', { name: 'Saved!' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4300);
    });

    expect(screen.queryByRole('button', { name: 'Saved!' })).not.toBeInTheDocument();
  });

  it('auto-dismisses info toasts after 4.2s', () => {
    render(<ToastCenter />);
    act(() => {
      useUiStore.getState().pushToast('Heads up', 'info');
    });
    expect(screen.getByRole('button', { name: 'Heads up' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4300);
    });

    expect(screen.queryByRole('button', { name: 'Heads up' })).not.toBeInTheDocument();
  });

  it('keeps error toasts visible past the 4.2s auto-dismiss window', () => {
    render(<ToastCenter />);
    act(() => {
      useUiStore.getState().pushToast('Something broke', 'error');
    });
    expect(screen.getByRole('button', { name: 'Something broke' })).toBeInTheDocument();

    act(() => {
      // Advance far past the previous 4.2s auto-dismiss to prove errors stick.
      vi.advanceTimersByTime(15_000);
    });

    expect(screen.getByRole('button', { name: 'Something broke' })).toBeInTheDocument();
  });

  it('dismisses an error toast when the operator clicks it', async () => {
    // userEvent needs real timers internally for its async dispatch loop;
    // swap back to real timers for this test since we're exercising a click,
    // not the auto-dismiss timeout.
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<ToastCenter />);
    act(() => {
      useUiStore.getState().pushToast('Network timeout', 'error');
    });

    // The same text appears in the aria-live announcement region — scope the
    // click to the toast button itself.
    await user.click(screen.getByRole('button', { name: 'Network timeout' }));

    expect(screen.queryByRole('button', { name: 'Network timeout' })).not.toBeInTheDocument();
  });
});
