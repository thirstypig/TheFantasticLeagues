import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    player: { findMany: vi.fn(), findFirst: vi.fn() },
    roster: { findMany: vi.fn() },
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));
vi.mock("../../../lib/mlbTeams.js", () => ({
  getLeagueStatsSource: vi.fn().mockResolvedValue("NL"),
  getTeamsForSource: vi.fn().mockReturnValue(null), // null = no filter
}));
vi.mock("../../../lib/mlbApi.js", () => ({
  mlbGetJson: vi.fn(),
}));
vi.mock("../services/dataService.js", () => ({
  DataService: {
    getInstance: vi.fn().mockReturnValue({
      getAuctionValues: vi.fn().mockReturnValue([]),
    }),
  },
}));
// Mock fs to avoid loading real CSV
vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn().mockReturnValue(""),
  },
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(""),
}));

import { prisma } from "../../../db/prisma.js";
import { mlbGetJson } from "../../../lib/mlbApi.js";

const mockPrisma = prisma as any;

// ── Express test app ─────────────────────────────────────────────

import express from "express";
import { playersRouter, playerDataRouter } from "../routes.js";
import supertest from "supertest";

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 1, isAdmin: false };
  next();
});
app.use("/players", playersRouter);
app.use(playerDataRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  res.status(500).json({ error: "Internal Server Error" });
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── GET /players ─────────────────────────────────────────────────

describe("GET /players", () => {
  it("returns all players", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 545361, name: "Mike Trout", posPrimary: "CF", posList: "CF,DH", mlbTeam: "LAA" },
    ]);
    mockPrisma.roster.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/players");
    expect(res.status).toBe(200);
    expect(res.body.players).toHaveLength(1);
    expect(res.body.players[0].player_name).toBe("Mike Trout");
    expect(res.body.players[0].is_pitcher).toBe(false);
  });

  it("filters by availability=available (no team assignment)", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 1, name: "Free Agent", posPrimary: "SS", posList: "SS", mlbTeam: "NYM" },
      { id: 2, mlbId: 2, name: "Owned Guy", posPrimary: "1B", posList: "1B", mlbTeam: "ATL" },
    ]);
    mockPrisma.roster.findMany.mockResolvedValue([
      { playerId: 2, team: { code: "ABC", leagueId: 1, name: "Aces" } },
    ]);

    const res = await supertest(app).get("/players?availability=available&leagueId=1");
    expect(res.status).toBe(200);
    expect(res.body.players).toHaveLength(1);
    expect(res.body.players[0].player_name).toBe("Free Agent");
  });

  it("filters pitchers only", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 1, name: "Hitter", posPrimary: "CF", posList: "CF", mlbTeam: "NYM" },
      { id: 2, mlbId: 2, name: "Pitcher", posPrimary: "P", posList: "P", mlbTeam: "ATL" },
    ]);
    mockPrisma.roster.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/players?type=pitchers");
    expect(res.status).toBe(200);
    expect(res.body.players).toHaveLength(1);
    expect(res.body.players[0].player_name).toBe("Pitcher");
  });
});

// ── GET /players/:mlbId ──────────────────────────────────────────

describe("GET /players/:mlbId", () => {
  it("returns player by MLB ID", async () => {
    mockPrisma.player.findFirst.mockResolvedValue({
      id: 1, mlbId: 545361, name: "Mike Trout", posPrimary: "CF", posList: "CF,DH", mlbTeam: "LAA",
    });

    const res = await supertest(app).get("/players/545361");
    expect(res.status).toBe(200);
    expect(res.body.player.player_name).toBe("Mike Trout");
  });

  it("returns 404 for unknown player", async () => {
    mockPrisma.player.findFirst.mockResolvedValue(null);

    const res = await supertest(app).get("/players/999999");
    expect(res.status).toBe(404);
  });

  it("returns 400 for non-numeric mlbId", async () => {
    const res = await supertest(app).get("/players/abc");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid MLB ID");
  });
});

// ── GET /players/:mlbId/fielding ─────────────────────────────────

describe("GET /players/:mlbId/fielding", () => {
  it("returns fielding positions sorted by games", async () => {
    (mlbGetJson as any).mockResolvedValue({
      stats: [{
        splits: [
          { stat: { position: { abbreviation: "CF" }, games: 100 } },
          { stat: { position: { abbreviation: "RF" }, games: 20 } },
        ],
      }],
    });

    const res = await supertest(app).get("/players/545361/fielding");
    expect(res.status).toBe(200);
    expect(res.body.positions).toHaveLength(2);
    expect(res.body.positions[0].position).toBe("CF");
    expect(res.body.positions[0].games).toBe(100);
  });

  it("returns 400 for invalid MLB ID", async () => {
    const res = await supertest(app).get("/players/abc/fielding");
    expect(res.status).toBe(400);
  });

  it("returns 502 when MLB API fails", async () => {
    (mlbGetJson as any).mockRejectedValue(new Error("API down"));

    const res = await supertest(app).get("/players/545361/fielding");
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("Unable to fetch fielding stats");
  });
});

// ── GET /player-season-stats ─────────────────────────────────────

describe("GET /player-season-stats", () => {
  it("returns player season stats with zero defaults", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 545361, name: "Mike Trout", posPrimary: "CF", posList: "CF", mlbTeam: "LAA" },
    ]);
    mockPrisma.roster.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/player-season-stats?leagueId=1");
    expect(res.status).toBe(200);
    expect(res.body.stats).toHaveLength(1);
    expect(res.body.stats[0].AB).toBe(0);
    expect(res.body.stats[0].dollar_value).toBe(0);
  });
});

// ── GET /player-period-stats ─────────────────────────────────────

describe("GET /player-period-stats", () => {
  it("returns empty stats array", async () => {
    const res = await supertest(app).get("/player-period-stats");
    expect(res.status).toBe(200);
    expect(res.body.stats).toEqual([]);
  });
});

// ── GET /auction-values ──────────────────────────────────────────

describe("GET /auction-values", () => {
  it("returns auction values from data service", async () => {
    const res = await supertest(app).get("/auction-values");
    expect(res.status).toBe(200);
    expect(res.body.values).toEqual([]);
  });
});
