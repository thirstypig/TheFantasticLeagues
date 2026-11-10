import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { auditLog: { findMany: vi.fn() } },
}));
vi.mock("../../db/prisma.js", () => ({ prisma: mockPrisma }));

import { computeDeferredPeriods, findDeferredPeriodIds, findDeferredPeriods } from "../deferredBilling.js";

const t = (iso: string) => new Date(iso);
const close = (periodId: number, at: string, billed: boolean | undefined, leagueId = 20) => ({
  action: "PERIOD_CLOSE",
  resourceId: String(periodId),
  createdAt: t(at),
  metadata: billed === undefined ? { leagueId, periodId } : { leagueId, periodId, billed },
});
const reconcile = (periodId: number, at: string) => ({
  action: "IL_FEE_RECONCILE",
  resourceId: String(periodId),
  createdAt: t(at),
  metadata: { leagueId: 20, periodId },
});

beforeEach(() => vi.clearAllMocks());

describe("computeDeferredPeriods", () => {
  it("billed:false close with no reconcile → deferred", () => {
    const out = computeDeferredPeriods([close(6, "2026-08-01T15:00:00Z", false)]);
    expect(out).toEqual([{ periodId: 6, leagueId: 20, closedAt: t("2026-08-01T15:00:00Z") }]);
  });

  it("a later manual reconcile ends the deferral", () => {
    const out = computeDeferredPeriods([
      close(6, "2026-08-01T15:00:00Z", false),
      reconcile(6, "2026-08-02T15:00:00Z"),
    ]);
    expect(out).toEqual([]);
  });

  it("an EARLIER reconcile does not clear a later billed:false close", () => {
    const out = computeDeferredPeriods([
      reconcile(6, "2026-07-30T15:00:00Z"),
      close(6, "2026-08-01T15:00:00Z", false),
    ]);
    expect(out.map((d) => d.periodId)).toEqual([6]);
  });

  it("billed:true close → not deferred", () => {
    expect(computeDeferredPeriods([close(6, "2026-08-01T15:00:00Z", true)])).toEqual([]);
  });

  it("close without a billed flag (legacy rows) → not deferred", () => {
    expect(computeDeferredPeriods([close(6, "2026-08-01T15:00:00Z", undefined)])).toEqual([]);
  });

  it("only the LATEST close counts: reopen + re-close with billing clears an old deferral", () => {
    const out = computeDeferredPeriods([
      close(6, "2026-08-01T15:00:00Z", false),
      close(6, "2026-08-03T15:00:00Z", true),
    ]);
    expect(out).toEqual([]);
  });

  it("latest close billed:false wins over an earlier billed:true close", () => {
    const out = computeDeferredPeriods([
      close(6, "2026-08-01T15:00:00Z", true),
      close(6, "2026-08-03T15:00:00Z", false),
    ]);
    expect(out.map((d) => d.periodId)).toEqual([6]);
  });
});

describe("findDeferredPeriodIds", () => {
  it("queries audit rows for exactly the given period ids", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([close(6, "2026-08-01T15:00:00Z", false)]);

    const ids = await findDeferredPeriodIds([6, 7]);

    expect(ids).toEqual(new Set([6]));
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          action: { in: ["PERIOD_CLOSE", "IL_FEE_RECONCILE"] },
          resourceType: "Period",
          resourceId: { in: ["6", "7"] },
        },
      }),
    );
  });

  it("does not query when given no period ids", async () => {
    expect(await findDeferredPeriodIds([])).toEqual(new Set());
    expect(mockPrisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("findDeferredPeriods() with no filter reads all Period close/reconcile rows", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    await findDeferredPeriods();
    expect(mockPrisma.auditLog.findMany.mock.calls[0][0].where).toEqual({
      action: { in: ["PERIOD_CLOSE", "IL_FEE_RECONCILE"] },
      resourceType: "Period",
    });
  });
});
