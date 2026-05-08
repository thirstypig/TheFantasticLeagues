/**
 * Integration tests for the wire-list HTTP routes (todos #159 + #161):
 *   - POST /api/wire-list/periods/:periodId/reorder — atomic priority rewrite.
 *   - Probe-oracle 404 collapse on cross-league period↔team mismatch.
 *
 * Prisma is mocked; we exercise the real Express router with the real
 * middleware factories stubbed so authorization is a no-op (the routes
 * themselves implement the authorization-relevant DB checks we care about).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    waiverPeriod: { findUnique: vi.fn() },
    team: { findUnique: vi.fn() },
    waiverAddEntry: {
      findMany: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
    },
    waiverDropEntry: {
      findMany: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/auditLog.js", () => ({
  writeAuditLog: vi.fn(),
}));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireLeagueMember: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireCommissionerOrAdmin: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireTeamOwner: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  isTeamOwner: vi.fn(async () => true),
}));

import { prisma } from "../../../db/prisma.js";

const mockPrisma = prisma as unknown as {
  waiverPeriod: { findUnique: ReturnType<typeof vi.fn> };
  team: { findUnique: ReturnType<typeof vi.fn> };
  waiverAddEntry: {
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
  };
  waiverDropEntry: {
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

// ── Express test app ─────────────────────────────────────────────

import express from "express";
import supertest from "supertest";
import { wireListRouter } from "../routes.js";

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 1, isAdmin: true };
  next();
});
app.use("/api/wire-list", wireListRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error("test app error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── todo #161: cross-league probe oracle ─────────────────────────

describe("wire-list cross-league probe oracle (todo #161)", () => {
  it("returns 404 PERIOD_NOT_FOUND when period.leagueId !== team.leagueId on GET /adds", async () => {
    mockPrisma.waiverPeriod.findUnique.mockResolvedValue({
      id: 10, leagueId: 1, status: "PENDING", createdAt: new Date(),
    });
    mockPrisma.team.findUnique.mockResolvedValue({ id: 50, leagueId: 2 });

    const res = await supertest(app).get("/api/wire-list/periods/10/adds?teamId=50");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("PERIOD_NOT_FOUND");
    // No data leak — entries query never runs.
    expect(mockPrisma.waiverAddEntry.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 PERIOD_NOT_FOUND (not 400) on POST /adds for cross-league team", async () => {
    mockPrisma.waiverPeriod.findUnique.mockResolvedValue({
      id: 10, leagueId: 1, status: "PENDING", createdAt: new Date(),
    });
    mockPrisma.team.findUnique.mockResolvedValue({ id: 50, leagueId: 2 });

    const res = await supertest(app)
      .post("/api/wire-list/periods/10/adds")
      .send({ teamId: 50, playerId: 999 });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("PERIOD_NOT_FOUND");
  });

  it("returns 404 when the period itself is missing (collapsed with cross-league)", async () => {
    mockPrisma.waiverPeriod.findUnique.mockResolvedValue(null);
    mockPrisma.team.findUnique.mockResolvedValue({ id: 50, leagueId: 2 });

    const res = await supertest(app).get("/api/wire-list/periods/10/drops?teamId=50");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("PERIOD_NOT_FOUND");
  });
});

// ── todo #159: atomic reorder ────────────────────────────────────

describe("POST /api/wire-list/periods/:periodId/reorder (todo #159)", () => {
  function setupValidPeriodAndTeam() {
    mockPrisma.waiverPeriod.findUnique.mockResolvedValue({
      id: 10, leagueId: 1, status: "PENDING", createdAt: new Date(),
    });
    mockPrisma.team.findUnique.mockResolvedValue({ id: 50, leagueId: 1 });
  }

  it("rewrites Add priorities atomically and returns the new ordered list", async () => {
    setupValidPeriodAndTeam();
    // First findMany — verifying orderedIds match existing rows.
    mockPrisma.waiverAddEntry.findMany
      .mockResolvedValueOnce([{ id: 100 }, { id: 101 }, { id: 102 }])
      // Second findMany — return the post-update list.
      .mockResolvedValueOnce([
        { id: 102, priority: 1, periodId: 10, teamId: 50, playerId: 7, outcome: "PENDING", player: null },
        { id: 100, priority: 2, periodId: 10, teamId: 50, playerId: 8, outcome: "PENDING", player: null },
        { id: 101, priority: 3, periodId: 10, teamId: 50, playerId: 9, outcome: "PENDING", player: null },
      ]);

    // $transaction: invoke the callback against a tx whose update fns are
    // proxies on the mocked prisma so we can assert the call sequence.
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof prisma) => Promise<void>) => {
      const tx = {
        waiverPeriod: {
          findUnique: vi.fn().mockResolvedValue({ status: "PENDING" }),
        },
        waiverAddEntry: { update: mockPrisma.waiverAddEntry.update },
        waiverDropEntry: { update: mockPrisma.waiverDropEntry.update },
      };
      await cb(tx as unknown as typeof prisma);
    });
    mockPrisma.waiverAddEntry.update.mockResolvedValue({});

    const res = await supertest(app)
      .post("/api/wire-list/periods/10/reorder")
      .send({ kind: "ADD", teamId: 50, orderedIds: [102, 100, 101] });

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(3);
    expect(res.body.entries[0].id).toBe(102);
    expect(res.body.entries[0].priority).toBe(1);

    // 6 update calls — 3 phase-1 negative temps + 3 phase-2 final.
    expect(mockPrisma.waiverAddEntry.update).toHaveBeenCalledTimes(6);
    // First three: negative temps -1, -2, -3.
    expect(mockPrisma.waiverAddEntry.update.mock.calls[0][0]).toEqual({
      where: { id: 102 }, data: { priority: -1 },
    });
    expect(mockPrisma.waiverAddEntry.update.mock.calls[1][0]).toEqual({
      where: { id: 100 }, data: { priority: -2 },
    });
    // Last three: final 1, 2, 3.
    expect(mockPrisma.waiverAddEntry.update.mock.calls[3][0]).toEqual({
      where: { id: 102 }, data: { priority: 1 },
    });
    expect(mockPrisma.waiverAddEntry.update.mock.calls[5][0]).toEqual({
      where: { id: 101 }, data: { priority: 3 },
    });
  });

  it("rejects 404 when teamId belongs to a different league than periodId", async () => {
    mockPrisma.waiverPeriod.findUnique.mockResolvedValue({
      id: 10, leagueId: 1, status: "PENDING", createdAt: new Date(),
    });
    mockPrisma.team.findUnique.mockResolvedValue({ id: 50, leagueId: 99 });

    const res = await supertest(app)
      .post("/api/wire-list/periods/10/reorder")
      .send({ kind: "ADD", teamId: 50, orderedIds: [100, 101] });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("PERIOD_NOT_FOUND");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects 403 PERIOD_NOT_PENDING when period is LOCKED", async () => {
    mockPrisma.waiverPeriod.findUnique.mockResolvedValue({
      id: 10, leagueId: 1, status: "LOCKED", createdAt: new Date(),
    });
    mockPrisma.team.findUnique.mockResolvedValue({ id: 50, leagueId: 1 });

    const res = await supertest(app)
      .post("/api/wire-list/periods/10/reorder")
      .send({ kind: "ADD", teamId: 50, orderedIds: [100] });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PERIOD_NOT_PENDING");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects 400 REORDER_IDS_MISMATCH when orderedIds doesn't match existing entries", async () => {
    setupValidPeriodAndTeam();
    mockPrisma.waiverAddEntry.findMany.mockResolvedValueOnce([
      { id: 100 }, { id: 101 }, { id: 102 },
    ]);

    // Caller forgets one id.
    const res = await supertest(app)
      .post("/api/wire-list/periods/10/reorder")
      .send({ kind: "ADD", teamId: 50, orderedIds: [100, 101] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("REORDER_IDS_MISMATCH");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects 400 REORDER_IDS_MISMATCH when orderedIds contains an unrelated id", async () => {
    setupValidPeriodAndTeam();
    mockPrisma.waiverAddEntry.findMany.mockResolvedValueOnce([
      { id: 100 }, { id: 101 },
    ]);

    const res = await supertest(app)
      .post("/api/wire-list/periods/10/reorder")
      .send({ kind: "ADD", teamId: 50, orderedIds: [100, 999] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("REORDER_IDS_MISMATCH");
  });

  it("supports kind=DROP using the WaiverDropEntry tables", async () => {
    setupValidPeriodAndTeam();
    mockPrisma.waiverDropEntry.findMany
      .mockResolvedValueOnce([{ id: 200 }, { id: 201 }])
      .mockResolvedValueOnce([
        { id: 201, priority: 1, periodId: 10, teamId: 50, playerId: 7, dropMode: "RELEASE", status: "PENDING", player: null },
        { id: 200, priority: 2, periodId: 10, teamId: 50, playerId: 8, dropMode: "RELEASE", status: "PENDING", player: null },
      ]);
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof prisma) => Promise<void>) => {
      const tx = {
        waiverPeriod: { findUnique: vi.fn().mockResolvedValue({ status: "PENDING" }) },
        waiverAddEntry: { update: mockPrisma.waiverAddEntry.update },
        waiverDropEntry: { update: mockPrisma.waiverDropEntry.update },
      };
      await cb(tx as unknown as typeof prisma);
    });
    mockPrisma.waiverDropEntry.update.mockResolvedValue({});

    const res = await supertest(app)
      .post("/api/wire-list/periods/10/reorder")
      .send({ kind: "DROP", teamId: 50, orderedIds: [201, 200] });

    expect(res.status).toBe(200);
    expect(mockPrisma.waiverDropEntry.update).toHaveBeenCalledTimes(4); // 2 phase-1 + 2 phase-2
    expect(mockPrisma.waiverAddEntry.update).not.toHaveBeenCalled();
  });
});
