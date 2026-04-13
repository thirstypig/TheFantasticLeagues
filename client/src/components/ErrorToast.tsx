import { useEffect, useState } from "react";
import { AlertCircle, Copy, Check, X, WifiOff, Bug } from "lucide-react";
import type { SurfacedError } from "../lib/errorBus";

interface ErrorToastProps {
  error: SurfacedError;
  onDismiss: () => void;
}

const ICON_FOR_KIND = {
  api: AlertCircle,
  network: WifiOff,
  runtime: Bug,
} as const;

const LABEL_FOR_KIND = {
  api: "Request failed",
  network: "Network error",
  runtime: "Unexpected error",
} as const;

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ErrorToast({ error, onDismiss }: ErrorToastProps) {
  const Icon = ICON_FOR_KIND[error.kind];
  const [copied, setCopied] = useState(false);

  // Auto-dismiss after 12s unless the user hovers
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(onDismiss, 12_000);
    return () => clearTimeout(t);
  }, [paused, onDismiss]);

  const displayCode = error.ref ?? (error.requestId ? `ERR-${error.requestId}` : null);

  const onCopy = async () => {
    const parts = [
      `[${LABEL_FOR_KIND[error.kind]}]`,
      error.status ? `HTTP ${error.status}` : null,
      displayCode ? `code=${displayCode}` : null,
      error.source ? `source=${error.source}` : null,
      `time=${new Date(error.timestamp).toISOString()}`,
      `— ${error.message}`,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(parts.join(" "));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be blocked (iframe, insecure context) — silently ignore
    }
  };

  return (
    <div
      role="alert"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="pointer-events-auto w-full max-w-sm rounded-lg border border-red-500/30 bg-[var(--lg-bg-card)] shadow-lg overflow-hidden"
    >
      <div className="flex items-start gap-3 p-3">
        <Icon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--lg-text-primary)]">
              {LABEL_FOR_KIND[error.kind]}
              {error.status ? <span className="ml-1 text-[var(--lg-text-muted)] font-normal">· {error.status}</span> : null}
            </span>
            <button
              onClick={onDismiss}
              aria-label="Dismiss"
              className="p-0.5 text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="mt-0.5 text-xs text-[var(--lg-text-secondary)] break-words">
            {error.message}
          </p>
          <div className="mt-2 flex items-center gap-2 text-[10px]">
            {displayCode ? (
              <button
                onClick={onCopy}
                title="Copy the error code + context so support can grep logs"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--lg-border-faint)] bg-[var(--lg-tint)] text-[var(--lg-text-primary)] font-mono hover:border-[var(--lg-accent)]"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{displayCode}</span>
              </button>
            ) : (
              <span className="text-[var(--lg-text-muted)] italic">no error code</span>
            )}
            <span className="text-[var(--lg-text-muted)] tabular-nums">{formatTime(error.timestamp)}</span>
            {error.source && (
              <span className="text-[var(--lg-text-muted)]">· {error.source}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
