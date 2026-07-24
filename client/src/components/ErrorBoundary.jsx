import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '16px',
          alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: 'var(--color-paper)', color: 'var(--color-ink)',
        }}>
          <span className="seal" aria-hidden="true">愛</span>
          <h2 className="t-heading">页面出了点问题</h2>
          <p className="t-lead" style={{ textAlign: 'center', maxWidth: 360 }}>
            遇到意外错误，请刷新页面重试。
          </p>
          <button
            className="btn-primary"
            onClick={() => window.location.reload()}
          >
            刷新页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
