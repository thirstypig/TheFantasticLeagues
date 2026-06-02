/**
 * Transaction / direct-claim MCP tool definitions.
 *
 * Three tools wrapping the in-season add/drop claim flow:
 *
 *   players_get_eligible_slots — GET /api/players/:mlbId/eligible-slots
 *   transactions_preview_claim — POST /api/transactions/claim/preview
 *   transactions_execute_claim — POST /api/transactions/claim
 *
 * Input schemas reuse `ClaimRequestSchema` from `shared/api/rosterMoves.ts`
 * so any wire-format change is a compile-time error here.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ClaimRequestSchema } from "../../../../shared/api/rosterMoves.js";
import { FbstApiClient, formatError } from "../apiClient.js";

type TextResult = { content: Array<{ type: "text"; text: string }> };

function ok(data: unknown): TextResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown): TextResult {
  return { content: [{ type: "text" as const, text: formatError(err) }] };
}

// ─── Registration ───────────────────────────────────────────────────

export function registerTransactionTools(server: McpServer, client: FbstApiClient): void {
  // ── 1. players_get_eligible_slots ──────────────────────────────────

  server.tool(
    "players_get_eligible_slots",
    "Return the list of eligible roster slot codes for a player in a given league. Wraps GET /api/players/:mlbId/eligible-slots. Use this before executing a claim to check which slots the player can fill.",
    {
      mlbId: z.number().int().positive().describe("MLB player ID"),
      leagueId: z.number().int().positive().describe("League ID"),
    },
    async ({ mlbId, leagueId }) => {
      try {
        const data = await client.request("GET", `/api/players/${mlbId}/eligible-slots`, {
          query: { leagueId },
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ── 2. transactions_preview_claim ──────────────────────────────────

  server.tool(
    "transactions_preview_claim",
    "Preview a direct in-season add/drop claim without executing it. Wraps POST /api/transactions/claim/preview. Returns { ok, message?, error? }. Use before transactions_execute_claim to verify legality.",
    {
      leagueId: ClaimRequestSchema.shape.leagueId.describe("League ID"),
      teamId: ClaimRequestSchema.shape.teamId.describe("Owning team ID"),
      playerId: ClaimRequestSchema.shape.playerId.describe(
        "Prisma Player.id of the player to add (prefer over mlbId when known)",
      ),
      mlbId: ClaimRequestSchema.shape.mlbId.describe(
        "MLB player ID of the player to add (used when playerId is unknown; server accepts digits-only string or integer ≤9999999)",
      ),
      dropPlayerId: ClaimRequestSchema.shape.dropPlayerId.describe(
        "Prisma Player.id of the player to drop in exchange (required if the roster is full)",
      ),
      effectiveDate: ClaimRequestSchema.shape.effectiveDate.describe(
        "ISO date string YYYY-MM-DD for backdated commissioner claims (optional)",
      ),
      slotChanges: ClaimRequestSchema.shape.slotChanges.describe(
        "Optional owner-directed slot reassignments applied atomically with the claim (array of {playerId, slot})",
      ),
    },
    async ({ leagueId, teamId, playerId, mlbId, dropPlayerId, effectiveDate, slotChanges }) => {
      try {
        const body: Record<string, unknown> = { leagueId, teamId };
        if (playerId !== undefined) body.playerId = playerId;
        if (mlbId !== undefined) body.mlbId = mlbId;
        if (dropPlayerId !== undefined) body.dropPlayerId = dropPlayerId;
        if (effectiveDate !== undefined) body.effectiveDate = effectiveDate;
        if (slotChanges !== undefined) body.slotChanges = slotChanges;
        const data = await client.request("POST", "/api/transactions/claim/preview", { body });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ── 3. transactions_execute_claim ──────────────────────────────────

  server.tool(
    "transactions_execute_claim",
    "Execute a direct in-season add/drop claim. Wraps POST /api/transactions/claim. Atomically adds the target player, optionally drops another player, and auto-resolves roster slot assignments. Returns { success: true, playerId, name, appliedReassignments? } on success.",
    {
      leagueId: ClaimRequestSchema.shape.leagueId.describe("League ID"),
      teamId: ClaimRequestSchema.shape.teamId.describe("Owning team ID"),
      playerId: ClaimRequestSchema.shape.playerId.describe(
        "Prisma Player.id of the player to add (prefer over mlbId when known)",
      ),
      mlbId: ClaimRequestSchema.shape.mlbId.describe(
        "MLB player ID of the player to add (used when playerId is unknown; server accepts digits-only string or integer ≤9999999)",
      ),
      dropPlayerId: ClaimRequestSchema.shape.dropPlayerId.describe(
        "Prisma Player.id of the player to drop in exchange (required if the roster is full)",
      ),
      effectiveDate: ClaimRequestSchema.shape.effectiveDate.describe(
        "ISO date string YYYY-MM-DD for backdated commissioner claims (optional)",
      ),
      slotChanges: ClaimRequestSchema.shape.slotChanges.describe(
        "Optional owner-directed slot reassignments applied atomically with the claim (array of {playerId, slot})",
      ),
    },
    async ({ leagueId, teamId, playerId, mlbId, dropPlayerId, effectiveDate, slotChanges }) => {
      try {
        const body: Record<string, unknown> = { leagueId, teamId };
        if (playerId !== undefined) body.playerId = playerId;
        if (mlbId !== undefined) body.mlbId = mlbId;
        if (dropPlayerId !== undefined) body.dropPlayerId = dropPlayerId;
        if (effectiveDate !== undefined) body.effectiveDate = effectiveDate;
        if (slotChanges !== undefined) body.slotChanges = slotChanges;
        const data = await client.request("POST", "/api/transactions/claim", { body });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );
}

/** Exported for tests. Names must stay stable — agents grep on these. */
export const TRANSACTION_TOOL_NAMES = [
  "players_get_eligible_slots",
  "transactions_preview_claim",
  "transactions_execute_claim",
] as const;
