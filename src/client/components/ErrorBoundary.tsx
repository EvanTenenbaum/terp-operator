import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Optional callback invoked when a child throws during render. Useful for
   * forwarding the error to a logging service.
   */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level error boundary for the operator console. Wraps {@link App}'s
 * root so a render-time exception in any view falls back to a recoverable
 * panel instead of blanking the entire UI.
 *
 * Per #21 slice 4 (UX-06):
 *  - Generic message in production, full error message in dev.
 *  - A "Reload" button calls `window.location.reload()` so the operator can
 *    recover without resorting to the browser refresh.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isDev = Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);

    return (
      <div
        role="alert"
        className="flex min-h-screen items-center justify-center bg-panel p-4 text-ink"
      >
        <div className="flex w-full max-w-md flex-col gap-3 border border-line bg-white p-4 shadow-lg">
          <h1 className="text-base font-semibold">Something went wrong.</h1>
          <p className="text-sm text-zinc-700">
            The console hit an unexpected error. Reload to continue; if the issue persists, contact support.
          </p>
          {isDev ? (
            <pre className="json-chip whitespace-pre-wrap text-xs">{error.message}</pre>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              className="primary-button compact-action"
              onClick={this.handleReload}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
