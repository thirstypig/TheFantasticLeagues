import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerStandingsTools, STANDINGS_TOOL_NAMES } from "../src/tools/standings.js";
import { FbstApiClient } from "../src/apiClient.js";

function makeServer(): { server: McpServer; registered: Set<string> } {
  const server = new McpServer({ name: "fbst-app-test", version: "0.0.0" });
  const registered = new Set<string>();
  // Spy on .tool() — wrap original.
  const original = server.tool.bind(server);
  // @ts-expect-error — overriding for spy
  server.tool = (name: string, ...rest: unknown[]) => {
    registered.add(name);
    // @ts-expect-error
    return original(name, ...rest);
  };
  return { server, registered };
}

describe("standings tool registration", () => {
  it("registers all 4 documented tool names", () => {
    const { server, registered } = makeServer();
    const client = new FbstApiClient({ baseUrl: "http://localhost:0", token: "stub" });
    registerStandingsTools(server, client);
    for (const name of STANDINGS_TOOL_NAMES) {
      expect(registered.has(name)).toBe(true);
    }
    expect(STANDINGS_TOOL_NAMES.length).toBe(4);
  });

  it("tool name list is unique", () => {
    expect(new Set(STANDINGS_TOOL_NAMES).size).toBe(STANDINGS_TOOL_NAMES.length);
  });

  it("standings_get_waiver_priority calls GET /api/standings/waiver-priority with leagueId", async () => {
    const client = new FbstApiClient({ baseUrl: "http://localhost:0", token: "stub" });
    const requestSpy = vi.spyOn(client, "request").mockResolvedValueOnce({ data: "ok" });

    const { server } = makeServer();
    registerStandingsTools(server, client);

    // Extract the registered handler by intercepting server.tool
    const server2 = new McpServer({ name: "fbst-app-test-2", version: "0.0.0" });
    let capturedHandler: ((args: { leagueId: number }) => Promise<unknown>) | undefined;
    // @ts-expect-error — overriding for spy
    server2.tool = (name: string, _desc: string, _schema: unknown, handler: (args: { leagueId: number }) => Promise<unknown>) => {
      if (name === "standings_get_waiver_priority") capturedHandler = handler;
    };
    registerStandingsTools(server2, client);

    expect(capturedHandler).toBeDefined();
    await capturedHandler!({ leagueId: 20 });
    expect(requestSpy).toHaveBeenCalledWith("GET", "/api/standings/waiver-priority", { query: { leagueId: 20 } });
  });

  it("standings_get_period calls GET /api/standings/period/current with leagueId", async () => {
    const client = new FbstApiClient({ baseUrl: "http://localhost:0", token: "stub" });
    const requestSpy = vi.spyOn(client, "request").mockResolvedValueOnce({ data: "ok" });

    const server2 = new McpServer({ name: "fbst-app-test-3", version: "0.0.0" });
    let capturedHandler: ((args: { leagueId: number }) => Promise<unknown>) | undefined;
    // @ts-expect-error — overriding for spy
    server2.tool = (name: string, _desc: string, _schema: unknown, handler: (args: { leagueId: number }) => Promise<unknown>) => {
      if (name === "standings_get_period") capturedHandler = handler;
    };
    registerStandingsTools(server2, client);

    expect(capturedHandler).toBeDefined();
    await capturedHandler!({ leagueId: 20 });
    expect(requestSpy).toHaveBeenCalledWith("GET", "/api/standings/period/current", { query: { leagueId: 20 } });
  });

  it("standings_get_season calls GET /api/standings/season with leagueId", async () => {
    const client = new FbstApiClient({ baseUrl: "http://localhost:0", token: "stub" });
    const requestSpy = vi.spyOn(client, "request").mockResolvedValueOnce({ data: "ok" });

    const server2 = new McpServer({ name: "fbst-app-test-4", version: "0.0.0" });
    let capturedHandler: ((args: { leagueId: number }) => Promise<unknown>) | undefined;
    // @ts-expect-error — overriding for spy
    server2.tool = (name: string, _desc: string, _schema: unknown, handler: (args: { leagueId: number }) => Promise<unknown>) => {
      if (name === "standings_get_season") capturedHandler = handler;
    };
    registerStandingsTools(server2, client);

    expect(capturedHandler).toBeDefined();
    await capturedHandler!({ leagueId: 20 });
    expect(requestSpy).toHaveBeenCalledWith("GET", "/api/standings/season", { query: { leagueId: 20 } });
  });
});
