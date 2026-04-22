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
