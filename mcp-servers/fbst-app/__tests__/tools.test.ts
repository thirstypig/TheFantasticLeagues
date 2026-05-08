import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerWireListTools, WIRE_LIST_TOOL_NAMES } from "../src/tools.js";
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

describe("wire-list tool registration", () => {
  it("registers all 12 documented tool names", () => {
    const { server, registered } = makeServer();
    const client = new FbstApiClient({ baseUrl: "http://localhost:0", token: "stub" });
    registerWireListTools(server, client);
    for (const name of WIRE_LIST_TOOL_NAMES) {
      expect(registered.has(name)).toBe(true);
    }
    expect(WIRE_LIST_TOOL_NAMES.length).toBe(12);
  });

  it("tool name list is unique", () => {
    expect(new Set(WIRE_LIST_TOOL_NAMES).size).toBe(WIRE_LIST_TOOL_NAMES.length);
  });
});
