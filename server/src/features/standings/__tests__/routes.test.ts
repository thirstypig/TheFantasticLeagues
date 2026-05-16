import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    period: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue({ id: 1, startDate: new Date("2026-03-24"), endDate: new Date("2026-04-06") }) },
    team: { findMany: vi.fn() },
    league: { findUnique: vi.fn().mockResolvedValue({ scoringFormat: "ROTO" }) },
    leagueRule: { findMany: vi.fn() },
    teamStatsPeriod: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn().mockResolvedValue({}) },
    teamStatsCategoryDaily: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireLeagueMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireCommissionerOrAdmin: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));

// Mock the standings service functions
const mockComputeTeamStatsFromDb = vi.fn();
const mockComputeStandingsFromStats = vi.fn();
const mockComputeCategoryRows = vi.fn();
const mockGetSeasonStandings = vi.fn();

vi.mock("../services/standingsService.js", () => ({
  computeTeamStatsFromDb: (...args: any[]) => mockComputeTeamStatsFromDb(...args),
  computeStandingsFromStats: (...args: any[]) => mockComputeStandingsFromStats(...args),
  computeCategoryRows: (...args: any[]) => mockComputeCategoryRows(...args),
  getSeasonStandings: (...args: any[]) => mockGetSeasonStandings(...args),
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
  KEY_TO_DB_FIELD: {
    R: "R", HR: "HR", RBI: "RBI", SB: "SB", AVG: "AVG",
    W: "W", SV: "S", ERA: "ERA", WHIP: "WHIP", K: "K",
  } as Record<string, string>,
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
    mockGetSeasonStandings.mockResolvedValue({
      periodIds: [5],
      periodData: [{ teamStats: sampleTeamStats, standings: sampleStandings }],
      seasonRows: [],
    });
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
    mockGetSeasonStandings.mockResolvedValue({
      periodIds: [7],
      periodData: [{ teamStats: sampleTeamStats, standings: sampleStandings }],
      seasonRows: [],
    });
    mockComputeCategoryRows.mockReturnValue([]);

    const res = await supertest(app).get("/period-category-standings?leagueId=1&periodId=7");

    expect(res.status).toBe(200);
    expect(res.body.periodId).toBe(7);
    // getSeasonStandings was called (cache path), computeTeamStatsFromDb not needed
    expect(mockGetSeasonStandings).toHaveBeenCalledWith(1);
  });

  // Todo #134 regression: GET handlers must not block on writes. Production runs
  // `connection_limit=1`, so an awaited `$transaction(map(... upsert ...))` on the
  // read path serialized every concurrent standings view. The snapshot persistence
  // is now fire-and-forget — invoked but not awaited, and the response is sent
  // without waiting for the transaction to settle.
  it("does not await prisma.$transaction on the read path (todo #134)", async () => {
    mockPrisma.period.findFirst.mockResolvedValue({ id: 5 });
    mockGetSeasonStandings.mockResolvedValue({
      periodIds: [5],
      periodData: [{ teamStats: sampleTeamStats, standings: sampleStandings }],
      seasonRows: [],
    });
    mockComputeCategoryRows.mockReturnValue([]);

    // Force `$transaction` to hang. If the handler awaits the snapshot persist
    // the response would never resolve. We assert the response comes back well
    // before the transaction resolves — proving fire-and-forget.
    let resolveTx: (value: unknown[]) => void = () => {};
    const txPending = new Promise<unknown[]>(resolve => { resolveTx = resolve; });
    mockPrisma.$transaction.mockReturnValue(txPending);

    const res = await supertest(app).get("/period-category-standings?leagueId=1");

    // Response returned without the transaction settling.
    expect(res.status).toBe(200);
    expect(res.body.periodId).toBe(5);

    // Cleanup — let the dangling transaction settle so vitest doesn't warn.
    resolveTx([]);
  });
});

// ── Season-to-date weighted averaging (Issue #109) ──────────────
//
// `/period-category-standings` exposes `seasonValue` per category row.
// Rate stats (AVG/ERA/WHIP) must be computed by re-aggregating their
// underlying components (H/AB, ER/IP, BB_H/IP) across periods, NOT by
// arithmetic mean of the per-period rate. The classic counter-example:
// .300 in 100 AB and .200 in 400 AB is .220, NOT the unweighted .250.

