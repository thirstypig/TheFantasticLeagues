import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    player: { findMany: vi.fn(), findFirst: vi.fn() },
    roster: { findMany: vi.fn() },
    period: { findMany: vi.fn() },
    playerStatsPeriod: { findMany: vi.fn() },
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
import { clearPlayersCache } from "../services/playersListCache.js";

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
  // Flush the in-memory players list cache so each test sees a fresh load.
  clearPlayersCache();
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
    // Filter pushdown (todo #137): availability=available is now translated
    // to `where.id = { notIn: rosteredPlayerIds }`. Mock honors that filter so
    // we exercise the route's pushdown contract, not just the in-memory filter.
    const allPlayers = [
      { id: 1, mlbId: 1, name: "Free Agent", posPrimary: "SS", posList: "SS", mlbTeam: "NYM" },
      { id: 2, mlbId: 2, name: "Owned Guy", posPrimary: "1B", posList: "1B", mlbTeam: "ATL" },
    ];
    mockPrisma.player.findMany.mockImplementation(async (args: any) => {
      const notIn = args?.where?.id?.notIn;
      if (Array.isArray(notIn)) {
        return allPlayers.filter((p) => !notIn.includes(p.id));
      }
      return allPlayers;
    });
    mockPrisma.roster.findMany.mockResolvedValue([
      { playerId: 2, team: { code: "ABC", leagueId: 1, name: "Aces" } },
    ]);

    const res = await supertest(app).get("/players?availability=available&leagueId=1");
    expect(res.status).toBe(200);
    // Pushdown filtered owned player at the DB level.
    expect(res.body.players).toHaveLength(1);
    expect(res.body.players[0].player_name).toBe("Free Agent");

    // Assert the route built the right `where` clause — regression for the
    // pushdown specifically. The owned player must appear in `id.notIn`.
    expect(mockPrisma.player.findMany).toHaveBeenCalled();
    const call = mockPrisma.player.findMany.mock.calls[0][0];
    expect(call.where.id.notIn).toEqual([2]);
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

  it.skip("OBSOLETE: Ohtani is now 2 separate player records — expands two-way player (Ohtani) into hitter + pitcher rows", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 10, mlbId: 660271, name: "Shohei Ohtani", posPrimary: "TWP", posList: "TWP", mlbTeam: "LAD" },
      { id: 11, mlbId: 1, name: "Regular Hitter", posPrimary: "CF", posList: "CF", mlbTeam: "NYM" },
    ]);
    mockPrisma.roster.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/players");
    expect(res.status).toBe(200);
    // Ohtani should produce 2 rows (DH + P), plus 1 regular hitter = 3 total
    expect(res.body.players).toHaveLength(3);

    const ohtaniRows = res.body.players.filter((p: any) => p.player_name === "Shohei Ohtani");
    expect(ohtaniRows).toHaveLength(2);

    const hitterRow = ohtaniRows.find((p: any) => !p.is_pitcher);
    expect(hitterRow.positions).toBe("DH");
    expect(hitterRow.is_pitcher).toBe(false);

    const pitcherRow = ohtaniRows.find((p: any) => p.is_pitcher);
    expect(pitcherRow.positions).toBe("P");
    expect(pitcherRow.is_pitcher).toBe(true);
  });

  it.skip("OBSOLETE: Ohtani split — shows Ohtani pitcher row when filtering type=pitchers", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 10, mlbId: 660271, name: "Shohei Ohtani", posPrimary: "TWP", posList: "TWP", mlbTeam: "LAD" },
    ]);
    mockPrisma.roster.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/players?type=pitchers");
    expect(res.status).toBe(200);
    expect(res.body.players).toHaveLength(1);
    expect(res.body.players[0].player_name).toBe("Shohei Ohtani");
    expect(res.body.players[0].is_pitcher).toBe(true);
    expect(res.body.players[0].positions).toBe("P");
  });

  it.skip("OBSOLETE: Ohtani split — shows Ohtani hitter row when filtering type=hitters", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 10, mlbId: 660271, name: "Shohei Ohtani", posPrimary: "TWP", posList: "TWP", mlbTeam: "LAD" },
    ]);
    mockPrisma.roster.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/players?type=hitters");
    expect(res.status).toBe(200);
    expect(res.body.players).toHaveLength(1);
    expect(res.body.players[0].player_name).toBe("Shohei Ohtani");
    expect(res.body.players[0].is_pitcher).toBe(false);
    expect(res.body.players[0].positions).toBe("DH");
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

// ── GET /players/:mlbId/eligible-slots ───────────────────────────

