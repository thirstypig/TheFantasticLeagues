/**
 * Wire List processor service — pure(-ish) state-machine functions extracted
 * from `processor.ts` (todo #174).
 *
 * Routes own:
 *   - HTTP parsing (`req.body`, `req.params`)
 *   - Auth (`assertCommissionerForPeriod`, `loadAddEntryAsCommissioner`)
 *   - Audit log writes (so the audit action label can vary by outcome)
 *   - Push fan-out (fire-and-forget IIFE, fed by the service's return value)
 *
 * Service owns:
 *   - Prisma transactions + status-CAS guards
 *   - Consume / free reducer semantics
 *   - Position-eligibility re-checks at outcome time
 *   - Throwing `WireListServiceError` so the route can map → HTTP 1:1
 *
 * Behavior is byte-identical to the prior in-route implementation. Error codes
 * and HTTP statuses round-trip through `WireListServiceError` exactly as
 * before.
 */
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { nextDayEffective } from "../../../lib/utils.js";
import { enforceRosterRules } from "../../../lib/featureFlags.js";
import { isEligibleForSlot } from "../../transactions/lib/positionInherit.js";
import { getLeagueStatsSource, getTeamsForSource } from "../../../lib/mlbTeams.js";
import type { WaiverPeriodStatus } from "../../../../../shared/api/wireList.js";
import { SlotChangeSchema, type SlotChange } from "../../../../../shared/api/rosterMoves.js";

// ─── Error type ──────────────────────────────────────────────────────

/**
 * Structured error thrown by service functions. The route translates each
 * `(status, code, message)` tuple to its corresponding HTTP response.
 *
 * `extra` carries response-shape data that some codes need (e.g. `blockers`
 * for FINALIZE_BLOCKED, `pendingAdds` count). The route spreads it into the
 * JSON body alongside `error` + `code`.
 */
export class WireListServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "WireListServiceError";
  }
}

// ─── Loaded-entry shape (mirror of the route-layer auth helper output) ───

const loadedAddEntrySelect = {
  id: true,
  periodId: true,
  teamId: true,
  playerId: true,
  outcome: true,
  consumedDropEntryId: true,
  reason: true,
  slotChanges: true,
  period: { select: { id: true, leagueId: true, createdAt: true, status: true } },
} satisfies Prisma.WaiverAddEntrySelect;

export type LoadedAddEntry = Omit<
  Prisma.WaiverAddEntryGetPayload<{ select: typeof loadedAddEntrySelect }>,
  "period"
> & {
  period: Omit<
    Prisma.WaiverAddEntryGetPayload<{ select: typeof loadedAddEntrySelect }>["period"],
    "status"
  > & { status: WaiverPeriodStatus };
};

export const PROCESSOR_LOADED_ADD_ENTRY_SELECT = loadedAddEntrySelect;

// ─── Period transitions ──────────────────────────────────────────────

/**
 * Lock a PENDING period. Throws on non-PENDING.
 */
export async function lockPeriod(period: {
  id: number;
  status: WaiverPeriodStatus;
}): Promise<Awaited<ReturnType<typeof prisma.waiverPeriod.update>>> {
  if (period.status !== "PENDING") {
    throw new WireListServiceError(
      403,
      "PERIOD_NOT_PENDING",
      `Period is ${period.status} — only PENDING periods can be locked`,
    );
  }
  return prisma.waiverPeriod.update({
    where: { id: period.id },
    data: { status: "LOCKED", lockedAt: new Date() },
  });
}

export type FinalizeResult = {
  period: Awaited<ReturnType<typeof prisma.waiverPeriod.update>>;
  addsApplied: number;
  dropsConsumed: number;
  dropsUnused: number;
  /**
   * Per-team success names harvested INSIDE the tx so the push fan-out doesn't
   * need to re-query waiverAddEntry. Routes use this to compose push payloads.
   */
  successesByTeam: Map<number, string[]>;
};

/**
 * Finalize a LOCKED period: apply all SUCCEEDED adds, mark UNUSED drops,
 * flip period to PROCESSED. Wrapped in a single $transaction with status-CAS
 * + count-asserted roster mutations (todo #156, #160).
 */
