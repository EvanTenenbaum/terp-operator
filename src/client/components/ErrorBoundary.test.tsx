// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ErrorBoundary } from './ErrorBoundary';

// React's ErrorBoundary triggers `console.error` when a child throws during
// render. Silence it in tests to keep output readable; restore afterwards.
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

function Bomb({ message = 'Boom!' }: { message?: string }): JSX.Element {
  throw new Error(message);
}

describe('ErrorBoundary (#21 slice 4 — UX-06)', () => {
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">all good</div>
      </ErrorBoundary>
    );
    expect(screen.getByTestId('child')).toHaveTextContent('all good');
  });

  it('renders fallback UI when a child throws during render', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('invokes onError callback with the thrown error', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Bomb message="Specific failure" />
      </ErrorBoundary>
    );
    expect(onError).toHaveBeenCalledTimes(1);
    const firstCall = onError.mock.calls[0]!;
    expect(firstCall[0]).toBeInstanceOf(Error);
    expect((firstCall[0] as Error).message).toBe('Specific failure');
  });

  it('shows a Reload button that calls window.location.reload', async () => {
    // jsdom's `window.location` is non-configurable, so we swap the whole
    // object for a stub that records the reload call. Restore afterwards.
    const reloadMock = vi.fn();
    const originalLocation = window.location;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).location;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).location = { ...originalLocation, reload: reloadMock };

    try {
      const user = userEvent.setup();
      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      );
      const reload = screen.getByRole('button', { name: /reload/i });
      expect(reload).toHaveClass('primary-button');
      await user.click(reload);
      expect(reloadMock).toHaveBeenCalledTimes(1);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).location = originalLocation;
    }
  });

  it('exposes the error message in development mode', () => {
    const originalDev = (import.meta as any).env?.DEV;
    (import.meta as any).env.DEV = true;
    try {
      render(
        <ErrorBoundary>
          <Bomb message="Dev-only details" />
        </ErrorBoundary>
      );
      expect(screen.getByText(/dev-only details/i)).toBeInTheDocument();
    } finally {
      (import.meta as any).env.DEV = originalDev;
    }
  });
});
