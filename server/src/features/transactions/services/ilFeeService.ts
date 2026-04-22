// server/src/features/transactions/services/ilFeeService.ts
// Phase 3 of the roster-rules enforcement plan — per-period IL fee billing.
//
// Reads: RosterSlotEvent (authoritative IL stint log written by Phase 2
// endpoints), LeagueRule (il_slot_1_cost / il_slot_2_cost).
// Writes: FinanceLedger (append-only; never DELETE; uses voidedAt +
// negative-amount reversal entries to correct backdates).
//
// Correctness properties:
//   - Idempotent: re-running reconcileIlFeesForPeriod for the same
//     (leagueId, periodId) converges to the correct ledger state.
//   - Concurrency-safe: wrapped in a transaction with
//     pg_advisory_xact_lock keyed on periodId so two concurrent runs
//     serialize per-period (different periods run in parallel).
//   - Append-only: never DELETEs from FinanceLedger (plan R10). A void
//     marks a row inactive; a matching reversal row carries the negated
//     amount for accounting reconciliation.
//
// Billing rules (plan Q14, Q17b, Q19a):
//   - Rank 1 player on IL during the period = $il_slot_1_cost (default $10).
//   - Rank 2 player = $il_slot_2_cost (default $15).
//   - Any stint overlap with the period → full fee (presence-based, not prorated).
//   - Rank is sticky per stint: computed at the moment of IL_STASH, based on
//     how many OTHER stints for the same team are still open at that instant.

import { prisma } from "../../../db/prisma.js";
import type { PrismaClient, Prisma } from "@prisma/client";
import { writeAuditLog } from "../../../lib/auditLog.js";
import { logger } from "../../../lib/logger.js";

type TxClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/** A derived stint of IL occupancy — one per (team, player, stash event). */
export type BillableStint = {
  teamId: number;
  playerId: number;
  playerName?: string;
  startedAt: Date;
  /** null = stint still open at period end */
  endedAt: Date | null;
  /** 1-based; determined at stash time from count of concurrent open stints on this team. */
  rankAtEntry: 1 | 2;
};

type StintEvent = {
  id: number;
  teamId: number;
  playerId: number;
  event: string;
  effDate: Date;
  player?: { name?: string } | null;
};

/** Per-league IL fee rule values (with defaults). */
async function loadIlFeeRates(tx: TxClient, leagueId: number): Promise<{ slot1: number; slot2: number }> {
  const rules = await tx.leagueRule.findMany({
    where: { leagueId, category: "il", key: { in: ["il_slot_1_cost", "il_slot_2_cost"] } },
    select: { key: true, value: true },
  });
  const byKey = new Map(rules.map(r => [r.key, Number(r.value)]));
  return {
    slot1: Number.isFinite(byKey.get("il_slot_1_cost")) ? (byKey.get("il_slot_1_cost") as number) : 10,
    slot2: Number.isFinite(byKey.get("il_slot_2_cost")) ? (byKey.get("il_slot_2_cost") as number) : 15,
  };
}

/**
 * Derive the stints (start/end windows) for every IL occupancy in the
 * league's history up to `upTo`. Stints are built by pairing IL_STASH
 * events with the next IL_ACTIVATE or IL_RELEASE event for the same
 * (team, player). Open stints (no matching close) stay open with endedAt
 * = null — the reconciler treats them as running through period end.
 */
