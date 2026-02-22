import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  clearStorageAndReload = () => {
    try {
      localStorage.removeItem('arch2d-recent-finds');
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 480 }}>
          <h1 style={{ fontSize: 18, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: '#666', fontSize: 14, marginBottom: 16 }}>
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={this.clearStorageAndReload}
            style={{
              padding: '8px 16px',
              background: '#e5e7eb',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Clear saved data and reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
