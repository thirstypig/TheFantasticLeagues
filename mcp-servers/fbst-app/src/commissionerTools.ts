/**
 * MCP tools for commissioner and team operations.
 *
 * Tools:
 *   #218 — commissioner_get_rosters     GET /api/commissioner/:leagueId/rosters
 *   #211 — commissioner_edit_roster_entry  PATCH /api/commissioner/:leagueId/roster/:rosterId
 *   #219 — team_get_period_roster       GET /api/teams/:teamId/period-roster?periodId=
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FbstApiClient, formatError } from "./apiClient.js";

type TextResult = { content: Array<{ type: "text"; text: string }> };

function ok(data: unknown): TextResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function fail(err: unknown): TextResult {
  return { content: [{ type: "text" as const, text: formatError(err) }] };
}

export function registerCommissionerTools(server: McpServer, client: FbstApiClient): void {

  // Tool 1: #218 — Get all roster entries for a league
  server.tool(
    "commissioner_get_rosters",
    "Get all roster entries for a league. Each entry includes player.posList " +
    "(CSV of eligible roster positions, e.g. '2B,SS') and assignedPosition. " +
    "Use player.posList to determine valid positions before calling commissioner_edit_roster_entry.",
    { leagueId: z.number().int().positive().describe("League ID") },
    async ({ leagueId }) => {
      try {
        const data = await client.request("GET", `/api/commissioner/${leagueId}/rosters`);
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // Tool 2: #211 — Edit a roster entry (position, price, source)
  server.tool(
    "commissioner_edit_roster_entry",
    "Edit a roster entry's assigned position, price, or source. " +
    "Server validates position eligibility — returns POSITION_INELIGIBLE (HTTP 400) " +
    "if the slot is not in the player's posList. " +
    "Call commissioner_get_rosters first to read player.posList and determine valid slots. " +
    "Pass assignedPosition=null to clear a slot assignment. " +
    "The 'IL' slot is exempt from eligibility checks (use dedicated IL transactions instead).",
    {
      leagueId: z.number().int().positive().describe("League ID"),
      rosterId: z.number().int().positive().describe("Roster entry ID"),
      assignedPosition: z.string().max(5).nullable().optional()
        .describe("New assigned position (e.g. 'OF', '1B'). null clears the slot."),
      price: z.number().int().min(1).optional().describe("New auction price"),
      source: z.string().optional().describe("Acquisition source label"),
    },
    async ({ leagueId, rosterId, ...updates }) => {
      try {
        const data = await client.request("PATCH", `/api/commissioner/${leagueId}/roster/${rosterId}`, { body: updates });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // Tool 3: #219 — Get team period roster
  server.tool(
    "team_get_period_roster",
    "Get the roster for a team during a specific period, including per-player stats for that period. " +
    "Returns { period: { id, startDate, endDate }, roster: [...] }. " +
    "NOTE: entries where releasedAt === period.startDate are boundary rows — the player was released " +
    "at the opening moment and did not actively play for this team during the period. " +
    "Exclude these from 'active during period' analysis; they are included for stats attribution only.",
    {
      teamId: z.number().int().positive().describe("Team ID"),
      periodId: z.number().int().positive().describe("Period ID"),
    },
    async ({ teamId, periodId }) => {
      try {
        const data = await client.request("GET", `/api/teams/${teamId}/period-roster`, { query: { periodId } });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );
}
