import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTransactionTools, TRANSACTION_TOOL_NAMES } from "../src/tools/transactionTools.js";
import { FbstApiClient } from "../src/apiClient.js";

function makeServer(): { server: McpServer; registered: Set<string> } {
  const server = new McpServer({ name: "fbst-app-test", version: "0.0.0" });
  const registered = new Set<string>();
  const original = server.tool.bind(server);
  // @ts-expect-error — overriding for spy
  server.tool = (name: string, ...rest: unknown[]) => {
    registered.add(name);
    // @ts-expect-error
    return original(name, ...rest);
  };
  return { server, registered };
}

describe("transaction tool registration", () => {
  it("registers all 3 documented tool names", () => {
    const { server, registered } = makeServer();
    const client = new FbstApiClient({ baseUrl: "http://localhost:0", token: "stub" });
    registerTransactionTools(server, client);
    for (const name of TRANSACTION_TOOL_NAMES) {
      expect(registered.has(name)).toBe(true);
    }
    expect(TRANSACTION_TOOL_NAMES.length).toBe(3);
  });

  it("tool name list is unique", () => {
    expect(new Set(TRANSACTION_TOOL_NAMES).size).toBe(TRANSACTION_TOOL_NAMES.length);
  });

  it("players_get_eligible_slots calls GET /api/players/:mlbId/eligible-slots with leagueId", async () => {
    const client = new FbstApiClient({ baseUrl: "http://localhost:0", token: "stub" });
    const requestSpy = vi.spyOn(client, "request").mockResolvedValueOnce({ slots: ["2B", "MI"] });

    const server = new McpServer({ name: "test", version: "0.0.0" });
    let capturedHandler: ((args: { mlbId: number; leagueId: number }) => Promise<unknown>) | undefined;
    // @ts-expect-error — overriding for spy
    server.tool = (name: string, _desc: string, _schema: unknown, handler: typeof capturedHandler) => {
      if (name === "players_get_eligible_slots") capturedHandler = handler;
    };
    registerTransactionTools(server, client);

    expect(capturedHandler).toBeDefined();
    await capturedHandler!({ mlbId: 642731, leagueId: 20 });
    expect(requestSpy).toHaveBeenCalledWith("GET", "/api/players/642731/eligible-slots", { query: { leagueId: 20 } });
  });

  it("transactions_preview_claim calls POST /api/transactions/claim/preview with body", async () => {
    const client = new FbstApiClient({ baseUrl: "http://localhost:0", token: "stub" });
    const requestSpy = vi.spyOn(client, "request").mockResolvedValueOnce({ ok: true });

    const server = new McpServer({ name: "test", version: "0.0.0" });
    let capturedHandler: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
    // @ts-expect-error — overriding for spy
    server.tool = (name: string, _desc: string, _schema: unknown, handler: typeof capturedHandler) => {
      if (name === "transactions_preview_claim") capturedHandler = handler;
    };
    registerTransactionTools(server, client);

    expect(capturedHandler).toBeDefined();
    await capturedHandler!({ leagueId: 20, teamId: 147, mlbId: 642731, dropPlayerId: 600 });
    expect(requestSpy).toHaveBeenCalledWith("POST", "/api/transactions/claim/preview", {
      body: { leagueId: 20, teamId: 147, mlbId: 642731, dropPlayerId: 600 },
    });
  });

  it("transactions_execute_claim calls POST /api/transactions/claim with body", async () => {
    const client = new FbstApiClient({ baseUrl: "http://localhost:0", token: "stub" });
    const requestSpy = vi.spyOn(client, "request").mockResolvedValueOnce({ success: true, playerId: 100 });

    const server = new McpServer({ name: "test", version: "0.0.0" });
    let capturedHandler: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
    // @ts-expect-error — overriding for spy
    server.tool = (name: string, _desc: string, _schema: unknown, handler: typeof capturedHandler) => {
      if (name === "transactions_execute_claim") capturedHandler = handler;
    };
    registerTransactionTools(server, client);

    expect(capturedHandler).toBeDefined();
    await capturedHandler!({ leagueId: 20, teamId: 147, playerId: 100, dropPlayerId: 600 });
    expect(requestSpy).toHaveBeenCalledWith("POST", "/api/transactions/claim", {
      body: { leagueId: 20, teamId: 147, playerId: 100, dropPlayerId: 600 },
    });
  });

  it("transactions_execute_claim omits undefined optional fields from body", async () => {
    const client = new FbstApiClient({ baseUrl: "http://localhost:0", token: "stub" });
    const requestSpy = vi.spyOn(client, "request").mockResolvedValueOnce({ success: true, playerId: 100 });

    const server = new McpServer({ name: "test", version: "0.0.0" });
    let capturedHandler: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
    // @ts-expect-error — overriding for spy
    server.tool = (name: string, _desc: string, _schema: unknown, handler: typeof capturedHandler) => {
      if (name === "transactions_execute_claim") capturedHandler = handler;
    };
    registerTransactionTools(server, client);

    await capturedHandler!({ leagueId: 20, teamId: 147, mlbId: 642731 });
    const [, , callArgs] = requestSpy.mock.calls[0];
    const body = (callArgs as { body: Record<string, unknown> }).body;
    expect(body).not.toHaveProperty("dropPlayerId");
    expect(body).not.toHaveProperty("effectiveDate");
    expect(body).not.toHaveProperty("slotChanges");
  });
});
