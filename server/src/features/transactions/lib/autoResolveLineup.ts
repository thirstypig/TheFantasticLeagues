// server/src/features/transactions/lib/autoResolveLineup.ts
//
// Bridge between Prisma and the pure `slotMatcher` module. Given the team's
// current roster state plus a pending mutation (an add, a drop, an IL stash,
// or an IL activate), resolves a legal lineup end-state via bipartite
// matching and applies the resulting slot reassignments inside the existing
// transaction.
//
// The matcher itself is dependency-free (see slotMatcher.ts). This file is
// the "wiring" — it knows about Prisma, RosterRuleError, and the LeagueRule
// flag, none of which the matcher should care about.

import type { Prisma } from "@prisma/client";
import { resolveLineup, type RosterCandidate, type SlotAssignment } from "./slotMatcher.js";
import { RosterRuleError } from "../../../lib/rosterRuleError.js";
import { getLeagueRules } from "../../../lib/leagueRuleCache.js";

/**
 * Per-row reassignment applied by the auto-resolve. Returned to the route
 * handler so it can echo to the client (which surfaces a toast).
 *
 * NOTE: this is the wire shape — `playerName` is denormalized for the toast.
 * The matcher's `SlotAssignment` doesn't carry it; we look up names here.
 */
export interface AppliedReassignment {
  rosterId: number;
  playerId: number;
  playerName: string;
  oldSlot: string;
  newSlot: string;
}

/**
 * Read the per-league `transactions.auto_resolve_slots` rule. Defaults to
 * `false` (legacy strict pairwise) when the row is missing, so leagues that
 * haven't been migrated stay on the old behavior.
 *
 * The migration seeds `true` for OGBA, `false` for everyone else.
 */
export async function isAutoResolveEnabled(
  client: Prisma.TransactionClient | { leagueRule: { findMany: any } },
  leagueId: number,
): Promise<boolean> {
  const rules = await getLeagueRules(client as any, leagueId);
  return rules.transactions?.auto_resolve_slots === "true";
}

/**
 * Build the per-slot capacity map for a league from `LeagueRule`. Falls back
 * to OGBA's standard 14-batter / 9-pitcher shape when rule rows are missing.
 *
 * Reads `roster.roster_positions` (JSON: `{ "C":2, "1B":1, ..., "OF":5 }`)
 * for hitter slots and `roster.pitcher_count` (string number) for the P slot.
 * The two sources are independent in the existing schema; we merge them here.
 */
export async function loadSlotCapacities(
  client: Prisma.TransactionClient | { leagueRule: { findMany: any } },
  leagueId: number,
): Promise<Record<string, number>> {
  const rules = await getLeagueRules(client as any, leagueId);

  const FALLBACK: Record<string, number> = {
    C: 2, "1B": 1, "2B": 1, "3B": 1, SS: 1, MI: 1, CM: 1, OF: 5, DH: 1, P: 9,
  };

  const raw = rules.roster?.roster_positions;
  let hitters: Record<string, number> = { ...FALLBACK };
  delete hitters.P;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        hitters = parsed as Record<string, number>;
      }
    } catch {
      // Bad JSON in the rule row → fall back to defaults rather than failing
      // the transaction. The seed migration writes valid JSON; corruption here
      // is a commissioner-edit bug, not a runtime concern.
    }
  }

  const pitcherCount = Number(rules.roster?.pitcher_count);
  const P = Number.isFinite(pitcherCount) && pitcherCount > 0 ? pitcherCount : FALLBACK.P;

  return { ...hitters, P };
}

/**
 * Load every active (non-released) Roster row for the team plus its players,
 * and shape it into `RosterCandidate`s. IL rows are returned `pinned: true`
 * so the matcher leaves them alone.
 *
 * `excludeRosterIds` is for rows that this transaction has already released
 * (e.g., the dropped player on /claim) — we drop them from the candidate
 * pool because they're going away. `includeNewPlayer` lets the caller stage
 * a not-yet-created Roster row for the player being added.
 */
