import React, { Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled React Error in InverterZone App:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    try {
      localStorage.clear();
    } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#11161F] text-white flex items-center justify-center p-4 font-sans">
          <div className="max-w-md w-full rounded-3xl bg-[#171F2B] border border-slate-700/80 p-6 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 mx-auto flex items-center justify-center mb-4 text-xl font-bold">
              !
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Something went wrong</h2>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              The application encountered an unexpected runtime error.
            </p>
            {this.state.error && (
              <pre className="text-[11px] font-mono text-rose-300 bg-slate-900/80 p-3 rounded-xl overflow-x-auto text-left mb-5 border border-slate-800">
                {this.state.error.message || String(this.state.error)}
              </pre>
            )}
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="min-h-[42px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white cursor-pointer transition-colors"
              >
                Reload App
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="min-h-[42px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white cursor-pointer transition-colors"
              >
                Clear Cache &amp; Reset
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
