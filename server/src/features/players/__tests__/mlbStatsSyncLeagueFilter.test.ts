/**
 * NL-only (and AL-only) scoring: stats a player earns while on a team in the
 * OTHER league do not count. This matches OnRoto, which OGBA treats as the
 * standard (commissioner decision 2026-11-11).
 *
 * Found by the 2026 period-by-period audit against the commissioner's OnRoto
 * workbook: Hicks (MIA -> TB), L. García Jr. (WSH -> NYY), Peralta (-> TB),
 * F. Griffin (WSH -> CLE), Ramos (SF -> NYY), E. Miller (-> BOS) and N. Lowe
 * (CIN -> CLE) stayed on OGBA rosters until 08-30 in BOTH systems, but OnRoto
 * scored none of their AL games and FBST scored all of them. That alone moved
 * 7th/8th place.
 *
 * statsapi byDateRange returns one split per MLB team (sport.id 1) plus an
 * aggregate (sport.id 0). The filter keeps only the per-team splits whose team
 * is in the league's own league.
 *
 * Fixtures are trimmed real statsapi responses (team ids are MLB's).
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("../../../db/prisma.js", () => ({ prisma: {} }));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../../lib/mlbApi.js", () => ({ mlbGetJson: vi.fn() }));

import { parsePlayerStats } from "../services/mlbStatsSyncService.js";

/** Liam Hicks, 2026-07-05..08-29: Miami (NL, 146) then Tampa Bay (AL, 139). */
const HICKS_NL_TO_AL = {
  stats: [{
    group: { displayName: "hitting" },
    splits: [
      { team: { id: 146, name: "Miami Marlins" }, sport: { id: 1 },
        stat: { gamesPlayed: 24, atBats: 83, hits: 23, runs: 9, homeRuns: 2, rbi: 11, stolenBases: 0,
                baseOnBalls: 6, hitByPitch: 1, sacFlies: 1, totalBases: 33 } },
      { team: { id: 139, name: "Tampa Bay Rays" }, sport: { id: 1 },
        stat: { gamesPlayed: 21, atBats: 61, hits: 19, runs: 7, homeRuns: 3, rbi: 12, stolenBases: 1,
                baseOnBalls: 4, hitByPitch: 0, sacFlies: 0, totalBases: 31 } },
      { team: null, sport: { id: 0, code: "All" },
        stat: { gamesPlayed: 45, atBats: 144, hits: 42, runs: 16, homeRuns: 5, rbi: 23, stolenBases: 1,
                baseOnBalls: 10, hitByPitch: 1, sacFlies: 1, totalBases: 64 } },
    ],
  }],
};

/** Luis García Jr., 2026-08-02..08-29: the whole window with the Yankees (AL, 147). */
const GARCIA_ALL_AL = {
  stats: [{
    group: { displayName: "hitting" },
    splits: [
      { team: { id: 147, name: "New York Yankees" }, sport: { id: 1 },
        stat: { gamesPlayed: 22, atBats: 80, hits: 25, runs: 10, homeRuns: 5, rbi: 12, stolenBases: 1 } },
      { team: { id: 147, name: "New York Yankees" }, sport: { id: 0, code: "All" },
        stat: { gamesPlayed: 22, atBats: 80, hits: 25, runs: 10, homeRuns: 5, rbi: 12, stolenBases: 1 } },
    ],
  }],
};

/** Ronald Acuña Jr.: one NL team. Two splits, both tagged — must not double-count. */
const ACUNA_SINGLE_NL = {
  stats: [{
    group: { displayName: "hitting" },
    splits: [
      { team: { id: 144, name: "Atlanta Braves" }, sport: { id: 1 },
        stat: { gamesPlayed: 6, atBats: 22, hits: 3, runs: 5, homeRuns: 2, rbi: 2, stolenBases: 0, obp: ".280" } },
      { team: { id: 144, name: "Atlanta Braves" }, sport: { id: 0, code: "All" },
        stat: { gamesPlayed: 6, atBats: 22, hits: 3, runs: 5, homeRuns: 2, rbi: 2, stolenBases: 0, obp: ".280" } },
    ],
  }],
};

