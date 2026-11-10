// server/src/lib/deferredBilling.ts
// "Bill later" record. A commissioner can close a period without billing IL
// fees; the PERIOD_CLOSE audit row then carries `metadata.billed === false`.
// That period's billing is DEFERRED until a commissioner bills it manually,
// which writes an IL_FEE_RECONCILE audit row (system reconciles have no actor
// and write none, so they can never end a deferral).
//
// Every automatic billing path (outbox drainer, hourly sweeper) must skip
// deferred periods, and the hub's "unbilled periods" list reads the same
// predicate — one definition, so the three can't drift apart.
import { prisma } from "../db/prisma.js";

export type DeferralAuditRow = {
  action: string;
  resourceId: string | null;
  createdAt: Date;
  metadata: unknown;
};

export type DeferredPeriod = {
  periodId: number;
  /** metadata.leagueId of the deferring PERIOD_CLOSE row (null when absent). */
  leagueId: number | null;
  closedAt: Date;
};

function metaRecord(metadata: unknown): Record<string, unknown> | null {
  return metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : null;
}

function metaLeagueId(metadata: unknown): number | null {
  const m = metaRecord(metadata);
  if (!m || m.leagueId == null) return null;
  const n = Number(m.leagueId);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pure predicate over PERIOD_CLOSE / IL_FEE_RECONCILE audit rows. A period is
 * deferred when its LATEST PERIOD_CLOSE has `metadata.billed === false` and no
 * IL_FEE_RECONCILE row for it is strictly later than that close.
 */
export function computeDeferredPeriods(rows: DeferralAuditRow[]): DeferredPeriod[] {
  const latestClose = new Map<string, DeferralAuditRow>();
  const latestReconcile = new Map<string, Date>();
  for (const r of rows) {
    if (r.resourceId == null) continue;
    if (r.action === "PERIOD_CLOSE") {
      const prev = latestClose.get(r.resourceId);
      if (!prev || r.createdAt >= prev.createdAt) latestClose.set(r.resourceId, r);
    } else if (r.action === "IL_FEE_RECONCILE") {
      const prev = latestReconcile.get(r.resourceId);
      if (!prev || r.createdAt > prev) latestReconcile.set(r.resourceId, r.createdAt);
    }
  }

  const out: DeferredPeriod[] = [];
  for (const [resourceId, close] of latestClose) {
    if (metaRecord(close.metadata)?.billed !== false) continue;
    const reconciledAt = latestReconcile.get(resourceId);
    if (reconciledAt && reconciledAt > close.createdAt) continue;
    const periodId = Number(resourceId);
    if (!Number.isInteger(periodId)) continue;
    out.push({ periodId, leagueId: metaLeagueId(close.metadata), closedAt: close.createdAt });
  }
  return out.sort((a, b) => a.periodId - b.periodId);
}

/**
 * Deferred periods, optionally limited to `periodIds`. Period ids are global,
 * so no league scope is needed to answer "is this period deferred".
 */
export async function findDeferredPeriods(periodIds?: number[]): Promise<DeferredPeriod[]> {
  if (periodIds && periodIds.length === 0) return [];
  const rows = await prisma.auditLog.findMany({
    where: {
      action: { in: ["PERIOD_CLOSE", "IL_FEE_RECONCILE"] },
      resourceType: "Period",
      ...(periodIds ? { resourceId: { in: periodIds.map(String) } } : {}),
    },
    select: { action: true, resourceId: true, createdAt: true, metadata: true },
    orderBy: { createdAt: "asc" },
  });
  return computeDeferredPeriods(rows);
}

export async function findDeferredPeriodIds(periodIds: number[]): Promise<Set<number>> {
  const deferred = await findDeferredPeriods(periodIds);
  return new Set(deferred.map((d) => d.periodId));
}