export async function finalizePeriod(period: {
  id: number;
  leagueId: number;
  status: WaiverPeriodStatus;
  createdAt: Date;
}): Promise<FinalizeResult> {
  if (period.status !== "LOCKED") {
    throw new WireListServiceError(
      403,
      "PERIOD_NOT_LOCKED",
      `Period is ${period.status} — only LOCKED periods can be finalized`,
    );
  }

  // Block finalize if any Add is still PENDING — commissioner must decide every row.
  const pendingAdds = await prisma.waiverAddEntry.count({
    where: { periodId: period.id, outcome: "PENDING" },
  });
  if (pendingAdds > 0) {
    throw new WireListServiceError(
      409,
      "FINALIZE_BLOCKED",
      `${pendingAdds} Add ${pendingAdds === 1 ? "entry has" : "entries have"} no outcome — succeed/fail/skip every row before finalizing`,
      { pendingAdds },
    );
  }

  const effective = nextDayEffective();
  const seasonYear =
    (await prisma.league.findUnique({ where: { id: period.leagueId }, select: { season: true } }))
      ?.season ?? new Date().getFullYear();
  const PITCHER_POS = new Set(["P", "SP", "RP", "CL"]);
  const allowed = getTeamsForSource(await getLeagueStatsSource(period.leagueId));

  // ────────────────────────────────────────────────────────────────────
  // Atomicity (todo #156): the period-status check, blocker re-validation,
  // and roster mutations all happen inside ONE $transaction. The first
  // write is a CAS on period.status — if a concurrent finalize already
  // flipped it to PROCESSED, our update matches zero rows and we throw a
  // typed error that rolls everything back, returning 409 PERIOD_NOT_LOCKED.
  // Every roster.updateMany for a drop also asserts count===1 — if the drop
  // player slipped off the roster between commissioner-decision time and
  // finalize, the transaction rolls back rather than silently producing a
  // ghost-add row.
  // ────────────────────────────────────────────────────────────────────
  type FinalizeError =
    | { code: "PERIOD_NOT_LOCKED" }
    | { code: "FINALIZE_BLOCKED"; blockers: Array<{ addId: number; code: string; detail: string }> }
    | { code: "DROP_NOT_ON_ROSTER"; addId: number; playerId: number };

  try {
    return await prisma.$transaction(async (tx) => {
      const cas = await tx.waiverPeriod.updateMany({
        where: { id: period.id, status: "LOCKED" },
        data: { status: "LOCKED" },
      });
      if (cas.count === 0) {
        const err: FinalizeError = { code: "PERIOD_NOT_LOCKED" };
        throw err;
      }

      const succeededAdds = await tx.waiverAddEntry.findMany({
        where: { periodId: period.id, outcome: "SUCCEEDED" },
        include: {
          consumedDrop: {
            select: {
              id: true,
              playerId: true,
              dropMode: true,
              slotChanges: true,
              player: { select: { name: true } },
            },
          },
          player: { select: { id: true, name: true, posPrimary: true, posList: true } },
        },
        orderBy: [{ teamId: "asc" }, { priority: "asc" }],
      });

      const blockers: Array<{ addId: number; code: string; detail: string }> = [];
      for (const add of succeededAdds) {
        const stillFA = await tx.roster.findFirst({
          where: { playerId: add.playerId, releasedAt: null, team: { leagueId: period.leagueId } },
          select: { id: true },
        });
        if (stillFA) {
          blockers.push({ addId: add.id, code: "PLAYER_NOT_FA", detail: "Player is now on a roster" });
          continue;
        }
        const teamCode =
          (await tx.player.findUnique({ where: { id: add.playerId }, select: { mlbTeam: true } }))
            ?.mlbTeam ?? "";
        if (allowed && teamCode && teamCode !== "FA" && !allowed.has(teamCode)) {
          blockers.push({ addId: add.id, code: "PLAYER_NOT_FA", detail: "Player's MLB team outside league source" });
          continue;
        }
        if (!add.consumedDrop) {
          blockers.push({ addId: add.id, code: "NO_DROP_AVAILABLE", detail: "Consumed drop record missing" });
          continue;
        }
        const dropRoster = await tx.roster.findFirst({
          where: { teamId: add.teamId, playerId: add.consumedDrop.playerId, releasedAt: null },
          select: { id: true },
        });
        if (!dropRoster) {
          blockers.push({ addId: add.id, code: "PLAYER_NOT_ON_TEAM", detail: "Drop player no longer on team" });
        }
      }
      if (blockers.length > 0) {
        const err: FinalizeError = { code: "FINALIZE_BLOCKED", blockers };
        throw err;
      }

      // Batch I/O setup (todo #160).
      const succeededWithDrop = succeededAdds.filter((a) => a.consumedDrop);
      const dropRosters =
        succeededWithDrop.length === 0
          ? []
          : await tx.roster.findMany({
              where: {
                releasedAt: null,
                OR: succeededWithDrop.map((a) => ({
                  teamId: a.teamId,
                  playerId: a.consumedDrop!.playerId,
                })),
              },
              select: { id: true, teamId: true, playerId: true, assignedPosition: true },
            });
      const dropRosterByKey = new Map(
        dropRosters.map((r) => [`${r.teamId}-${r.playerId}`, r]),
      );

      const eventRows: Array<{
        rowHash: string;
        leagueId: number;
        season: number;
        effDate: Date;
        submittedAt: Date;
        teamId: number;
        playerId: number;
        transactionRaw: string;
        transactionType: string;
      }> = [];
      const processedAddIds: number[] = [];
      const processedDropIds: number[] = [];

      let dropsConsumed = 0;
      const now = new Date();
      for (const add of succeededAdds) {
        if (!add.consumedDrop) continue;
        const drop = add.consumedDrop;

        const dropRoster = dropRosterByKey.get(`${add.teamId}-${drop.playerId}`);
        if (!dropRoster) {
          const err: FinalizeError = { code: "DROP_NOT_ON_ROSTER", addId: add.id, playerId: drop.playerId };
          throw err;
        }

        const released = await tx.roster.updateMany({
          where: { id: dropRoster.id, releasedAt: null },
          data: {
            releasedAt: effective,
            source: drop.dropMode === "IL_STASH" ? "WIRE_LIST_IL_STASH" : "WIRE_LIST_DROP",
          },
        });
        if (released.count !== 1) {
          const err: FinalizeError = { code: "DROP_NOT_ON_ROSTER", addId: add.id, playerId: drop.playerId };
          throw err;
        }

        // Apply owner-directed slot rearrangements from both drop and add entries.
        // Merged set: drop-entry changes first, then add-entry changes (add wins on conflict).
        const rawDropChanges = drop.slotChanges;
        const rawAddChanges = add.slotChanges;
        const mergedChanges = new Map<number, string>(); // playerId → newSlot
        const parseChanges = (raw: unknown): SlotChange[] => {
          if (!Array.isArray(raw)) return [];
          return raw.flatMap((c) => {
            const parsed = SlotChangeSchema.safeParse(c);
            return parsed.success ? [parsed.data] : [];
          });
        };
        for (const c of parseChanges(rawDropChanges)) mergedChanges.set(c.playerId, c.slot);
        for (const c of parseChanges(rawAddChanges)) mergedChanges.set(c.playerId, c.slot); // add wins

        if (mergedChanges.size > 0) {
          // Fetch active roster rows for the team to validate eligibility.
          // Drop player is already released above, so they won't appear here.
          const activeRows = await tx.roster.findMany({
            where: { teamId: add.teamId, releasedAt: null },
            select: { id: true, playerId: true, player: { select: { posList: true, name: true } } },
          });
          const byPlayerId = new Map(activeRows.map((r) => [r.playerId, r]));
          for (const [playerId, newSlot] of mergedChanges) {
            const row = byPlayerId.get(playerId);
            if (!row) continue; // player may have already been dropped — skip silently
            const eligible = isEligibleForSlot(row.player.posList, newSlot);
            if (!eligible) continue; // skip ineligible — don't throw, finalize must be atomic
            await tx.roster.update({ where: { id: row.id }, data: { assignedPosition: newSlot } });
          }
        }

        const inherited =
          dropRoster.assignedPosition && dropRoster.assignedPosition !== "IL"
            ? dropRoster.assignedPosition
            : null;
        const primary = (add.player.posPrimary ?? "UT").toUpperCase();
        const fallback = PITCHER_POS.has(primary) ? "P" : primary;
        const assignedPos = enforceRosterRules() && inherited ? inherited : fallback;

        await tx.roster.create({
          data: {
            teamId: add.teamId,
            playerId: add.playerId,
            source: "WIRE_LIST",
            price: 0,
            acquiredAt: effective,
            assignedPosition: assignedPos,
          },
        });

        eventRows.push({
          rowHash: `WIRE-LIST-ADD-${crypto.randomUUID()}-${add.playerId}`,
          leagueId: period.leagueId,
          season: seasonYear,
          effDate: effective,
          submittedAt: now,
          teamId: add.teamId,
          playerId: add.playerId,
          transactionRaw: `Wire List: added ${add.player.name}`,
          transactionType: "ADD",
        });
        eventRows.push({
          rowHash: `WIRE-LIST-DROP-${crypto.randomUUID()}-${drop.playerId}`,
          leagueId: period.leagueId,
          season: seasonYear,
          effDate: effective,
          submittedAt: now,
          teamId: add.teamId,
          playerId: drop.playerId,
          transactionRaw: `Wire List: ${drop.dropMode === "IL_STASH" ? "IL-stashed" : "released"} ${drop.player?.name ?? `#${drop.playerId}`}`,
          transactionType: "DROP",
        });

        processedAddIds.push(add.id);
        processedDropIds.push(drop.id);
        dropsConsumed++;
      }

      if (eventRows.length > 0) {
        await tx.transactionEvent.createMany({ data: eventRows });
      }
      if (processedAddIds.length > 0) {
        await tx.waiverAddEntry.updateMany({
          where: { id: { in: processedAddIds } },
          data: { processedAt: now },
        });
      }
      if (processedDropIds.length > 0) {
        await tx.waiverDropEntry.updateMany({
          where: { id: { in: processedDropIds } },
          data: { processedAt: now },
        });
      }

      const unusedDrops = await tx.waiverDropEntry.updateMany({
        where: { periodId: period.id, status: "PENDING" },
        data: { status: "UNUSED", processedAt: new Date() },
      });

      const updatedPeriod = await tx.waiverPeriod.update({
        where: { id: period.id },
        data: { status: "PROCESSED", processedAt: new Date() },
      });

      const successesByTeam = new Map<number, string[]>();
      for (const add of succeededAdds) {
        const list = successesByTeam.get(add.teamId);
        if (list) list.push(add.player.name);
        else successesByTeam.set(add.teamId, [add.player.name]);
      }

      return {
        period: updatedPeriod,
        dropsConsumed,
        dropsUnused: unusedDrops.count,
        addsApplied: succeededAdds.length,
        successesByTeam,
      };
    });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err) {
      const e = err as FinalizeError;
      if (e.code === "PERIOD_NOT_LOCKED") {
        throw new WireListServiceError(
          409,
          "PERIOD_NOT_LOCKED",
          "Period status changed during finalize — already finalized or no longer LOCKED",
        );
      }
      if (e.code === "FINALIZE_BLOCKED") {
        throw new WireListServiceError(
          409,
          "FINALIZE_BLOCKED",
          "One or more SUCCEEDED outcomes are no longer valid — revert and re-decide before finalizing",
          { blockers: e.blockers },
        );
      }
      if (e.code === "DROP_NOT_ON_ROSTER") {
        throw new WireListServiceError(
          409,
          "FINALIZE_BLOCKED",
          "Drop player is no longer on this team's roster — revert the affected entry and re-decide",
          {
            blockers: [
              {
                addId: e.addId,
                code: "PLAYER_NOT_ON_TEAM",
                detail: `Player #${e.playerId} not on roster at finalize time`,
              },
            ],
          },
        );
      }
    }
    throw err;
  }
}

