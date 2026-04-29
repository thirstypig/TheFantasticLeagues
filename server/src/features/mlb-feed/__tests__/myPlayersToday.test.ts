/**
 * Tests for `GET /api/mlb/my-players-today` — Gap 1 boxscore stat lines.
 *
 * What we cover:
 *   - hitter with full line returned correctly
 *   - pitcher with full line returned correctly
 *   - DNP detection: roster player whose game went FINAL with no split
 *     entry — `line` undefined, gameStatus === "FINAL"
 *   - PRE-game state: schedule says game hasn't started — `line` undefined
 *     and we don't even hit the gameLog API
 *   - one player's lookup throws → `Promise.allSettled` keeps the others
 *   - cache hit doesn't refetch
 *   - live vs final TTL difference (validated via cacheSet calls)
 *
 * Mocking strategy:
 *   - We mock `mlbGetJson` (the HTTP boundary in `lib/mlbApi.ts`) so no
 *     real network calls happen. This mirrors the pattern already used
 *     by `players/__tests__/routes.test.ts`.
 *   - We mock the SQLite cache (`lib/mlbCache.ts`) so cache state is
 *     observable per test.
 *   - Prisma is mocked at the module level for the route's roster lookup.
 *
 * The Will Smith / Shohei Ohtani naming convention from the existing
 * mlb-feed tests is borrowed for fixtures.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks (hoisted) ─────────────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    team: { findFirst: vi.fn() },
    roster: { findMany: vi.fn() },
  },
}));

vi.mock("../../../lib/logger.js", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireLeagueMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));

vi.mock("../../../middleware/validate.js", () => ({
  validateBody: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

// HTTP boundary — mlbGetJson is the single function that talks to MLB.
vi.mock("../../../lib/mlbApi.js", () => ({
  mlbGetJson: vi.fn(),
  fetchMlbTeamsMap: vi.fn().mockResolvedValue({
    119: "LAD",
    137: "SF",
    121: "NYM",
    111: "BOS",
  }),
}));

// SQLite cache — observed by tests for cache-hit + TTL assertions.
vi.mock("../../../lib/mlbCache.js", () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

// Stub mlbGameDayDate so tests are deterministic regardless of the
// machine clock / timezone.
vi.mock("../../../lib/utils.js", async () => {
  const actual = await vi.importActual<any>("../../../lib/utils.js");
  return {
    ...actual,
    mlbGameDayDate: vi.fn(() => "2026-04-28"),
  };
});

// digestRoutes pulls in heavy AI deps (zod, gemini) we don't need for
// these tests; stub it with a no-op router so the parent routes import
// graph stays small.
vi.mock("../digestRoutes.js", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const express = require("express");
  return { digestRouter: express.Router() };
});

import { prisma } from "../../../db/prisma.js";
import { mlbGetJson } from "../../../lib/mlbApi.js";
import { cacheGet, cacheSet } from "../../../lib/mlbCache.js";
import { logger } from "../../../lib/logger.js";

const mockPrisma = prisma as any;
const mockMlbGetJson = mlbGetJson as ReturnType<typeof vi.fn>;
const mockCacheGet = cacheGet as ReturnType<typeof vi.fn>;
const mockCacheSet = cacheSet as ReturnType<typeof vi.fn>;
const mockLogger = logger as any;

// ── Express harness ─────────────────────────────────────────────────────

import express from "express";
import supertest from "supertest";
import { mlbFeedRouter } from "../routes.js";

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 42, isAdmin: false };
  next();
});
app.use(mlbFeedRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error("[test-app] unhandled", err);
  res.status(500).json({ error: "Internal Server Error" });
});

// ── Fixtures ────────────────────────────────────────────────────────────

const TODAY = "2026-04-28";

/** Build a schedule fixture where every supplied team has a game vs an
 *  opponent at the requested abstractGameState. */
function scheduleFixture(games: Array<{
  away: string;
  home: string;
  abstractGameState: "Preview" | "Live" | "Final";
  detailedState?: string;
  inning?: number;
  inningState?: "Top" | "Bottom";
}>) {
  return {
    dates: [
      {
        games: games.map((g, i) => ({
          gamePk: 700000 + i,
          gameDate: `${TODAY}T23:10:00Z`,
          status: {
            abstractGameState: g.abstractGameState,
            detailedState: g.detailedState ?? g.abstractGameState,
          },
          teams: {
            away: { team: { id: 100 + i, abbreviation: g.away } },
            home: { team: { id: 200 + i, abbreviation: g.home } },
          },
          linescore: g.inning
            ? { currentInning: g.inning, inningState: g.inningState ?? "Top" }
            : undefined,
        })),
      },
    ],
  };
}

