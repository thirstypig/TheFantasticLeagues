import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    player: { findMany: vi.fn(), findFirst: vi.fn() },
    roster: { findMany: vi.fn(), findFirst: vi.fn() },
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
  getTeamsForSource: vi.fn().mockReturnValue(null),
}));
vi.mock("../../../lib/mlbApi.js", () => ({
  mlbGetJson: vi.fn(),
  fetchMlbTeamsMap: vi.fn().mockResolvedValue({ 119: "LAD", 135: "SD" }),
}));
vi.mock("../services/dataService.js", () => ({
  DataService: {
    getInstance: vi.fn().mockReturnValue({ getAuctionValues: vi.fn().mockReturnValue([]) }),
  },
}));

import { prisma } from "../../../db/prisma.js";
import { mlbGetJson } from "../../../lib/mlbApi.js";
import { buildPlayerCard } from "../services/playerCardService.js";
import express from "express";
import supertest from "supertest";
import { playersRouter, playerDataRouter } from "../routes.js";

const mockPrisma = prisma as any;
const mockGet = mlbGetJson as unknown as ReturnType<typeof vi.fn>;

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 1, isAdmin: false };
  next();
});
app.use("/players", playersRouter);
app.use(playerDataRouter);

const TODAY = new Date("2026-06-11T15:00:00Z");

function person(pos = "CF", type = "Outfielder") {
  return {
    people: [
      {
        id: 100,
        fullName: "Test Guy",
        primaryPosition: { abbreviation: pos, type },
        currentTeam: { id: 119 },
      },
    ],
  };
}
const statResp = (splits: any[]) => ({ stats: [{ splits }] });
const mlbSplit = (stat: any, extra: any = {}) => ({ sport: { id: 1 }, stat, ...extra });

type Routes = Record<string, (url: string) => any>;
function route(overrides: Routes = {}) {
  mockGet.mockImplementation(async (url: string) => {
    for (const [frag, fn] of Object.entries(overrides)) {
      if (url.includes(frag)) return fn(url);
    }
    if (url.includes("/schedule")) return { dates: [] };
    if (url.includes("/stats?")) return statResp([]);
    if (url.includes("/people/")) return person();
    return {};
  });
}
const urls = () => mockGet.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.roster.findFirst.mockResolvedValue(null);
});

