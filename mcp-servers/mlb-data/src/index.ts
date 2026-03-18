#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Cache } from "./cache.js";
import { RateLimiter } from "./rateLimiter.js";
import { MlbClient } from "./mlbClient.js";

const cache = new Cache(process.env.CACHE_PATH);
const rateLimiter = new RateLimiter(20, 10, 50);
const client = new MlbClient(cache, rateLimiter);

const server = new McpServer({
  name: "mlb-data",
  version: "1.0.0",
});

// ── Tool: get-player-info ──────────────────────────────────────
server.tool(
  "get-player-info",
  "Look up an MLB player by ID. Returns name, team, position, jersey number.",
  { playerId: z.number().describe("MLB player ID") },
  async ({ playerId }) => {
    const data = (await client.getPlayerInfo(playerId)) as {
      people?: Array<Record<string, unknown>>;
    };
    const player = data.people?.[0];
    if (!player) return { content: [{ type: "text" as const, text: `No player found with ID ${playerId}` }] };
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(player, null, 2),
      }],
    };
  }
);

// ── Tool: get-player-stats ─────────────────────────────────────
server.tool(
  "get-player-stats",
  "Get season batting or pitching stats for a player.",
  {
    playerId: z.number().describe("MLB player ID"),
    season: z.number().optional().describe("Season year (default: current)"),
    group: z.enum(["hitting", "pitching"]).optional().describe("Stat group (default: hitting)"),
  },
  async ({ playerId, season, group }) => {
    const data = await client.getPlayerStats(playerId, season, group ?? "hitting");
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: search-players ───────────────────────────────────────
server.tool(
  "search-players",
  "Search for MLB players by name (fuzzy match).",
  {
    query: z.string().describe("Player name to search for"),
    limit: z.number().optional().describe("Max results (default: 10)"),
  },
  async ({ query, limit }) => {
    const data = await client.searchPlayers(query, limit ?? 10);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: get-team-roster ──────────────────────────────────────
server.tool(
  "get-team-roster",
  "Get the roster for an MLB team.",
  {
    teamId: z.number().describe("MLB team ID"),
    rosterType: z.enum(["40Man", "active"]).optional().describe("Roster type (default: active)"),
  },
  async ({ teamId, rosterType }) => {
    const data = await client.getTeamRoster(teamId, rosterType ?? "active");
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: get-mlb-standings ────────────────────────────────────
server.tool(
  "get-mlb-standings",
  "Get current MLB standings by division.",
  {
    season: z.number().optional().describe("Season year (default: current)"),
    leagueId: z.number().optional().describe("League ID: 103=AL, 104=NL (default: both)"),
  },
  async ({ season, leagueId }) => {
    const data = await client.getStandings(season, leagueId);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: get-mlb-schedule ─────────────────────────────────────
server.tool(
  "get-mlb-schedule",
  "Get the MLB game schedule for a given date.",
  {
    date: z.string().optional().describe("Date in YYYY-MM-DD format (default: today)"),
    teamId: z.number().optional().describe("Filter to a specific MLB team"),
  },
  async ({ date, teamId }) => {
    const data = await client.getSchedule(date, teamId);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: sync-player-teams ───────────────────────────────────
server.tool(
  "sync-player-teams",
  "Batch resolve MLB player IDs to their current team abbreviations.",
  {
    playerIds: z.array(z.number()).describe("Array of MLB player IDs"),
  },
  async ({ playerIds }) => {
    const result = await client.syncPlayerTeams(playerIds);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      }],
    };
  }
);

// ── Tool: cache-status ─────────────────────────────────────────
server.tool(
  "cache-status",
  "View cache statistics and optionally clear the cache.",
  {
    clear: z.boolean().optional().describe("Set to true to clear the entire cache"),
  },
  async ({ clear }) => {
    if (clear) {
      const deleted = cache.clear();
      return {
        content: [{
          type: "text" as const,
          text: `Cache cleared. ${deleted} entries removed.`,
        }],
      };
    }
    const stats = cache.stats();
    const rlStats = {
      totalRequests: rateLimiter.totalRequests,
      throttledRequests: rateLimiter.throttledRequests,
      rejectedRequests: rateLimiter.rejectedRequests,
      queueDepth: rateLimiter.queueDepth,
      availableTokens: rateLimiter.availableTokens,
    };
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ cache: stats, rateLimiter: rlStats }, null, 2),
      }],
    };
  }
);

// ── Resource: mlb://teams ──────────────────────────────────────
server.resource("teams", "mlb://teams", async (uri) => {
  const data = (await client.getTeams()) as {
    teams?: Array<{ id: number; name: string; abbreviation: string; division?: { name: string } }>;
  };
  const teams = (data.teams ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    abbreviation: t.abbreviation,
    division: t.division?.name,
  }));
  return {
    contents: [{
      uri: uri.href,
      mimeType: "application/json",
      text: JSON.stringify(teams, null, 2),
    }],
  };
});

// ── Resource: mlb://cache-stats ────────────────────────────────
server.resource("cache-stats", "mlb://cache-stats", async (uri) => {
  const stats = cache.stats();
  return {
    contents: [{
      uri: uri.href,
      mimeType: "application/json",
      text: JSON.stringify(stats, null, 2),
    }],
  };
});

// ── Start ──────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mlb-data MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