/** A gameLog payload with one hitting split for `date`. */
function hittingGameLog(date: string, stat: Record<string, number>) {
  return {
    stats: [
      {
        group: { displayName: "hitting" },
        splits: [{ date, stat }],
      },
    ],
  };
}

/** A gameLog payload with one pitching split for `date`. */
function pitchingGameLog(date: string, stat: Record<string, number | string>) {
  return {
    stats: [
      {
        group: { displayName: "pitching" },
        splits: [{ date, stat }],
      },
    ],
  };
}

/** An empty gameLog (no splits today — DNP). */
function emptyGameLog() {
  return {
    stats: [
      { group: { displayName: "hitting" }, splits: [] },
      { group: { displayName: "pitching" }, splits: [] },
    ],
  };
}

const TEAM_ID = 7;

function setupTeamAndRoster(
  rosterPlayers: Array<{ id: number; name: string; mlbId: number; mlbTeam: string; posPrimary: string }>,
) {
  mockPrisma.team.findFirst.mockResolvedValue({ id: TEAM_ID });
  mockPrisma.roster.findMany.mockResolvedValue(
    rosterPlayers.map((p) => ({ player: p })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: cache miss (forces real fetch).
  mockCacheGet.mockReturnValue(null);
});

// ─────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────

describe("GET /my-players-today — boxscore stat lines (Gap 1)", () => {
  it("returns full hitting line for a hitter whose game is FINAL", async () => {
    setupTeamAndRoster([
      { id: 1, name: "Mookie Betts", mlbId: 605141, mlbTeam: "LAD", posPrimary: "OF" },
    ]);

    // First call: schedule. Then per-player gameLog.
    mockMlbGetJson
      .mockResolvedValueOnce(scheduleFixture([{ away: "LAD", home: "SF", abstractGameState: "Final" }]))
      .mockResolvedValueOnce(
        hittingGameLog(TODAY, { atBats: 4, hits: 3, runs: 2, homeRuns: 1, rbi: 4, stolenBases: 1, baseOnBalls: 0, strikeOuts: 1 }),
      );

    const res = await supertest(app).get("/my-players-today?leagueId=1");
    expect(res.status).toBe(200);
    expect(res.body.players).toHaveLength(1);

    const p = res.body.players[0];
    expect(p.playerName).toBe("Mookie Betts");
    expect(p.gameStatus).toBe("FINAL");
    expect(p.line).toEqual({
      hitting: { AB: 4, H: 3, R: 2, HR: 1, RBI: 4, SB: 1, BB: 0, SO: 1 },
    });
    expect(p.line.pitching).toBeUndefined();
  });

  it("returns full pitching line for a pitcher whose game is FINAL", async () => {
    setupTeamAndRoster([
      { id: 2, name: "Walker Buehler", mlbId: 621111, mlbTeam: "LAD", posPrimary: "SP" },
    ]);

    mockMlbGetJson
      .mockResolvedValueOnce(scheduleFixture([{ away: "LAD", home: "SF", abstractGameState: "Final" }]))
      .mockResolvedValueOnce(
        pitchingGameLog(TODAY, {
          inningsPitched: "6.2",
          hits: 4,
          runs: 1,
          earnedRuns: 1,
          baseOnBalls: 2,
          strikeOuts: 9,
          wins: 1,
          losses: 0,
          saves: 0,
          holds: 0,
        }),
      );

    const res = await supertest(app).get("/my-players-today?leagueId=1");
    expect(res.status).toBe(200);

    const p = res.body.players[0];
    expect(p.gameStatus).toBe("FINAL");
    // 6.2 IP from MLB API → we surface as numeric 6.2
    expect(p.line.pitching).toMatchObject({
      IP: 6.2,
      H: 4,
      R: 1,
      ER: 1,
      BB: 2,
      K: 9,
      W: 1,
    });
    // No L/SV/HLD because those were 0 — those flags are only set when truthy.
    expect(p.line.pitching.L).toBeUndefined();
    expect(p.line.pitching.SV).toBeUndefined();
    expect(p.line.pitching.HLD).toBeUndefined();
    expect(p.line.hitting).toBeUndefined();
  });

  it("renders DNP correctly: FINAL game, no splits for today → no `line`", async () => {
    setupTeamAndRoster([
      { id: 3, name: "Pinch Hitter", mlbId: 700001, mlbTeam: "LAD", posPrimary: "OF" },
    ]);

    mockMlbGetJson
      .mockResolvedValueOnce(scheduleFixture([{ away: "LAD", home: "SF", abstractGameState: "Final" }]))
      .mockResolvedValueOnce(emptyGameLog());

    const res = await supertest(app).get("/my-players-today?leagueId=1");
    expect(res.status).toBe(200);

    const p = res.body.players[0];
    expect(p.gameStatus).toBe("FINAL");
    // The client renders the "DNP" chip when gameStatus === "FINAL" and
    // no `line.hitting` is present.
    expect(p.line).toBeUndefined();
  });

  it("does not call the gameLog API for PRE games (schedule says not started)", async () => {
    setupTeamAndRoster([
      { id: 4, name: "Tonight's Starter", mlbId: 700002, mlbTeam: "LAD", posPrimary: "SP" },
    ]);

    mockMlbGetJson.mockResolvedValueOnce(
      scheduleFixture([{ away: "LAD", home: "SF", abstractGameState: "Preview" }]),
    );

    const res = await supertest(app).get("/my-players-today?leagueId=1");
    expect(res.status).toBe(200);

    const p = res.body.players[0];
    expect(p.gameStatus).toBe("PRE");
    expect(p.line).toBeUndefined();
    // Only the schedule fetch should have happened — no per-player call.
    expect(mockMlbGetJson).toHaveBeenCalledTimes(1);
  });

  it("isolates failures via Promise.allSettled — one player throws, others resolve", async () => {
    setupTeamAndRoster([
      { id: 5, name: "Healthy Hitter", mlbId: 605141, mlbTeam: "LAD", posPrimary: "OF" },
      { id: 6, name: "Crash Hitter", mlbId: 700003, mlbTeam: "NYM", posPrimary: "1B" },
    ]);

    mockMlbGetJson
      // schedule (covers both LAD and NYM)
      .mockResolvedValueOnce(
        scheduleFixture([
          { away: "LAD", home: "SF", abstractGameState: "Final" },
          { away: "NYM", home: "BOS", abstractGameState: "Final" },
        ]),
      )
      // first per-player call: succeed
      .mockResolvedValueOnce(
        hittingGameLog(TODAY, { atBats: 4, hits: 2, runs: 1, homeRuns: 0, rbi: 1, stolenBases: 0, baseOnBalls: 1, strikeOuts: 1 }),
      )
      // second per-player call: throw
      .mockRejectedValueOnce(new Error("MLB API 500"));

    const res = await supertest(app).get("/my-players-today?leagueId=1");
    expect(res.status).toBe(200);
    expect(res.body.players).toHaveLength(2);

    const byName = Object.fromEntries(res.body.players.map((p: any) => [p.playerName, p]));
    expect(byName["Healthy Hitter"].line.hitting.H).toBe(2);
    // Failure → no line, but the player entry still exists.
    expect(byName["Crash Hitter"].line).toBeUndefined();
    expect(byName["Crash Hitter"].gameStatus).toBe("FINAL");

    // We logged the per-player failure (warn, not error — the panel
    // degrades gracefully and we don't want to flood the error stream).
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ mlbId: 700003 }),
      expect.stringContaining("gameLog lookup failed"),
    );
  });

  it("uses cached payload when present — no second fetch", async () => {
    setupTeamAndRoster([
      { id: 7, name: "Cached Hitter", mlbId: 605141, mlbTeam: "LAD", posPrimary: "OF" },
    ]);

    // Schedule fetch still happens (it has its own URL, separate cache key).
    mockMlbGetJson.mockResolvedValueOnce(
      scheduleFixture([{ away: "LAD", home: "SF", abstractGameState: "Live" }]),
    );

    // Cache hit on the gameLog URL.
    mockCacheGet.mockImplementation((url: string) => {
      if (url.includes("/people/605141/stats")) {
        return hittingGameLog(TODAY, { atBats: 3, hits: 1, runs: 0, homeRuns: 0, rbi: 0, stolenBases: 0, baseOnBalls: 0, strikeOuts: 1 });
      }
      return null;
    });

    const res = await supertest(app).get("/my-players-today?leagueId=1");
    expect(res.status).toBe(200);

    const p = res.body.players[0];
    expect(p.line.hitting.H).toBe(1);
    // Only one mlbGetJson call should have been made (the schedule fetch).
    expect(mockMlbGetJson).toHaveBeenCalledTimes(1);
    // Cache should NOT have been written for the cache-hit URL — only the
    // schedule path writes cache (mlbGetJson does that internally and our
    // mock doesn't simulate it, so cacheSet must NOT have been called by
    // the gameLog path).
    const gameLogSets = mockCacheSet.mock.calls.filter((c: any[]) =>
      typeof c[0] === "string" && c[0].includes("/people/605141/stats"),
    );
    expect(gameLogSets).toHaveLength(0);
  });

  it("uses 24h TTL for FINAL games and 60s TTL for LIVE games", async () => {
    // Two players: one FINAL, one LIVE. Both miss the cache → service
    // calls cacheSet with state-aware TTLs.
    setupTeamAndRoster([
      { id: 8, name: "Final Guy", mlbId: 800001, mlbTeam: "LAD", posPrimary: "OF" },
      { id: 9, name: "Live Guy", mlbId: 800002, mlbTeam: "NYM", posPrimary: "OF" },
    ]);

    mockMlbGetJson
      .mockResolvedValueOnce(
        scheduleFixture([
          { away: "LAD", home: "SF", abstractGameState: "Final" },
          { away: "NYM", home: "BOS", abstractGameState: "Live", inning: 5, inningState: "Top" },
        ]),
      )
      .mockResolvedValueOnce(
        hittingGameLog(TODAY, { atBats: 4, hits: 1, runs: 0, homeRuns: 0, rbi: 0, stolenBases: 0, baseOnBalls: 0, strikeOuts: 1 }),
      )
      .mockResolvedValueOnce(
        hittingGameLog(TODAY, { atBats: 2, hits: 1, runs: 0, homeRuns: 0, rbi: 0, stolenBases: 0, baseOnBalls: 0, strikeOuts: 0 }),
      );

    await supertest(app).get("/my-players-today?leagueId=1");

    // The service writes its own state-aware TTL via cacheSet.
    const gameLogWrites = mockCacheSet.mock.calls.filter((c: any[]) =>
      typeof c[0] === "string" && c[0].includes("/people/") && c[0].includes("gameLog"),
    );
    expect(gameLogWrites).toHaveLength(2);

    const finalWrite = gameLogWrites.find((c: any[]) => c[0].includes("/people/800001/"));
    const liveWrite = gameLogWrites.find((c: any[]) => c[0].includes("/people/800002/"));

    // 24h for FINAL.
    expect(finalWrite?.[2]).toBe(86400);
    // 60s for LIVE.
    expect(liveWrite?.[2]).toBe(60);
  });

  it("emits LIVE game state with TOP/BOT N descriptor", async () => {
    setupTeamAndRoster([
      { id: 10, name: "Live Hitter", mlbId: 605141, mlbTeam: "NYM", posPrimary: "OF" },
    ]);

    mockMlbGetJson
      .mockResolvedValueOnce(
        scheduleFixture([
          {
            away: "NYM",
            home: "BOS",
            abstractGameState: "Live",
            inning: 7,
            inningState: "Bottom",
          },
        ]),
      )
      .mockResolvedValueOnce(
        hittingGameLog(TODAY, { atBats: 2, hits: 1, runs: 1, homeRuns: 0, rbi: 0, stolenBases: 0, baseOnBalls: 0, strikeOuts: 0 }),
      );

    const res = await supertest(app).get("/my-players-today?leagueId=1");
    const p = res.body.players[0];
    expect(p.gameStatus).toBe("LIVE");
    expect(p.gameStateDesc).toBe("BOT 7");
  });

  it("returns empty players array when user has no team in the league", async () => {
    mockPrisma.team.findFirst.mockResolvedValue(null);
    const res = await supertest(app).get("/my-players-today?leagueId=1");
    expect(res.status).toBe(200);
    expect(res.body.players).toEqual([]);
    // No schedule call — we short-circuited.
    expect(mockMlbGetJson).not.toHaveBeenCalled();
  });

  it("rejects invalid leagueId with 400", async () => {
    const res = await supertest(app).get("/my-players-today?leagueId=notanumber");
    expect(res.status).toBe(400);
  });
});