export async function deriveAllStints(
  tx: TxClient,
  leagueId: number,
  upTo: Date,
): Promise<BillableStint[]> {
  // Pull every IL-touching event for the league up through `upTo` + 1 day
  // (so closes that happen at the period boundary are included).
  const events = await tx.rosterSlotEvent.findMany({
    where: {
      leagueId,
      event: { in: ["IL_STASH", "IL_ACTIVATE", "IL_RELEASE"] },
      effDate: { lte: new Date(upTo.getTime() + 24 * 60 * 60 * 1000) },
    },
    orderBy: [{ teamId: "asc" }, { playerId: "asc" }, { effDate: "asc" }, { id: "asc" }],
    select: {
      id: true, teamId: true, playerId: true,
      event: true, effDate: true,
      player: { select: { name: true } },
    },
  }) as StintEvent[];

  // Group events by (teamId, playerId) and pair STASH with next CLOSE.
  const key = (e: StintEvent) => `${e.teamId}:${e.playerId}`;
  const byPair = new Map<string, StintEvent[]>();
  for (const e of events) {
    const k = key(e);
    const arr = byPair.get(k) ?? [];
    arr.push(e);
    byPair.set(k, arr);
  }

  const rawStints: Array<Omit<BillableStint, "rankAtEntry">> = [];
  for (const arr of byPair.values()) {
    // Walk through events. Each IL_STASH opens a stint; the next
    // IL_ACTIVATE or IL_RELEASE for the same pair closes it.
    let openStart: Date | null = null;
    for (const e of arr) {
      if (e.event === "IL_STASH") {
        if (openStart !== null) {
          // Malformed log: IL_STASH while a stint is already open for this
          // pair. Close the prior one at this event's effDate so we don't
          // lose billing data, and log.
          logger.warn({ teamId: e.teamId, playerId: e.playerId, at: e.effDate },
            "ilFeeService: IL_STASH while prior stint still open — auto-closing.");
          rawStints.push({ teamId: e.teamId, playerId: e.playerId, playerName: e.player?.name, startedAt: openStart, endedAt: e.effDate });
        }
        openStart = e.effDate;
      } else {
        // IL_ACTIVATE or IL_RELEASE
        if (openStart === null) {
          logger.warn({ teamId: e.teamId, playerId: e.playerId, at: e.effDate, event: e.event },
            "ilFeeService: close event with no open stint — ignoring.");
          continue;
        }
        rawStints.push({ teamId: e.teamId, playerId: e.playerId, playerName: e.player?.name, startedAt: openStart, endedAt: e.effDate });
        openStart = null;
      }
    }
    if (openStart !== null) {
      const last = arr[arr.length - 1];
      rawStints.push({ teamId: last.teamId, playerId: last.playerId, playerName: last.player?.name, startedAt: openStart, endedAt: null });
    }
  }

  // Compute rank-at-entry for each stint based on count of concurrent
  // other stints on the same team at the moment of stash.
  const stintsByTeam = new Map<number, typeof rawStints>();
  for (const s of rawStints) {
    const arr = stintsByTeam.get(s.teamId) ?? [];
    arr.push(s);
    stintsByTeam.set(s.teamId, arr);
  }

  const out: BillableStint[] = [];
  for (const [, teamStints] of stintsByTeam) {
    for (const s of teamStints) {
      // How many other stints on this team were OPEN at s.startedAt?
      const concurrent = teamStints.filter(other =>
        other !== s
        && other.startedAt <= s.startedAt
        && (other.endedAt === null || other.endedAt > s.startedAt),
      ).length;
      const rank: 1 | 2 = concurrent === 0 ? 1 : 2;
      out.push({ ...s, rankAtEntry: rank });
      if (concurrent >= 2) {
        logger.warn({ teamId: s.teamId, playerId: s.playerId, concurrent },
          "ilFeeService: more than 2 concurrent IL stints for team — rank capped at 2.");
      }
    }
  }

  return out;
}

/**
 * Does a stint overlap a period? Presence-based per plan Q17=b.
 */
function stintOverlapsPeriod(
  s: Pick<BillableStint, "startedAt" | "endedAt">,
  period: { startDate: Date; endDate: Date },
): boolean {
  const startedBeforeEnd = s.startedAt <= period.endDate;
  const endedAfterStart = s.endedAt === null || s.endedAt >= period.startDate;
  return startedBeforeEnd && endedAfterStart;
}

export type ReconcileResult = {
  leagueId: number;
  periodId: number;
  added: number;
  voided: number;
  unchanged: number;
  dryRun: boolean;
};

/**
 * Reconcile IL fees for a single period. Idempotent — re-running converges
 * to the correct ledger state. Uses advisory lock + Serializable isolation
 * to serialize concurrent runs per period.
 *
 * @param leagueId — scope (IDOR-checked against period.leagueId)
 * @param periodId — target period
 * @param opts.dryRun — if true, compute the diff and return counts but
 *   DON'T write to FinanceLedger. Caller can preview impact.
 * @param opts.actorUserId — recorded on new ledger rows + audit event.
 */
