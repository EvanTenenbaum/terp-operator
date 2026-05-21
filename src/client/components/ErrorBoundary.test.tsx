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

  it('"Try again" button resets component state without calling window.location.reload', async () => {
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

      // Primary action is "Try again", not "Reload"
      const tryAgain = screen.getByRole('button', { name: /try again/i });
      expect(tryAgain).toHaveClass('primary-button');
      await user.click(tryAgain);

      // After reset the error state is cleared — reload was NOT called
      expect(reloadMock).not.toHaveBeenCalled();
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).location = originalLocation;
    }
  });

  it('"Reload page" secondary button calls window.location.reload', async () => {
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

      const reloadBtn = screen.getByRole('button', { name: /reload page/i });
      await user.click(reloadBtn);
      expect(reloadMock).toHaveBeenCalledTimes(1);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).location = originalLocation;
    }
  });

  it('exposes the error message in development mode', () => {
    render(
      <ErrorBoundary isDev={true}>
        <Bomb message="Dev-only details" />
      </ErrorBoundary>
    );
    expect(screen.getByText(/dev-only details/i)).toBeInTheDocument();
  });

  it('hides error details in production mode (does not leak stack trace to users)', () => {
    // Each ESM module has its own import.meta, so we cannot mutate the
    // ErrorBoundary module's import.meta.env.DEV from this test file.
    // The isDev prop override lets us exercise the production rendering path
    // without relying on build-time env substitution.
    render(
      <ErrorBoundary isDev={false}>
        <Bomb message="Secret internal details" />
      </ErrorBoundary>
    );
    // Friendly fallback heading IS shown
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    // The raw error message / stack trace is NOT rendered
    expect(screen.queryByText(/secret internal details/i)).not.toBeInTheDocument();
  });
});
