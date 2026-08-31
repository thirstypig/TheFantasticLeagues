import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The orchestrator around `classifyPeriodAudit` (todo #301). The classifier is
 * unit-tested separately; these cover the three things the CALLER depends on
 * that live only here.
 */

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { period: { findMany: vi.fn() } },
}));

vi.mock("../../../db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { auditAllClosedPeriods } from "../services/mlbStatsSyncService.js";

const period = (id: number, name: string) => ({ id, name });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.period.findMany.mockResolvedValue([period(35, "Period 1"), period(36, "Period 2")]);
});

describe("auditAllClosedPeriods", () => {
  it("audits only COMPLETED periods", async () => {
    // Regression this prevents: widening the filter to include the ACTIVE
    // period. On day one it holds zero PlayerStatsPeriod rows, so every player
    // reads as a coverage gap — the exact false-INCOMPLETE that broke the
    // standings audit season leg (PR #441).
    await auditAllClosedPeriods({ reconcile: async () => ({ mismatches: [], fetchErrors: 0 }) });
    expect(mockPrisma.period.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "completed" } }),
    );
  });

  it("records a period whose reconcile THROWS as fetch_error, not as absent", async () => {
    // Regression this prevents: dropping the try/catch. A throwing period would
    // vanish from the results, shrinking `checked` — so the sweep reads
    // HEALTHIER the more periods fail. That inverts the alarm.
    const reconcile = vi.fn(async (periodId: number) => {
      if (periodId === 36) throw new Error("MLB unreachable");
      return { mismatches: [], fetchErrors: 0 };
    });

    const out = await auditAllClosedPeriods({ reconcile });

    expect(out).toHaveLength(2);
    expect(out.find((e) => e.periodId === 36)).toMatchObject({
      status: "fetch_error",
      mismatches: 0,
    });
    expect(out.find((e) => e.periodId === 35)).toMatchObject({ status: "clean" });
  });

  it("keeps auditing after one period throws", async () => {
    const reconcile = vi.fn(async (periodId: number) => {
      if (periodId === 35) throw new Error("boom");
      return { mismatches: [{ playerId: 1 }], fetchErrors: 0 };
    });

    const out = await auditAllClosedPeriods({ reconcile });

    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(out.find((e) => e.periodId === 36)).toMatchObject({ status: "drift", mismatches: 1 });
  });

  it("reports the mismatch COUNT so an alert can say how bad it is", async () => {
    const out = await auditAllClosedPeriods({
      reconcile: async () => ({ mismatches: [{ a: 1 }, { b: 2 }, { c: 3 }], fetchErrors: 0 }),
    });
    expect(out.every((e) => e.mismatches === 3)).toBe(true);
  });

  it("NEVER re-syncs — this sweep is alert-only", async () => {
    // Older periods' standings have been seen and acted on by owners. Silently
    // rewriting them is worse than reporting drift; the windowed reconciler is
    // the one allowed to auto-heal.
    const reconcile = vi.fn(async () => ({ mismatches: [{ playerId: 1 }], fetchErrors: 0 }));
    await auditAllClosedPeriods({ reconcile });
    // Only the diff call per period — no second call that would indicate a heal.
    expect(reconcile).toHaveBeenCalledTimes(2);
  });

  it("returns an empty sweep rather than throwing when there are no closed periods", async () => {
    mockPrisma.period.findMany.mockResolvedValue([]);
    await expect(auditAllClosedPeriods({ reconcile: async () => ({ mismatches: [], fetchErrors: 0 }) }))
      .resolves.toEqual([]);
  });
});
