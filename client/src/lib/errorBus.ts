/**
 * Simple pub/sub for surfacing errors to a global UI layer from anywhere —
 * including non-React code (API clients, hooks). Avoids threading a React
 * Context dependency into every layer that might produce an error.
 *
 * Usage:
 *   import { reportError } from "../lib/errorBus";
 *
 *   try {
 *     await fetchJsonApi(...);
 *   } catch (err) {
 *     reportError(err, { source: "trade-propose" });
 *   }
 *
 * The ErrorProvider (mounted once in main.tsx) subscribes to emitted events
 * and renders a stack of dismissible toasts.
 */

import { ApiError, getLastRequestId } from "../api/base";

export interface SurfacedError {
  /** Unique id for React keying + dedupe */
  id: string;
  /** Short user-facing message */
  message: string;
  /** Correlation id for log grepping (null if we never saw one) */
  requestId: string | null;
  /** ERR-prefixed display code (preferred over raw requestId in UI) */
  ref: string | null;
  /** HTTP status for API errors; null for React/runtime errors */
  status: number | null;
  /** Category for icon/color selection */
  kind: "api" | "runtime" | "network";
  /** Optional caller-supplied context tag, e.g. "auction-bid" */
  source?: string;
  /** ms since epoch */
  timestamp: number;
}

type Listener = (err: SurfacedError) => void;

const listeners = new Set<Listener>();

/** Subscribe. Returns an unsubscribe fn. */
export function subscribeErrors(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Report an error to the UI layer. Accepts any thrown value; normalizes
 * into a {@link SurfacedError}. Safe to call from outside React.
 */
export function reportError(err: unknown, opts: { source?: string } = {}): void {
  const surfaced = normalize(err, opts.source);
  for (const listener of listeners) {
    try {
      listener(surfaced);
    } catch {
      // Never let a buggy listener swallow the original error.
    }
  }
}

function normalize(err: unknown, source?: string): SurfacedError {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const timestamp = Date.now();

  if (err instanceof ApiError) {
    // Network-level failures (fetch rejects before we get a response) produce
    // TypeErrors in most browsers — those come through as non-ApiError below.
    const isNetworkish = err.status === 0 || err.status === 504;
    // Admins receive `detail` with the real server error message — prefer it
    // over the generic envelope message. Non-admins fall back to serverMessage.
    const message = err.detail || err.serverMessage || err.message || "Request failed";
    return {
      id,
      message,
      requestId: err.requestId,
      ref: err.ref ?? (err.requestId ? `ERR-${err.requestId}` : null),
      status: err.status,
      kind: isNetworkish ? "network" : "api",
      source,
      timestamp,
    };
  }

  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    const requestId = getLastRequestId();
    return {
      id,
      message: "Network error — check your connection and try again.",
      requestId,
      ref: requestId ? `ERR-${requestId}` : null,
      status: null,
      kind: "network",
      source,
      timestamp,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  const requestId = getLastRequestId();
  return {
    id,
    message: message || "Something went wrong.",
    // Best-effort — use the last seen request id. May be unrelated; the UI
    // should label it as "last request" vs. "for this error" if we want
    // precision later.
    requestId,
    ref: requestId ? `ERR-${requestId}` : null,
    status: null,
    kind: "runtime",
    source,
    timestamp,
  };
}
