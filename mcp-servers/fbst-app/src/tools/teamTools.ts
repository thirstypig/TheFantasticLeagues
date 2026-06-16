/**
 * Team read MCP tool definitions.
 *
 *   team_get_period_roster  — GET /api/teams/:teamId/period-roster?periodId=
 *   team_get_roster_hub     — GET /api/teams/:teamId/roster-hub
 *
 * Lets agents query team rosters: historical (period-roster) or current (roster-hub).
 * roster-hub is the richest player payload in the app — stats, slot, eligibility,
 * gamesByPos, IL status, price, keeper flag.
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


  server.tool(
    "team_get_roster_hub",
    "Get the current active roster hub for a team. Returns the richest player payload in the app: slot assignment, position eligibility, period stats (AB/H/HR/R/RBI/SB for hitters; IP/ERA/WHIP/W/SV/K for pitchers), gamesByPos (real MLB GP data when posGamesSource is \"real\"; synthetic 60/40 fallback otherwise), IL status, price, and keeper flag. Use for position-eligibility analysis, GP-by-position queries, or commissioner roster audits.",
    {
      teamId: z.number().int().positive().describe("Team DB id (Team.id)"),
    },
    async ({ teamId }) => {
      try {
        const data = await client.request("GET", `/api/teams/${teamId}/roster-hub`);
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );
}

export const TEAM_TOOL_NAMES = ["team_get_period_roster", "team_get_roster_hub"] as const;
