/**
 * Regression test for the daily-stats sync `hasStats` filter.
 *
 * The bug: a relief pitcher who comes in, gives up a hit and a run, and gets
 * pulled with 0 outs records `IP=0, ER=1, BB_H=1` and zeros everywhere else.
 * The old filter only checked positive-outcome counters (W/SV/K/IP) plus a
 * subset of batter stats (AB/H/R/HR), so this game was silently dropped.
 *
 * Precedent: Matt Gage 2026-05-19 vs ARI, surfaced by the 2026-06-02
 * FanGraphs Period 3 audit (todo #239).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    roster: { findMany: vi.fn() },
    player: { findFirst: vi.fn() },
    playerStatsDaily: { upsert: vi.fn(), findUnique: vi.fn() },
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../../lib/mlbApi.js", () => ({
  mlbGetJson: vi.fn(),
}));

import { prisma } from "../../../db/prisma.js";
import { mlbGetJson } from "../../../lib/mlbApi.js";
import { syncDailyStats } from "../services/mlbStatsSyncService.js";

const mockPrisma = prisma as any;
const mockMlbGetJson = mlbGetJson as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("syncDailyStats — hasStats filter", () => {
  // Single rostered player with a known mlbId; the syncDailyStats function
  // builds an mlbId → playerId map and calls mlbGetJson for stats.
  function setupOnePlayer(mlbId = 657424, playerId = 99001) {
    // First call: top of syncDailyStats builds the mlbId→playerId map.
    // Second call: mirrorTwoWayDailyPitcherStats hunts for synthetic
    // two-way pitcher rows (mlbId >= 1_000_000). Return [] so the mirror
    // loop is a no-op for our single normal player.
    mockPrisma.roster.findMany
      .mockResolvedValueOnce([{ player: { id: playerId, mlbId } }])
      .mockResolvedValueOnce([]);
    // Defensive: mirror loop never reaches these in this test, but unused
    // mocks are free and prevent flaky failures from refactors.
    mockPrisma.player.findFirst.mockResolvedValue(null);
    mockPrisma.playerStatsDaily.findUnique.mockResolvedValue(null);
    return { mlbId, playerId };
  }

  it("upserts a blown pitcher appearance (0 IP, 1 ER, 1 H allowed)", async () => {
    const { mlbId, playerId } = setupOnePlayer();
    // MLB API response shape: one person with a `pitching` stats split where
    // IP/W/SV/K are 0 but ER and the (BB+H) total are non-zero.
    mockMlbGetJson.mockResolvedValue({
      people: [
        {
          id: mlbId,
          stats: [
            {
              group: { displayName: "pitching" },
              splits: [
                {
                  stat: {
                    wins: 0, saves: 0, strikeOuts: 0,
                    inningsPitched: "0.0",
                    earnedRuns: 1,
                    baseOnBalls: 0,
                    hits: 1,
                    losses: 0,
                    gamesStarted: 0,
                    homeRuns: 0,
                    battersFaced: 1,
                    shutouts: 0,
                    gamesPlayed: 1,
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    const result = await syncDailyStats("2026-05-19");

    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(0);
    expect(mockPrisma.playerStatsDaily.upsert).toHaveBeenCalledTimes(1);
    const callArg = mockPrisma.playerStatsDaily.upsert.mock.calls[0][0];
    expect(callArg.where.playerId_gameDate.playerId).toBe(playerId);
    expect(callArg.create.ER).toBe(1);
    expect(callArg.create.BB_H).toBe(1);
    expect(callArg.create.IP).toBe(0);
  });

  it("still skips truly empty stat lines (off-day)", async () => {
    setupOnePlayer();
    mockMlbGetJson.mockResolvedValue({
      people: [
        {
          id: 657424,
          stats: [
            {
              group: { displayName: "pitching" },
              splits: [
                {
                  stat: {
                    wins: 0, saves: 0, strikeOuts: 0,
                    inningsPitched: "0.0",
                    earnedRuns: 0,
                    baseOnBalls: 0,
                    hits: 0,
                    losses: 0,
                    gamesStarted: 0,
                    homeRuns: 0,
                    battersFaced: 0,
                    shutouts: 0,
                    gamesPlayed: 0,
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    const result = await syncDailyStats("2026-05-20");

    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockPrisma.playerStatsDaily.upsert).not.toHaveBeenCalled();
  });

  it("upserts a 0-AB pinch runner with a stolen base", async () => {
    setupOnePlayer();
    mockMlbGetJson.mockResolvedValue({
      people: [
        {
          id: 657424,
          stats: [
            {
              group: { displayName: "hitting" },
              splits: [
                {
                  stat: {
                    atBats: 0,
                    hits: 0,
                    runs: 1,
                    homeRuns: 0,
                    rbi: 0,
                    stolenBases: 1,
                    baseOnBalls: 0,
                    hitByPitch: 0,
                    sacFlies: 0,
                    totalBases: 0,
                    doubles: 0,
                    triples: 0,
                    strikeOuts: 0,
                    obp: "0",
                    slg: "0",
                    ops: "0",
                    grandSlams: 0,
                    gamesPlayed: 1,
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    const result = await syncDailyStats("2026-05-21");

    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(0);
    const callArg = mockPrisma.playerStatsDaily.upsert.mock.calls[0][0];
    // R is in the old filter so this previously would have been kept; assert
    // the new filter doesn't break the existing behavior.
    expect(callArg.create.R).toBe(1);
    expect(callArg.create.SB).toBe(1);
  });
});
