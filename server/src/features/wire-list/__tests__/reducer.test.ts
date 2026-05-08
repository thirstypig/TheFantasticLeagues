/**
 * Wire List reducer state-machine tests (todo #168).
 *
 * The 655-LOC processor (succeed / fail / skip / revert / finalize) is the
 * riskiest surface in the wire-list feature. Prior to this file the only
 * coverage was 100 LOC of Zod schema-shape assertions. These tests exercise
 * the actual reducer paths via supertest + a fully-mocked Prisma client.
 *
 * Why mock-only (no real DB): per project memory the local `.env` points at
 * the prod-shared Supabase, so any add/drop test that touches real rows
 * leaves residue. `feedback_test_addrops_full_cleanup.md` documents the
 * precedent. Mocked Prisma + asserting on call args/sequence is sufficient
 * to lock down the state-machine transitions and the race-loss codes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => {
  const tx = {
    waiverPeriod: {
      updateMany: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    waiverAddEntry: {
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    waiverDropEntry: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    roster: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    transactionEvent: { create: vi.fn() },
    player: { findUnique: vi.fn() },
    league: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
  };
  return {
    prisma: {
      waiverPeriod: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
        update: vi.fn(),
      },
      waiverAddEntry: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      waiverDropEntry: { findFirst: vi.fn() },
      roster: { findFirst: vi.fn() },
      leagueMembership: { findUnique: vi.fn() },
      league: { findUnique: vi.fn() },
      teamOwnership: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: any, _opts?: unknown) => {
        // Support both signatures: fn (callback form) and array form.
        if (typeof fn === "function") return fn(tx);
        return Promise.all(fn);
      }),
      $queryRaw: vi.fn(),
      __mockTx: tx,
    },
  };
});

vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../../../lib/utils.js", () => ({
  nextDayEffective: () => new Date("2026-05-07T00:00:00Z"),
}));
vi.mock("../../../lib/featureFlags.js", () => ({
  enforceRosterRules: () => false, // simplest: skip position-eligibility re-check
}));
vi.mock("../../transactions/lib/positionInherit.js", () => ({
  isEligibleForSlot: () => true,
}));
vi.mock("../../../lib/mlbTeams.js", () => ({
  getLeagueStatsSource: vi.fn().mockResolvedValue("MLB_ALL"),
  getTeamsForSource: vi.fn().mockReturnValue(null), // no source-team filter
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

// ── Re-import @prisma/client to get the real Prisma namespace
// (we need Prisma.PrismaClientKnownRequestError to construct race-loss). We
// don't mock it because the processor uses `instanceof` checks.

import express from "express";
import supertest from "supertest";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { wireListProcessorRouter } from "../processor.js";

const mockPrisma = prisma as any;
const mockTx = mockPrisma.__mockTx;

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  // Run as admin so loadAddEntryAsCommissioner short-circuits the
  // commissioner-membership lookup.
  req.user = { id: 99, isAdmin: true };
  next();
});
app.use(wireListProcessorRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  // Safety net — surface the error in the test response so failures are
  // diagnosable rather than hanging on an unhandled rejection.
  res.status(500).json({ error: String(err?.message ?? err) });
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ──────────────────────────────────────────────────────────────────
// succeed
// ──────────────────────────────────────────────────────────────────

describe("POST /adds/:id/succeed", () => {
  it("succeeds → consumes the priority-1 drop and stamps consumedDropEntryId", async () => {
    mockPrisma.waiverAddEntry.findUnique.mockResolvedValue({
      id: 10,
      periodId: 1,
      teamId: 5,
      playerId: 100,
      outcome: "PENDING",
      consumedDropEntryId: null,
      reason: null,
      period: { id: 1, leagueId: 7, createdAt: new Date("2026-05-01"), status: "LOCKED" },
    });
    // pre-tx eligibility checks
    mockPrisma.roster.findFirst.mockResolvedValueOnce(null); // not on a roster
    mockPrisma.roster.findFirst.mockResolvedValueOnce(null); // not acquired this period

    mockTx.waiverDropEntry.findFirst.mockResolvedValue({
      id: 200, periodId: 1, teamId: 5, playerId: 888, priority: 1, status: "PENDING", dropMode: "RELEASE",
    });
    mockTx.roster.findFirst.mockResolvedValue({ id: 555, assignedPosition: "OF" });
    mockTx.waiverDropEntry.updateMany.mockResolvedValue({ count: 1 });
    mockTx.waiverAddEntry.update.mockResolvedValue({
      id: 10, outcome: "SUCCEEDED", consumedDropEntryId: 200,
    });

    const res = await supertest(app).post("/adds/10/succeed").send({});
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("SUCCEEDED");
    expect(res.body.consumedDropEntryId).toBe(200);
    // CAS update on drop status
    expect(mockTx.waiverDropEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 200, status: "PENDING" }, data: { status: "CONSUMED" } }),
    );
    // add update wires consumedDropEntryId
    expect(mockTx.waiverAddEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 10 }, data: expect.objectContaining({ outcome: "SUCCEEDED", consumedDropEntryId: 200 }) }),
    );
  });

  it("succeed when no PENDING drop available → 409 NO_DROP_AVAILABLE", async () => {
    mockPrisma.waiverAddEntry.findUnique.mockResolvedValue({
      id: 11, periodId: 1, teamId: 5, playerId: 101, outcome: "PENDING", consumedDropEntryId: null, reason: null,
      period: { id: 1, leagueId: 7, createdAt: new Date("2026-05-01"), status: "LOCKED" },
    });
    mockPrisma.roster.findFirst.mockResolvedValueOnce(null);
    mockPrisma.roster.findFirst.mockResolvedValueOnce(null);
    mockTx.waiverDropEntry.findFirst.mockResolvedValue(null); // exhausted

    const res = await supertest(app).post("/adds/11/succeed").send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NO_DROP_AVAILABLE");
  });

  it("concurrent succeed on same drop → P2002 → 409 DROP_RACE_LOST", async () => {
    mockPrisma.waiverAddEntry.findUnique.mockResolvedValue({
      id: 12, periodId: 1, teamId: 5, playerId: 102, outcome: "PENDING", consumedDropEntryId: null, reason: null,
      period: { id: 1, leagueId: 7, createdAt: new Date("2026-05-01"), status: "LOCKED" },
    });
    mockPrisma.roster.findFirst.mockResolvedValueOnce(null);
    mockPrisma.roster.findFirst.mockResolvedValueOnce(null);
    mockTx.waiverDropEntry.findFirst.mockResolvedValue({
      id: 201, periodId: 1, teamId: 5, playerId: 889, priority: 1, status: "PENDING", dropMode: "RELEASE",
    });
    mockTx.roster.findFirst.mockResolvedValue({ id: 556, assignedPosition: "OF" });
    mockTx.waiverDropEntry.updateMany.mockResolvedValue({ count: 1 });
    // Sibling raced and beat us — unique-constraint violation on consumedDropEntryId.
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["consumedDropEntryId"] },
    });
    mockTx.waiverAddEntry.update.mockRejectedValue(p2002);

    const res = await supertest(app).post("/adds/12/succeed").send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("DROP_RACE_LOST");
  });
});

// ──────────────────────────────────────────────────────────────────
// revert
// ──────────────────────────────────────────────────────────────────

describe("POST /adds/:id/revert", () => {
  it("succeed-then-revert → returns drop to PENDING and clears consumedDropEntryId", async () => {
    mockPrisma.waiverAddEntry.findUnique.mockResolvedValue({
      id: 20, periodId: 1, teamId: 5, playerId: 200,
      outcome: "SUCCEEDED", consumedDropEntryId: 300, reason: null,
      period: { id: 1, leagueId: 7, createdAt: new Date("2026-05-01"), status: "LOCKED" },
    });
    mockTx.waiverAddEntry.update.mockResolvedValue({
      id: 20, outcome: "PENDING", consumedDropEntryId: null,
    });
    mockTx.waiverDropEntry.updateMany.mockResolvedValue({ count: 1 });

    const res = await supertest(app).post("/adds/20/revert").send({});
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("PENDING");
    expect(res.body.consumedDropEntryId).toBeNull();
    // First write: clear FK on the add (so unique constraint is released)
    expect(mockTx.waiverAddEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 20 }, data: { outcome: "PENDING", consumedDropEntryId: null, reason: null } }),
    );
    // Then: flip drop status back to PENDING via CAS
    expect(mockTx.waiverDropEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 300, status: "CONSUMED" }, data: { status: "PENDING", processedAt: null } }),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// finalize
// ──────────────────────────────────────────────────────────────────

describe("POST /periods/:periodId/finalize", () => {
  it("blocked when any add is still PENDING → 409 FINALIZE_BLOCKED", async () => {
    mockPrisma.waiverPeriod.findUnique.mockResolvedValue({
      id: 1, leagueId: 7, status: "LOCKED", createdAt: new Date("2026-05-01"),
    });
    mockPrisma.waiverAddEntry.count.mockResolvedValue(1);

    const res = await supertest(app).post("/periods/1/finalize").send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("FINALIZE_BLOCKED");
    expect(res.body.pendingAdds).toBe(1);
  });

  it("happy path: 1 succeeded add → creates roster + 2 TransactionEvents and flips period to PROCESSED", async () => {
    mockPrisma.waiverPeriod.findUnique.mockResolvedValue({
      id: 1, leagueId: 7, status: "LOCKED", createdAt: new Date("2026-05-01"),
    });
    mockPrisma.waiverAddEntry.count.mockResolvedValue(0);
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    // tx scope
    mockTx.waiverPeriod.updateMany.mockResolvedValue({ count: 1 }); // CAS pass
    mockTx.waiverAddEntry.findMany.mockResolvedValue([
      {
        id: 30, periodId: 1, teamId: 5, playerId: 500,
        outcome: "SUCCEEDED", consumedDropEntryId: 600, reason: null,
        consumedDrop: { id: 600, periodId: 1, teamId: 5, playerId: 700, status: "CONSUMED", dropMode: "RELEASE", priority: 1 },
        player: { id: 500, name: "Add Guy", posPrimary: "OF", posList: "OF" },
      },
    ]);
    // Blocker re-validation pass:
    //   findFirst #1: still-FA check → null (good, player not on a roster)
    //   findFirst #2: drop player still on team → some row (good)
    //   findFirst #3: dropRoster (capture slot before release) → some row
    mockTx.roster.findFirst
      .mockResolvedValueOnce(null) // stillFA
      .mockResolvedValueOnce({ id: 1500 }) // dropRoster blocker check
      .mockResolvedValueOnce({ id: 1500, assignedPosition: "OF" }); // dropRoster slot capture
    mockTx.player.findUnique
      .mockResolvedValueOnce({ mlbTeam: "LAD" }) // adds player team check
      .mockResolvedValueOnce({ name: "Drop Guy" }); // for drop TransactionEvent text
    mockTx.roster.updateMany.mockResolvedValue({ count: 1 }); // released
    mockTx.roster.create.mockResolvedValue({ id: 9999 });
    mockTx.transactionEvent.create.mockResolvedValue({ id: 1 });
    mockTx.waiverAddEntry.update.mockResolvedValue({});
    mockTx.waiverDropEntry.update.mockResolvedValue({});
    mockTx.waiverDropEntry.updateMany.mockResolvedValue({ count: 0 }); // unused drops
    mockTx.waiverPeriod.update.mockResolvedValue({
      id: 1, leagueId: 7, status: "PROCESSED", processedAt: new Date(), createdAt: new Date("2026-05-01"),
    });

    // For the post-tx push fan-out
    mockPrisma.waiverAddEntry.findMany.mockResolvedValue([]);
    mockPrisma.teamOwnership.findMany.mockResolvedValue([]);

    const res = await supertest(app).post("/periods/1/finalize").send({});
    expect(res.status).toBe(200);
    expect(res.body.addsApplied).toBe(1);
    expect(res.body.dropsConsumed).toBe(1);
    expect(res.body.period.status).toBe("PROCESSED");

    // Assertions on the critical writes
    expect(mockTx.roster.create).toHaveBeenCalledTimes(1);
    expect(mockTx.transactionEvent.create).toHaveBeenCalledTimes(2); // one ADD, one DROP
    const calls = mockTx.transactionEvent.create.mock.calls.map((c: any) => c[0].data.transactionType);
    expect(calls).toEqual(expect.arrayContaining(["ADD", "DROP"]));
    expect(mockTx.waiverPeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: expect.objectContaining({ status: "PROCESSED" }) }),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// Auto-lock cron behavior — the cron is defined inside an IIFE in
// server/src/index.ts, so we test the equivalent SQL/DSL sequence
// directly. This pins the contract: when xact-advisory lock is held
// and overdue periods exist, they are flipped to LOCKED inside the
// same transaction. (Switched to pg_try_advisory_xact_lock per #166.)
// ──────────────────────────────────────────────────────────────────

describe("auto-lock cron contract", () => {
  it("flips PENDING period past deadlineAt to LOCKED when advisory lock is acquired", async () => {
    const now = new Date("2026-05-06T12:00:00Z");
    // Simulate what the cron body does (now using xact-advisory lock):
    //   1. tx.$queryRaw → pg_try_advisory_xact_lock → locked: true
    //   2. tx.waiverPeriod.findMany overdue
    //   3. tx.waiverPeriod.updateMany → LOCKED
    mockTx.waiverPeriod.findMany.mockResolvedValue([{ id: 42, leagueId: 7 }]);
    mockTx.waiverPeriod.updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const lockKey = 0x57495245;
    mockTx.$queryRaw = vi.fn().mockResolvedValue([{ locked: true }]);

    const result = await mockPrisma.$transaction(async (tx: any) => {
      const lockResult = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${lockKey}) AS locked`;
      if (!lockResult[0]?.locked) return { count: 0 };
      const overdue = await tx.waiverPeriod.findMany({
        where: { status: "PENDING", deadlineAt: { lte: now } },
        select: { id: true, leagueId: true },
      });
      if (overdue.length === 0) return { count: 0 };
      return tx.waiverPeriod.updateMany({
        where: { id: { in: overdue.map((p: any) => p.id) } },
        data: { status: "LOCKED", lockedAt: now },
      });
    }, { isolationLevel: "Serializable" });

    expect(result.count).toBe(1);
    expect(mockTx.waiverPeriod.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [42] } },
        data: { status: "LOCKED", lockedAt: now },
      }),
    );
    // The xact-scoped lock means there is no separate `pg_advisory_unlock`
    // call — the lock auto-releases on commit. Assert we never invoked it.
    const queryRawCalls = (mockTx.$queryRaw.mock.calls as any[]).flat();
    const unlockHit = queryRawCalls.some((c: any) =>
      typeof c === "object" && c?.strings?.some?.((s: string) => s.includes("pg_advisory_unlock")),
    );
    expect(unlockHit).toBe(false);
  });
});
