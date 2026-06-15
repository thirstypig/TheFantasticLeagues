/**
 * Team read MCP tool definitions.
 *
 *   team_get_period_roster  — GET /api/teams/:teamId/period-roster?periodId=
 *
 * Lets agents query historical roster composition by period — who was on a
 * team during period X? Useful for commissioner audit, standings verification,
 * and wire-list context. Complements transaction tools (current-state) with
 * historical read coverage.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FbstApiClient, formatError } from "../apiClient.js";

type TextResult = { content: Array<{ type: "text"; text: string }> };

function ok(data: unknown): TextResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown): TextResult {
  return { content: [{ type: "text" as const, text: formatError(err) }] };
}

export function registerTeamTools(server: McpServer, client: FbstApiClient): void {
  server.tool(
    "team_get_period_roster",
    "Get the roster for a team during a specific scoring period (historical view). Returns players who owned at least one day of the period, with per-player period stats if available. Excludes players released exactly at period start (they belong to the prior period). Useful for commissioner audit, standings verification, and wire-list context.",
    {
      teamId: z.number().int().positive().describe("Team DB id (Team.id)"),
      periodId: z.number().int().positive().describe("Scoring period DB id (Period.id)"),
    },
    async ({ teamId, periodId }) => {
      try {
        const data = await client.request("GET", `/api/teams/${teamId}/period-roster`, {
          query: { periodId },
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );
}

export const TEAM_TOOL_NAMES = ["team_get_period_roster"] as const;