/** A pitcher with three teams in one window: two NL (SD 135, PIT 134) and one AL (CLE 114). */
const PITCHER_THREE_TEAMS = {
  stats: [{
    group: { displayName: "pitching" },
    splits: [
      { team: { id: 135, name: "San Diego Padres" }, sport: { id: 1 },
        stat: { gamesPlayed: 2, wins: 1, saves: 0, strikeOuts: 9, inningsPitched: "5.1", earnedRuns: 2,
                baseOnBalls: 2, hits: 4, losses: 0, gamesStarted: 1, battersFaced: 22 } },
      { team: { id: 134, name: "Pittsburgh Pirates" }, sport: { id: 1 },
        stat: { gamesPlayed: 3, wins: 0, saves: 1, strikeOuts: 7, inningsPitched: "6.2", earnedRuns: 3,
                baseOnBalls: 1, hits: 6, losses: 1, gamesStarted: 0, battersFaced: 29 } },
      { team: { id: 114, name: "Cleveland Guardians" }, sport: { id: 1 },
        stat: { gamesPlayed: 5, wins: 3, saves: 0, strikeOuts: 23, inningsPitched: "28.0", earnedRuns: 11,
                baseOnBalls: 8, hits: 25, losses: 1, gamesStarted: 5, battersFaced: 120 } },
      { team: null, sport: { id: 0, code: "All" },
        stat: { gamesPlayed: 10, wins: 4, saves: 1, strikeOuts: 39, inningsPitched: "40.0", earnedRuns: 16,
                baseOnBalls: 11, hits: 35, losses: 2, gamesStarted: 6, battersFaced: 171 } },
    ],
  }],
};

describe("parsePlayerStats — league filter (NL-only / AL-only scoring)", () => {
  it("NL league: a player traded NL -> AL keeps only his NL line", () => {
    const got = parsePlayerStats(HICKS_NL_TO_AL, "NL");
    expect(got).toMatchObject({ AB: 83, H: 23, R: 9, HR: 2, RBI: 11, SB: 0, G: 24 });
  });

  it("no filter (MIXED league): the aggregate is unchanged", () => {
    const got = parsePlayerStats(HICKS_NL_TO_AL);
    expect(got).toMatchObject({ AB: 144, H: 42, R: 16, HR: 5, RBI: 23, SB: 1 });
  });

  it("AL league: the same player keeps only his AL line", () => {
    const got = parsePlayerStats(HICKS_NL_TO_AL, "AL");
    expect(got).toMatchObject({ AB: 61, H: 19, R: 7, HR: 3, RBI: 12, SB: 1, G: 21 });
  });

  it("NL league: a window spent entirely on an AL team scores zero", () => {
    const got = parsePlayerStats(GARCIA_ALL_AL, "NL");
    expect(got).toMatchObject({ AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, G: 0 });
  });

  it("NL league: a single-team NL player is not double-counted", () => {
    const got = parsePlayerStats(ACUNA_SINGLE_NL, "NL");
    expect(got).toMatchObject({ AB: 22, H: 3, R: 5, HR: 2, RBI: 2, OBP: 0.28 });
  });

  it("NL league: two NL teams are summed, the AL team is dropped (innings add in thirds)", () => {
    const got = parsePlayerStats(PITCHER_THREE_TEAMS, "NL");
    expect(got.W).toBe(1);
    expect(got.SV).toBe(1);
    expect(got.K).toBe(16);
    expect(got.ER).toBe(5);
    expect(got.BB_H).toBe(2 + 4 + 1 + 6);
    expect(got.L).toBe(1);
    expect(got.G).toBe(5);
    expect(got.IP).toBeCloseTo(12, 5); // 5.1 + 6.2 = 5⅓ + 6⅔ = 12.0
  });

  it("NL league: combined hitting lines recompute OBP/SLG from the summed components", () => {
    const twoNl = {
      stats: [{
        group: { displayName: "hitting" },
        splits: [
          { team: { id: 120 }, sport: { id: 1 },
            stat: { gamesPlayed: 1, atBats: 4, hits: 2, baseOnBalls: 0, hitByPitch: 0, sacFlies: 0, totalBases: 3 } },
          { team: { id: 121 }, sport: { id: 1 },
            stat: { gamesPlayed: 1, atBats: 4, hits: 0, baseOnBalls: 2, hitByPitch: 0, sacFlies: 0, totalBases: 0 } },
          { team: { id: 147 }, sport: { id: 1 },
            stat: { gamesPlayed: 1, atBats: 4, hits: 4, baseOnBalls: 0, hitByPitch: 0, sacFlies: 0, totalBases: 10 } },
          { sport: { id: 0 }, stat: { gamesPlayed: 3, atBats: 12, hits: 6 } },
        ],
      }],
    };
    const got = parsePlayerStats(twoNl, "NL");
    expect(got).toMatchObject({ AB: 8, H: 2, BB: 2, TB: 3 });
    expect(got.OBP).toBeCloseTo(4 / 10, 5);
    expect(got.SLG).toBeCloseTo(3 / 8, 5);
  });
});
