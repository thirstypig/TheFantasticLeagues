/**
 * Contract tests for the fbst-app MCP server's 12 wire-list tools.
 *
 * Coverage matrix:
 *   1. Input-schema validation (rejects malformed payloads, accepts minimal
 *      valid payloads) — 4 representative tools
 *   2. HTTP shape — every tool: URL, method, body shape, query params
 *   3. Auth flow — missing token fails clean; present token sends Bearer header
 *   4. Error-code passthrough — server WireListErrorCode bubbles up via FbstApiError
 *   5. Schema reuse drift detector — tool param schemas accept the SAME inputs
 *      as the shared `shared/api/wireList.ts` schemas (so a future refactor that
 *      copy-pastes the schema instead of importing it gets caught)
 *
 * Test strategy: instead of round-tripping through MCP transport, we spy on
 * `server.tool()` to capture each tool's (paramsShape, callback). The shape
 * lets us reconstruct the same Zod object the MCP runtime would validate
 * against; the callback lets us drive the tool with a stub fetch.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerWireListTools, WIRE_LIST_TOOL_NAMES } from "../src/tools.js";
import { FbstApiClient, FbstApiError } from "../src/apiClient.js";
import {
  CreateAddEntryBodySchema,
  CreateDropEntryBodySchema,
  ReorderEntriesBodySchema,
  FailOutcomeBodySchema,
} from "../../../shared/api/wireList.js";

// ─── Capture helpers ────────────────────────────────────────────────

type Captured = {
  description: string;
  paramsShape: Record<string, z.ZodTypeAny>;
  cb: (args: any) => Promise<{ content: Array<{ type: string; text: string }> }>;
};

function captureTools(client: FbstApiClient): Map<string, Captured> {
  const captured = new Map<string, Captured>();
  const server = new McpServer({ name: "fbst-app-test", version: "0.0.0" });
  const original = server.tool.bind(server);
  // @ts-expect-error — overriding for capture
  server.tool = (name: string, description: string, paramsShape: any, cb: any) => {
    captured.set(name, { description, paramsShape, cb });
    // Still call original so MCP-side validation is exercised (catches
    // bad shapes like the priority-on-add bug that crashed registration).
    return (original as any)(name, description, paramsShape, cb);
  };
  registerWireListTools(server, client);
  return captured;
}

type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
};

function makeStubFetch(
  responder: (call: FetchCall) => { status: number; body: unknown },
  log: FetchCall[] = [],
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const headers: Record<string, string> = {};
    if (init?.headers) {
      for (const [k, v] of Object.entries(init.headers as Record<string, string>)) headers[k] = v;
    }
    const call: FetchCall = {
      url,
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    log.push(call);
    const { status, body } = responder(call);
    const text = body === undefined ? "" : JSON.stringify(body);
    return new Response(text, { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

function makeClient(opts: {
  token?: string | undefined;
  responder?: (c: FetchCall) => { status: number; body: unknown };
} = {}): { client: FbstApiClient; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const responder = opts.responder ?? (() => ({ status: 200, body: { ok: true } }));
  const client = new FbstApiClient({
    baseUrl: "https://api.test",
    // hasOwnProperty check: explicitly-undefined token disables auth even
    // if process.env.FBST_AUTH_TOKEN happens to be set in the dev shell
    token: "token" in opts ? opts.token : "stub-token",
    fetchImpl: makeStubFetch(responder, calls),
  });
  return { client, calls };
}

// ─── 1. Input-schema validation ─────────────────────────────────────

describe("input-schema validation (drift catches malformed payloads)", () => {
  let captured: Map<string, Captured>;

  beforeEach(() => {
    const { client } = makeClient();
    captured = captureTools(client);
  });

  function shape(tool: string): z.ZodObject<any> {
    return z.object(captured.get(tool)!.paramsShape);
  }

  // Pick 4 representative tools spanning: read-with-query, write-with-body,
  // commissioner-by-id, atomic-reorder.

  describe("wire_list_get_active_period (LeagueIdInput)", () => {
    const tool = "wire_list_get_active_period";

    it("accepts a valid leagueId", () => {
      expect(shape(tool).safeParse({ leagueId: 7 }).success).toBe(true);
    });

    it("rejects missing leagueId", () => {
      expect(shape(tool).safeParse({}).success).toBe(false);
    });

    it("rejects string leagueId (wrong type)", () => {
      expect(shape(tool).safeParse({ leagueId: "7" }).success).toBe(false);
    });

    it("rejects negative leagueId", () => {
      expect(shape(tool).safeParse({ leagueId: -1 }).success).toBe(false);
    });

    it("rejects zero leagueId (must be positive)", () => {
      expect(shape(tool).safeParse({ leagueId: 0 }).success).toBe(false);
    });

    it("rejects non-integer leagueId", () => {
      expect(shape(tool).safeParse({ leagueId: 1.5 }).success).toBe(false);
    });
  });

  describe("wire_list_create_add (composed schema)", () => {
    const tool = "wire_list_create_add";

    it("accepts minimal valid payload", () => {
      expect(shape(tool).safeParse({ periodId: 1, teamId: 2, playerId: 3 }).success).toBe(true);
    });

    it("rejects missing required playerId", () => {
      expect(shape(tool).safeParse({ periodId: 1, teamId: 2 }).success).toBe(false);
    });

    it("rejects negative teamId", () => {
      expect(shape(tool).safeParse({ periodId: 1, teamId: -1, playerId: 3 }).success).toBe(false);
    });

    it("rejects negative playerId", () => {
      expect(shape(tool).safeParse({ periodId: 1, teamId: 2, playerId: -3 }).success).toBe(false);
    });
  });

  describe("wire_list_create_drop (with optional dropMode enum)", () => {
    const tool = "wire_list_create_drop";

    it("accepts payload without optional dropMode", () => {
      expect(shape(tool).safeParse({ periodId: 1, teamId: 2, playerId: 3 }).success).toBe(true);
    });

    it("accepts dropMode=RELEASE", () => {
      expect(shape(tool).safeParse({ periodId: 1, teamId: 2, playerId: 3, dropMode: "RELEASE" }).success).toBe(true);
    });

    it("accepts dropMode=IL_STASH", () => {
      expect(shape(tool).safeParse({ periodId: 1, teamId: 2, playerId: 3, dropMode: "IL_STASH" }).success).toBe(true);
    });

    it("rejects bogus dropMode", () => {
      expect(shape(tool).safeParse({ periodId: 1, teamId: 2, playerId: 3, dropMode: "BOGUS" }).success).toBe(false);
    });
  });

  describe("wire_list_reorder_entries (array + enum)", () => {
    const tool = "wire_list_reorder_entries";

    it("accepts a valid ADD reorder", () => {
      expect(
        shape(tool).safeParse({ periodId: 1, kind: "ADD", teamId: 2, orderedIds: [10, 11, 12] }).success,
      ).toBe(true);
    });

    it("rejects empty orderedIds (min 1)", () => {
      expect(
        shape(tool).safeParse({ periodId: 1, kind: "ADD", teamId: 2, orderedIds: [] }).success,
      ).toBe(false);
    });

    it("rejects non-array orderedIds", () => {
      expect(
        shape(tool).safeParse({ periodId: 1, kind: "ADD", teamId: 2, orderedIds: "10,11" }).success,
      ).toBe(false);
    });

    it("rejects bogus kind", () => {
      expect(
        shape(tool).safeParse({ periodId: 1, kind: "SWAP", teamId: 2, orderedIds: [1] }).success,
      ).toBe(false);
    });
  });

  describe("wire_list_fail_add (reason required, length-bounded)", () => {
    const tool = "wire_list_fail_add";

    it("accepts a valid reason", () => {
      expect(shape(tool).safeParse({ addEntryId: 5, reason: "no roster slot" }).success).toBe(true);
    });

    it("rejects empty-string reason (min 1)", () => {
      expect(shape(tool).safeParse({ addEntryId: 5, reason: "" }).success).toBe(false);
    });

    it("rejects reason >280 chars", () => {
      expect(shape(tool).safeParse({ addEntryId: 5, reason: "x".repeat(281) }).success).toBe(false);
    });

    it("rejects missing reason — fail endpoint requires it", () => {
      // Drift sentinel: if anyone swaps FailOutcomeBodySchema for the
      // deprecated SkipOutcomeBodySchema (reason optional), this flips.
      expect(shape(tool).safeParse({ addEntryId: 5 }).success).toBe(false);
    });
  });
});

// ─── 2. HTTP shape — endpoint + method + body for every tool ────────

describe("HTTP shape (all 12 tools dispatch to the documented endpoint)", () => {
  function exec(toolName: string, input: unknown) {
    const { client, calls } = makeClient({
      responder: () => ({ status: 200, body: { ok: true } }),
    });
    const captured = captureTools(client);
    const t = captured.get(toolName)!;
    return { run: () => t.cb(input as any), calls };
  }

  it("registers all 16 documented names", () => {
    const { client } = makeClient();
    const captured = captureTools(client);
    for (const n of WIRE_LIST_TOOL_NAMES) expect(captured.has(n)).toBe(true);
    expect(captured.size).toBe(16);
  });

  it("wire_list_get_active_period → GET /api/wire-list/periods/active?leagueId=", async () => {
    const { run, calls } = exec("wire_list_get_active_period", { leagueId: 7 });
    await run();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.test/api/wire-list/periods/active?leagueId=7");
    expect(calls[0].body).toBeUndefined();
  });

  it("wire_list_list_adds → GET /api/wire-list/periods/:periodId/adds?teamId=", async () => {
    const { run, calls } = exec("wire_list_list_adds", { periodId: 12, teamId: 4 });
    await run();
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.test/api/wire-list/periods/12/adds?teamId=4");
  });

  it("wire_list_list_drops → GET /api/wire-list/periods/:periodId/drops?teamId=", async () => {
    const { run, calls } = exec("wire_list_list_drops", { periodId: 12, teamId: 4 });
    await run();
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.test/api/wire-list/periods/12/drops?teamId=4");
  });

  it("wire_list_get_results → GET /api/wire-list/periods/:periodId/results", async () => {
    const { run, calls } = exec("wire_list_get_results", { periodId: 99 });
    await run();
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.test/api/wire-list/periods/99/results");
  });

  it("wire_list_create_add → POST /adds with {teamId, playerId} (no priority field)", async () => {
    const { run, calls } = exec("wire_list_create_add", { periodId: 1, teamId: 2, playerId: 3 });
    await run();
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.test/api/wire-list/periods/1/adds");
    expect(JSON.parse(calls[0].body!)).toEqual({ teamId: 2, playerId: 3 });
    // Drift sentinel: priority is server-assigned per the schema comment in
    // shared/api/wireList.ts. If anyone re-adds the field the body shape changes.
  });

  it("wire_list_create_drop → POST /drops with optional dropMode forwarded", async () => {
    {
      const { run, calls } = exec("wire_list_create_drop", { periodId: 1, teamId: 2, playerId: 3 });
      await run();
      expect(JSON.parse(calls[0].body!)).toEqual({ teamId: 2, playerId: 3 });
    }
    {
      const { run, calls } = exec("wire_list_create_drop", {
        periodId: 1,
        teamId: 2,
        playerId: 3,
        dropMode: "IL_STASH",
      });
      await run();
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toBe("https://api.test/api/wire-list/periods/1/drops");
      expect(JSON.parse(calls[0].body!)).toEqual({ teamId: 2, playerId: 3, dropMode: "IL_STASH" });
    }
  });

  it("wire_list_reorder_entries → POST /reorder with full body", async () => {
    const { run, calls } = exec("wire_list_reorder_entries", {
      periodId: 5,
      kind: "DROP",
      teamId: 9,
      orderedIds: [101, 102, 103],
    });
    await run();
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.test/api/wire-list/periods/5/reorder");
    expect(JSON.parse(calls[0].body!)).toEqual({ kind: "DROP", teamId: 9, orderedIds: [101, 102, 103] });
  });

  it("wire_list_lock_period → POST /lock (no body)", async () => {
    const { run, calls } = exec("wire_list_lock_period", { periodId: 17 });
    await run();
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.test/api/wire-list/periods/17/lock");
    expect(calls[0].body).toBeUndefined();
  });

  it("wire_list_succeed_add → POST /adds/:id/succeed (no body)", async () => {
    const { run, calls } = exec("wire_list_succeed_add", { addEntryId: 42 });
    await run();
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.test/api/wire-list/adds/42/succeed");
    expect(calls[0].body).toBeUndefined();
  });

  it("wire_list_fail_add → POST /adds/:id/fail with {reason}", async () => {
    const { run, calls } = exec("wire_list_fail_add", { addEntryId: 42, reason: "drop list empty" });
    await run();
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.test/api/wire-list/adds/42/fail");
    expect(JSON.parse(calls[0].body!)).toEqual({ reason: "drop list empty" });
  });

  it("wire_list_skip_add → POST /adds/:id/skip", async () => {
    const { run, calls } = exec("wire_list_skip_add", { addEntryId: 42 });
    await run();
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.test/api/wire-list/adds/42/skip");
  });

  it("wire_list_finalize_period → POST /finalize", async () => {
    const { run, calls } = exec("wire_list_finalize_period", { periodId: 17 });
    await run();
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.test/api/wire-list/periods/17/finalize");
  });
});

// ─── 3. Auth flow ───────────────────────────────────────────────────

describe("auth flow", () => {
  it("includes Authorization: Bearer <token> when token is set", async () => {
    const { client, calls } = makeClient({ token: "jwt-abc" });
    const captured = captureTools(client);
    await captured.get("wire_list_get_active_period")!.cb({ leagueId: 1 });
    expect(calls[0].headers["Authorization"]).toBe("Bearer jwt-abc");
  });

  it("fails clean (no crash, structured error text) when token is unset", async () => {
    const { client, calls } = makeClient({ token: undefined });
    expect(client.hasToken()).toBe(false);
    const captured = captureTools(client);
    const result = await captured.get("wire_list_lock_period")!.cb({ periodId: 1 });
    // Tool should not have hit the network — the apiClient throws before fetch
    expect(calls).toHaveLength(0);
    // Tool returns a TextResult with the formatted error, NOT a thrown exception
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("401");
    expect(result.content[0].text).toContain("FBST_AUTH_TOKEN");
  });

  it("auth failure path is exercised across both read and write tools", async () => {
    // Both an owner-write tool and a commissioner-write tool must fail clean
    // — agents can't recover from a thrown exception in MCP transport.
    const { client } = makeClient({ token: undefined });
    const captured = captureTools(client);
    for (const tool of ["wire_list_create_add", "wire_list_finalize_period"] as const) {
      const args =
        tool === "wire_list_create_add"
          ? { periodId: 1, teamId: 2, playerId: 3 }
          : { periodId: 1 };
      const result = await captured.get(tool)!.cb(args);
      expect(result.content[0].text).toContain("401");
    }
  });
});

// ─── 4. Error-code passthrough ──────────────────────────────────────

describe("error-code passthrough (FbstApiError carries WireListErrorCode)", () => {
  it("PERIOD_NOT_PENDING from /lock surfaces as code on FbstApiError + format string", async () => {
    const { client } = makeClient({
      responder: () => ({ status: 409, body: { error: "Period already locked", code: "PERIOD_NOT_PENDING" } }),
    });
    const captured = captureTools(client);
    const result = await captured.get("wire_list_lock_period")!.cb({ periodId: 1 });
    expect(result.content[0].text).toContain("PERIOD_NOT_PENDING");
    expect(result.content[0].text).toContain("409");
  });

  it("DROP_RACE_LOST from /succeed surfaces", async () => {
    const { client } = makeClient({
      responder: () => ({
        status: 409,
        body: { error: "another succeed consumed the next drop first", code: "DROP_RACE_LOST" },
      }),
    });
    const captured = captureTools(client);
    const result = await captured.get("wire_list_succeed_add")!.cb({ addEntryId: 5 });
    expect(result.content[0].text).toContain("DROP_RACE_LOST");
  });

  it("REORDER_IDS_MISMATCH from /reorder surfaces", async () => {
    const { client } = makeClient({
      responder: () => ({
        status: 422,
        body: { error: "orderedIds must match the existing set", code: "REORDER_IDS_MISMATCH" },
      }),
    });
    const captured = captureTools(client);
    const result = await captured
      .get("wire_list_reorder_entries")!
      .cb({ periodId: 1, kind: "ADD", teamId: 2, orderedIds: [9] });
    expect(result.content[0].text).toContain("REORDER_IDS_MISMATCH");
    expect(result.content[0].text).toContain("422");
  });

  it("error without a code field still produces a structured message (not a crash)", async () => {
    const { client } = makeClient({
      responder: () => ({ status: 500, body: { error: "Internal Server Error" } }),
    });
    const captured = captureTools(client);
    const result = await captured.get("wire_list_get_results")!.cb({ periodId: 1 });
    expect(result.content[0].text).toContain("500");
    expect(result.content[0].text).toContain("Internal Server Error");
  });

  // Direct-throw assertion: when the apiClient is exercised outside the tool
  // wrapper, FbstApiError preserves the code on the instance for typed callers.
  it("FbstApiError instance carries the typed code property", async () => {
    const { client } = makeClient({
      responder: () => ({ status: 409, body: { error: "x", code: "PLAYER_NOT_FA" } }),
    });
    await expect(client.request("POST", "/api/wire-list/periods/1/adds", { body: {} })).rejects.toMatchObject({
      name: "FbstApiError",
      status: 409,
      code: "PLAYER_NOT_FA",
    } satisfies Partial<FbstApiError>);
  });
});

// ─── 5. Schema-reuse drift detector ─────────────────────────────────

/**
 * The pilot's promise: one Zod schema → client + server + MCP. The simplest
 * "is the import there" test would be satisfied by a copy-paste, so instead
 * we check that the tool's runtime schema actually behaves the same as the
 * shared schema for the fields it claims to delegate. If anyone replaces
 * `CreateAddEntryBodySchema.shape.teamId` with `z.number()` (no `.positive()`),
 * the negative-id case below flips.
 */
