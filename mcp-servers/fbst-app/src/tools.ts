/**
 * Wire List MCP tool definitions. Each tool wraps a single FBST API endpoint
 * and runs Zod validation on inputs before forwarding to the server.
 *
 * Where possible, the input schemas reuse the cross-side Zod schemas from
 * `shared/api/wireList.ts` — the same source of truth used by the React
 * client and the Express validator. That's the pilot's payoff: one schema,
 * three callers.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CreateAddEntryBodySchema,
  CreateDropEntryBodySchema,
  ReorderEntriesBodySchema,
  FailOutcomeBodySchema,
  WaiverDropModeSchema,
} from "../../../shared/api/wireList.js";
import { FbstApiClient, formatError } from "./apiClient.js";

type TextResult = { content: Array<{ type: "text"; text: string }> };

function ok(data: unknown): TextResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown): TextResult {
  return { content: [{ type: "text" as const, text: formatError(err) }] };
}

// ─── Input schemas ──────────────────────────────────────────────────
// We define MCP-tool-level schemas (the params shape Claude sees) and
// reuse the shared body schemas for the request payload where applicable.

const LeagueIdInput = { leagueId: z.number().int().positive().describe("League ID") };
const PeriodIdInput = { periodId: z.number().int().positive().describe("Wire-list period ID (WaiverPeriod.id)") };
const TeamIdInput = { teamId: z.number().int().positive().describe("Team ID") };
const AddEntryIdInput = { addEntryId: z.number().int().positive().describe("WaiverAddEntry ID") };
const DropEntryIdInput = { dropEntryId: z.number().int().positive().describe("WaiverDropEntry ID") };

// ─── Registration ───────────────────────────────────────────────────

export function registerWireListTools(server: McpServer, client: FbstApiClient): void {
  // Owner reads ──────────────────────────────────────────────────────

  server.tool(
    "wire_list_get_active_period",
    "Return the current PENDING wire-list period for a league, if any. Resolves to { period: WaiverPeriod | null }.",
    LeagueIdInput,
    async ({ leagueId }) => {
      try {
        const data = await client.request("GET", "/api/wire-list/periods/active", { query: { leagueId } });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    "wire_list_list_adds",
    "List a team's Add entries (ranked claim list) for a wire-list period.",
    { ...PeriodIdInput, ...TeamIdInput },
    async ({ periodId, teamId }) => {
      try {
        const data = await client.request("GET", `/api/wire-list/periods/${periodId}/adds`, { query: { teamId } });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    "wire_list_list_drops",
    "List a team's Drop entries (ranked drop list) for a wire-list period.",
    { ...PeriodIdInput, ...TeamIdInput },
    async ({ periodId, teamId }) => {
      try {
        const data = await client.request("GET", `/api/wire-list/periods/${periodId}/drops`, { query: { teamId } });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    "wire_list_get_results",
    "Get the multi-team Add/Drop results view for a finalized period (read-only aggregate).",
    PeriodIdInput,
    async ({ periodId }) => {
      try {
        const data = await client.request("GET", `/api/wire-list/periods/${periodId}/results`);
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // Owner writes ─────────────────────────────────────────────────────

  server.tool(
    "wire_list_create_add",
    "Submit a new Add entry to a team's wire-list claim queue. Priority is server-assigned (next available).",
    {
      periodId: z.number().int().positive().describe("Period ID"),
      teamId: CreateAddEntryBodySchema.shape.teamId.describe("Owning team ID"),
      playerId: CreateAddEntryBodySchema.shape.playerId.describe("Target Player.id (DB row id, not MLB id)"),
    },
    async ({ periodId, teamId, playerId }) => {
      try {
        const body: Record<string, unknown> = { teamId, playerId };
        const data = await client.request("POST", `/api/wire-list/periods/${periodId}/adds`, { body });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    "wire_list_create_drop",
    "Submit a new Drop entry to a team's wire-list drop list. dropMode: RELEASE drops to FA; IL_STASH parks on the IL stash queue.",
    {
      periodId: z.number().int().positive().describe("Period ID"),
      teamId: CreateDropEntryBodySchema.shape.teamId.describe("Owning team ID"),
      playerId: CreateDropEntryBodySchema.shape.playerId.describe("Player.id to drop"),
      dropMode: CreateDropEntryBodySchema.shape.dropMode.describe('"RELEASE" or "IL_STASH"'),
    },
    async ({ periodId, teamId, playerId, dropMode }) => {
      try {
        const body: Record<string, unknown> = { teamId, playerId };
        if (dropMode !== undefined) body.dropMode = dropMode;
        const data = await client.request("POST", `/api/wire-list/periods/${periodId}/drops`, { body });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    "wire_list_reorder_entries",
    "Atomically replace the priorities for a team's Add or Drop list. orderedIds: index 0 → priority 1, etc.",
    {
      periodId: z.number().int().positive().describe("Period ID"),
      kind: ReorderEntriesBodySchema.shape.kind.describe('"ADD" or "DROP"'),
      teamId: ReorderEntriesBodySchema.shape.teamId.describe("Owning team ID"),
      orderedIds: ReorderEntriesBodySchema.shape.orderedIds.describe(
        "Entry IDs in the desired final order (must match the existing set).",
      ),
    },
    async ({ periodId, kind, teamId, orderedIds }) => {
      try {
        const data = await client.request("POST", `/api/wire-list/periods/${periodId}/reorder`, {
          body: { kind, teamId, orderedIds },
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    "wire_list_delete_add",
    "Remove an Add entry from a team's wire-list claim queue. Only allowed while the period is PENDING.",
    AddEntryIdInput,
    async ({ addEntryId }) => {
      try {
        const data = await client.request("DELETE", `/api/wire-list/adds/${addEntryId}`);
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    "wire_list_delete_drop",
    "Remove a Drop entry from a team's wire-list drop list. Only allowed while the period is PENDING.",
    DropEntryIdInput,
    async ({ dropEntryId }) => {
      try {
        const data = await client.request("DELETE", `/api/wire-list/drops/${dropEntryId}`);
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    "wire_list_update_drop",
    "Change the drop mode on a Drop entry (RELEASE drops to FA; IL_STASH parks on the IL stash queue). Only allowed while the period is PENDING.",
    {
      dropEntryId: z.number().int().positive().describe("WaiverDropEntry ID"),
      dropMode: WaiverDropModeSchema.describe('"RELEASE" or "IL_STASH"'),
    },
    async ({ dropEntryId, dropMode }) => {
      try {
        const data = await client.request("PATCH", `/api/wire-list/drops/${dropEntryId}`, {
          body: { dropMode },
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // Commissioner reducer ─────────────────────────────────────────────

  server.tool(
    "wire_list_lock_period",
    "Commissioner action: flip a PENDING period to LOCKED so owners can no longer mutate Add/Drop entries.",
    PeriodIdInput,
    async ({ periodId }) => {
      try {
        const data = await client.request("POST", `/api/wire-list/periods/${periodId}/lock`);
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    "wire_list_succeed_add",
    "Commissioner action: mark an Add entry SUCCEEDED, consuming the next available Drop entry (transactional).",
    AddEntryIdInput,
    async ({ addEntryId }) => {
      try {
        const data = await client.request("POST", `/api/wire-list/adds/${addEntryId}/succeed`);
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    "wire_list_fail_add",
    "Commissioner action: mark an Add entry FAILED with a stable, audit-logged reason.",
    {
      addEntryId: z.number().int().positive().describe("WaiverAddEntry ID"),
      reason: FailOutcomeBodySchema.shape.reason.describe("Free-form reason (1–280 chars). Required."),
    },
    async ({ addEntryId, reason }) => {
      try {
        const body: Record<string, unknown> = { reason };
        const data = await client.request("POST", `/api/wire-list/adds/${addEntryId}/fail`, { body });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    "wire_list_skip_add",
    "Commissioner action: mark an Add entry SKIPPED (e.g., owner rescinded). Skip differs from fail in the audit trail.",
    AddEntryIdInput,
    async ({ addEntryId }) => {
      try {
        const data = await client.request("POST", `/api/wire-list/adds/${addEntryId}/skip`);
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    "wire_list_revert_add",
    "Commissioner action: revert a previously-succeeded Add entry back to PENDING (requires period LOCKED).",
    AddEntryIdInput,
    async ({ addEntryId }) => {
      try {
        const data = await client.request("POST", `/api/wire-list/adds/${addEntryId}/revert`);
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    "wire_list_finalize_period",
    "Commissioner action: atomically finalize a LOCKED period — applies all SUCCEEDED Add/Drop pairs to rosters and emits push notifications.",
    PeriodIdInput,
    async ({ periodId }) => {
      try {
        const data = await client.request("POST", `/api/wire-list/periods/${periodId}/finalize`);
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );
}

/** Exported for tests. Names must stay stable — agents grep on these. */
export const WIRE_LIST_TOOL_NAMES = [
  "wire_list_get_active_period",
  "wire_list_list_adds",
  "wire_list_list_drops",
  "wire_list_get_results",
  "wire_list_create_add",
  "wire_list_create_drop",
  "wire_list_reorder_entries",
  "wire_list_delete_add",
  "wire_list_delete_drop",
  "wire_list_update_drop",
  "wire_list_lock_period",
  "wire_list_succeed_add",
  "wire_list_fail_add",
  "wire_list_skip_add",
  "wire_list_revert_add",
  "wire_list_finalize_period",
] as const;
