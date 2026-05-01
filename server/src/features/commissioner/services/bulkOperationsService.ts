/**
 * Commissioner bulk-ops service.
 *
 * Two league-wide operations:
 *   - `auditLeagueIlPlayers` — list players on active rosters whose MLB
 *     status starts with "Injured" but who haven't been moved to an IL slot
 *     yet. Drives the "League IL audit" UI.
 *   - `performBulkIlStash` — sequentially run an IL stash (stash-only mode)
 *     for each (teamId, playerId) entry, returning a per-entry succeed/fail
 *     summary. Idempotent: a player already on IL is reported as a `noop`
 *     success rather than a failure.
 *   - `cleanupDroppedRosterRows` — hard-delete `Roster` rows whose
 *     `releasedAt` is older than the configured cutoff. The Prisma schema
 *     models `releasedAt` as the soft-delete marker; rows older than the
 *     cutoff have no operational value and accumulate over many seasons.
 *     `TransactionEvent.playerId` and `TransactionEvent.teamId` use
 *     `onDelete: SetNull` for Player/Team — the `Roster` row itself has no
 *     downstream FKs that would block a delete (verified via schema
 *     inspection on 2026-04-30).
 */
import { prisma } from "../../../db/prisma.js";
import { logger } from "../../../lib/logger.js";
import { writeAuditLog } from "../../../lib/auditLog.js";
import { getMlbPlayerStatus, type MlbRosterStatus } from "../../../lib/mlbApi.js";
import {
  checkMlbIlEligibility,
  isMlbIlStatus,
  assertIlSlotAvailable,
  assertNoGhostIl,
  type MlbStatusCheck,
} from "../../../lib/ilSlotGuard.js";
import { isRosterRuleError } from "../../../lib/rosterRuleError.js";
import {
  loadSlotCapacities,
  buildCandidatesForTeam,
  verifyEligibilityUnchanged,
  applyAssignments,
  resolveLineup,
} from "../../transactions/lib/autoResolveLineup.js";
import { resolveEffectiveDate } from "../../../lib/rosterWindow.js";
import { clearPlayersCache } from "../../players/services/playersListCache.js";
import { clearStandingsCache } from "../../standings/services/standingsService.js";
import crypto from "crypto";
import type {
  IlAuditRow,
  IlAuditResponse,
  BulkIlStashEntry,
  BulkIlStashResponse,
  BulkIlStashSucceeded,
  BulkIlStashFailed,
  CleanupDroppedResponse,
} from "../../../../../shared/api/commissioner.js";

/**
 * Detection: which players on this league's active rosters carry an MLB
 * status that starts with "Injured" but have NOT yet been moved to an IL
 * slot? These are the candidates for a bulk IL stash.
 *
 * Implementation note: the `Player` model does not (yet) carry a persistent
 * `mlbStatus` column — that's Cluster U's plumbing. Until then we fan out
 * to the live MLB feed via `getMlbPlayerStatus` per player, exactly the same
 * approach `listGhostIlPlayersForTeam` uses. Cached responses make this cheap.
 *
 * Fail-open: a feed error for a single player is logged and the player is
 * skipped. Read-only path; no need to fail closed (write paths still do).
 */
export async function auditLeagueIlPlayers(leagueId: number): Promise<IlAuditResponse> {
  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, name: true, code: true },
  });

  const fetchedAt = new Date().toISOString();
  const rows: IlAuditRow[] = [];
  const teamIdsWithRows = new Set<number>();

  for (const team of teams) {
    // Active roster only — skip already-IL'd rows + already-released rows.
    const roster = await prisma.roster.findMany({
      where: {
        teamId: team.id,
        releasedAt: null,
        NOT: { assignedPosition: "IL" },
      },
      select: {
        playerId: true,
        assignedPosition: true,
        player: { select: { id: true, name: true, mlbId: true, mlbTeam: true } },
      },
    });

    for (const r of roster) {
      if (!r.player.mlbId || !r.player.mlbTeam) continue;
      let status: MlbRosterStatus | null;
      try {
        status = await getMlbPlayerStatus(r.player.mlbId, r.player.mlbTeam);
      } catch (err) {
        logger.warn(
          { error: String(err), playerId: r.player.id, mlbId: r.player.mlbId },
          "[bulkOps.auditLeagueIlPlayers] feed unavailable for player; skipping",
        );
        continue;
      }
      if (!status) continue;
      if (!isMlbIlStatus(status.status)) continue;

      rows.push({
        teamId: team.id,
        teamName: team.name,
        teamCode: team.code ?? null,
        playerId: r.player.id,
        playerName: r.player.name,
        mlbId: r.player.mlbId,
        mlbStatus: status.status,
        assignedPosition: r.assignedPosition,
      });
      teamIdsWithRows.add(team.id);
    }
  }

  return {
    rows,
    totalRows: rows.length,
    totalTeams: teamIdsWithRows.size,
    fetchedAt,
  };
}

