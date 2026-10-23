import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// Top-level safety net. A render-time throw anywhere in the tree (an unvalidated API
// shape, a null deref mid-lesson) would otherwise blank the whole app for a child. This
// catches it and shows a friendly bilingual "something broke, let's start over" screen
// with a reload button, instead of a white screen. Class component because React only
// exposes error boundaries via componentDidCatch / getDerivedStateFromError.
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // @types/react is parked in node_modules/.ignored, so the base Component generics don't
  // surface `this.props`/`this.state` on the instance. Declare them explicitly (declare =
  // type-only, emits nothing) so this class typechecks without un-ignoring the React types.
  declare readonly props: ErrorBoundaryProps;
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep a console trail for debugging; there's no remote error sink wired up yet.
    console.error('Unhandled render error caught by ErrorBoundary:', error, info);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center',
          background: 'var(--app-bg, #0f172a)',
          color: 'var(--app-text, #f8fafc)',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ fontSize: '3.5rem', lineHeight: 1 }} aria-hidden="true">
          🐣
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0 }}>
          Oops! Something went wrong
        </h1>
        <p style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, opacity: 0.85 }}>
          Ối! Có gì đó trục trặc rồi
        </p>
        <p style={{ maxWidth: 420, fontSize: '0.95rem', opacity: 0.7, margin: 0 }}>
          Let's start again together. / Mình cùng bắt đầu lại nhé.
        </p>
        <button
          onClick={this.handleReload}
          style={{
            marginTop: '0.5rem',
            padding: '0.85rem 2rem',
            fontSize: '1rem',
            fontWeight: 900,
            color: '#ffffff',
            background: '#0ea5e9',
            border: 'none',
            borderRadius: 16,
            cursor: 'pointer',
          }}
        >
          Try again / Thử lại
        </button>
      </div>
    );
  }
}
