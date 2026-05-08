/**
 * Wire List outcome-guard tests (todo #170).
 *
 * Locks the LOCKED-period + PENDING-entry guard that's now consolidated
 * into a single helper used by `/succeed`, `/fail`, `/skip`. The helper
 * itself is file-local in `processor.ts`; we exercise it via the `/skip`
 * route because skip's body is the simplest of the three (no eligibility
 * re-check, no transaction, just guards → terminal-outcome write).
 *
 * Covers (per spec):
 *   - LOCKED + PENDING → 200 (the happy path for `recordTerminalOutcome`)
 *   - LOCKED + already-SUCCEEDED → 409 ENTRY_ALREADY_PROCESSED
 *   - PROCESSED period → 403 PERIOD_NOT_LOCKED
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

vi.mock("../../../db/prisma.js", () => {
  return {
    prisma: {
      waiverPeriod: { findUnique: vi.fn() },
      waiverAddEntry: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      waiverDropEntry: { findFirst: vi.fn() },
      roster: { findFirst: vi.fn() },
      leagueMembership: { findUnique: vi.fn() },
      league: { findUnique: vi.fn() },
      teamOwnership: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: any) => {
        if (typeof fn === "function") return fn({});
        return Promise.all(fn);
      }),
      $queryRaw: vi.fn(),
    },
  };
});

vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../../lib/auditLog.js", () => ({
  writeAuditLog: vi.fn(),
  writeAuditLogAwait: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../lib/utils.js", () => ({
  nextDayEffective: () => new Date("2026-05-07T00:00:00Z"),
}));
vi.mock("../../../lib/featureFlags.js", () => ({ enforceRosterRules: () => false }));
vi.mock("../../transactions/lib/positionInherit.js", () => ({ isEligibleForSlot: () => true }));
vi.mock("../../../lib/mlbTeams.js", () => ({
  getLeagueStatsSource: vi.fn().mockResolvedValue("MLB_ALL"),
  getTeamsForSource: vi.fn().mockReturnValue(null),
}));
vi.mock("../../../lib/pushService.js", () => ({
  sendPushToUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/validate.js", () => ({
  validateBody: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));

import express from "express";
import supertest from "supertest";
import { prisma } from "../../../db/prisma.js";
import { wireListProcessorRouter } from "../processor.js";

const mockPrisma = prisma as any;

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 99, isAdmin: true };
  next();
});
app.use(wireListProcessorRouter);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("outcome guards (consolidated helper)", () => {
  it("LOCKED period + PENDING entry → 200 and terminal outcome is written", async () => {
    mockPrisma.waiverAddEntry.findUnique.mockResolvedValue({
      id: 11,
      periodId: 1,
      teamId: 5,
      playerId: 100,
      outcome: "PENDING",
      consumedDropEntryId: null,
      reason: null,
      period: { id: 1, leagueId: 7, createdAt: new Date("2026-05-01"), status: "LOCKED" },
    });
    mockPrisma.waiverAddEntry.update.mockResolvedValue({ id: 11, outcome: "SKIPPED", reason: "noop" });

    const res = await supertest(app).post("/adds/11/skip").send({ reason: "noop" });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("SKIPPED");
    expect(mockPrisma.waiverAddEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 11 }, data: { outcome: "SKIPPED", reason: "noop" } }),
    );
  });

  it("LOCKED period + already-SUCCEEDED entry → 409 ENTRY_ALREADY_PROCESSED", async () => {
    mockPrisma.waiverAddEntry.findUnique.mockResolvedValue({
      id: 12,
      periodId: 1,
      teamId: 5,
      playerId: 100,
      outcome: "SUCCEEDED",
      consumedDropEntryId: 200,
      reason: null,
      period: { id: 1, leagueId: 7, createdAt: new Date("2026-05-01"), status: "LOCKED" },
    });

    const res = await supertest(app).post("/adds/12/skip").send({ reason: "x" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ENTRY_ALREADY_PROCESSED");
    expect(mockPrisma.waiverAddEntry.update).not.toHaveBeenCalled();
  });

  it("PROCESSED period → 403 PERIOD_NOT_LOCKED (entry status is irrelevant)", async () => {
    mockPrisma.waiverAddEntry.findUnique.mockResolvedValue({
      id: 13,
      periodId: 1,
      teamId: 5,
      playerId: 100,
      outcome: "PENDING",
      consumedDropEntryId: null,
      reason: null,
      period: { id: 1, leagueId: 7, createdAt: new Date("2026-05-01"), status: "PROCESSED" },
    });

    const res = await supertest(app).post("/adds/13/skip").send({ reason: "x" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PERIOD_NOT_LOCKED");
    expect(mockPrisma.waiverAddEntry.update).not.toHaveBeenCalled();
  });
});