// ─── Outcome reducer ─────────────────────────────────────────────────

export type SucceedAddResult = {
  updated: Awaited<ReturnType<typeof prisma.waiverAddEntry.update>>;
  consumedDropEntryId: number;
};

/**
 * Apply a SUCCEEDED outcome: re-validate eligibility, find the next PENDING
 * drop, atomically flip drop → CONSUMED + add → SUCCEEDED with the FK link.
 *
 * Routes must have run `ensureLockedPeriodAndPendingEntry(entry)` before
 * calling. Auth was performed by `loadAddEntryAsCommissioner`.
 */
export async function succeedAdd(entry: LoadedAddEntry): Promise<SucceedAddResult> {
  // Pre-tx eligibility re-validation.
  const onRoster = await prisma.roster.findFirst({
    where: { playerId: entry.playerId, releasedAt: null, team: { leagueId: entry.period.leagueId } },
    select: { id: true },
  });
  if (onRoster) {
    throw new WireListServiceError(409, "PLAYER_NOT_FA", "Player is no longer a free agent");
  }
  const acquired = await prisma.roster.findFirst({
    where: { teamId: entry.teamId, playerId: entry.playerId, acquiredAt: { gt: entry.period.createdAt } },
    select: { id: true },
  });
  if (acquired) {
    throw new WireListServiceError(
      400,
      "ACQUIRED_THIS_PERIOD",
      "Player was acquired during this period — not eligible",
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // Atomicity (todo #157): everything from "find next drop" through
  // "mark drop CONSUMED + add SUCCEEDED" runs in ONE transaction. The
  // drop transition uses a status-CAS so a sibling add that already won
  // the same drop gives count===0, not P2002. We still also catch P2002
  // on the add side (consumedDropEntryId @unique) as a belt-and-suspenders
  // guard and translate it to 409 DROP_RACE_LOST.
  // ────────────────────────────────────────────────────────────────────
  type SucceedError =
    | { kind: "NO_DROP_AVAILABLE" }
    | { kind: "PLAYER_NOT_ON_TEAM" }
    | { kind: "POSITION_INCOMPATIBLE"; slot: string }
    | { kind: "DROP_RACE_LOST"; dropId: number };

  try {
    return await prisma.$transaction(async (tx) => {
      const nextDrop = await tx.waiverDropEntry.findFirst({
        where: { periodId: entry.periodId, teamId: entry.teamId, status: "PENDING" },
        orderBy: { priority: "asc" },
      });
      if (!nextDrop) {
        const err: SucceedError = { kind: "NO_DROP_AVAILABLE" };
        throw err;
      }

      const dropRoster = await tx.roster.findFirst({
        where: { teamId: entry.teamId, playerId: nextDrop.playerId, releasedAt: null },
        select: { id: true, assignedPosition: true },
      });
      if (!dropRoster) {
        const err: SucceedError = { kind: "PLAYER_NOT_ON_TEAM" };
        throw err;
      }

      // When the owner has provided slotChanges, they've taken responsibility for
      // the slot layout — skip the POSITION_INCOMPATIBLE check.
      const hasSlotChanges =
        entry.slotChanges !== null &&
        Array.isArray(entry.slotChanges) &&
        (entry.slotChanges as unknown[]).length > 0;
      if (
        !hasSlotChanges &&
        enforceRosterRules() &&
        nextDrop.dropMode !== "IL_STASH" &&
        dropRoster.assignedPosition &&
        dropRoster.assignedPosition !== "IL"
      ) {
        const addPlayer = await tx.player.findUnique({
          where: { id: entry.playerId },
          select: { posList: true },
        });
        const compatible = addPlayer ? isEligibleForSlot(addPlayer.posList, dropRoster.assignedPosition) : false;
        if (!compatible) {
          const err: SucceedError = { kind: "POSITION_INCOMPATIBLE", slot: dropRoster.assignedPosition };
          throw err;
        }
      }

      const consume = await tx.waiverDropEntry.updateMany({
        where: { id: nextDrop.id, status: "PENDING" },
        data: { status: "CONSUMED" },
      });
      if (consume.count === 0) {
        const err: SucceedError = { kind: "DROP_RACE_LOST", dropId: nextDrop.id };
        throw err;
      }

      const u = await tx.waiverAddEntry.update({
        where: { id: entry.id },
        data: { outcome: "SUCCEEDED", consumedDropEntryId: nextDrop.id, reason: null },
      });
      return { updated: u, consumedDropEntryId: nextDrop.id };
    });
  } catch (err) {
    if (err && typeof err === "object" && "kind" in err) {
      const e = err as SucceedError;
      if (e.kind === "NO_DROP_AVAILABLE") {
        throw new WireListServiceError(
          409,
          "NO_DROP_AVAILABLE",
          "No drop slot available — team has used all pending drops. Mark this Add as SKIPPED instead.",
        );
      }
      if (e.kind === "PLAYER_NOT_ON_TEAM") {
        throw new WireListServiceError(
          409,
          "PLAYER_NOT_ON_TEAM",
          "Drop player is no longer on this team's roster — drop entry is stale",
        );
      }
      if (e.kind === "POSITION_INCOMPATIBLE") {
        throw new WireListServiceError(
          400,
          "POSITION_INCOMPATIBLE",
          `Add player is not eligible for the dropped player's ${e.slot} slot`,
        );
      }
      if (e.kind === "DROP_RACE_LOST") {
        throw new WireListServiceError(
          409,
          "DROP_RACE_LOST",
          "Another add for this team consumed the next drop slot first — refresh and retry",
        );
      }
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new WireListServiceError(
        409,
        "DROP_RACE_LOST",
        "Another add for this team consumed the next drop slot first — refresh and retry",
      );
    }
    throw err;
  }
}

/**
 * Record a terminal FAILED/SKIPPED outcome. Caller is responsible for
 * `ensureLockedPeriodAndPendingEntry` before invocation.
 */
export async function recordTerminalOutcome(
  outcome: "FAILED" | "SKIPPED",
  entry: { id: number },
  reason: string | null | undefined,
): Promise<Awaited<ReturnType<typeof prisma.waiverAddEntry.update>>> {
  return prisma.waiverAddEntry.update({
    where: { id: entry.id },
    data: { outcome, reason: reason ?? null },
  });
}

export const failAdd = (entry: { id: number }, reason: string | null | undefined) =>
  recordTerminalOutcome("FAILED", entry, reason);

export const skipAdd = (entry: { id: number }, reason: string | null | undefined) =>
  recordTerminalOutcome("SKIPPED", entry, reason);

/**
 * Revert a non-PENDING add back to PENDING and free the consumed drop.
 *
 * Routes must have run `ensureLockedPeriodAndProcessedEntry(entry)` before
 * calling. Auth was performed by `loadAddEntryAsCommissioner`.
 */
export async function revertAdd(entry: {
  id: number;
  consumedDropEntryId: number | null;
}): Promise<Awaited<ReturnType<typeof prisma.waiverAddEntry.update>>> {
  // ────────────────────────────────────────────────────────────────────
  // Atomicity (todo #157): freeing the drop and clearing the
  // consumedDropEntryId on the add must happen in one tx. We clear the FK
  // on the add FIRST so the unique constraint on consumedDropEntryId is
  // released before any sibling tries to claim the same drop. P2002 from
  // a concurrent succeed is translated to 409 DROP_RACE_LOST.
  // ────────────────────────────────────────────────────────────────────
  try {
    return await prisma.$transaction(async (tx) => {
      const u = await tx.waiverAddEntry.update({
        where: { id: entry.id },
        data: { outcome: "PENDING", consumedDropEntryId: null, reason: null },
      });
      if (entry.consumedDropEntryId) {
        await tx.waiverDropEntry.updateMany({
          where: { id: entry.consumedDropEntryId, status: "CONSUMED" },
          data: { status: "PENDING", processedAt: null },
        });
      }
      return u;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new WireListServiceError(
        409,
        "DROP_RACE_LOST",
        "Concurrent succeed claimed the same drop — refresh and retry",
      );
    }
    throw err;
  }
}

// ─── Read endpoint ───────────────────────────────────────────────────

/**
 * One-pass groupBy of adds + drops by team for the multi-team results view
 * (todo #172). Returns the period row and the bucketed lists; route layer
 * handles auth + 404.
 */
export async function getPeriodResults(periodId: number) {
  const [adds, drops] = await Promise.all([
    prisma.waiverAddEntry.findMany({
      where: { periodId },
      include: { player: { select: { id: true, name: true, posPrimary: true, mlbTeam: true } } },
      orderBy: [{ teamId: "asc" }, { priority: "asc" }],
    }),
    prisma.waiverDropEntry.findMany({
      where: { periodId },
      include: { player: { select: { id: true, name: true, posPrimary: true, mlbTeam: true } } },
      orderBy: [{ teamId: "asc" }, { priority: "asc" }],
    }),
  ]);

  type TeamBucket = { teamId: number; adds: typeof adds; drops: typeof drops };
  const buckets = new Map<number, TeamBucket>();
  const ensure = (teamId: number): TeamBucket => {
    let b = buckets.get(teamId);
    if (!b) {
      b = { teamId, adds: [], drops: [] };
      buckets.set(teamId, b);
    }
    return b;
  };
  for (const a of adds) ensure(a.teamId).adds.push(a);
  for (const d of drops) ensure(d.teamId).drops.push(d);
  const byTeam = Array.from(buckets.values()).sort((a, b) => a.teamId - b.teamId);

  return { byTeam };
}
