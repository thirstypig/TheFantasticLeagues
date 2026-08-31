// server/src/lib/outboxDrainer.ts
// In-process drainer for OutboxEvent rows. Polls every 5 seconds, picks
// uncompleted rows via SELECT ... FOR UPDATE SKIP LOCKED, processes by
// kind, and marks completedAt on success.
//
// Forward-compatible with pg-boss: when FBST goes multi-container, the
// contract here (outbox table + kind-based dispatch) maps 1:1 onto
// pg-boss job semantics; the only swap is replacing the drain loop with
// a pg-boss worker. For single-container today, this is enough.

import { prisma } from "../db/prisma.js";
import { logger } from "./logger.js";
import { reconcileIlFeesForPeriods } from "../features/transactions/services/ilFeeService.js";
import { findPeriodsMissingReconcile, findExhaustedEvents } from "./outboxHealth.js";
import { findIlLogDrift } from "./ilLogDrift.js";

type OutboxPayloadFeeReconcile = {
  leagueId: number;
  periodIds: number[];
};

const POLL_INTERVAL_MS = 5_000;
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 5;

let timer: NodeJS.Timeout | null = null;
let draining = false;

/**
 * Pull up to BATCH_SIZE uncompleted events under SKIP LOCKED + process
 * each by kind. Returns the number of events processed this tick
 * (useful for tests).
 */
export async function drainOutboxOnce(): Promise<number> {
  // FOR UPDATE SKIP LOCKED ensures concurrent drainers (future
  // multi-container) don't double-process; today it's a no-op but harmless.
  const rows = await prisma.$queryRaw<Array<{ id: number; kind: string; payload: unknown; attempts: number }>>`
    SELECT id, kind, payload, attempts
    FROM "OutboxEvent"
    WHERE "completedAt" IS NULL AND attempts < ${MAX_ATTEMPTS}
    ORDER BY "createdAt" ASC
    FOR UPDATE SKIP LOCKED
    LIMIT ${BATCH_SIZE}
  `;

  if (rows.length === 0) return 0;

  for (const row of rows) {
    try {
      await dispatch(row.kind, row.payload);
      await prisma.outboxEvent.update({
        where: { id: row.id },
        data: { completedAt: new Date(), attempts: row.attempts + 1 },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ error: msg, id: row.id, kind: row.kind }, "Outbox event failed");
      await prisma.outboxEvent.update({
        where: { id: row.id },
        data: { attempts: row.attempts + 1, lastError: msg.slice(0, 500) },
      });
    }
  }

  return rows.length;
}

async function dispatch(kind: string, payload: unknown): Promise<void> {
  switch (kind) {
    case "IL_FEE_RECONCILE": {
      const p = payload as OutboxPayloadFeeReconcile;
      if (!p?.leagueId || !Array.isArray(p.periodIds) || p.periodIds.length === 0) {
        throw new Error("IL_FEE_RECONCILE payload missing leagueId or periodIds");
      }
      await reconcileIlFeesForPeriods(p.leagueId, p.periodIds, { actorUserId: null });
      return;
    }
    default:
      throw new Error(`Unknown outbox kind: ${kind}`);
  }
}

/**
 * Enqueue an outbox event. Call inside or outside a transaction (the
 * function uses the global prisma client either way — the event is durable
 * once committed). For same-request enqueuing, prefer inside the tx so a
 * rollback drops the outbox row too.
 */
export async function enqueueIlFeeReconcile(
  tx: { outboxEvent: { create: (args: any) => Promise<any> } } | null,
  leagueId: number,
  periodIds: number[],
): Promise<void> {
  if (periodIds.length === 0) return;
  const client = tx ?? prisma;
  await client.outboxEvent.create({
    data: {
      kind: "IL_FEE_RECONCILE",
      payload: { leagueId, periodIds } as any,
    },
  });
}

/**
 * Enqueue IL_FEE_RECONCILE for every COMPLETED period that has no successful
 * reconcile event (todo: P4/P7 missing-enqueue gap, 2026-08-31).
 *
 * The transition-based enqueue in `PATCH /api/periods/:id` only fires when a
 * period is closed *through that route*. OGBA rollovers are sometimes done with
 * a direct DB write, which skips it silently — Period 4 closed that way and its
 * $50 sat unbilled for weeks with nothing to notice. This sweeps the end state
 * instead of trusting the transition, so a period closed by any means still
 * gets billed.
 *
 * Safe to run repeatedly: reconcile is idempotent and a period that owes
 * nothing simply reports `added: 0`. Returns the number of events enqueued.
 */