describe("GET /period-category-standings — season-to-date weighted averaging", () => {
  // Two periods with very different volumes, designed so weighted vs
  // unweighted produce visibly different numbers.
  const periodOneStats = [
    {
      team: { id: 1, name: "Team A", code: "TMA" },
      R: 10, HR: 2, RBI: 8, SB: 1,
      AVG: 0.300, // 30 H / 100 AB
      W: 1, S: 0, ERA: 9.00, // 10 ER, 10 IP
      WHIP: 1.50, // BB_H = 15, IP = 10
      K: 5,
      H: 30, AB: 100, ER: 10, IP: 10, BB_H: 15,
    },
  ];
  const periodTwoStats = [
    {
      team: { id: 1, name: "Team A", code: "TMA" },
      R: 40, HR: 8, RBI: 32, SB: 4,
      AVG: 0.200, // 80 H / 400 AB
      W: 4, S: 0, ERA: 1.00, // 10 ER, 90 IP
      WHIP: 1.00, // BB_H = 90, IP = 90
      K: 20,
      H: 80, AB: 400, ER: 10, IP: 90, BB_H: 90,
    },
  ];

  beforeEach(() => {
    // Two periods supplied via getSeasonStandings cache.
    // Period 4 = periodOneStats, period 5 = periodTwoStats.
    mockPrisma.period.findFirst.mockResolvedValue({ id: 5, status: "active" });
    mockPrisma.period.findUnique.mockResolvedValue({
      id: 5,
      startDate: new Date("2026-04-15"),
      endDate: new Date("2026-04-30"),
    });
    mockPrisma.period.findMany.mockResolvedValue([
      { id: 4, startDate: new Date("2026-04-01"), endDate: new Date("2026-04-14") },
      { id: 5, startDate: new Date("2026-04-15"), endDate: new Date("2026-04-30") },
    ]);
    mockGetSeasonStandings.mockResolvedValue({
      periodIds: [4, 5],
      periodData: [
        {
          teamStats: periodOneStats,
          standings: [{ teamId: 1, teamName: "Team A", points: 5, rank: 1, delta: 0 }],
        },
        {
          teamStats: periodTwoStats,
          standings: [{ teamId: 1, teamName: "Team A", points: 10, rank: 1, delta: 0 }],
        },
      ],
      seasonRows: [],
    });
    mockComputeStandingsFromStats.mockReturnValue([
      { teamId: 1, teamName: "Team A", points: 10, rank: 1, delta: 0 },
    ]);
    mockComputeCategoryRows.mockImplementation((stats: any[]) =>
      stats.map((s) => ({
        teamId: s.team.id,
        teamName: s.team.name,
        teamCode: s.team.code,
        value: 0,
        rank: 1,
        points: 1,
      })),
    );
  });

  it("computes AVG by sum(H)/sum(AB), not arithmetic mean of period AVG", async () => {
    const res = await supertest(app).get("/period-category-standings?leagueId=1");
    expect(res.status).toBe(200);

    const avgCat = res.body.categories.find((c: any) => c.key === "AVG");
    expect(avgCat).toBeDefined();
    const teamA = avgCat.rows.find((r: any) => r.teamId === 1);

    // Correct (weighted): (30 + 80) / (100 + 400) = 110/500 = 0.220
    // Wrong (unweighted period mean): (0.300 + 0.200) / 2 = 0.250
    expect(teamA.seasonValue).toBeCloseTo(0.220, 3);
    expect(teamA.seasonValue).not.toBeCloseTo(0.250, 3);
  });

  it("computes ERA by sum(ER)*9/sum(IP), not arithmetic mean of period ERA", async () => {
    const res = await supertest(app).get("/period-category-standings?leagueId=1");

    const eraCat = res.body.categories.find((c: any) => c.key === "ERA");
    const teamA = eraCat.rows.find((r: any) => r.teamId === 1);

    // Correct (weighted): (10 + 10) * 9 / (10 + 90) = 180/100 = 1.80
    // Wrong (unweighted period mean): (9.00 + 1.00) / 2 = 5.00
    expect(teamA.seasonValue).toBeCloseTo(1.80, 2);
    expect(teamA.seasonValue).not.toBeCloseTo(5.00, 2);
  });

  it("computes WHIP by sum(BB_H)/sum(IP), not arithmetic mean of period WHIP", async () => {
    const res = await supertest(app).get("/period-category-standings?leagueId=1");

    const whipCat = res.body.categories.find((c: any) => c.key === "WHIP");
    const teamA = whipCat.rows.find((r: any) => r.teamId === 1);

    // Correct (weighted): (15 + 90) / (10 + 90) = 105/100 = 1.05
    // Wrong (unweighted period mean): (1.50 + 1.00) / 2 = 1.25
    expect(teamA.seasonValue).toBeCloseTo(1.05, 2);
    expect(teamA.seasonValue).not.toBeCloseTo(1.25, 2);
  });

  it("returns 0 for rate stats when components are zero (divide-by-zero guard)", async () => {
    // Override: a team with zero AB and zero IP across all periods.
    const emptyHittingPitching = [
      {
        team: { id: 1, name: "Team A", code: "TMA" },
        R: 0, HR: 0, RBI: 0, SB: 0,
        AVG: 0, W: 0, S: 0, ERA: 0, WHIP: 0, K: 0,
        H: 0, AB: 0, ER: 0, IP: 0, BB_H: 0,
      },
    ];
    mockGetSeasonStandings.mockReset();
    mockGetSeasonStandings.mockResolvedValue({
      periodIds: [5],
      periodData: [
        {
          teamStats: emptyHittingPitching,
          standings: [{ teamId: 1, teamName: "Team A", points: 0, rank: 1, delta: 0 }],
        },
      ],
      seasonRows: [],
    });

    const res = await supertest(app).get("/period-category-standings?leagueId=1");
    expect(res.status).toBe(200);

    for (const key of ["AVG", "ERA", "WHIP"]) {
      const cat = res.body.categories.find((c: any) => c.key === key);
      const teamA = cat.rows.find((r: any) => r.teamId === 1);
      // Existing convention is to return 0 (not null) — see services/standingsService.ts.
      expect(teamA.seasonValue).toBe(0);
    }
  });

  it("preserves counting stats as straight sums (not weighted)", async () => {
    const res = await supertest(app).get("/period-category-standings?leagueId=1");

    const rCat = res.body.categories.find((c: any) => c.key === "R");
    const teamA = rCat.rows.find((r: any) => r.teamId === 1);
    // R = 10 + 40 = 50
    expect(teamA.seasonValue).toBe(50);
  });
});