export async function reconcileIlFeesForPeriod(
  leagueId: number,
  periodId: number,
  opts: { dryRun?: boolean; actorUserId?: number | null } = {},
): Promise<ReconcileResult> {
  const dryRun = !!opts.dryRun;
  const actorUserId = opts.actorUserId ?? null;

  return prisma.$transaction(async (tx) => {
    // Advisory lock keyed on periodId — two concurrent reconciles for the
    // same period serialize; different periods run in parallel. Hash the
    // string "il_fee_reconcile" to a stable 32-bit int for the first arg.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('il_fee_reconcile'), ${periodId})`;

    const period = await tx.period.findUnique({
      where: { id: periodId },
      select: { id: true, leagueId: true, startDate: true, endDate: true, name: true },
    });
    if (!period) throw new Error(`Period ${periodId} not found`);
    if (period.leagueId !== leagueId) {
      // IDOR guard (plan security review)
      throw new Error(`Period ${periodId} does not belong to league ${leagueId}`);
    }

    const rates = await loadIlFeeRates(tx, leagueId);

    // Derive stints up through period end — anything open past that is
    // treated as still occupying the slot through period end.
    const allStints = await deriveAllStints(tx, leagueId, period.endDate);
    const billable = allStints.filter(s =>
      stintOverlapsPeriod(s, { startDate: period.startDate, endDate: period.endDate }),
    );

    // Desired ledger rows keyed by (teamId, playerId).
    const desired = new Map<string, { teamId: number; playerId: number; amount: number; rank: 1 | 2; playerName?: string }>();
    for (const s of billable) {
      const amount = s.rankAtEntry === 1 ? rates.slot1 : rates.slot2;
      desired.set(`${s.teamId}:${s.playerId}`, {
        teamId: s.teamId, playerId: s.playerId, amount, rank: s.rankAtEntry, playerName: s.playerName,
      });
    }

    // Current active il_fee rows for this period.
    const existing = await tx.financeLedger.findMany({
      where: { type: "il_fee", periodId, voidedAt: null },
      select: { id: true, teamId: true, playerId: true, amount: true },
    });
    const existingByKey = new Map(existing.map(r => [`${r.teamId}:${r.playerId}`, r]));

    const toAdd: typeof billable = [];
    const toVoid: typeof existing = [];
    let unchanged = 0;

    for (const [k, d] of desired) {
      const row = existingByKey.get(k);
      if (!row) {
        toAdd.push(billable.find(s => `${s.teamId}:${s.playerId}` === k)!);
      } else if (row.amount !== d.amount) {
        // Rank/amount shifted (e.g., a backdate flipped rank 2 → 1). Void
        // + reversal + fresh row at the new amount.
        toVoid.push(row);
        toAdd.push(billable.find(s => `${s.teamId}:${s.playerId}` === k)!);
      } else {
        unchanged++;
      }
    }
    // Existing rows whose corresponding stint is no longer billable:
    // void + reversal (no new row).
    for (const [k, row] of existingByKey) {
      if (!desired.has(k)) toVoid.push(row);
    }

    if (dryRun) {
      return {
        leagueId, periodId,
        added: toAdd.length,
        voided: toVoid.length,
        unchanged,
        dryRun: true,
      };
    }

    // Apply changes — append-only. Never DELETE.
    if (toAdd.length > 0) {
      await tx.financeLedger.createMany({
        data: toAdd.map(s => ({
          teamId: s.teamId,
          periodId,
          playerId: s.playerId,
          type: "il_fee",
          amount: s.rankAtEntry === 1 ? rates.slot1 : rates.slot2,
          reason: `IL rank ${s.rankAtEntry} — period ${period.name}`,
          createdBy: actorUserId,
        })),
        skipDuplicates: true, // partial unique protects against double-fire
      });
    }
    for (const row of toVoid) {
      await tx.financeLedger.update({
        where: { id: row.id },
        data: { voidedAt: new Date() },
      });
      await tx.financeLedger.create({
        data: {
          teamId: row.teamId,
          periodId,
          playerId: row.playerId,
          type: "il_fee",
          amount: -row.amount, // negative reversal
          reason: `Reversal of ledger #${row.id} (reconcile)`,
          reversalOf: row.id,
          createdBy: actorUserId,
        },
      });
    }

    // AuditLog requires a non-null userId. System-initiated reconciles
    // (drainer, period-close cron) have no actor — skip the audit call
    // there; the OutboxEvent row itself carries the provenance. When a
    // commissioner triggers reconcile manually, audit is emitted.
    if (actorUserId != null) {
      writeAuditLog({
        userId: actorUserId,
        action: "IL_FEE_RECONCILE",
        resourceType: "Period",
        resourceId: String(periodId),
        metadata: {
          leagueId, periodId,
          stintCount: billable.length,
          added: toAdd.length,
          voided: toVoid.length,
          unchanged,
        },
      });
    }

    return {
      leagueId, periodId,
      added: toAdd.length,
      voided: toVoid.length,
      unchanged,
      dryRun: false,
    };
  }, { isolationLevel: "Serializable" as Prisma.TransactionIsolationLevel, timeout: 30_000 });
}

/**
 * Reconcile a batch of periods, one at a time (advisory lock per period).
 * Used by the outbox drainer when a backdated transaction affects multiple
 * completed periods.
 */
export async function reconcileIlFeesForPeriods(
  leagueId: number,
  periodIds: number[],
  opts: { actorUserId?: number | null } = {},
): Promise<ReconcileResult[]> {
  const results: ReconcileResult[] = [];
  for (const pid of periodIds) {
    results.push(await reconcileIlFeesForPeriod(leagueId, pid, { actorUserId: opts.actorUserId }));
  }
  return results;
}