export async function buildCandidatesForTeam(
  tx: Prisma.TransactionClient,
  teamId: number,
  options: {
    excludeRosterIds?: number[];
    /**
     * The player being added in this transaction. We synthesize a candidate
     * for them so the matcher can place them legally. The synthetic
     * `rosterId: 0` is replaced by the real id post-create in the caller's
     * apply step (we only emit assignments for non-synthetic rows).
     */
    includeNewPlayer?: { playerId: number; posList: string };
  } = {},
): Promise<{
  candidates: RosterCandidate[];
  /** Map rosterId → playerName (for echoing toasts). 0 = the new player. */
  playerNames: Map<number, string>;
}> {
  const exclude = new Set(options.excludeRosterIds ?? []);

  const rows = await tx.roster.findMany({
    where: { teamId, releasedAt: null },
    select: {
      id: true,
      playerId: true,
      assignedPosition: true,
      player: { select: { name: true, posList: true } },
    },
  });

  const candidates: RosterCandidate[] = [];
  const playerNames = new Map<number, string>();

  for (const row of rows) {
    if (exclude.has(row.id)) continue;
    const isIl = row.assignedPosition === "IL";
    candidates.push({
      rosterId: row.id,
      playerId: row.playerId,
      posList: row.player.posList ?? "",
      currentSlot: row.assignedPosition,
      pinned: isIl,
    });
    playerNames.set(row.id, row.player.name ?? `Player #${row.playerId}`);
  }

  if (options.includeNewPlayer) {
    candidates.push({
      rosterId: 0,
      playerId: options.includeNewPlayer.playerId,
      posList: options.includeNewPlayer.posList,
      currentSlot: null,
      pinned: false,
    });
    // Name will be filled in by the caller (which already has the Player row).
  }

  return { candidates, playerNames };
}

/**
 * Re-read `Player.posList` for every involved player and verify nothing
 * changed since the pre-flight read. Used to detect the daily-eligibility-
 * sync race (plan Q1).
 *
 * Returns `null` if posLists are unchanged; otherwise returns the updated
 * candidates so the caller can re-run the matcher with fresh data.
 */
export async function verifyEligibilityUnchanged(
  tx: Prisma.TransactionClient,
  candidates: RosterCandidate[],
): Promise<RosterCandidate[] | null> {
  const playerIds = candidates
    .filter((c) => c.playerId > 0)
    .map((c) => c.playerId);
  if (playerIds.length === 0) return null;

  const fresh = await tx.player.findMany({
    where: { id: { in: playerIds } },
    select: { id: true, posList: true },
  });
  const freshMap = new Map(fresh.map((p) => [p.id, p.posList ?? ""]));

  let changed = false;
  const updated: RosterCandidate[] = candidates.map((c) => {
    const newPos = freshMap.get(c.playerId);
    if (newPos != null && newPos !== c.posList) {
      changed = true;
      return { ...c, posList: newPos };
    }
    return c;
  });

  return changed ? updated : null;
}

/**
 * Apply a list of `SlotAssignment`s to the Roster table within an active
 * transaction. Synthetic rows (rosterId === 0) are skipped — the caller is
 * responsible for them.
 *
 * Returns the names hydrated into `AppliedReassignment` rows.
 */
export async function applyAssignments(
  tx: Prisma.TransactionClient,
  assignments: SlotAssignment[],
  playerNames: Map<number, string>,
  rosterRowToPlayerId: Map<number, number>,
): Promise<AppliedReassignment[]> {
  const out: AppliedReassignment[] = [];
  for (const a of assignments) {
    if (a.rosterId === 0) continue; // synthetic — caller handles the new row.
    await tx.roster.update({
      where: { id: a.rosterId },
      data: { assignedPosition: a.newSlot },
    });
    const playerId = rosterRowToPlayerId.get(a.rosterId) ?? 0;
    out.push({
      rosterId: a.rosterId,
      playerId,
      playerName: playerNames.get(a.rosterId) ?? `Player #${playerId}`,
      oldSlot: a.oldSlot ?? "",
      newSlot: a.newSlot,
    });
  }
  return out;
}

/**
 * Throw `RosterRuleError` for matcher failures — maps to the existing 400
 * response shape used by the three transaction endpoints.
 */
export function throwForFailure(
  reason: string,
  unfilledSlots: string[],
  unassignedPlayers: number[],
): never {
  throw new RosterRuleError(
    "NO_LEGAL_ASSIGNMENT",
    reason,
    { unfilledSlots, unassignedPlayers },
  );
}

export { resolveLineup }; // re-export for callers that don't want a second import