describe("buildPlayerCard", () => {
  it("computes calendar windows ending yesterday ET", async () => {
    route();
    await buildPlayerCard(100, 1, TODAY);
    const u = urls();
    const dr = u.filter((x) => x.includes("stats=byDateRange"));
    expect(dr.some((x) => x.includes("startDate=2026-06-04&endDate=2026-06-10"))).toBe(true);
    expect(dr.some((x) => x.includes("startDate=2026-05-28&endDate=2026-06-10"))).toBe(true);
    expect(dr.some((x) => x.includes("startDate=2026-05-12&endDate=2026-06-10"))).toBe(true);
    expect(dr.every((x) => x.includes("group=hitting") && x.includes("season=2026"))).toBe(true);
    expect(u.some((x) => x.includes("stats=season") && x.includes("season=2026"))).toBe(true);
    expect(u.some((x) => x.includes("stats=season") && x.includes("season=2025"))).toBe(true);
  });

  it("uses the ET date, not UTC, when today is just after midnight UTC", async () => {
    route();
    await buildPlayerCard(100, 1, new Date("2026-06-11T02:00:00Z")); // 22:00 ET Jun 10
    expect(urls().some((x) => x.includes("startDate=2026-06-03&endDate=2026-06-09"))).toBe(true);
  });

  it("passes a 30-minute TTL on card fetches", async () => {
    route();
    await buildPlayerCard(100, 1, TODAY);
    expect(mockGet.mock.calls.every((c) => c[1] === 1800)).toBe(true);
  });

  it("last 3 starts skips relief appearances", async () => {
    const g = (date: string, gs: number) => ({
      date,
      stat: { gamesStarted: gs, inningsPitched: "6.0", strikeOuts: 5 },
      opponent: { id: 135, name: "Padres" },
      isHome: true,
    });
    route({
      "/people/100?": () => person("SP", "Pitcher"),
      "stats=gameLog": () =>
        statResp([g("2026-06-01", 1), g("2026-06-03", 0), g("2026-06-05", 1), g("2026-06-07", 0), g("2026-06-09", 1)]),
    });
    const card = await buildPlayerCard(100, 1, TODAY);
    expect(card.isPitcher).toBe(true);
    const recent = card.recent.pitching!;
    expect(recent.map((r) => r.date)).toEqual(["2026-06-09", "2026-06-05", "2026-06-01"]);
    expect(recent[0].opp).toBe("SD");
    expect(recent[0].home).toBe(true);
  });

  it("hitters get the last 5 games, most recent first", async () => {
    const g = (d: number) => ({
      date: `2026-06-0${d}`, stat: { atBats: 4 }, opponent: { id: 135 }, isHome: false,
    });
    route({ "stats=gameLog": () => statResp([1, 2, 3, 4, 5, 6, 7].map(g)) });
    const card = await buildPlayerCard(100, 1, TODAY);
    expect(card.recent.hitting!.map((r) => r.date)).toEqual([
      "2026-06-07", "2026-06-06", "2026-06-05", "2026-06-04", "2026-06-03",
    ]);
  });

  it("picks the MLB split, not the all-sports one", async () => {
    route({
      "stats=season&group=hitting&season=2026": () =>
        statResp([
          { sport: { id: 0 }, stat: { homeRuns: 99 } },
          mlbSplit({ homeRuns: 12 }),
        ]),
    });
    const card = await buildPlayerCard(100, 1, TODAY);
    expect(card.splits.season.hitting).toEqual({ homeRuns: 12 });
  });

  it("prefers the no-team aggregate split for a traded player", async () => {
    route({
      "stats=season&group=hitting&season=2026": () =>
        statResp([
          mlbSplit({ homeRuns: 5 }, { team: { id: 1 } }),
          mlbSplit({ homeRuns: 7 }, { team: { id: 2 } }),
          mlbSplit({ homeRuns: 12 }),
        ]),
    });
    const card = await buildPlayerCard(100, 1, TODAY);
    expect(card.splits.season.hitting).toEqual({ homeRuns: 12 });
  });

  it("sums per-team splits and recomputes rates when every split has a team", async () => {
    route({
      "stats=season&group=hitting&season=2026": () =>
        statResp([
          mlbSplit({ atBats: 100, hits: 30, homeRuns: 5, avg: ".300" }, { team: { id: 1 } }),
          mlbSplit({ atBats: 100, hits: 20, homeRuns: 7, avg: ".200" }, { team: { id: 2 } }),
        ]),
      "stats=season&group=hitting&season=2025": () => statResp([]),
    });
    const card = await buildPlayerCard(100, 1, TODAY);
    expect(card.splits.season.hitting).toMatchObject({ atBats: 200, hits: 50, homeRuns: 12, avg: ".250" });
  });

  it("recomputes ERA and WHIP from summed innings for pitchers", async () => {
    route({
      "/people/100?": () => person("SP", "Pitcher"),
      "stats=season&group=pitching&season=2026": () =>
        statResp([
          mlbSplit({ inningsPitched: "10.1", earnedRuns: 3, hits: 8, baseOnBalls: 2 }, { team: { id: 1 } }),
          mlbSplit({ inningsPitched: "9.2", earnedRuns: 3, hits: 7, baseOnBalls: 3 }, { team: { id: 2 } }),
        ]),
    });
    const card = await buildPlayerCard(100, 1, TODAY);
    // 20.0 IP, 6 ER -> 2.70 ; (15 H + 5 BB)/20 -> 1.00
    expect(card.splits.season.pitching).toMatchObject({ inningsPitched: "20.0", earnedRuns: 6, era: "2.70", whip: "1.00" });
  });

  it("empty splits yield null, not a crash", async () => {
    route();
    const card = await buildPlayerCard(100, 1, TODAY);
    expect(card.splits.last7.hitting).toBeNull();
    expect(card.splits.season.hitting).toBeNull();
    expect(card.splits.lastSeason.hitting).toBeNull();
    expect(card.recent).toEqual({ hitting: [] });
    expect(card.nextGame).toBeNull();
  });

  it("fantasyTeam comes from the active Roster row in that league", async () => {
    route();
    mockPrisma.roster.findFirst.mockResolvedValue({ team: { id: 7, name: "Doyers", code: "DOY" } });
    const card = await buildPlayerCard(100, 20, TODAY);
    const arg = mockPrisma.roster.findFirst.mock.calls[0][0];
    expect(arg.where).toMatchObject({
      releasedAt: null,
      player: { mlbId: 100 },
      team: { leagueId: 20 },
    });
    expect(card.fantasyTeam).toEqual({ id: 7, name: "Doyers", code: "DOY" });
  });

  it("two-way players get both groups", async () => {
    route({ "/people/100?": () => person("TWP", "Two-Way Player") });
    const card = await buildPlayerCard(100, 1, TODAY);
    expect(card.isTwoWay).toBe(true);
    expect(urls().some((x) => x.includes("group=pitching") && x.includes("byDateRange"))).toBe(true);
    expect(urls().some((x) => x.includes("group=hitting") && x.includes("byDateRange"))).toBe(true);
    expect(card.splits.last7).toHaveProperty("pitching");
    expect(card.splits.last7).toHaveProperty("hitting");
  });

  it("nextGame uses a schedule query for the player's team and reports opp/home", async () => {
    route({
      "/schedule": () => ({
        dates: [
          {
            games: [
              {
                gameDate: "2026-06-11T23:10:00Z",
                teams: { home: { team: { id: 119 } }, away: { team: { id: 135 } } },
              },
            ],
          },
        ],
      }),
    });
    const card = await buildPlayerCard(100, 1, TODAY);
    const sched = urls().find((x) => x.includes("/schedule"))!;
    expect(sched).toContain("teamId=119");
    expect(sched).toContain("startDate=2026-06-11&endDate=2026-06-18");
    expect(card.nextGame).toEqual({ opp: "SD", home: true, startUtc: "2026-06-11T23:10:00Z" });
    expect(card.mlbTeam).toBe("LAD");
  });
});