/**
 * Internal: stash-only flow for a single (leagueId, teamId, stashPlayerId).
 * Mirrors the IL stash route handler's stash-only branch but is callable
 * from the bulk endpoint without re-entering Express. Returns either an
 * already-on-IL noop, a successful stash, or a failure with reason/code.
 */
async function stashOneIdempotent(args: {
  leagueId: number;
  teamId: number;
  stashPlayerId: number;
  actorUserId: number;
}): Promise<
  | { kind: "stashed" }
  | { kind: "noop"; reason: "already_on_il" }
  | { kind: "failed"; reason: string; code?: string }
> {
  const { leagueId, teamId, stashPlayerId, actorUserId } = args;

  const effective = resolveEffectiveDate(undefined);

  // Pre-tx: fetch the active-roster row (if any). Idempotency: if the player
  // is already on IL, treat as a no-op success. If the player isn't on this
  // team's active roster at all, that's a real failure (caller mis-targeted).
  const stashRoster = await prisma.roster.findFirst({
    where: { teamId, playerId: stashPlayerId, releasedAt: null },
    select: { id: true, assignedPosition: true },
  });
  if (!stashRoster) {
    return { kind: "failed", reason: "Player is not on this team's active roster.", code: "IL_UNKNOWN_PLAYER" };
  }
  if (stashRoster.assignedPosition === "IL") {
    return { kind: "noop", reason: "already_on_il" };
  }

  // Pre-tx: MLB IL eligibility (fails closed on feed unavailability).
  let mlbCheck: MlbStatusCheck;
  try {
    mlbCheck = await checkMlbIlEligibility(stashPlayerId);
  } catch (err) {
    if (isRosterRuleError(err)) {
      return { kind: "failed", reason: err.message, code: err.code };
    }
    return {
      kind: "failed",
      reason: err instanceof Error ? err.message : "MLB eligibility check failed",
    };
  }

  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
  const season = league?.season ?? new Date().getFullYear();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;

      const locked = await tx.roster.findFirst({
        where: { id: stashRoster.id, releasedAt: null },
        select: { id: true, assignedPosition: true },
      });
      if (!locked) {
        throw new Error("Stash player roster row vanished mid-transaction.");
      }
      if (locked.assignedPosition === "IL") {
        // Race: another tx beat us to it. Treat as no-op via thrown sentinel.
        throw new RaceAlreadyOnIl();
      }

      await assertIlSlotAvailable(tx, teamId, leagueId);
      await assertNoGhostIl(tx, teamId);

      // Move the player onto IL.
      await tx.roster.update({
        where: { id: stashRoster.id },
        data: { assignedPosition: "IL" },
      });

      // Bipartite re-resolve so the freed slot is re-filled from BN if
      // possible. Mirrors the route handler's stash-only branch.
      const slotCapacities = await loadSlotCapacities(tx, leagueId);
      const { candidates, playerNames } = await buildCandidatesForTeam(tx, teamId);
      const rosterRowToPlayerId = new Map<number, number>();
      for (const c of candidates) rosterRowToPlayerId.set(c.rosterId, c.playerId);

      let result = resolveLineup(candidates, slotCapacities);
      if (result.ok === false) {
        const refreshed = await verifyEligibilityUnchanged(tx, candidates);
        if (refreshed) {
          result = resolveLineup(refreshed, slotCapacities);
        }
      }
      if (result.ok) {
        await applyAssignments(tx, result.assignments, playerNames, rosterRowToPlayerId);
      }
      // If still not ok, we accept the orphaned slot — same forgiving stance
      // as the route handler when a manual rule edit creates an unsolvable
      // configuration. The IL stash itself stuck.

      // Append-only IL stint event (drives Phase 3 fee reconciler).
      await tx.rosterSlotEvent.create({
        data: {
          teamId,
          playerId: stashPlayerId,
          leagueId,
          event: "IL_STASH",
          effDate: effective,
          createdBy: actorUserId,
          reason: "Bulk IL audit stash",
          mlbStatusSnapshot: mlbCheck.status,
          mlbStatusFetchedAt: mlbCheck.cacheFetchedAt,
        },
      });

      await tx.transactionEvent.create({
        data: {
          rowHash: `IL_STASH-${crypto.randomUUID()}-${stashPlayerId}`,
          leagueId,
          season,
          effDate: effective,
          submittedAt: new Date(),
          teamId,
          playerId: stashPlayerId,
          transactionRaw: `Bulk IL stash — MLB status "${mlbCheck.status}"`,
          transactionType: "IL_STASH",
        },
      });
    }, { timeout: 30_000 });

    return { kind: "stashed" };
  } catch (err) {
    if (err instanceof RaceAlreadyOnIl) {
      return { kind: "noop", reason: "already_on_il" };
    }
    if (isRosterRuleError(err)) {
      return { kind: "failed", reason: err.message, code: err.code };
    }
    return {
      kind: "failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Sentinel thrown inside the tx when a concurrent stash already moved the
 *  player onto IL — caught above and translated to a noop success. */
class RaceAlreadyOnIl extends Error {
  constructor() {
    super("Player was placed on IL by a concurrent operation");
  }
}

/**
 * Sequentially process bulk IL stash entries. Each entry runs in its own
 * transaction so a failure on entry N doesn't roll back the N-1 successful
 * stashes. Idempotency: if the player is already on IL, recorded as
 * `outcome: "noop"` under `succeeded` (no failure, no double-stash).
 */
export async function performBulkIlStash(
  leagueId: number,
  entries: BulkIlStashEntry[],
  actorUserId: number,
): Promise<BulkIlStashResponse> {
  const succeeded: BulkIlStashSucceeded[] = [];
  const failed: BulkIlStashFailed[] = [];

  // IDOR guard: every entry's teamId must belong to the requested leagueId.
  const teamIds = Array.from(new Set(entries.map(e => e.teamId)));
  const validTeams = await prisma.team.findMany({
    where: { id: { in: teamIds }, leagueId },
    select: { id: true },
  });
  const validTeamIds = new Set(validTeams.map(t => t.id));

  for (const entry of entries) {
    if (!validTeamIds.has(entry.teamId)) {
      failed.push({
        teamId: entry.teamId,
        playerId: entry.playerId,
        reason: "Team does not belong to this league.",
        code: "TEAM_NOT_IN_LEAGUE",
      });
      continue;
    }

    const result = await stashOneIdempotent({
      leagueId,
      teamId: entry.teamId,
      stashPlayerId: entry.playerId,
      actorUserId,
    });

    if (result.kind === "stashed") {
      succeeded.push({ teamId: entry.teamId, playerId: entry.playerId, outcome: "stashed" });
    } else if (result.kind === "noop") {
      succeeded.push({ teamId: entry.teamId, playerId: entry.playerId, outcome: "noop" });
    } else {
      failed.push({
        teamId: entry.teamId,
        playerId: entry.playerId,
        reason: result.reason,
        code: result.code,
      });
    }
  }

  // Cache invalidation once after the whole batch — cheaper than per-entry.
  if (succeeded.some(s => s.outcome === "stashed")) {
    clearPlayersCache(leagueId);
    clearStandingsCache(leagueId);
  }

  writeAuditLog({
    userId: actorUserId,
    action: "COMMISSIONER_BULK_IL_STASH",
    resourceType: "League",
    resourceId: String(leagueId),
    metadata: {
      leagueId,
      attempted: entries.length,
      succeededCount: succeeded.length,
      failedCount: failed.length,
      stashedCount: succeeded.filter(s => s.outcome === "stashed").length,
      noopCount: succeeded.filter(s => s.outcome === "noop").length,
    },
  });

  return { succeeded, failed };
}

/**
 * Hard-delete `Roster` rows whose `releasedAt` is older than the cutoff.
 * The Prisma schema treats `releasedAt` as the soft-delete marker; rows
 * older than the cutoff have no live business need (the underlying
 * TransactionEvent rows preserve the audit trail and survive Roster
 * deletion via `onDelete: SetNull`).
 */
export async function cleanupDroppedRosterRows(
  leagueId: number,
  olderThanDays: number,
  actorUserId: number,
): Promise<CleanupDroppedResponse> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  // Scope by leagueId via team relation so a malicious request can't reach
  // other leagues' Roster rows.
  const eligible = await prisma.roster.findMany({
    where: {
      releasedAt: { lt: cutoff },
      team: { leagueId },
    },
    select: { id: true },
  });

  let deletedCount = 0;
  if (eligible.length > 0) {
    const ids = eligible.map(r => r.id);
    const result = await prisma.roster.deleteMany({ where: { id: { in: ids } } });
    deletedCount = result.count;
  }

  writeAuditLog({
    userId: actorUserId,
    action: "COMMISSIONER_CLEANUP_DROPPED_ROSTER",
    resourceType: "League",
    resourceId: String(leagueId),
    metadata: {
      leagueId,
      olderThanDays,
      cutoff: cutoff.toISOString(),
      deletedCount,
    },
  });

  return { deletedCount, cutoff: cutoff.toISOString() };
}
