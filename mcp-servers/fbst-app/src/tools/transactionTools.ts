/**
 * Transaction / direct-claim MCP tool definitions.
 *
 * Eight tools wrapping the in-season roster-move surfaces:
 *
 *   players_get_eligible_slots         — GET  /api/players/:mlbId/eligible-slots
 *   transactions_preview_claim         — POST /api/transactions/claim/preview
 *   transactions_execute_claim         — POST /api/transactions/claim
 *   transactions_preview_il_stash      — POST /api/transactions/il-stash/preview
 *   transactions_execute_il_stash      — POST /api/transactions/il-stash
 *   transactions_preview_il_activate   — POST /api/transactions/il-activate/preview
 *   transactions_execute_il_activate   — POST /api/transactions/il-activate
 *   transactions_execute_drop          — POST /api/transactions/drop
 *
 * Input schemas reuse Zod schemas from `shared/api/rosterMoves.ts`
 * (`ClaimRequestSchema`, `IlStashRequestSchema`, `IlActivateRequestSchema`,
 * `DropRequestSchema`) so any wire-format change is a compile-time error here.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ClaimRequestSchema,
  DropRequestSchema,
  IlActivateRequestSchema,
  IlStashRequestSchema,
} from "../../../../shared/api/rosterMoves.js";
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

  // ── 4. transactions_preview_il_stash ───────────────────────────────

  const ilStashShape = {
    leagueId: IlStashRequestSchema.shape.leagueId.describe("League ID"),
    teamId: IlStashRequestSchema.shape.teamId.describe("Owning team ID"),
    stashPlayerId: IlStashRequestSchema.shape.stashPlayerId.describe(
      "Prisma Player.id of the player to move from active → IL",
    ),
    addPlayerId: IlStashRequestSchema.shape.addPlayerId.describe(
      "Optional Prisma Player.id of an incoming free-agent to add into the freed slot (atomic with the stash)",
    ),
    addMlbId: IlStashRequestSchema.shape.addMlbId.describe(
      "Optional MLB player ID for the incoming free-agent (used when addPlayerId is unknown)",
    ),
    effectiveDate: IlStashRequestSchema.shape.effectiveDate.describe(
      "ISO date string YYYY-MM-DD for backdated commissioner stashes (optional)",
    ),
    reason: IlStashRequestSchema.shape.reason.describe(
      "Optional human-readable note recorded on the TransactionEvent (≤500 chars)",
    ),
  };

  server.tool(
    "transactions_preview_il_stash",
    "Preview an IL stash without executing it. Wraps POST /api/transactions/il-stash/preview. Returns { ok, message?, error? }. Use before transactions_execute_il_stash to verify legality (player must be on the team's active roster with an MLB IL status). Omit addPlayerId/addMlbId for stash-only mode (the freed slot stays empty).",
    ilStashShape,
    async ({ leagueId, teamId, stashPlayerId, addPlayerId, addMlbId, effectiveDate, reason }) => {
      try {
        const body: Record<string, unknown> = { leagueId, teamId, stashPlayerId };
        if (addPlayerId !== undefined) body.addPlayerId = addPlayerId;
        if (addMlbId !== undefined) body.addMlbId = addMlbId;
        if (effectiveDate !== undefined) body.effectiveDate = effectiveDate;
        if (reason !== undefined) body.reason = reason;
        const data = await client.request("POST", "/api/transactions/il-stash/preview", { body });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ── 5. transactions_execute_il_stash ───────────────────────────────

  server.tool(
    "transactions_execute_il_stash",
    "Execute an IL stash. Wraps POST /api/transactions/il-stash. Atomically moves the target player from active → IL, optionally adds an incoming free-agent into the freed slot, and auto-resolves slot assignments via the bipartite matcher. Returns { success: true, stashPlayerId, addPlayerId, stashOnly, ... } on success.",
    ilStashShape,
    async ({ leagueId, teamId, stashPlayerId, addPlayerId, addMlbId, effectiveDate, reason }) => {
      try {
        const body: Record<string, unknown> = { leagueId, teamId, stashPlayerId };
        if (addPlayerId !== undefined) body.addPlayerId = addPlayerId;
        if (addMlbId !== undefined) body.addMlbId = addMlbId;
        if (effectiveDate !== undefined) body.effectiveDate = effectiveDate;
        if (reason !== undefined) body.reason = reason;
        const data = await client.request("POST", "/api/transactions/il-stash", { body });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ── 6. transactions_preview_il_activate ────────────────────────────

  const ilActivateShape = {
    leagueId: IlActivateRequestSchema.shape.leagueId.describe("League ID"),
    teamId: IlActivateRequestSchema.shape.teamId.describe("Owning team ID"),
    activatePlayerId: IlActivateRequestSchema.shape.activatePlayerId.describe(
      "Prisma Player.id of the player to activate from IL → active roster",
    ),
    dropPlayerId: IlActivateRequestSchema.shape.dropPlayerId.describe(
      "Prisma Player.id of the active-roster player to drop in exchange (required — cannot drop an IL player here; use /transactions/drop instead)",
    ),
    effectiveDate: IlActivateRequestSchema.shape.effectiveDate.describe(
      "ISO date string YYYY-MM-DD for backdated commissioner activations (optional)",
    ),
    reason: IlActivateRequestSchema.shape.reason.describe(
      "Optional human-readable note recorded on the TransactionEvent (≤500 chars)",
    ),
  };

  server.tool(
    "transactions_preview_il_activate",
    "Preview an IL activation + drop without executing it. Wraps POST /api/transactions/il-activate/preview. Returns { ok, message?, error? }. Both player ids are required — activate must be on the team's IL, drop must be on the team's active roster. Use before transactions_execute_il_activate to verify legality.",
    ilActivateShape,
    async ({ leagueId, teamId, activatePlayerId, dropPlayerId, effectiveDate, reason }) => {
      try {
        const body: Record<string, unknown> = { leagueId, teamId, activatePlayerId, dropPlayerId };
        if (effectiveDate !== undefined) body.effectiveDate = effectiveDate;
        if (reason !== undefined) body.reason = reason;
        const data = await client.request("POST", "/api/transactions/il-activate/preview", { body });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ── 7. transactions_execute_il_activate ────────────────────────────

  server.tool(
    "transactions_execute_il_activate",
    "Execute an atomic activate-from-IL + drop. Wraps POST /api/transactions/il-activate. Moves activatePlayerId from IL → active and drops dropPlayerId in the same transaction; auto-resolves slot assignments. Returns { success: true, activatePlayerId, dropPlayerId, ... } on success.",
    ilActivateShape,
    async ({ leagueId, teamId, activatePlayerId, dropPlayerId, effectiveDate, reason }) => {
      try {
        const body: Record<string, unknown> = { leagueId, teamId, activatePlayerId, dropPlayerId };
        if (effectiveDate !== undefined) body.effectiveDate = effectiveDate;
        if (reason !== undefined) body.reason = reason;
        const data = await client.request("POST", "/api/transactions/il-activate", { body });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ── 8. transactions_execute_drop ───────────────────────────────────

  server.tool(
    "transactions_execute_drop",
    "Execute a plain drop (no incoming player). Wraps POST /api/transactions/drop. Frees the dropped player's roster slot; the bipartite matcher reshuffles BN if needed. Returns { success: true, playerId, name? } on success.",
    {
      leagueId: DropRequestSchema.shape.leagueId.describe("League ID"),
      teamId: DropRequestSchema.shape.teamId.describe("Owning team ID"),
      playerId: DropRequestSchema.shape.playerId.describe(
        "Prisma Player.id of the player to drop (must be on the team's roster)",
      ),
      effectiveDate: DropRequestSchema.shape.effectiveDate.describe(
        "ISO date string YYYY-MM-DD for backdated commissioner drops (optional)",
      ),
    },
    async ({ leagueId, teamId, playerId, effectiveDate }) => {
      try {
        const body: Record<string, unknown> = { leagueId, teamId, playerId };
        if (effectiveDate !== undefined) body.effectiveDate = effectiveDate;
        const data = await client.request("POST", "/api/transactions/drop", { body });
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
  "transactions_preview_il_stash",
  "transactions_execute_il_stash",
  "transactions_preview_il_activate",
  "transactions_execute_il_activate",
  "transactions_execute_drop",
] as const;
