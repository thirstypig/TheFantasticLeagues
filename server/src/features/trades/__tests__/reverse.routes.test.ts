import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

const { mockTx, mockOwnership } = vi.hoisted(() => ({
  mockTx: {
    $queryRaw: vi.fn(),
    roster: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    team: { findUnique: vi.fn(), update: vi.fn() },
    player: { findUnique: vi.fn() },
    trade: { update: vi.fn() },
  },
  mockOwnership: vi.fn(),
}));

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    trade: { findUnique: vi.fn() },
    league: { findUnique: vi.fn() },
    leagueMembership: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(mockTx)),
  },
}));
vi.mock("../../../lib/tradeWindow.js", () => ({ getTradeWindow: vi.fn() }));
vi.mock("../../../lib/leagueRuleCache.js", () => ({ getLeagueRules: vi.fn(async () => ({})) }));
// "Tomorrow" for the reverse is 2026-11-12.
vi.mock("../../../lib/rosterWindow.js", () => ({
  resolveEffectiveDate: () => new Date("2026-11-12T00:00:00Z"),
  assertNoOwnershipConflict: mockOwnership,
}));
vi.mock("../../../lib/supabase.js", () => ({ supabaseAdmin: { auth: { getUser: vi.fn() } } }));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../../../lib/emailService.js", () => ({
  sendTradeProposedEmail: vi.fn(),
  sendTradeProcessedEmail: vi.fn(),
  sendTradeVetoedEmail: vi.fn(),
  notifyTeamOwners: vi.fn(async () => undefined),
}));
vi.mock("../../../lib/pushService.js", () => ({
  sendPushToTeamOwners: vi.fn(async () => undefined),
  sendPushToLeague: vi.fn(async () => undefined),
}));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireTeamOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireLeagueMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  isTeamOwner: vi.fn(),
}));
vi.mock("../../../middleware/seasonGuard.js", () => ({
  requireSeasonStatus: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
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
import { tradesRouter } from "../routes.js";

const mockPrisma = prisma as any;

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 1, isAdmin: false };
  next();
});
app.use(tradesRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  res.status(500).json({ error: "Internal Server Error" });
});

const ALPHA = { id: 1, name: "Alpha", leagueId: 20, budget: 100 };
const BETA = { id: 2, name: "Beta", budget: 50 };

// Ann Aces went Alpha -> Beta in the processed trade.
const playerItem = {
  id: 70, assetType: "PLAYER", playerId: 100, senderId: 1, recipientId: 2,
  amount: null, pickRound: null, season: null,
  player: { id: 100, name: "Ann Aces" }, sender: ALPHA, recipient: BETA,
};
const budgetItem = {
  id: 71, assetType: "BUDGET", playerId: null, senderId: 2, recipientId: 1,
  amount: 5, pickRound: null, season: null,
  player: null, sender: { ...BETA, leagueId: 20 }, recipient: ALPHA,
};

const processed = (items: any[]) => ({ id: 9, leagueId: 20, proposerId: 1, status: "PROCESSED", items });

/** Beta's open row for Ann, written by process. */
const betaRow = (extra: Record<string, unknown> = {}) => ({
  id: 55, teamId: 2, playerId: 100, releasedAt: null,
  acquiredAt: new Date("2026-11-05T00:00:00Z"),
  price: 27, assignedPosition: "SS", source: "TRADE_IN",
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));
  mockPrisma.leagueMembership.findUnique.mockResolvedValue({ role: "COMMISSIONER" });
  mockTx.$queryRaw.mockResolvedValue([{ status: "PROCESSED" }]);
  mockTx.roster.findFirst.mockResolvedValue(betaRow());
  mockTx.roster.update.mockResolvedValue({});
  mockTx.roster.updateMany.mockResolvedValue({ count: 1 });
  mockTx.roster.create.mockResolvedValue({});
  mockTx.player.findUnique.mockResolvedValue({ posPrimary: "SS" });
  mockTx.team.findUnique.mockResolvedValue({ budget: 50 });
  mockTx.team.update.mockResolvedValue({});
  mockTx.trade.update.mockResolvedValue({});
  mockOwnership.mockResolvedValue(undefined);
});

function noWrites() {
  expect(mockTx.roster.update).not.toHaveBeenCalled();
  expect(mockTx.roster.updateMany).not.toHaveBeenCalled();
  expect(mockTx.roster.create).not.toHaveBeenCalled();
  expect(mockTx.team.update).not.toHaveBeenCalled();
  expect(mockTx.trade.update).not.toHaveBeenCalled();
}

