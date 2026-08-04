/**
 * Regression test: a player traded between MLB teams mid-period had his stats
 * silently zeroed.
 *
 * MLB's byDateRange endpoint returns ONE SPLIT PER TEAM plus an aggregate row.
 * The aggregate is identified by `sport.id === 0` (`code: "All"`), not by
 * position in the array and not by the absence of a `team` key.
 *
 * `parsePlayerStats` took `splits[0]`, which for a traded player is his FIRST
 * team's partial line. Curtis Mead (mlbId 678554) was traded Boston -> Washington
 * during Period 5 (2026-07-05..08-01). His first split was Boston: 1 game, all
 * zeros. FBST therefore recorded his entire Period 5 as zero while he actually
 * produced R=11 HR=3 RBI=9 SB=2 over 15 games.
 *
 * That undercount was the whole of Demolition Lumber Co.'s season divergence from
 * FanGraphs (-11 R, -3 HR, -9 RBI, -2 SB), found by the 2026-08-03 standings audit.
 *
 * The reconciler could not catch it: reconcilePeriodStats shares this same parse
 * path with the syncer by design (ADR-014), so it re-read splits[0], got the same
 * zeros, and reported "0 mismatches".
 *
 * Fixtures below are the real statsapi responses, trimmed to the relevant fields.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("../../../db/prisma.js", () => ({ prisma: {} }));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../../lib/mlbApi.js", () => ({ mlbGetJson: vi.fn() }));

import { parsePlayerStats } from "../services/mlbStatsSyncService.js";

/** Curtis Mead, byDateRange 07/05/2026-08/01/2026 — traded Boston -> Washington. */
const TRADED_MID_PERIOD = {
  stats: [
    {
      group: { displayName: "hitting" },
      splits: [
        {
          team: { id: 111, name: "Boston Red Sox" },
          sport: { id: 1, abbreviation: "MLB" },
          numTeams: 1,
          stat: { gamesPlayed: 1, atBats: 3, hits: 0, runs: 0, homeRuns: 0, rbi: 0, stolenBases: 0 },
        },
        {
          team: { id: 120, name: "Washington Nationals" },
          sport: { id: 1, abbreviation: "MLB" },
          numTeams: 1,
          stat: { gamesPlayed: 14, atBats: 50, hits: 14, runs: 11, homeRuns: 3, rbi: 9, stolenBases: 2 },
        },
        {
          sport: { id: 0, code: "All" },
          numTeams: 2,
          stat: { gamesPlayed: 15, atBats: 53, hits: 14, runs: 11, homeRuns: 3, rbi: 9, stolenBases: 2 },
        },
      ],
    },
  ],
};

/**
 * Ronald Acuña Jr., same window, NOT traded. Note there are still TWO splits and
 * BOTH carry a team — the aggregate is only distinguishable by sport.id === 0.
 * This is why "use the split without a team key" and "sum the splits" are both
 * wrong: summing here would double-count.
 */
const SINGLE_TEAM = {
  stats: [
    {
      group: { displayName: "hitting" },
      splits: [
        {
          team: { id: 144, name: "Atlanta Braves" },
          sport: { id: 1, abbreviation: "MLB" },
          numTeams: 1,
          stat: { gamesPlayed: 6, atBats: 22, hits: 3, runs: 5, homeRuns: 2, rbi: 2, stolenBases: 0 },
        },
        {
          team: { id: 144, name: "Atlanta Braves" },
          sport: { id: 0, code: "All" },
          numTeams: 1,
          stat: { gamesPlayed: 6, atBats: 22, hits: 3, runs: 5, homeRuns: 2, rbi: 2, stolenBases: 0 },
        },
      ],
    },
  ],
};

/** A player with no games in the window — statsapi returns an empty splits array. */
const NO_GAMES = { stats: [{ group: { displayName: "hitting" }, splits: [] }] };

/** Defensive: some responses carry only the per-team split, with no aggregate. */
const NO_AGGREGATE = {
  stats: [
    {
      group: { displayName: "hitting" },
      splits: [
        {
          team: { id: 144, name: "Atlanta Braves" },
          sport: { id: 1, abbreviation: "MLB" },
          stat: { gamesPlayed: 4, atBats: 15, hits: 5, runs: 3, homeRuns: 1, rbi: 4, stolenBases: 1 },
        },
      ],
    },
  ],
};

describe("parsePlayerStats — multi-team splits", () => {
  it("uses the aggregate row for a player traded mid-period, not his first team", () => {
    // Before the fix this returned Boston's line: R=0 HR=0 RBI=0 SB=0 — an
    // entire period of production silently lost.
    const got = parsePlayerStats(TRADED_MID_PERIOD);
    expect(got.R).toBe(11);
    expect(got.HR).toBe(3);
    expect(got.RBI).toBe(9);
    expect(got.SB).toBe(2);
    expect(got.AB).toBe(53);
    expect(got.H).toBe(14);
  });

  it("does not double-count a single-team player whose response still has two splits", () => {
    // Summing the splits would report R=10 for a player who scored 5.
    const got = parsePlayerStats(SINGLE_TEAM);
    expect(got.R).toBe(5);
    expect(got.HR).toBe(2);
    expect(got.AB).toBe(22);
  });

  it("falls back to the only split when no aggregate row is present", () => {
    const got = parsePlayerStats(NO_AGGREGATE);
    expect(got.R).toBe(3);
    expect(got.HR).toBe(1);
    expect(got.AB).toBe(15);
  });

  it("returns zeros for a player with no games in the window", () => {
    const got = parsePlayerStats(NO_GAMES);
    expect(got.R).toBe(0);
    expect(got.AB).toBe(0);
  });
});
