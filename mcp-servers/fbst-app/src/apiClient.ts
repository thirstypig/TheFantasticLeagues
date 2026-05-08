/**
 * Thin HTTP client for the FBST API. Used by the fbst-app MCP server to
 * proxy agent tool calls to the live Express endpoints.
 *
 * Auth: reads a Supabase JWT from `FBST_AUTH_TOKEN` (an env var injected via
 * `.mcp.json`). Tools fail clean with a clear message if the token is unset.
 *
 * Base URL: reads `FBST_API_BASE` (defaults to http://localhost:4010 — the
 * Express dev server's port per MASTER-PORTS.md). Production deployments
 * should set this to https://app.thefantasticleagues.com.
 */

export class FbstApiError extends Error {
  status: number;
  body: unknown;
  code?: string;
  constructor(status: number, message: string, body: unknown, code?: string) {
    super(message);
    this.name = "FbstApiError";
    this.status = status;
    this.body = body;
    this.code = code;
  }
}

export interface FbstApiClientOptions {
  baseUrl?: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

export class FbstApiClient {
  private baseUrl: string;
  private token: string | undefined;
  private fetchImpl: typeof fetch;

  constructor(opts: FbstApiClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.FBST_API_BASE ?? "http://localhost:4010").replace(/\/+$/, "");
    this.token = opts.token ?? process.env.FBST_AUTH_TOKEN;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  hasToken(): boolean {
    return typeof this.token === "string" && this.token.length > 0;
  }

  private requireToken(): string {
    if (!this.hasToken()) {
      throw new FbstApiError(
        401,
        "FBST_AUTH_TOKEN env var is not set. Provide a Supabase JWT via .mcp.json before invoking write tools.",
        null,
      );
    }
    return this.token!;
  }

  async request<T = unknown>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    opts: { body?: unknown; query?: Record<string, string | number | undefined> } = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + (path.startsWith("/") ? path : `/${path}`));
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    headers["Authorization"] = `Bearer ${this.requireToken()}`;

    const res = await this.fetchImpl(url.toString(), {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    const text = await res.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      const body = parsed as { error?: string; code?: string } | null;
      const msg = body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `HTTP ${res.status}`;
      const code = body && typeof body === "object" && "code" in body && typeof body.code === "string"
        ? body.code
        : undefined;
      throw new FbstApiError(res.status, msg, parsed, code);
    }

    return parsed as T;
  }
}

export function formatError(err: unknown): string {
  if (err instanceof FbstApiError) {
    const codeStr = err.code ? ` (${err.code})` : "";
    return `Error ${err.status}${codeStr}: ${err.message}`;
  }
  if (err instanceof Error) return `Error: ${err.message}`;
  return `Error: ${String(err)}`;
}
