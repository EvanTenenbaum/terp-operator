import { Component, type ReactNode } from 'react';
import { logger } from '@/client/services/logger';

interface Props {
  children: ReactNode;
  onClose: () => void;
  drawerName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class DrawerErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    logger.error('Drawer render error', { drawer: this.props.drawerName, error: error.message });
  }

  componentDidUpdate(_prevProps: Props, prevState: State) {
    if (this.state.hasError && !prevState.hasError) {
      this.props.onClose();
    }
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}
