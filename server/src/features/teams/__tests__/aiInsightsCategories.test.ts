import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import supertest from "supertest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    aiInsight: { findUnique: vi.fn(), create: vi.fn().mockResolvedValue({}) },
    team: { findUnique: vi.fn(), findMany: vi.fn() },
    roster: { findMany: vi.fn() },
    period: { findFirst: vi.fn() },
    playerStatsPeriod: { findMany: vi.fn() },
    teamStatsPeriod: { findMany: vi.fn() },
    league: { findUnique: vi.fn() },
    leagueMembership: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("../../../lib/leagueCategories.js", () => ({
  getLeagueCategories: vi.fn(),
}));
vi.mock("../../../lib/auctionValues.js", () => ({ lookupAuctionValue: vi.fn().mockReturnValue(null) }));
vi.mock("../../../services/aiAnalysisService.js", () => ({
  aiAnalysisService: {
    generateWeeklyInsights: vi.fn().mockResolvedValue({ success: true, result: { insights: [], overallGrade: "B" } }),
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/supabase.js", () => ({
  supabaseAdmin: { auth: { getUser: vi.fn() } },
}));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireTeamOwner: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireTeamOwnerOrCommissioner: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireLeagueMember: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../services/teamService.js", () => ({
  TeamService: class {},
}));

import { prisma } from "../../../db/prisma.js";
import { getLeagueCategories } from "../../../lib/leagueCategories.js";
import { aiAnalysisService } from "../../../services/aiAnalysisService.js";
import { teamsRouter } from "../routes.js";

const p = prisma as any;
const app = express();
app.use((req: any, _res, next) => { req.user = { id: 1, isAdmin: false }; next(); });
app.use("/api/teams", teamsRouter);

const CATS = [
  { key: "R", label: "Runs", lowerIsBetter: false, group: "H" },
  { key: "HR", label: "Home Runs", lowerIsBetter: false, group: "H" },
];

beforeEach(() => {
  vi.clearAllMocks();
  p.aiInsight.findUnique.mockResolvedValue(null);
  p.team.findUnique.mockResolvedValue({ id: 5, leagueId: 7, name: "T", budget: 260 });
  p.roster.findMany.mockResolvedValue([]);
  p.period.findFirst.mockResolvedValue({ id: 9 });
  p.playerStatsPeriod.findMany.mockResolvedValue([]);
  p.teamStatsPeriod.findMany.mockResolvedValue([
    { teamId: 5, team: { id: 5, name: "T" }, R: 10, HR: 9, RBI: 1, SB: 1, AVG: 0.25, W: 1, S: 1, K: 5, ERA: 4, WHIP: 1.2 },
    { teamId: 6, team: { id: 6, name: "U" }, R: 5, HR: 2, RBI: 9, SB: 9, AVG: 0.3, W: 9, S: 9, K: 50, ERA: 3, WHIP: 1.0 },
  ]);
  p.league.findUnique.mockResolvedValue({ rules: {} });
  (getLeagueCategories as any).mockResolvedValue(CATS);
});

describe("GET /api/teams/ai-insights — league categories", () => {
  it("scores standings over the league's categories only (R, HR)", async () => {
    const res = await supertest(app).get("/api/teams/ai-insights?leagueId=7&teamId=5");
    expect(res.status).toBe(200);
    expect(getLeagueCategories).toHaveBeenCalledWith(7);
    const args = (aiAnalysisService.generateWeeklyInsights as any).mock.calls[0][0];
    // Team T wins both R and HR (2 teams => 2 pts each); U wins every other
    // category in the stat line but those must not count.
    const byName = Object.fromEntries(args.standings.map((s: any) => [s.teamName, s.totalScore]));
    expect(byName).toEqual({ T: 4, U: 2 });
  });
});