describe("GET /players/:mlbId/eligible-slots", () => {
  it("returns deduped slot union + per-position breakdown for a multi-position player", async () => {
    mockPrisma.player.findFirst.mockResolvedValue({
      id: 1, mlbId: 605141, name: "Mookie Betts", posList: "OF,2B", posPrimary: "OF",
    });

    const res = await supertest(app).get("/players/605141/eligible-slots");
    expect(res.status).toBe(200);
    expect(res.body.playerId).toBe(1);
    expect(res.body.mlbId).toBe(605141);
    expect(res.body.posList).toBe("OF,2B");
    // 2B → ["2B", "MI"]; OF → ["OF"]; deduped union preserves first-seen order.
    expect(res.body.eligibleSlots).toEqual(["OF", "2B", "MI"]);
    expect(res.body.perPosition).toEqual([
      { position: "OF", slots: ["OF"] },
      { position: "2B", slots: ["2B", "MI"] },
    ]);
  });

  it("falls back to posPrimary when posList is empty", async () => {
    mockPrisma.player.findFirst.mockResolvedValue({
      id: 2, mlbId: 545361, name: "Mike Trout", posList: null, posPrimary: "CF",
    });

    const res = await supertest(app).get("/players/545361/eligible-slots");
    expect(res.status).toBe(200);
    // CF maps to OF in positionToSlots.
    expect(res.body.posList).toBe("CF");
    expect(res.body.eligibleSlots).toEqual(["OF"]);
    expect(res.body.perPosition).toEqual([{ position: "CF", slots: ["OF"] }]);
  });

  it("returns 404 for unknown player", async () => {
    mockPrisma.player.findFirst.mockResolvedValue(null);

    const res = await supertest(app).get("/players/999999/eligible-slots");
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid mlbId", async () => {
    const res = await supertest(app).get("/players/abc/eligible-slots");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid MLB ID");
  });

  it("resolves Ohtani's derived pitcher ID (1660271) to the real ID (660271)", async () => {
    mockPrisma.player.findFirst.mockResolvedValue({
      id: 3, mlbId: 660271, name: "Shohei Ohtani", posList: "DH,P", posPrimary: "DH",
    });

    const res = await supertest(app).get("/players/1660271/eligible-slots");
    expect(res.status).toBe(200);
    expect(mockPrisma.player.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { mlbId: 660271 } }),
    );
    expect(res.body.eligibleSlots).toEqual(["DH", "P"]);
  });

  it("returns empty arrays for a player with no recognized positions", async () => {
    mockPrisma.player.findFirst.mockResolvedValue({
      id: 4, mlbId: 1, name: "Unknown", posList: "", posPrimary: "",
    });

    const res = await supertest(app).get("/players/1/eligible-slots");
    expect(res.status).toBe(200);
    expect(res.body.eligibleSlots).toEqual([]);
    expect(res.body.perPosition).toEqual([]);
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

  // todo #114 — every season-stats row must surface the full extended-stat set so
  // agent consumers don't have to guess which fields are present.
  it("includes the full extended-stat field set on every row (todo #114)", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 545361, name: "Mike Trout", posPrimary: "CF", posList: "CF", mlbTeam: "LAA" },
    ]);
    mockPrisma.roster.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/player-season-stats?leagueId=1");
    expect(res.status).toBe(200);
    const row = res.body.stats[0];
    // 13 extended fields the sync stores but the API previously hid:
    // batting: BB, HBP, SF, TB, DBL, TPL, SO, OBP, SLG, OPS
    // pitching: L, GS, K9, BB9, HR_A, BF
    const extendedBatting = ["BB", "HBP", "SF", "TB", "DBL", "TPL", "SO", "OBP", "SLG", "OPS"];
    const extendedPitching = ["L", "GS", "K9", "BB9", "HR_A", "BF"];
    for (const f of [...extendedBatting, ...extendedPitching]) {
      expect(row).toHaveProperty(f);
      expect(typeof row[f]).toBe("number");
    }
  });

  it.skip("OBSOLETE: Ohtani split — expands Ohtani into hitter + pitcher rows in season stats", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 10, mlbId: 660271, name: "Shohei Ohtani", posPrimary: "TWP", posList: "TWP", mlbTeam: "LAD" },
    ]);
    mockPrisma.roster.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/player-season-stats?leagueId=1");
    expect(res.status).toBe(200);
    expect(res.body.stats).toHaveLength(2);

    const hitter = res.body.stats.find((s: any) => !s.is_pitcher);
    expect(hitter.positions).toBe("DH");
    expect(hitter.mlb_id).toBe("660271");

    const pitcher = res.body.stats.find((s: any) => s.is_pitcher);
    expect(pitcher.positions).toBe("P");
    expect(pitcher.mlb_id).toBe("660271");
  });
});

// ── GET /player-season-stats — FA filter pushdown (todo #164) ────

