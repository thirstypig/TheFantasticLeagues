import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

const { mockTx, mockGetTradeWindow } = vi.hoisted(() => ({
  mockTx: {
    $queryRaw: vi.fn(),
    roster: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    team: { findUnique: vi.fn(), update: vi.fn() },
    trade: { update: vi.fn() },
    player: { findUnique: vi.fn() },
  },
  mockGetTradeWindow: vi.fn(),
}));

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    trade: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    team: { findUnique: vi.fn(), findMany: vi.fn() },
    league: { findUnique: vi.fn() },
    leagueMembership: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(mockTx)),
  },
}));
vi.mock("../../../lib/tradeWindow.js", () => ({ getTradeWindow: mockGetTradeWindow }));
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
const MSG = "Trades open at the next meeting, after Period 8 closes.";

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

const proposal = {
  leagueId: 20,
  proposerTeamId: 1,
  items: [{ senderId: 1, recipientId: 2, assetType: "PLAYER", playerId: 100 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.league.findUnique.mockResolvedValue({ name: "L" });
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));
  mockPrisma.team.findUnique.mockResolvedValue({ leagueId: 20 });
  mockPrisma.team.findMany.mockResolvedValue([
    { id: 1, leagueId: 20 },
    { id: 2, leagueId: 20 },
  ]);
});

describe("POST / (propose) with trade window", () => {
  it("returns 409 with the window message and creates no trade when closed", async () => {
    mockGetTradeWindow.mockResolvedValue({ open: false, message: MSG });
    const res = await supertest(app).post("/").send(proposal);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: MSG });
    expect(mockGetTradeWindow).toHaveBeenCalledWith(20);
    expect(mockPrisma.trade.create).not.toHaveBeenCalled();
  });

  it("creates the trade as before when open", async () => {
    mockGetTradeWindow.mockResolvedValue({ open: true });
    mockPrisma.trade.create.mockResolvedValue({ id: 5, status: "PROPOSED", items: [] });
    const res = await supertest(app).post("/").send(proposal);
    expect(res.status).toBeLessThan(300);
    expect(mockPrisma.trade.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.trade.create.mock.calls[0][0].data).toMatchObject({
      leagueId: 20,
      proposerId: 1,
      status: "PROPOSED",
    });
  });
});

describe("POST /:id/accept with trade window", () => {
  const proposed = {
    id: 9,
    leagueId: 20,
    proposerId: 1,
    status: "PROPOSED",
    items: [{ senderId: 1, recipientId: 2 }],
  };

  it("returns 409 and leaves the trade PROPOSED when closed (proposed in-window, accepted after next period starts)", async () => {
    mockPrisma.trade.findUnique.mockResolvedValue(proposed);
    mockGetTradeWindow.mockResolvedValue({ open: false, message: MSG });
    const res = await supertest(app).post("/9/accept");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: MSG });
    expect(mockGetTradeWindow).toHaveBeenCalledWith(20);
    expect(mockPrisma.trade.update).not.toHaveBeenCalled();
  });

  it("accepts as before when open", async () => {
    mockPrisma.trade.findUnique.mockResolvedValue(proposed);
    mockGetTradeWindow.mockResolvedValue({ open: true });
    mockPrisma.trade.update.mockResolvedValue({ ...proposed, status: "ACCEPTED" });
    const res = await supertest(app).post("/9/accept");
    expect(res.status).toBe(200);
    expect(mockPrisma.trade.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { status: "ACCEPTED" },
    });
  });
});

describe("POST /:id/process is never blocked by the window", () => {
  it("processes while the window is closed", async () => {
    mockGetTradeWindow.mockResolvedValue({ open: false, message: MSG });
    mockPrisma.trade.findUnique.mockResolvedValue({
      id: 9,
      leagueId: 20,
      proposerId: 1,
      status: "ACCEPTED",
      items: [],
    });
    mockTx.$queryRaw.mockResolvedValue([{ status: "ACCEPTED" }]);
    mockTx.trade.update.mockResolvedValue({});
    const res = await supertest(app).post("/9/process").send({});
    expect(res.status).not.toBe(409);
    expect(res.status).toBe(200);
    expect(mockTx.trade.update).toHaveBeenCalled();
    expect(mockGetTradeWindow).not.toHaveBeenCalled();
  });
});
