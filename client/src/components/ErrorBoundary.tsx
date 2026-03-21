// client/src/components/ErrorBoundary.tsx
// Generic React error boundary — catches render errors and shows a friendly fallback.
// React requires class components for error boundaries (no hook equivalent).
import React from "react";
import { track } from "../lib/posthog";

interface Props {
  /** Label for tracking which boundary caught the error */
  name?: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ""}]`, error, info.componentStack);
    track("error_boundary_caught", {
      boundary: this.props.name ?? "unknown",
      error: error.message?.slice(0, 200),
    });
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center min-h-[300px] px-4">
          <div className="max-w-md w-full rounded-lg border border-[var(--lg-error)]/20 bg-[var(--lg-error)]/5 p-6 text-center">
            <h2 className="text-lg font-semibold text-[var(--lg-text-primary)] mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-[var(--lg-text-secondary)] mb-4">
              {this.state.error.message || "An unexpected error occurred."}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--lg-accent)] text-white hover:opacity-90 transition-opacity"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-sm font-medium rounded-md border border-[var(--lg-border-subtle)] text-[var(--lg-text-secondary)] hover:bg-[var(--lg-tint)] transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
