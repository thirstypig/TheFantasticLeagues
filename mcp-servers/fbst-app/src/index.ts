#!/usr/bin/env node
/**
 * fbst-app MCP server — exposes FBST app actions (wire-list owner CRUD +
 * commissioner reducer) as Claude-callable tools.
 *
 * Entry point spawned by `.mcp.json` at the repo root. Reads:
 *   - FBST_API_BASE  (default: http://localhost:4010)
 *   - FBST_AUTH_TOKEN (Supabase JWT; required for any tool call)
 *
 * Companion server: mcp-servers/mlb-data/ (read-only MLB API proxy).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FbstApiClient } from "./apiClient.js";
import { registerWireListTools } from "./tools.js";

const client = new FbstApiClient();

const server = new McpServer({
  name: "fbst-app",
  version: "1.0.0",
});

registerWireListTools(server, client);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `fbst-app MCP server running on stdio (auth: ${client.hasToken() ? "token-present" : "NO_TOKEN — write tools will fail"})`,
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
