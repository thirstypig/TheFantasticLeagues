import { describe, it, expect } from "vitest";
import { FbstApiClient, FbstApiError, formatError } from "../src/apiClient.js";

function fakeFetch(handler: (req: { url: string; method: string; headers: Record<string, string>; body: string | undefined }) => { status: number; body: unknown }): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const headers: Record<string, string> = {};
    if (init?.headers) {
      for (const [k, v] of Object.entries(init.headers as Record<string, string>)) headers[k] = v;
    }
    const { status, body } = handler({
      url,
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    const text = body === undefined ? "" : JSON.stringify(body);
    return new Response(text, { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

describe("FbstApiClient", () => {
  it("attaches Bearer token and base URL", async () => {
    let captured: { url?: string; auth?: string } = {};
    const client = new FbstApiClient({
      baseUrl: "https://example.test",
      token: "tok-123",
      fetchImpl: fakeFetch((r) => {
        captured = { url: r.url, auth: r.headers["Authorization"] };
        return { status: 200, body: { ok: true } };
      }),
    });
    const res = await client.request("GET", "/api/wire-list/periods/active", { query: { leagueId: 7 } });
    expect(res).toEqual({ ok: true });
    expect(captured.url).toBe("https://example.test/api/wire-list/periods/active?leagueId=7");
    expect(captured.auth).toBe("Bearer tok-123");
  });

  it("throws FbstApiError when token is missing", async () => {
    const client = new FbstApiClient({
      baseUrl: "https://example.test",
      token: undefined,
      fetchImpl: fakeFetch(() => ({ status: 200, body: {} })),
    });
    expect(client.hasToken()).toBe(false);
    await expect(client.request("GET", "/api/wire-list/periods/active")).rejects.toMatchObject({
      name: "FbstApiError",
      status: 401,
    });
  });

  it("surfaces stable error code from API response", async () => {
    const client = new FbstApiClient({
      baseUrl: "https://example.test",
      token: "tok",
      fetchImpl: fakeFetch(() => ({ status: 409, body: { error: "Period already locked", code: "PERIOD_NOT_PENDING" } })),
    });
    try {
      await client.request("POST", "/api/wire-list/periods/1/lock");
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FbstApiError);
      const e = err as FbstApiError;
      expect(e.status).toBe(409);
      expect(e.code).toBe("PERIOD_NOT_PENDING");
      expect(formatError(e)).toContain("PERIOD_NOT_PENDING");
    }
  });

  it("serializes JSON bodies and sets Content-Type", async () => {
    let captured: { body?: string; contentType?: string } = {};
    const client = new FbstApiClient({
      baseUrl: "https://example.test",
      token: "t",
      fetchImpl: fakeFetch((r) => {
        captured = { body: r.body, contentType: r.headers["Content-Type"] };
        return { status: 201, body: { id: 5 } };
      }),
    });
    await client.request("POST", "/api/wire-list/periods/1/adds", { body: { teamId: 2, playerId: 3 } });
    expect(captured.contentType).toBe("application/json");
    expect(JSON.parse(captured.body!)).toEqual({ teamId: 2, playerId: 3 });
  });
});