describe("GET /player-season-stats — FA filter pushdown (todo #164)", () => {
  it("pushes `freeAgentsOnly=true` into Prisma where clause as `id: { notIn: rosteredIds }`", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 545361, name: "Free Agent", posPrimary: "SS", posList: "SS", mlbTeam: "NYM" },
    ]);
    mockPrisma.roster.findMany.mockResolvedValue([
      { playerId: 99, team: { id: 7, code: "ABC", leagueId: 1, name: "Aces" }, price: 10 },
    ]);

    const res = await supertest(app).get(
      "/player-season-stats?leagueId=1&freeAgentsOnly=true",
    );
    expect(res.status).toBe(200);
    const where = mockPrisma.player.findMany.mock.calls[0][0].where;
    expect(where.id).toEqual({ notIn: [99] });
  });

  it("pushes `q` into Prisma where clause as case-insensitive name contains", async () => {
    mockPrisma.player.findMany.mockResolvedValue([]);
    mockPrisma.roster.findMany.mockResolvedValue([]);

    const res = await supertest(app).get(
      "/player-season-stats?leagueId=1&freeAgentsOnly=true&q=trout",
    );
    expect(res.status).toBe(200);
    const where = mockPrisma.player.findMany.mock.calls[0][0].where;
    expect(where.name).toEqual({ contains: "trout", mode: "insensitive" });
  });

  it("clamps the response with `take` (capped defensively at 200)", async () => {
    mockPrisma.player.findMany.mockResolvedValue([]);
    mockPrisma.roster.findMany.mockResolvedValue([]);

    await supertest(app).get(
      "/player-season-stats?leagueId=1&freeAgentsOnly=true&take=50",
    );
    expect(mockPrisma.player.findMany.mock.calls[0][0].take).toBe(50);

    await supertest(app).get(
      "/player-season-stats?leagueId=1&freeAgentsOnly=true&take=10000",
    );
    expect(mockPrisma.player.findMany.mock.calls[1][0].take).toBe(200);
  });

  it("does not change default behavior when freeAgentsOnly is omitted", async () => {
    mockPrisma.player.findMany.mockResolvedValue([]);
    mockPrisma.roster.findMany.mockResolvedValue([
      { playerId: 99, team: { id: 7, code: "ABC", leagueId: 1, name: "Aces" }, price: 10 },
    ]);

    await supertest(app).get("/player-season-stats?leagueId=1");
    const where = mockPrisma.player.findMany.mock.calls[0][0].where;
    expect(where.id).toBeUndefined();
    expect(where.name?.contains).toBeUndefined();
  });
});

// ── GET /player-period-stats ─────────────────────────────────────

describe("GET /player-period-stats", () => {
  it("returns empty stats array", async () => {
    const res = await supertest(app).get("/player-period-stats");
    expect(res.status).toBe(200);
    expect(res.body.stats).toEqual([]);
  });

  // todo #114 — period-stats rows must also surface the extended fields that
  // PlayerStatsPeriod has stored in the DB since the sync pipeline added them.
  it("exposes all extended PlayerStatsPeriod fields on each row (todo #114)", async () => {
    mockPrisma.period.findMany.mockResolvedValue([
      { id: 7, name: "Period 1", status: "active", startDate: new Date(), endDate: new Date() },
    ]);
    mockPrisma.playerStatsPeriod.findMany.mockResolvedValue([
      {
        playerId: 1,
        AB: 100, H: 30, R: 15, HR: 5, RBI: 20, SB: 2, GS_HR: 0,
        BB: 12, HBP: 1, SF: 1, TB: 50, DBL: 5, TPL: 0, SO: 25,
        OBP: 0.36, SLG: 0.500, OPS: 0.860,
        W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0, SHO: 0,
        L: 0, GS: 0, QS: 0, K9: 0, BB9: 0, HR_A: 0, BF: 0,
        G: 30,
        player: { id: 1, mlbId: 545361, name: "Mike Trout", posPrimary: "CF", mlbTeam: "LAA" },
      },
    ]);
    mockPrisma.roster.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/player-period-stats?leagueId=1");
    expect(res.status).toBe(200);
    expect(res.body.stats).toHaveLength(1);
    const row = res.body.stats[0];
    // OBP/SLG/OPS — the headline-level demand from #114
    expect(row.OBP).toBeCloseTo(0.36, 4);
    expect(row.SLG).toBeCloseTo(0.500, 4);
    expect(row.OPS).toBeCloseTo(0.860, 4);
    // Other extended batting fields
    expect(row.BB).toBe(12);
    expect(row.HBP).toBe(1);
    expect(row.SF).toBe(1);
    expect(row.TB).toBe(50);
    expect(row.DBL).toBe(5);
    expect(row.TPL).toBe(0);
    expect(row.SO).toBe(25);
    // Extended pitching shape (zero for a hitter row, but still surfaced)
    for (const f of ["L", "GS", "K9", "BB9", "HR_A", "BF"]) {
      expect(row).toHaveProperty(f);
    }
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