describe("GET /players/:mlbId/card", () => {
  it("400 on non-numeric mlbId", async () => {
    const res = await supertest(app).get("/players/abc/card?leagueId=1");
    expect(res.status).toBe(400);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("returns the card JSON", async () => {
    route();
    const res = await supertest(app).get("/players/100/card?leagueId=20");
    expect(res.status).toBe(200);
    expect(res.body.mlbId).toBe(100);
    expect(res.body.name).toBe("Test Guy");
    expect(mockPrisma.roster.findFirst.mock.calls[0][0].where.team).toEqual({ leagueId: 20 });
  });

  it("502 when statsapi is down", async () => {
    mockGet.mockRejectedValue(new Error("down"));
    const res = await supertest(app).get("/players/100/card?leagueId=20");
    expect(res.status).toBe(502);
  });
});

describe("fix round 1", () => {
  it("falls back to last season's game log when the current one is empty", async () => {
    const g = (d: string) => ({ date: d, stat: { atBats: 4 }, opponent: { id: 135 }, isHome: true });
    route({
      "stats=gameLog&group=hitting&season=2025": () => statResp([g("2025-09-01"), g("2025-09-02")]),
    });
    const card = await buildPlayerCard(100, 1, TODAY);
    expect(urls().some((x) => x.includes("stats=gameLog") && x.includes("season=2025"))).toBe(true);
    expect(card.recent.hitting!.map((r) => r.date)).toEqual(["2025-09-02", "2025-09-01"]);
  });

  it("pitcher with only relief appearances this season falls back to last season starts", async () => {
    const g = (d: string, gs: number) => ({ date: d, stat: { gamesStarted: gs }, opponent: { id: 135 }, isHome: true });
    route({
      "/people/100?": () => person("SP", "Pitcher"),
      "stats=gameLog&group=pitching&season=2026": () => statResp([g("2026-06-01", 0)]),
      "stats=gameLog&group=pitching&season=2025": () => statResp([g("2025-09-01", 1)]),
    });
    const card = await buildPlayerCard(100, 1, TODAY);
    expect(card.recent.pitching!.map((r) => r.date)).toEqual(["2025-09-01"]);
  });

  it("does not fetch last season's log when the current one has games", async () => {
    route({
      "stats=gameLog&group=hitting&season=2026": () =>
        statResp([{ date: "2026-06-01", stat: {}, opponent: { id: 135 }, isHome: true }]),
    });
    await buildPlayerCard(100, 1, TODAY);
    expect(urls().some((x) => x.includes("stats=gameLog") && x.includes("season=2025"))).toBe(false);
  });

  it("degrades per split: failing lastSeason and schedule calls still return a card", async () => {
    route({
      "stats=season&group=hitting&season=2025": () => { throw new Error("404"); },
      "/schedule": () => { throw new Error("500"); },
      "stats=byDateRange": () => { throw new Error("500"); },
      "stats=gameLog": () => { throw new Error("500"); },
    });
    const card = await buildPlayerCard(100, 1, TODAY);
    expect(card.splits.lastSeason.hitting).toBeNull();
    expect(card.splits.last7.hitting).toBeNull();
    expect(card.nextGame).toBeNull();
    expect(card.recent.hitting).toEqual([]);
    expect(card.name).toBe("Test Guy");
  });

  it("route returns 200 when a non-core call fails, 502 only when the player lookup fails", async () => {
    route({ "stats=season&group=hitting&season=2025": () => { throw new Error("404"); } });
    const ok = await supertest(app).get("/players/100/card?leagueId=20");
    expect(ok.status).toBe(200);
    expect(ok.body.splits.lastSeason.hitting).toBeNull();
    route({ "/people/100?": () => { throw new Error("down"); } });
    const bad = await supertest(app).get("/players/100/card?leagueId=20");
    expect(bad.status).toBe(502);
  });

  it("treats a split with no sport as non-MLB unless it is the only split", async () => {
    route({
      "stats=season&group=hitting&season=2026": () =>
        statResp([{ stat: { homeRuns: 99 } }, mlbSplit({ homeRuns: 12 })]),
      "stats=season&group=hitting&season=2025": () => statResp([{ stat: { homeRuns: 7 } }]),
    });
    const card = await buildPlayerCard(100, 1, TODAY);
    expect(card.splits.season.hitting).toEqual({ homeRuns: 12 });
    expect(card.splits.lastSeason.hitting).toEqual({ homeRuns: 7 });
  });

  it("nextGame skips games that already started and picks the first future one", async () => {
    const game = (gameDate: string, home: number, away: number) => ({
      gameDate, teams: { home: { team: { id: home } }, away: { team: { id: away } } },
    });
    route({
      "/schedule": () => ({
        dates: [
          { games: [game("2026-06-11T01:00:00Z", 119, 135)] }, // earlier (yesterday ET evening)
          { games: [game("2026-06-11T14:00:00Z", 119, 135)] }, // earlier today, before 15:00Z
          { games: [game("2026-06-12T23:10:00Z", 135, 119)] }, // future, away for LAD
        ],
      }),
    });
    const card = await buildPlayerCard(100, 1, TODAY);
    expect(card.nextGame).toEqual({ opp: "SD", home: false, startUtc: "2026-06-12T23:10:00Z" });
  });
});
