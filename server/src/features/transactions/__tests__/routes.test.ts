import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

const mockTx = {
  $queryRaw: vi.fn().mockResolvedValue([]),
  roster: { create: vi.fn(), findFirst: vi.fn(), delete: vi.fn(), update: vi.fn(), count: vi.fn().mockResolvedValue(10) },
  player: { findUnique: vi.fn() },
  transactionEvent: { create: vi.fn() },
};

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    transactionEvent: { count: vi.fn(), findMany: vi.fn() },
    roster: { findFirst: vi.fn() },
    player: { findFirst: vi.fn() },
    league: { findUnique: vi.fn() },
    leagueMembership: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(mockTx)),
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireTeamOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireLeagueMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/validate.js", () => ({
  validateBody: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));
vi.mock("../../../lib/rosterGuard.js", () => ({
  assertPlayerAvailable: vi.fn().mockResolvedValue(undefined),
  assertRosterLimit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../middleware/seasonGuard.js", () => ({
  requireSeasonStatus: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

import { prisma } from "../../../db/prisma.js";

const mockPrisma = prisma as any;

// ── Express test app ─────────────────────────────────────────────

import express from "express";
import { transactionsRouter } from "../routes.js";
import supertest from "supertest";

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 1, isAdmin: true };
  next();
});
app.use(transactionsRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  res.status(500).json({ error: "Internal Server Error" });
});

beforeEach(() => {
  vi.clearAllMocks();
  mockTx.player.findUnique.mockResolvedValue({ id: 100, name: "Mike Trout", posPrimary: "OF", mlbId: 545361, mlbTeam: "LAA" });
  mockTx.roster.create.mockResolvedValue({});
  mockTx.transactionEvent.create.mockResolvedValue({});
});

// ── GET /transactions ────────────────────────────────────────────

describe("GET /transactions", () => {
  it("returns paginated transactions for a league", async () => {
    const txns = [{ id: 1, transactionType: "ADD", submittedAt: new Date() }];
    mockPrisma.transactionEvent.count.mockResolvedValue(1);
    mockPrisma.transactionEvent.findMany.mockResolvedValue(txns);

    const res = await supertest(app).get("/transactions?leagueId=1");
    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.skip).toBe(0);
    expect(res.body.take).toBe(50);
  });

  it("filters by teamId", async () => {
    mockPrisma.transactionEvent.count.mockResolvedValue(0);
    mockPrisma.transactionEvent.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/transactions?leagueId=1&teamId=10");
    expect(res.status).toBe(200);
    expect(mockPrisma.transactionEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ teamId: 10 }),
      })
    );
  });

  it("supports custom skip/take", async () => {
    mockPrisma.transactionEvent.count.mockResolvedValue(100);
    mockPrisma.transactionEvent.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/transactions?leagueId=1&skip=10&take=25");
    expect(res.status).toBe(200);
    expect(res.body.skip).toBe(10);
    expect(res.body.take).toBe(25);
  });
});

// ── POST /transactions/claim ─────────────────────────────────────

describe("POST /transactions/claim", () => {
  it("claims a player by playerId", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null); // not rostered
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.playerId).toBe(100);
  });

  it("claims a player by mlbId", async () => {
    mockPrisma.player.findFirst.mockResolvedValue({ id: 100 });
    mockPrisma.roster.findFirst.mockResolvedValue(null);
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, mlbId: 545361,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 404 when mlbId player not in DB", async () => {
    mockPrisma.player.findFirst.mockResolvedValue(null);

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, mlbId: 999999,
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });

  it("returns 400 when player already rostered", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue({
      playerId: 100,
      team: { name: "Rival Team" },
    });

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("already on team");
  });

  it("handles claim with drop player", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null);
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });
    mockTx.roster.findFirst.mockResolvedValue({ id: 50, teamId: 10, playerId: 200 });
    mockTx.player.findUnique.mockResolvedValue({ id: 200, name: "Dropped Guy" });

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100, dropPlayerId: 200,
    });

    expect(res.status).toBe(200);
    // Drop now uses soft-delete (update with releasedAt) instead of hard delete
    expect(mockTx.roster.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 50 },
        data: expect.objectContaining({ source: "DROP" }),
      })
    );
  });
});
