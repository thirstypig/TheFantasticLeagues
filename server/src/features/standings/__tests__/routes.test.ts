import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    period: { findFirst: vi.fn(), findMany: vi.fn() },
    team: { findMany: vi.fn() },
    leagueRule: { findMany: vi.fn() },
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireLeagueMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));

// Mock the standings service functions
const mockComputeTeamStatsFromDb = vi.fn();
const mockComputeStandingsFromStats = vi.fn();
const mockComputeCategoryRows = vi.fn();

vi.mock("../services/standingsService.js", () => ({
  computeTeamStatsFromDb: (...args: any[]) => mockComputeTeamStatsFromDb(...args),
  computeStandingsFromStats: (...args: any[]) => mockComputeStandingsFromStats(...args),
  computeCategoryRows: (...args: any[]) => mockComputeCategoryRows(...args),
  CATEGORY_CONFIG: [
    { key: "R", label: "Runs", lowerIsBetter: false },
    { key: "HR", label: "Home Runs", lowerIsBetter: false },
    { key: "RBI", label: "RBI", lowerIsBetter: false },
    { key: "SB", label: "Stolen Bases", lowerIsBetter: false },
    { key: "AVG", label: "Batting Average", lowerIsBetter: false },
    { key: "W", label: "Wins", lowerIsBetter: false },
    { key: "SV", label: "Saves", lowerIsBetter: false },
    { key: "ERA", label: "ERA", lowerIsBetter: true },
    { key: "WHIP", label: "WHIP", lowerIsBetter: true },
    { key: "K", label: "Strikeouts", lowerIsBetter: false },
  ],
}));

import { prisma } from "../../../db/prisma.js";
import express from "express";
import { standingsRouter } from "../routes.js";
import supertest from "supertest";

const mockPrisma = prisma as any;

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 1 };
  next();
});
app.use(standingsRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  res.status(500).json({ error: "Internal Server Error" });
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Sample data ─────────────────────────────────────────────────

const sampleTeamStats = [
  { team: { id: 1, name: "Team A", code: "TMA" }, R: 50, HR: 10, RBI: 40, SB: 5, AVG: 0.280, W: 8, S: 3, ERA: 3.50, WHIP: 1.20, K: 80 },
  { team: { id: 2, name: "Team B", code: "TMB" }, R: 45, HR: 12, RBI: 38, SB: 8, AVG: 0.265, W: 6, S: 5, ERA: 4.10, WHIP: 1.35, K: 70 },
];

const sampleStandings = [
  { teamId: 1, teamName: "Team A", points: 55, rank: 1, delta: 0 },
  { teamId: 2, teamName: "Team B", points: 45, rank: 2, delta: 0 },
];

// ── GET /period/current ──────────────────────────────────────────

describe("GET /period/current", () => {
  it("returns 400 when leagueId is missing", async () => {
    const res = await supertest(app).get("/period/current");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Missing leagueId");
  });

  it("returns 404 when no active period exists", async () => {
    mockPrisma.period.findFirst.mockResolvedValue(null);

    const res = await supertest(app).get("/period/current?leagueId=1");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("No active period found");
  });

  it("returns standings with real data", async () => {
    mockPrisma.period.findFirst.mockResolvedValue({ id: 5, status: "active" });
    mockComputeTeamStatsFromDb.mockResolvedValue(sampleTeamStats);
    mockComputeStandingsFromStats.mockReturnValue(sampleStandings);

    const res = await supertest(app).get("/period/current?leagueId=1");

    expect(res.status).toBe(200);
    expect(res.body.periodId).toBe(5);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].teamId).toBe(1);
    expect(res.body.data[0].points).toBe(55);
    expect(res.body.data[0].teamCode).toBe("TMA");
    expect(mockComputeTeamStatsFromDb).toHaveBeenCalledWith(1, 5);
  });

  it("returns zero-point teams when no stats data exists", async () => {
    mockPrisma.period.findFirst.mockResolvedValue({ id: 5 });
    mockComputeTeamStatsFromDb.mockResolvedValue([]);
    mockComputeStandingsFromStats.mockReturnValue([]);

    const res = await supertest(app).get("/period/current?leagueId=1");

    expect(res.status).toBe(200);
    expect(res.body.periodId).toBe(5);
    expect(res.body.data).toHaveLength(0);
  });
});

// ── GET /period-category-standings ───────────────────────────────

