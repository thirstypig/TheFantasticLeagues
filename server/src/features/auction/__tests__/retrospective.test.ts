import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    team: { findMany: vi.fn() },
    player: { findFirst: vi.fn(), create: vi.fn() },
    roster: { create: vi.fn(), deleteMany: vi.fn() },
    auctionLot: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    auctionBid: { create: vi.fn() },
    auctionSession: { findUnique: vi.fn(), upsert: vi.fn() },
    playerValue: { findMany: vi.fn() },
    leagueMembership: { findUnique: vi.fn() },
    financeLedger: { create: vi.fn() },
    season: { findFirst: vi.fn() },
    $transaction: vi.fn((fn: any) => fn({})),
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireTeamOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireLeagueMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireCommissionerOrAdmin: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));
vi.mock("../../../middleware/validate.js", () => ({
  validateBody: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/seasonGuard.js", () => ({
  requireSeasonStatus: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../../../lib/rosterGuard.js", () => ({ assertPlayerAvailable: vi.fn() }));
vi.mock("../../../lib/sportConfig.js", () => ({
  positionToSlots: vi.fn(() => ["UTIL"]),
  PITCHER_CODES: new Set(["SP", "RP", "P", "CL"]),
}));
vi.mock("../services/auctionWsService.js", () => ({ broadcastState: vi.fn() }));
vi.mock("../services/auctionPersistence.js", () => ({
  saveState: vi.fn().mockResolvedValue(undefined),
  loadState: vi.fn().mockResolvedValue(null),
  clearState: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../../db/prisma.js";
import express from "express";
import { auctionRouter } from "../routes.js";
import supertest from "supertest";

const mockPrisma = prisma as any;

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 1, isAdmin: true };
  next();
});
app.use(auctionRouter);

const TEAMS = [
  { id: 1, name: "Team Alpha", code: "ALP", budget: 150 },
  { id: 2, name: "Team Beta", code: "BET", budget: 100 },
];

function makeLot(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    playerId: 10,
    nominatingTeamId: 1,
    status: "completed",
    startTs: new Date("2026-03-22T10:00:00Z"),
    endTs: new Date("2026-03-22T10:01:00Z"),
    finalPrice: 25,
    winnerTeamId: 1,
    player: { id: 10, name: "Mike Trout", posPrimary: "CF", mlbTeam: "LAA" },
    bids: [
      { teamId: 1, amount: 25 },
      { teamId: 2, amount: 24 },
      { teamId: 1, amount: 20 },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /retrospective", () => {
  it("returns 400 for missing leagueId", async () => {
    const res = await supertest(app).get("/retrospective");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Missing leagueId");
  });

  it("returns 404 when no completed lots exist", async () => {
    mockPrisma.team.findMany.mockResolvedValue(TEAMS);
    mockPrisma.auctionLot.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/retrospective?leagueId=1");
    expect(res.status).toBe(404);
  });

  it("computes correct league-level metrics", async () => {
    const lots = [
      makeLot({ id: 1, finalPrice: 30, winnerTeamId: 1, player: { id: 10, name: "Player A", posPrimary: "SS", mlbTeam: "NYY" }, bids: [{ teamId: 1, amount: 30 }] }),
      makeLot({ id: 2, finalPrice: 20, winnerTeamId: 2, player: { id: 11, name: "Player B", posPrimary: "CF", mlbTeam: "LAD" }, bids: [{ teamId: 2, amount: 20 }, { teamId: 1, amount: 15 }] }),
      makeLot({ id: 3, finalPrice: 10, winnerTeamId: 1, player: { id: 12, name: "Player C", posPrimary: "SP", mlbTeam: "CHC" }, bids: [{ teamId: 1, amount: 10 }] }),
    ];
    mockPrisma.team.findMany.mockResolvedValue(TEAMS);
    mockPrisma.auctionLot.findMany.mockResolvedValue(lots);
    mockPrisma.playerValue.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/retrospective?leagueId=1");
    expect(res.status).toBe(200);
    expect(res.body.league.totalLots).toBe(3);
    expect(res.body.league.totalSpent).toBe(60);
    expect(res.body.league.avgPrice).toBe(20);
    expect(res.body.league.medianPrice).toBe(20);
    expect(res.body.league.totalBidsPlaced).toBe(4);
  });

  it("identifies most expensive player", async () => {
    const lots = [
      makeLot({ id: 1, finalPrice: 50, player: { id: 10, name: "Big Star", posPrimary: "1B", mlbTeam: "NYY" }, bids: [{ teamId: 1, amount: 50 }] }),
      makeLot({ id: 2, finalPrice: 5, player: { id: 11, name: "Bargain", posPrimary: "RP", mlbTeam: "CHC" }, bids: [{ teamId: 2, amount: 5 }] }),
    ];
    mockPrisma.team.findMany.mockResolvedValue(TEAMS);
    mockPrisma.auctionLot.findMany.mockResolvedValue(lots);
    mockPrisma.playerValue.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/retrospective?leagueId=1");
    expect(res.body.league.mostExpensivePlayer).toEqual({ playerName: "Big Star", position: "1B", price: 50 });
  });

  it("identifies cheapest win excluding $1 lots", async () => {
    const lots = [
      makeLot({ id: 1, finalPrice: 1, player: { id: 10, name: "AutoFill", posPrimary: "DH", mlbTeam: "NYY" }, bids: [{ teamId: 1, amount: 1 }] }),
      makeLot({ id: 2, finalPrice: 3, player: { id: 11, name: "Cheap Win", posPrimary: "RP", mlbTeam: "CHC" }, bids: [{ teamId: 2, amount: 3 }] }),
      makeLot({ id: 3, finalPrice: 20, player: { id: 12, name: "Normal", posPrimary: "SS", mlbTeam: "ATL" }, bids: [{ teamId: 1, amount: 20 }] }),
    ];
    mockPrisma.team.findMany.mockResolvedValue(TEAMS);
    mockPrisma.auctionLot.findMany.mockResolvedValue(lots);
    mockPrisma.playerValue.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/retrospective?leagueId=1");
    expect(res.body.league.cheapestWin).toEqual({ playerName: "Cheap Win", position: "RP", price: 3 });
  });

  it("computes bargains and overpays from PlayerValue data", async () => {
    const lots = [
      makeLot({ id: 1, finalPrice: 10, winnerTeamId: 1, player: { id: 10, name: "Steal", posPrimary: "SS", mlbTeam: "NYY" }, bids: [{ teamId: 1, amount: 10 }] }),
      makeLot({ id: 2, finalPrice: 40, winnerTeamId: 2, player: { id: 11, name: "Overpaid", posPrimary: "SP", mlbTeam: "LAD" }, bids: [{ teamId: 2, amount: 40 }] }),
    ];
    const values = [
      { playerId: 10, value: 30 },  // surplus +20 (bargain)
      { playerId: 11, value: 20 },  // surplus -20 (overpay)
    ];
    mockPrisma.team.findMany.mockResolvedValue(TEAMS);
    mockPrisma.auctionLot.findMany.mockResolvedValue(lots);
    mockPrisma.playerValue.findMany.mockResolvedValue(values);

    const res = await supertest(app).get("/retrospective?leagueId=1");
    expect(res.body.bargains).toHaveLength(1);
    expect(res.body.bargains[0].playerName).toBe("Steal");
    expect(res.body.bargains[0].surplus).toBe(20);
    expect(res.body.overpays).toHaveLength(1);
    expect(res.body.overpays[0].playerName).toBe("Overpaid");
    expect(res.body.overpays[0].surplus).toBe(-20);
  });

  it("returns empty bargains/overpays when no PlayerValue data exists", async () => {
    mockPrisma.team.findMany.mockResolvedValue(TEAMS);
    mockPrisma.auctionLot.findMany.mockResolvedValue([makeLot()]);
    mockPrisma.playerValue.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/retrospective?leagueId=1");
    expect(res.body.bargains).toEqual([]);
    expect(res.body.overpays).toEqual([]);
  });

  it("groups outfield positions (LF/CF/RF) into OF", async () => {
    const lots = [
      makeLot({ id: 1, finalPrice: 20, player: { id: 10, name: "LF Guy", posPrimary: "LF", mlbTeam: "NYY" }, bids: [{ teamId: 1, amount: 20 }] }),
      makeLot({ id: 2, finalPrice: 15, player: { id: 11, name: "CF Guy", posPrimary: "CF", mlbTeam: "LAD" }, bids: [{ teamId: 2, amount: 15 }] }),
      makeLot({ id: 3, finalPrice: 10, player: { id: 12, name: "RF Guy", posPrimary: "RF", mlbTeam: "CHC" }, bids: [{ teamId: 1, amount: 10 }] }),
    ];
    mockPrisma.team.findMany.mockResolvedValue(TEAMS);
    mockPrisma.auctionLot.findMany.mockResolvedValue(lots);
    mockPrisma.playerValue.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/retrospective?leagueId=1");
    const of = res.body.positionSpending.find((p: any) => p.position === "OF");
    expect(of).toBeDefined();
    expect(of.playerCount).toBe(3);
    expect(of.totalSpent).toBe(45);
  });

  it("identifies most contested lots by bid count", async () => {
    const lots = [
      makeLot({ id: 1, finalPrice: 30, player: { id: 10, name: "Hot Player", posPrimary: "SS", mlbTeam: "NYY" }, bids: [{ teamId: 1, amount: 30 }, { teamId: 2, amount: 28 }, { teamId: 1, amount: 25 }, { teamId: 2, amount: 20 }, { teamId: 1, amount: 15 }] }),
      makeLot({ id: 2, finalPrice: 5, player: { id: 11, name: "Cold Player", posPrimary: "RP", mlbTeam: "CHC" }, bids: [{ teamId: 2, amount: 5 }] }),
    ];
    mockPrisma.team.findMany.mockResolvedValue(TEAMS);
    mockPrisma.auctionLot.findMany.mockResolvedValue(lots);
    mockPrisma.playerValue.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/retrospective?leagueId=1");
    expect(res.body.mostContested[0].playerName).toBe("Hot Player");
    expect(res.body.mostContested[0].bidCount).toBe(5);
    expect(res.body.mostContested[0].teamsInvolved).toBe(2);
  });

  it("computes team efficiency with surplus", async () => {
    const lots = [
      makeLot({ id: 1, finalPrice: 20, winnerTeamId: 1, player: { id: 10, name: "P1", posPrimary: "SS", mlbTeam: "NYY" }, bids: [{ teamId: 1, amount: 20 }] }),
      makeLot({ id: 2, finalPrice: 30, winnerTeamId: 1, player: { id: 11, name: "P2", posPrimary: "SP", mlbTeam: "LAD" }, bids: [{ teamId: 1, amount: 30 }] }),
      makeLot({ id: 3, finalPrice: 15, winnerTeamId: 2, player: { id: 12, name: "P3", posPrimary: "CF", mlbTeam: "CHC" }, bids: [{ teamId: 2, amount: 15 }] }),
    ];
    const values = [
      { playerId: 10, value: 25 },  // surplus +5
      { playerId: 11, value: 20 },  // surplus -10
      { playerId: 12, value: 20 },  // surplus +5
    ];
    mockPrisma.team.findMany.mockResolvedValue(TEAMS);
    mockPrisma.auctionLot.findMany.mockResolvedValue(lots);
    mockPrisma.playerValue.findMany.mockResolvedValue(values);

    const res = await supertest(app).get("/retrospective?leagueId=1");
    const team1 = res.body.teamEfficiency.find((t: any) => t.teamId === 1);
    const team2 = res.body.teamEfficiency.find((t: any) => t.teamId === 2);
    expect(team1.totalSpent).toBe(50);
    expect(team1.playersAcquired).toBe(2);
    expect(team1.totalSurplus).toBe(-5);  // +5 + -10 = -5
    expect(team1.bargainCount).toBe(1);
    expect(team1.overpayCount).toBe(1);
    expect(team2.totalSpent).toBe(15);
    expect(team2.totalSurplus).toBe(5);
  });

  it("computes spending pace quarters", async () => {
    const lots = Array.from({ length: 8 }, (_, i) =>
      makeLot({
        id: i + 1,
        finalPrice: (i + 1) * 5,
        player: { id: i + 10, name: `P${i + 1}`, posPrimary: "SS", mlbTeam: "NYY" },
        bids: [{ teamId: 1, amount: (i + 1) * 5 }],
        startTs: new Date(Date.now() + i * 60000),
      })
    );
    mockPrisma.team.findMany.mockResolvedValue(TEAMS);
    mockPrisma.auctionLot.findMany.mockResolvedValue(lots);
    mockPrisma.playerValue.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/retrospective?leagueId=1");
    expect(res.body.spendingPace).toHaveLength(4);
    expect(res.body.spendingPace[0].quarter).toBe(1);
    expect(res.body.spendingPace[0].lotsCount).toBe(2);
    // Q1: lots 1,2 → prices 5,10 → total 15, avg 7.5
    expect(res.body.spendingPace[0].totalSpent).toBe(15);
    expect(res.body.spendingPace[0].avgPrice).toBe(7.5);
  });
});
