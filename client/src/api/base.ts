
import { JsonError } from './types';

/**
 * Thrown by fetchJsonApi when the server returns non-2xx or the response
 * body isn't valid JSON. Carries enough context for the user-facing error
 * UI to show a copyable error code that matches server logs.
 *
 * Two correlation strings are surfaced:
 *   - `ref`: user-visible ERR-prefixed code (e.g. "ERR-a3f7b291"). Prefer
 *     this in UI and when users paste codes back to support.
 *   - `requestId`: the raw prefix-less id. Useful for log grep queries
 *     where the prefix is noise.
 *
 * `detail` is populated only when the caller is an admin — the server
 * includes the true error message instead of the generic envelope.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly url: string;
  readonly requestId: string | null;
  readonly ref: string | null;
  readonly detail: string | null;
  readonly body: unknown;
  readonly serverMessage: string | null;

  constructor(params: {
    message: string;
    status: number;
    url: string;
    requestId: string | null;
    ref?: string | null;
    detail?: string | null;
    body: unknown;
    serverMessage?: string | null;
  }) {
    super(params.message);
    this.name = "ApiError";
    this.status = params.status;
    this.url = params.url;
    this.requestId = params.requestId;
    this.ref = params.ref ?? null;
    this.detail = params.detail ?? null;
    this.body = params.body;
    this.serverMessage = params.serverMessage ?? null;
  }

  /**
   * Best display code for the toast / error boundary / copy-to-clipboard.
   * Prefers the ERR-prefixed form; falls back to raw requestId if the
   * server is older and didn't populate `ref`.
   */
  displayCode(): string | null {
    return this.ref ?? (this.requestId ? `ERR-${this.requestId}` : null);
  }
}

/**
 * Module-level ref holding the most recent X-Request-Id observed on any API
 * response. React error boundaries use this to surface a code even when they
 * catch a non-ApiError (e.g. a TypeError from bad render code). It's a best-
 * effort correlation — not a guarantee the error is tied to that request.
 */
let lastRequestId: string | null = null;
export function getLastRequestId(): string | null {
  return lastRequestId;
}

const RAW_BASE: string =
  import.meta.env.VITE_API_BASE ??
  import.meta.env.VITE_API_BASE_URL ??
  ""; // Default to empty string for unified deployments (relative paths)

export const API_BASE: string = (() => {
  const b = String(RAW_BASE).replace(/\/+$/, "");
  // If base is empty, we want it to be /api
  if (!b || b === "") return "/api";
  return b.endsWith("/api") ? b : `${b}/api`;
})();

export const MLB_API_BASE = "https://statsapi.mlb.com/api/v1";


import { supabase } from '../lib/supabase';

const DEFAULT_TIMEOUT_MS = 30_000;

export async function fetchJsonApi<T>(url: string, init?: RequestInit): Promise<T> {
  // Get current session token
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...init?.headers as Record<string, string>
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Automatically add Content-Type if body is present and not already set
  if (init?.body && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  // 30s timeout — prevents indefinite hangs on stalled connections
  const timeoutSignal = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;

  const res = await fetch(url, {
    ...init,
    headers,
    signal,
    credentials: "omit", // Supabase uses headers, not cookies
  });

  const requestId = res.headers.get("x-request-id");
  if (requestId) lastRequestId = requestId;

  const text = await res.text();
  const maybeJson = (() => {
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  })();

  if (!res.ok) {
    const errorBody = maybeJson as
      | (JsonError & { requestId?: string; ref?: string; detail?: string })
      | null;
    const serverMessage = (errorBody && (errorBody.error || errorBody.message)) || null;
    const bodyRequestId = errorBody?.requestId ?? null;
    const bodyRef = errorBody?.ref ?? null;
    const bodyDetail = errorBody?.detail ?? null;
    // When the caller is an admin, the server includes `detail` with the real
    // error message. Prefer it over the generic envelope for display.
    const msg =
      bodyDetail ||
      serverMessage ||
      (text ? `HTTP ${res.status} for ${url} — ${text.slice(0, 180)}` : `HTTP ${res.status} for ${url}`);
    throw new ApiError({
      message: msg,
      status: res.status,
      url,
      requestId: requestId ?? bodyRequestId,
      ref: bodyRef,
      detail: bodyDetail,
      body: maybeJson ?? text,
      serverMessage,
    });
  }

  return (maybeJson ?? ({} as T)) as T;
}

export async function fetchJsonPublic<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    credentials: "omit",
  });

  const requestId = res.headers.get("x-request-id");
  if (requestId) lastRequestId = requestId;

  const text = await res.text();
  const maybeJson = (() => {
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  })();

  if (!res.ok) {
    const errorBody = maybeJson as
      | (JsonError & { requestId?: string; ref?: string; detail?: string })
      | null;
    const serverMessage = (errorBody && (errorBody.error || errorBody.message)) || null;
    const bodyRequestId = errorBody?.requestId ?? null;
    const bodyRef = errorBody?.ref ?? null;
    const bodyDetail = errorBody?.detail ?? null;
    // When the caller is an admin, the server includes `detail` with the real
    // error message. Prefer it over the generic envelope for display.
    const msg =
      bodyDetail ||
      serverMessage ||
      (text ? `HTTP ${res.status} for ${url} — ${text.slice(0, 180)}` : `HTTP ${res.status} for ${url}`);
    throw new ApiError({
      message: msg,
      status: res.status,
      url,
      requestId: requestId ?? bodyRequestId,
      ref: bodyRef,
      detail: bodyDetail,
      body: maybeJson ?? text,
      serverMessage,
    });
  }

  return (maybeJson ?? ({} as T)) as T;
}

/**
 * Fetch with auth token but without Content-Type (for multipart FormData uploads).
 * Use fetchJsonApi for JSON requests instead.
 */
export async function fetchWithAuth(url: string, init?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const headers: Record<string, string> = {
    ...init?.headers as Record<string, string>,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...init,
    headers,
    credentials: "omit",
  });
}

export function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parse baseball innings pitched notation to true decimal.
 * MLB uses "5.2" to mean 5⅔ innings, not 5.2 decimal.
 * The fractional part represents thirds: .0=0, .1=⅓, .2=⅔.
 */
export function parseIP(v: unknown): number {
  const s = String(v ?? "0").trim();
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 10);
  return whole + frac / 3;
}

export function fmt2(v: number): string {
  if (!Number.isFinite(v)) return "";
  return v.toFixed(2);
}

export function fmt3Avg(h: number, ab: number): string {
  if (!ab) return ".000";
  const s = (h / ab).toFixed(3);
  return s.startsWith("0") ? s.slice(1) : s;
}

export function fmtRate(v: number): string {
  if (!Number.isFinite(v)) return ".000";
  const s = v.toFixed(3);
  return s.startsWith("0") ? s.slice(1) : s;
}

/** AVG with 4 decimal places (.2576) — matches FanGraphs display */
export function fmtAvg4(v: number): string {
  if (!Number.isFinite(v)) return ".0000";
  const s = v.toFixed(4);
  return s.startsWith("0") ? s.slice(1) : s;
}

/** WHIP with 3 decimal places (1.077) — matches FanGraphs display */
export function fmtWhip(v: number): string {
  if (!Number.isFinite(v)) return "0.000";
  return v.toFixed(3);
}

export function yyyyMmDd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function addDays(d: Date, delta: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + delta);
  return x;
}