describe("GET /period-category-standings", () => {
  it("returns 400 when leagueId is missing", async () => {
    const res = await supertest(app).get("/period-category-standings");
    expect(res.status).toBe(400);
  });

  it("returns 404 when no active period exists", async () => {
    mockPrisma.period.findFirst.mockResolvedValue(null);

    const res = await supertest(app).get("/period-category-standings?leagueId=1");
    expect(res.status).toBe(404);
  });

  it("returns per-category breakdowns", async () => {
    mockPrisma.period.findFirst.mockResolvedValue({ id: 5 });
    mockComputeTeamStatsFromDb.mockResolvedValue(sampleTeamStats);
    mockComputeCategoryRows.mockReturnValue([
      { teamId: 1, teamName: "Team A", teamCode: "TMA", value: 50, rank: 1, points: 2 },
      { teamId: 2, teamName: "Team B", teamCode: "TMB", value: 45, rank: 2, points: 1 },
    ]);

    const res = await supertest(app).get("/period-category-standings?leagueId=1");

    expect(res.status).toBe(200);
    expect(res.body.periodId).toBe(5);
    expect(res.body.categories).toHaveLength(10); // 10 categories
    expect(res.body.teamCount).toBe(2);
    expect(res.body.categories[0].key).toBe("R");
    expect(res.body.categories[0].rows).toHaveLength(2);
  });

  it("accepts explicit periodId param", async () => {
    mockComputeTeamStatsFromDb.mockResolvedValue(sampleTeamStats);
    mockComputeCategoryRows.mockReturnValue([]);

    const res = await supertest(app).get("/period-category-standings?leagueId=1&periodId=7");

    expect(res.status).toBe(200);
    expect(res.body.periodId).toBe(7);
    expect(mockComputeTeamStatsFromDb).toHaveBeenCalledWith(1, 7);
  });
});

// ── GET /season ──────────────────────────────────────────────────

describe("GET /season", () => {
  it("returns 400 when leagueId is missing", async () => {
    const res = await supertest(app).get("/season");
    expect(res.status).toBe(400);
  });

  it("aggregates standings across periods", async () => {
    mockPrisma.period.findMany.mockResolvedValue([
      { id: 1, status: "completed" },
      { id: 2, status: "active" },
    ]);
    mockPrisma.team.findMany.mockResolvedValue([
      { id: 1, name: "Team A", code: "TMA" },
      { id: 2, name: "Team B", code: "TMB" },
    ]);
    // Period 1 standings
    mockComputeTeamStatsFromDb
      .mockResolvedValueOnce(sampleTeamStats)
      .mockResolvedValueOnce(sampleTeamStats);
    mockComputeStandingsFromStats
      .mockReturnValueOnce([
        { teamId: 1, teamName: "Team A", points: 55, rank: 1, delta: 0 },
        { teamId: 2, teamName: "Team B", points: 45, rank: 2, delta: 0 },
      ])
      .mockReturnValueOnce([
        { teamId: 2, teamName: "Team B", points: 52, rank: 1, delta: 0 },
        { teamId: 1, teamName: "Team A", points: 48, rank: 2, delta: 0 },
      ]);

    const res = await supertest(app).get("/season?leagueId=1");

    expect(res.status).toBe(200);
    expect(res.body.periodIds).toEqual([1, 2]);
    expect(res.body.rows).toHaveLength(2);

    // Team A: 55 + 48 = 103
    const teamA = res.body.rows.find((r: any) => r.teamId === 1);
    expect(teamA.periodPoints).toEqual([55, 48]);
    expect(teamA.totalPoints).toBe(103);

    // Team B: 45 + 52 = 97
    const teamB = res.body.rows.find((r: any) => r.teamId === 2);
    expect(teamB.periodPoints).toEqual([45, 52]);
    expect(teamB.totalPoints).toBe(97);

    // Sorted by totalPoints descending
    expect(res.body.rows[0].teamId).toBe(1);
  });

  it("returns empty rows when no periods exist", async () => {
    mockPrisma.period.findMany.mockResolvedValue([]);
    mockPrisma.team.findMany.mockResolvedValue([
      { id: 1, name: "Team A", code: "TMA" },
    ]);

    const res = await supertest(app).get("/season?leagueId=1");

    expect(res.status).toBe(200);
    expect(res.body.periodIds).toEqual([]);
    expect(res.body.rows[0].periodPoints).toEqual([]);
    expect(res.body.rows[0].totalPoints).toBe(0);
  });
});
