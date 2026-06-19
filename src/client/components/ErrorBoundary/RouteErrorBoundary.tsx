import { Component, type ReactNode } from 'react';
import { logger } from '@/client/services/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  routeName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    logger.error('Route render error', { route: this.props.routeName, error: error.message });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div role="alert" style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button onClick={this.handleRetry} style={{ marginRight: '0.5rem' }}>
            Try Again
          </button>
          <button onClick={this.handleGoHome}>Go Home</button>
        </div>
      );
    }
    return this.props.children;
  }
}
