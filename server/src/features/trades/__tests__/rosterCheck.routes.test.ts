import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

const { mockTx, mockGetTradeWindow, mockRules, mockOwnership } = vi.hoisted(() => ({
  mockTx: {
    $queryRaw: vi.fn(),
    roster: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn(), count: vi.fn() },
    team: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    player: { findUnique: vi.fn(), findMany: vi.fn() },
    trade: { update: vi.fn() },
  },
  mockGetTradeWindow: vi.fn(),
  mockRules: vi.fn(),
  mockOwnership: vi.fn(),
}));

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    trade: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    team: { findUnique: vi.fn(), findMany: vi.fn() },
    roster: { findMany: vi.fn() },
    player: { findMany: vi.fn() },
    league: { findUnique: vi.fn() },
    leagueMembership: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(mockTx)),
  },
}));
vi.mock("../../../lib/tradeWindow.js", () => ({ getTradeWindow: mockGetTradeWindow }));
vi.mock("../../../lib/leagueRuleCache.js", () => ({ getLeagueRules: mockRules }));
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
  req.user = { id: 1, isAdmin: true };
  next();
});
app.use(tradesRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  res.status(500).json({ error: "Internal Server Error" });
});

const rows = (teamId: number, start: number, n: number, extra: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) => ({
    teamId, playerId: start + i, assignedPosition: "OF", ...extra,
  }));
const TEAMS = [{ id: 1, name: "Alpha" }, { id: 2, name: "Beta" }];
const PLAYERS = [
  { id: 100, name: "Ann Aces" }, { id: 101, name: "Bo Bats" }, { id: 200, name: "Cy Curve" },
];

function seedDb(db: any, rosterRows: any[]) {
  db.roster.findMany.mockResolvedValue(rosterRows);
  db.team.findMany.mockResolvedValue(TEAMS);
  db.player.findMany.mockResolvedValue(PLAYERS);
}

const item = (playerId: number, senderId: number, recipientId: number) => ({
  assetType: "PLAYER", playerId, senderId, recipientId, amount: null, pickRound: null, season: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockRules.mockResolvedValue({ roster: { pitcher_count: "9", batter_count: "14" } });
  mockGetTradeWindow.mockResolvedValue({ open: true });
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));
  mockPrisma.league.findUnique.mockResolvedValue({ name: "L" });
  mockPrisma.team.findUnique.mockResolvedValue({ leagueId: 20 });
});

describe("POST /:id/process roster checks", () => {
  const trade = (items: any[]) => ({ id: 9, leagueId: 20, proposerId: 1, status: "ACCEPTED", items });
  const oneForOne = [item(100, 1, 2), item(200, 2, 1)];

  function seedProcess() {
    mockTx.$queryRaw.mockResolvedValue([{ status: "ACCEPTED" }]);
    mockTx.roster.findFirst.mockResolvedValue({ id: 5, assignedPosition: "OF", price: 10 });
    mockTx.roster.update.mockResolvedValue({});
    mockTx.roster.create.mockResolvedValue({});
    mockTx.player.findUnique.mockResolvedValue({ posPrimary: "OF" });
    mockTx.trade.update.mockResolvedValue({});
  }

  it("IL rows do not count toward the cap", async () => {
    mockPrisma.trade.findUnique.mockResolvedValue(trade(oneForOne));
    seedProcess();
    seedDb(mockTx, [
      ...rows(1, 100, 23),
      { teamId: 1, playerId: 900, assignedPosition: "IL" },
      ...rows(2, 200, 23),
    ]);
    const res = await supertest(app).post("/9/process").send({});
    expect(res.status).toBe(200);
    expect(mockTx.roster.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: { in: [1, 2] }, releasedAt: null } }),
    );
    expect(mockTx.roster.count).not.toHaveBeenCalled();
    expect(mockTx.trade.update).toHaveBeenCalled();
  });

  it("process rejects a trade whose player left the sender", async () => {
    mockPrisma.trade.findUnique.mockResolvedValue(trade(oneForOne));
    seedProcess();
    // player 100 is no longer on team 1
    seedDb(mockTx, [...rows(1, 101, 22), ...rows(2, 200, 23)]);
    const res = await supertest(app).post("/9/process").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Ann Aces is no longer on Alpha");
    expect(mockTx.roster.update).not.toHaveBeenCalled();
    expect(mockTx.trade.update).not.toHaveBeenCalled();
  });

  it("process fails (400, no writes) when the loop finds no sender row", async () => {
    mockPrisma.trade.findUnique.mockResolvedValue(trade(oneForOne));
    seedProcess();
    seedDb(mockTx, [...rows(1, 100, 23), ...rows(2, 200, 23)]);
    mockTx.roster.findFirst.mockResolvedValue(null); // row vanished after the check
    mockTx.player.findUnique.mockResolvedValue({ name: "Ann Aces" });
    mockTx.team.findUnique.mockResolvedValue({ name: "Alpha" });
    const res = await supertest(app).post("/9/process").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Ann Aces is no longer on Alpha");
    expect(mockTx.trade.update).not.toHaveBeenCalled();
  });

  it("process uses the league cap", async () => {
    mockPrisma.trade.findUnique.mockResolvedValue(trade([item(100, 1, 2), item(101, 1, 2), item(200, 2, 1)]));
    seedProcess();
    seedDb(mockTx, [...rows(1, 100, 23), ...rows(2, 200, 23)]);
    const res = await supertest(app).post("/9/process").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Beta would have 24 players (limit 23)");
    expect(mockRules).toHaveBeenCalledWith(expect.anything(), 20);
    expect(mockTx.roster.update).not.toHaveBeenCalled();
  });

  it("a bigger league cap lets the same 2-for-1 through", async () => {
    mockRules.mockResolvedValue({ roster: { pitcher_count: "10", batter_count: "14" } });
    mockPrisma.trade.findUnique.mockResolvedValue(trade([item(100, 1, 2), item(101, 1, 2), item(200, 2, 1)]));
    seedProcess();
    seedDb(mockTx, [...rows(1, 100, 23), ...rows(2, 200, 23)]);
    const res = await supertest(app).post("/9/process").send({});
    expect(res.status).toBe(200);
  });
});

