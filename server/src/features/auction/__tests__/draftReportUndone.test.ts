/**
 * C2 (UX step F final fix wave): the draft report built its auction log from
 * every WIN entry, including sales the commissioner undid. An undone sale
 * must not appear in the log handed to the report (and so not in any average).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction, Request, Response } from "express";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    auctionSession: { findUnique: vi.fn(), update: vi.fn() },
    season: { findFirst: vi.fn() },
    team: { findMany: vi.fn() },
  },
}));
vi.mock("../../../lib/logger.js", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireAdmin: (_req: any, _res: any, next: () => void) => next(),
  requireTeamOwner: () => (_req: any, _res: any, next: () => void) => next(),
  isTeamOwner: async () => true,
  requireLeagueMember: () => (_req: any, _res: any, next: () => void) => next(),
  requireCommissionerOrAdmin: () => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../../../lib/auctionValues.js", () => ({ lookupAuctionValue: () => null }));
const generateDraftReport = vi.hoisted(() => vi.fn());
vi.mock("../../../services/aiAnalysisService.js", () => ({ aiAnalysisService: { generateDraftReport } }));
vi.mock("../services/auctionWsService.js", () => ({ broadcastState: vi.fn() }));
vi.mock("../services/auctionPersistence.js", () => ({
  saveState: vi.fn(), loadState: vi.fn().mockResolvedValue(null), clearState: vi.fn(),
}));

import express from "express";
import supertest from "supertest";
import { prisma } from "../../../db/prisma.js";
import { auctionRouter } from "../routes.js";
import { saleEntriesFromLog } from "../lib/salesLog.js";

const mockPrisma = prisma as any;
const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => { (req as any).user = { id: 1, isAdmin: true }; next(); });
app.use(auctionRouter);

const log = [
  { type: "UNDO", teamName: "Beta", playerName: "Alonso", amount: 21, timestamp: 4, message: "" },
  { type: "WIN", teamName: "Beta", playerName: "Alonso", amount: 21, rosterId: 2, undone: true, timestamp: 3, message: "" },
  { type: "WIN", teamName: "Alpha", playerName: "Schwarber", amount: 14, rosterId: 1, timestamp: 2, message: "" },
  { type: "NOMINATION", teamName: "Alpha", playerName: "Schwarber", amount: 1, timestamp: 1, message: "" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.auctionSession.findUnique.mockResolvedValue({ leagueId: 7, state: { log, config: { budgetCap: 400, rosterSize: 23, pitcherCount: 9, batterCount: 14 } } });
  mockPrisma.season.findFirst.mockResolvedValue(null);
  mockPrisma.team.findMany.mockResolvedValue([
    { id: 1, name: "Alpha", rosters: [{ price: 14, source: "auction_2026", player: { name: "Schwarber", posPrimary: "OF", posList: "OF", mlbTeam: "PHI" } }] },
  ]);
  generateDraftReport.mockResolvedValue({ success: true, report: { ok: true } });
});

describe("C2: undone sales are left out of the draft report", () => {
  it("the log handed to generateDraftReport has no undone WIN", async () => {
    const res = await supertest(app).get("/draft-report?leagueId=7");
    expect(res.status).toBe(200);
    expect(generateDraftReport).toHaveBeenCalledTimes(1);
    const logEntries = generateDraftReport.mock.calls[0][2];
    expect(logEntries).toEqual([{ playerName: "Schwarber", teamName: "Alpha", price: 14, order: 1 }]);
  });

  it("saleEntriesFromLog: oldest first, WIN only, undone excluded", () => {
    expect(saleEntriesFromLog(log as any)).toEqual([{ playerName: "Schwarber", teamName: "Alpha", price: 14, order: 1 }]);
  });
});