describe("shared schema reuse — behavior parity", () => {
  let captured: Map<string, Captured>;
  beforeEach(() => {
    const { client } = makeClient();
    captured = captureTools(client);
  });

  function shape(tool: string): z.ZodObject<any> {
    return z.object(captured.get(tool)!.paramsShape);
  }

  it("create_add.teamId/playerId behave identically to CreateAddEntryBodySchema", () => {
    const toolShape = shape("wire_list_create_add");
    // Cases where shared schema rejects → tool must also reject
    for (const bad of [-1, 0, 1.5, "2"] as const) {
      expect(CreateAddEntryBodySchema.safeParse({ teamId: bad as any, playerId: 1 }).success).toBe(false);
      expect(toolShape.safeParse({ periodId: 1, teamId: bad, playerId: 1 }).success).toBe(false);
      expect(CreateAddEntryBodySchema.safeParse({ teamId: 1, playerId: bad as any }).success).toBe(false);
      expect(toolShape.safeParse({ periodId: 1, teamId: 1, playerId: bad }).success).toBe(false);
    }
    // Positive-int passes both
    expect(CreateAddEntryBodySchema.safeParse({ teamId: 2, playerId: 3 }).success).toBe(true);
    expect(toolShape.safeParse({ periodId: 1, teamId: 2, playerId: 3 }).success).toBe(true);
  });

  it("create_drop.dropMode rejects exactly the same enum mismatches as CreateDropEntryBodySchema", () => {
    const toolShape = shape("wire_list_create_drop");
    for (const good of ["RELEASE", "IL_STASH"] as const) {
      expect(CreateDropEntryBodySchema.safeParse({ teamId: 1, playerId: 1, dropMode: good }).success).toBe(true);
      expect(toolShape.safeParse({ periodId: 1, teamId: 1, playerId: 1, dropMode: good }).success).toBe(true);
    }
    for (const bad of ["release", "TRADE", "", null] as const) {
      expect(
        CreateDropEntryBodySchema.safeParse({ teamId: 1, playerId: 1, dropMode: bad as any }).success,
      ).toBe(false);
      expect(toolShape.safeParse({ periodId: 1, teamId: 1, playerId: 1, dropMode: bad }).success).toBe(false);
    }
  });

  it("reorder.kind + orderedIds parity with ReorderEntriesBodySchema", () => {
    const toolShape = shape("wire_list_reorder_entries");
    expect(ReorderEntriesBodySchema.safeParse({ kind: "ADD", teamId: 1, orderedIds: [] }).success).toBe(false);
    expect(toolShape.safeParse({ periodId: 1, kind: "ADD", teamId: 1, orderedIds: [] }).success).toBe(false);

    expect(ReorderEntriesBodySchema.safeParse({ kind: "ADD", teamId: 1, orderedIds: [1, 2] }).success).toBe(true);
    expect(toolShape.safeParse({ periodId: 1, kind: "ADD", teamId: 1, orderedIds: [1, 2] }).success).toBe(true);

    expect(ReorderEntriesBodySchema.safeParse({ kind: "REORDER", teamId: 1, orderedIds: [1] }).success).toBe(false);
    expect(toolShape.safeParse({ periodId: 1, kind: "REORDER", teamId: 1, orderedIds: [1] }).success).toBe(false);
  });

  it("fail_add.reason parity with FailOutcomeBodySchema (length 1..280, required)", () => {
    const toolShape = shape("wire_list_fail_add");
    // empty rejects
    expect(FailOutcomeBodySchema.safeParse({ reason: "" }).success).toBe(false);
    expect(toolShape.safeParse({ addEntryId: 1, reason: "" }).success).toBe(false);
    // 280 ok, 281 not
    expect(FailOutcomeBodySchema.safeParse({ reason: "x".repeat(280) }).success).toBe(true);
    expect(toolShape.safeParse({ addEntryId: 1, reason: "x".repeat(280) }).success).toBe(true);
    expect(FailOutcomeBodySchema.safeParse({ reason: "x".repeat(281) }).success).toBe(false);
    expect(toolShape.safeParse({ addEntryId: 1, reason: "x".repeat(281) }).success).toBe(false);
    // missing rejects (this is the bit that distinguishes Fail from Skip)
    expect(FailOutcomeBodySchema.safeParse({}).success).toBe(false);
    expect(toolShape.safeParse({ addEntryId: 1 }).success).toBe(false);
  });
});
