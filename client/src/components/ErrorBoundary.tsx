import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
  stack: string;
}

/**
 * A last-resort safety net. Something meant to be left running unattended
 * shouldn't white-screen silently if a component throws; this at least
 * tells you it broke and offers a way back. The error text is shown
 * directly in the fallback (not just logged to console) — this is a
 * single-user hobby project with no sensitive data behind it, and a
 * console-only error is easy to miss if DevTools isn't already open.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '', stack: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message, stack: error.stack ?? '' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] caught an error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-fallback">
          <p className="error-fallback-title">Something went wrong.</p>
          <p className="error-fallback-body">
            Umbra hit an unexpected error. Refreshing usually fixes it.
          </p>
          <pre className="error-fallback-detail">{this.state.message}
{this.state.stack}</pre>
          <button onClick={() => window.location.reload()}>Refresh</button>
        </div>
      );
    }
    return this.props.children;
  }
}
