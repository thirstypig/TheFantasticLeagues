// client/src/components/ErrorBoundary.tsx
// Generic React error boundary — catches render errors and shows a friendly fallback.
// React requires class components for error boundaries (no hook equivalent).
import React from "react";
import { track } from "../lib/posthog";
import { getLastRequestId } from "../api/base";
import { reportError } from "../lib/errorBus";

interface Props {
  /** Label for tracking which boundary caught the error */
  name?: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  /** Request id from the most-recent API call at the moment we caught. */
  requestId: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, requestId: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, requestId: getLastRequestId() };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ""}]`, error, info.componentStack);
    track("error_boundary_caught", {
      boundary: this.props.name ?? "unknown",
      error: error.message?.slice(0, 200),
      requestId: getLastRequestId(),
    });
    // Surface in the global toast stack as well so the user sees a
    // copyable code without needing to stay on the fallback screen.
    reportError(error, { source: `boundary:${this.props.name ?? "unknown"}` });
  }

  handleRetry = () => {
    this.setState({ error: null, requestId: null });
  };

  handleCopy = async () => {
    const { error, requestId } = this.state;
    if (!error) return;
    const code = requestId ? `ERR-${requestId}` : null;
    const parts = [
      "[Render error]",
      code ? `code=${code}` : null,
      `boundary=${this.props.name ?? "unknown"}`,
      `time=${new Date().toISOString()}`,
      `— ${error.message}`,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(parts.join(" "));
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center min-h-[300px] px-4">
          <div className="max-w-md w-full rounded-lg border border-[var(--lg-error)]/20 bg-[var(--lg-error)]/5 p-6 text-center">
            <h2 className="text-lg font-semibold text-[var(--lg-text-primary)] mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-[var(--lg-text-secondary)] mb-3">
              {this.state.error.message || "An unexpected error occurred."}
            </p>
            {this.state.requestId && (
              <div className="mb-4 text-[10px] flex items-center justify-center gap-2">
                <span className="text-[var(--lg-text-muted)]">Last request:</span>
                <button
                  onClick={this.handleCopy}
                  title="Copy code for support"
                  className="font-mono px-1.5 py-0.5 rounded border border-[var(--lg-border-faint)] bg-[var(--lg-tint)] text-[var(--lg-text-primary)] hover:border-[var(--lg-accent)]"
                >
                  ERR-{this.state.requestId}
                </button>
              </div>
            )}
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