describe("POST /:id/reverse", () => {
  it("reverse carries the price and slot back to the sender", async () => {
    mockPrisma.trade.findUnique.mockResolvedValue(processed([playerItem]));
    const res = await supertest(app).post("/9/reverse").send({});
    expect(res.status).toBe(200);

    expect(mockTx.roster.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: 2, playerId: 100, releasedAt: null } }),
    );
    expect(mockTx.roster.update).toHaveBeenCalledWith({
      where: { id: 55 },
      data: { releasedAt: new Date("2026-11-12T00:00:00Z"), source: "TRADE_REVERSE" },
    });
    expect(mockTx.roster.create).toHaveBeenCalledWith({
      data: {
        teamId: 1,
        playerId: 100,
        source: "TRADE_REVERSE",
        acquiredAt: new Date("2026-11-12T00:00:00Z"),
        price: 27,
        assignedPosition: "SS",
      },
    });
    expect(mockOwnership).toHaveBeenCalledWith(mockTx, {
      leagueId: 20,
      playerId: 100,
      acquiredAt: new Date("2026-11-12T00:00:00Z"),
      releasedAt: null,
      excludeRosterIds: [55],
    });
    expect(mockTx.trade.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { status: "REVERSED" } });
  });

  it("reverse uses the player's primary position when the recipient row has no slot", async () => {
    mockPrisma.trade.findUnique.mockResolvedValue(processed([playerItem]));
    mockTx.roster.findFirst.mockResolvedValue(betaRow({ assignedPosition: null }));
    mockTx.player.findUnique.mockResolvedValue({ posPrimary: "2B" });
    const res = await supertest(app).post("/9/reverse").send({});
    expect(res.status).toBe(200);
    expect(mockTx.roster.create.mock.calls[0][0].data.assignedPosition).toBe("2B");
  });

  it("reverse refuses (400, no writes) when the player has left the recipient", async () => {
    // Budget item first: the player check must still run before any write.
    mockPrisma.trade.findUnique.mockResolvedValue(processed([budgetItem, playerItem]));
    mockTx.roster.findFirst.mockResolvedValue(null);
    const res = await supertest(app).post("/9/reverse").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Ann Aces is no longer on Beta");
    noWrites();
  });

  it("reverse refuses (400, no writes) when the locked row is no longer PROCESSED", async () => {
    // A second reverse that passed the pre-check while the first was running.
    mockPrisma.trade.findUnique.mockResolvedValue(processed([playerItem, budgetItem]));
    mockTx.$queryRaw.mockResolvedValue([{ status: "REVERSED" }]);
    const res = await supertest(app).post("/9/reverse").send({});
    expect(res.status).toBe(400);
    expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = (mockTx.$queryRaw.mock.calls[0][0] as string[]).join("?");
    expect(sql).toMatch(/SELECT status FROM "Trade" WHERE id = \? FOR UPDATE/);
    expect(mockTx.$queryRaw.mock.calls[0][1]).toBe(9);
    noWrites();
  });

  it("reverse of a future-dated process is dated at the recipient's acquiredAt, never before", async () => {
    // Process dated the trade to the next period start, 2026-11-20; the
    // reverse runs "tomorrow" (2026-11-12), before that.
    const start = new Date("2026-11-20T00:00:00Z");
    mockPrisma.trade.findUnique.mockResolvedValue(processed([playerItem]));
    mockTx.roster.findFirst.mockResolvedValue(betaRow({ acquiredAt: start }));
    const res = await supertest(app).post("/9/reverse").send({});
    expect(res.status).toBe(200);
    expect(mockTx.roster.update.mock.calls[0][0].data.releasedAt).toEqual(start);
    expect(mockTx.roster.create.mock.calls[0][0].data.acquiredAt).toEqual(start);
    expect(mockOwnership.mock.calls[0][1].acquiredAt).toEqual(start);
  });

  it("reverse refuses (400) when the recipient cannot return the dollars", async () => {
    mockPrisma.trade.findUnique.mockResolvedValue(processed([budgetItem]));
    mockTx.team.findUnique.mockResolvedValue({ budget: 2 }); // Alpha received $5, has $2
    const res = await supertest(app).post("/9/reverse").send({});
    expect(res.status).toBe(400);
    noWrites();
  });

  it("reverse refuses (400) on an ownership conflict", async () => {
    mockPrisma.trade.findUnique.mockResolvedValue(processed([playerItem]));
    mockOwnership.mockRejectedValue(new Error("Ownership conflict: Ann Aces would be on Gamma"));
    const res = await supertest(app).post("/9/reverse").send({});
    expect(res.status).toBe(400);
    expect(mockTx.roster.create).not.toHaveBeenCalled();
    expect(mockTx.trade.update).not.toHaveBeenCalled();
  });
});