describe("POST / (propose) roster checks", () => {
  const body = (items: any[]) => ({ leagueId: 20, proposerTeamId: 1, items });

  beforeEach(() => {
    mockPrisma.team.findMany.mockResolvedValue(TEAMS.map((t) => ({ ...t, leagueId: 20 })));
    mockPrisma.trade.create.mockResolvedValue({ id: 5, status: "PROPOSED", items: [] });
  });

  it("propose rejects a player not on the sender's active roster", async () => {
    seedDb(mockPrisma, [...rows(1, 101, 22), ...rows(2, 200, 23)]);
    mockPrisma.team.findMany.mockResolvedValueOnce(TEAMS.map((t) => ({ ...t, leagueId: 20 })));
    const res = await supertest(app).post("/").send(body([item(100, 1, 2)]));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Ann Aces is no longer on Alpha");
    expect(mockPrisma.trade.create).not.toHaveBeenCalled();
  });

  it("propose rejects an IL player", async () => {
    seedDb(mockPrisma, [
      { teamId: 1, playerId: 100, assignedPosition: "IL" },
      ...rows(1, 300, 23),
      ...rows(2, 200, 23),
    ]);
    mockPrisma.team.findMany.mockResolvedValueOnce(TEAMS.map((t) => ({ ...t, leagueId: 20 })));
    const res = await supertest(app).post("/").send(body([item(100, 1, 2)]));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Ann Aces is on the IL");
    expect(mockPrisma.trade.create).not.toHaveBeenCalled();
  });

  it("propose rejects a trade that puts a team over the cap", async () => {
    seedDb(mockPrisma, [...rows(1, 100, 23), ...rows(2, 200, 23)]);
    mockPrisma.team.findMany.mockResolvedValueOnce(TEAMS.map((t) => ({ ...t, leagueId: 20 })));
    const res = await supertest(app)
      .post("/")
      .send(body([item(100, 1, 2), item(101, 1, 2), item(200, 2, 1)]));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Beta would have 24 players (limit 23)");
    expect(mockPrisma.roster.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: { in: [1, 2] }, releasedAt: null } }),
    );
    expect(mockPrisma.trade.create).not.toHaveBeenCalled();
  });

  it("propose allows an IL-carrying team's 1-for-1", async () => {
    seedDb(mockPrisma, [
      ...rows(1, 100, 23),
      { teamId: 1, playerId: 900, assignedPosition: "IL" },
      ...rows(2, 200, 23),
    ]);
    mockPrisma.team.findMany.mockResolvedValueOnce(TEAMS.map((t) => ({ ...t, leagueId: 20 })));
    const res = await supertest(app).post("/").send(body([item(100, 1, 2), item(200, 2, 1)]));
    expect(res.status).toBe(200);
    expect(mockPrisma.trade.create).toHaveBeenCalledTimes(1);
  });
});

describe("POST /:id/accept re-checks the cap", () => {
  const proposed = (items: any[]) => ({ id: 9, leagueId: 20, proposerId: 1, status: "PROPOSED", items });

  it("accept re-checks the cap", async () => {
    mockPrisma.trade.findUnique.mockResolvedValue(
      proposed([item(100, 1, 2), item(101, 1, 2), item(200, 2, 1)]),
    );
    seedDb(mockPrisma, [...rows(1, 100, 23), ...rows(2, 200, 23)]);
    const res = await supertest(app).post("/9/accept");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Beta would have 24 players (limit 23)");
    expect(mockPrisma.trade.update).not.toHaveBeenCalled();
  });

  it("accept fails when a player has left the sender", async () => {
    mockPrisma.trade.findUnique.mockResolvedValue(proposed([item(100, 1, 2)]));
    seedDb(mockPrisma, [...rows(1, 101, 23), ...rows(2, 200, 23)]);
    const res = await supertest(app).post("/9/accept");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Ann Aces is no longer on Alpha");
    expect(mockPrisma.trade.update).not.toHaveBeenCalled();
  });
});

describe("GET /window", () => {
  it("is closed with the message on meeting day with an active period", async () => {
    const msg = "Trades open at the next meeting, after Period 8 closes.";
    mockGetTradeWindow.mockResolvedValue({ open: false, message: msg });
    const res = await supertest(app).get("/window?leagueId=20");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ open: false, message: msg, rosterCap: 23 });
    expect(mockGetTradeWindow).toHaveBeenCalledWith(20);
  });

  it("is open with a null message otherwise", async () => {
    mockGetTradeWindow.mockResolvedValue({ open: true });
    const res = await supertest(app).get("/window?leagueId=20");
    expect(res.body).toEqual({ open: true, message: null, rosterCap: 23 });
  });

  it("400s without a leagueId", async () => {
    const res = await supertest(app).get("/window");
    expect(res.status).toBe(400);
  });
});
