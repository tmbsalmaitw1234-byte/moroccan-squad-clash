import { Component, ReactNode } from 'react';

/** Keeps a crash on one page from blanking the whole site. Reset by changing `resetKey` (the route). */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: undefined });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-lg rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-center">
          <div className="text-4xl">⚠️</div>
          <div className="mt-2 font-display text-xl font-bold uppercase">This page hit a problem</div>
          <p className="mt-1 text-sm text-white/70">{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: undefined })} className="mt-4 rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/5">Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