// ── GET /season ──────────────────────────────────────────────────

describe("GET /season", () => {
  it("returns 400 when leagueId is missing", async () => {
    const res = await supertest(app).get("/season");
    expect(res.status).toBe(400);
  });

  it("aggregates standings across periods", async () => {
    // getSeasonStandings returns the combined shape (parallel-computed internally)
    mockGetSeasonStandings.mockResolvedValue({
      periodIds: [1, 2],
      periodData: [
        {
          teamStats: sampleTeamStats,
          standings: [
            { teamId: 1, teamName: "Team A", points: 55, rank: 1, delta: 0 },
            { teamId: 2, teamName: "Team B", points: 45, rank: 2, delta: 0 },
          ],
        },
        {
          teamStats: sampleTeamStats,
          standings: [
            { teamId: 2, teamName: "Team B", points: 52, rank: 1, delta: 0 },
            { teamId: 1, teamName: "Team A", points: 48, rank: 2, delta: 0 },
          ],
        },
      ],
      seasonRows: [
        { rank: 1, teamId: 1, teamName: "Team A", totalPoints: 103 },
        { rank: 2, teamId: 2, teamName: "Team B", totalPoints: 97 },
      ],
    });
    mockPrisma.period.findMany.mockResolvedValue([
      { id: 1, name: "Period 1" },
      { id: 2, name: "Period 2" },
    ]);
    mockPrisma.team.findMany.mockResolvedValue([
      { id: 1, name: "Team A", code: "TMA" },
      { id: 2, name: "Team B", code: "TMB" },
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
    mockGetSeasonStandings.mockResolvedValue({
      periodIds: [],
      periodData: [],
      seasonRows: [],
    });
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

// ── GET /standings/settlement/:leagueId ─────────────────────────
//
// PII guard (todo #199): endpoint restricted to commissioners/admins via
// requireCommissionerOrAdmin() — not requireLeagueMember. The mock passes
// through to next() so these tests exercise the handler logic itself;
// the middleware's own enforcement is covered by authExtended.test.ts.

describe("GET /standings/settlement/:leagueId", () => {
  const sampleTeamsWithOwners = [
    {
      id: 1, name: "Team A", code: "TMA",
      ownerUser: { id: 10, name: "Alice", email: "alice@example.com", venmoHandle: "@alice", zelleHandle: null, paypalHandle: null },
      ownerships: [],
    },
    {
      id: 2, name: "Team B", code: "TMB",
      ownerUser: null,
      ownerships: [
        { user: { id: 20, name: "Bob", email: "bob@example.com", venmoHandle: null, zelleHandle: "bob@bank.com", paypalHandle: "@bob" } },
      ],
    },
  ];

  it("returns settlement data with payment handles for commissioners", async () => {
    mockPrisma.leagueRule.findMany.mockResolvedValue([
      { key: "payout_1st", value: "50" },
      { key: "payout_2nd", value: "30" },
    ]);
    mockPrisma.league.findUnique.mockResolvedValue({ entryFee: 100 });
    mockPrisma.team.findMany.mockResolvedValue(sampleTeamsWithOwners);

    const res = await supertest(app).get("/standings/settlement/1");

    expect(res.status).toBe(200);
    expect(res.body.leagueId).toBe(1);
    expect(res.body.entryFee).toBe(100);
    expect(res.body.totalPot).toBe(200);
    expect(res.body.payoutPcts["1"]).toBe(50);
    expect(res.body.payoutPcts["2"]).toBe(30);
    expect(res.body.teams).toHaveLength(2);
    // Verify PII is present in the response (commissioners can see it)
    expect(res.body.teams[0].owners[0].email).toBe("alice@example.com");
    expect(res.body.teams[0].owners[0].venmoHandle).toBe("@alice");
    expect(res.body.teams[1].owners[0].email).toBe("bob@example.com");
  });

  it("returns 400 for invalid leagueId", async () => {
    const res = await supertest(app).get("/standings/settlement/notanumber");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid leagueId");
  });

  it("returns empty teams and zero pot when league has no entry fee", async () => {
    mockPrisma.leagueRule.findMany.mockResolvedValue([]);
    mockPrisma.league.findUnique.mockResolvedValue({ entryFee: 0 });
    mockPrisma.team.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/standings/settlement/1");
    expect(res.status).toBe(200);
    expect(res.body.totalPot).toBe(0);
    expect(res.body.teams).toHaveLength(0);
  });
});
