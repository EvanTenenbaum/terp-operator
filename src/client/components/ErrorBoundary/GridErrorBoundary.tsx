import { Component, type ReactNode } from 'react';
import { logger } from '@/client/services/logger';

interface Props {
  children: ReactNode;
  gridName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GridErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    logger.error('Grid render error', { grid: this.props.gridName, error: error.message });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: '#b42318', marginBottom: '0.5rem' }}>
            Grid failed to load: {this.state.error?.message ?? 'Unknown error'}
          </p>
          <button onClick={this.handleRetry}>Reload Grid</button>
        </div>
      );
    }
    return this.props.children;
  }
}
