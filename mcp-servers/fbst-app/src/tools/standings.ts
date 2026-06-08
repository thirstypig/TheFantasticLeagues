/**
 * Standings MCP tool definitions. Each tool wraps a single FBST standings
 * API endpoint and returns the JSON response as a text content block.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FbstApiClient, formatError } from "../apiClient.js";

type TextResult = { content: Array<{ type: "text"; text: string }> };

function ok(data: unknown): TextResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function fail(err: unknown): TextResult {
  return { content: [{ type: "text" as const, text: formatError(err) }] };
}

// ─── Input schemas ──────────────────────────────────────────────────

const LeagueIdInput = { leagueId: z.number().int().positive().describe("League ID") };

// ─── Registration ───────────────────────────────────────────────────

export function registerStandingsTools(server: McpServer, client: FbstApiClient): void {
  server.tool(
    "standings_get_waiver_priority",
    "Get current waiver priority order for a league. Use this before processing wire-list claims to determine claim order. Returns teams sorted by waiver priority (worst record first).",
    LeagueIdInput,
    async ({ leagueId }) => {
      try {
        const data = await client.request("GET", "/api/standings/waiver-priority", { query: { leagueId } });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    "standings_get_period",
    "Get period standings for a league. When periodId is omitted, returns current period stats. When periodId is provided, returns per-category stats for that historical period.",
    { ...LeagueIdInput, periodId: z.number().int().positive().optional().describe("Period ID for historical lookup; omit for current period") },
    async ({ leagueId, periodId }) => {
      try {
        const data = periodId
          ? await client.request("GET", "/api/standings/period-category-standings", { query: { leagueId, periodId } })
          : await client.request("GET", "/api/standings/period/current", { query: { leagueId } });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    "standings_get_season",
    "Get full season standings for a league, including all periods and category breakdowns.",
    LeagueIdInput,
    async ({ leagueId }) => {
      try {
        const data = await client.request("GET", "/api/standings/season", { query: { leagueId } });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );
}

/** Exported for tests and index aggregation. Names must stay stable — agents grep on these. */
export const STANDINGS_TOOL_NAMES = [
  "standings_get_waiver_priority",
  "standings_get_period",
  "standings_get_season",
] as const;