export async function sweepMissingFeeReconciles(): Promise<number> {
  const periods = await prisma.period.findMany({
    where: { status: "completed" },
    select: { id: true, status: true, leagueId: true },
  });
  const events = await prisma.outboxEvent.findMany({
    where: { kind: "IL_FEE_RECONCILE" },
    select: { payload: true, completedAt: true },
  });

  const missing = new Set(
    findPeriodsMissingReconcile(
      periods.map((p) => ({ id: p.id, status: p.status })),
      events as Array<{ payload: { periodIds?: number[] }; completedAt: Date | null }>,
    ),
  );
  if (missing.size === 0) return 0;

  // One event per league, carrying that league's missing period ids.
  const byLeague = new Map<number, number[]>();
  for (const p of periods) {
    if (!missing.has(p.id) || p.leagueId == null) continue;
    byLeague.set(p.leagueId, [...(byLeague.get(p.leagueId) ?? []), p.id]);
  }

  let enqueued = 0;
  for (const [leagueId, periodIds] of byLeague) {
    await enqueueIlFeeReconcile(null, leagueId, periodIds);
    enqueued++;
    logger.warn({ leagueId, periodIds },
      "outbox: completed period(s) had no successful IL fee reconcile — enqueued by sweeper");
  }
  return enqueued;
}

/**
 * Outbox events the drainer will never retry: at or past MAX_ATTEMPTS and still
 * incomplete. They are invisible to `drainOutboxOnce` (which filters
 * `attempts < MAX_ATTEMPTS`), so without this they fail once and are never
 * heard from again — rows 1 and 2 sat that way for ~two months.
 */
export async function findStuckOutboxEvents() {
  const rows = await prisma.outboxEvent.findMany({
    where: { completedAt: null },
    select: { id: true, kind: true, attempts: true, completedAt: true, lastError: true },
  });
  return findExhaustedEvents(rows, MAX_ATTEMPTS);
}

/**
 * Reset an exhausted event so the drainer picks it up again. The escape hatch
 * that did not exist: once a bug was fixed in code, nothing could re-run the
 * events that had already burned their retries on it.
 */
export async function requeueOutboxEvent(id: number): Promise<void> {
  await prisma.outboxEvent.update({
    where: { id },
    data: { attempts: 0, lastError: null },
  });
  logger.info({ id }, "outbox: event requeued (attempts reset)");
}

/**
 * IL events present in one log but not the other (todo #310).
 *
 * A stash missing from `RosterSlotEvent` is unbillable — the fee service reads
 * that log — so the charge is silently never made. A row present only in
 * `RosterSlotEvent` is a billing event no recorded transaction explains.
 *
 * Deliberately not scoped to a league: drift anywhere is a data-integrity fault.
 */
export async function findIlLogDriftAll() {
  const [te, rse] = await Promise.all([
    prisma.transactionEvent.findMany({
      where: { transactionType: { in: ["IL_STASH", "IL_ACTIVATE", "IL_RELEASE"] }, effDate: { not: null } },
      select: { teamId: true, playerId: true, effDate: true, transactionType: true },
    }),
    prisma.rosterSlotEvent.findMany({
      select: { teamId: true, playerId: true, effDate: true, event: true },
    }),
  ]);
  return findIlLogDrift(
    te
      .filter((e) => e.teamId != null && e.playerId != null && e.effDate != null && e.transactionType != null)
      .map((e) => ({ teamId: e.teamId!, playerId: e.playerId!, effDate: e.effDate!, transactionType: e.transactionType! })),
    rse,
  );
}

/**
 * Start the in-process drainer. Idempotent — calling twice is a no-op.
 * Called from server bootstrap (server/src/index.ts).
 */
export function startOutboxDrainer(): void {
  if (timer) return;
  const tick = async () => {
    if (draining) return;
    draining = true;
    try {
      await drainOutboxOnce();
    } catch (err) {
      logger.error({ error: String(err) }, "Outbox drainer tick error");
    } finally {
      draining = false;
    }
  };
  timer = setInterval(tick, POLL_INTERVAL_MS);
  logger.info({ intervalMs: POLL_INTERVAL_MS }, "Outbox drainer started");
}

export function stopOutboxDrainer(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
