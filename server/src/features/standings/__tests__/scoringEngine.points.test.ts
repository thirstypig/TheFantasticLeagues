import { describe, it, expect, vi, beforeEach } from "vitest";

// PointsScoringEngine reads each team's stats dynamically by key (the read is
// not visible to tsc), so a row-shape change can silently score every team 0.
// These tests pin the per-stat weighting against real TeamStatRow rows.

const mockComputeTeamStatsFromDb = vi.fn();

vi.mock("../../../db/prisma.js", () => ({ prisma: {} }));
vi.mock("../services/standingsService.js", () => ({
  computeTeamStatsFromDb: (...args: unknown[]) => mockComputeTeamStatsFromDb(...args),
  computeStandingsFromStats: vi.fn(),
}));

import { PointsScoringEngine } from "../services/scoringEngine.js";

const rows = [
  {
    team: { id: 1, name: "Alpha", code: "ALP" },
    stats: { R: 10, HR: 2, RBI: 8, SB: 1, H: 20, AB: 80, AVG: 0.25, W: 3, S: 2, K: 40, ERA: 3, WHIP: 1.1, ER: 10, IP: 30, BB_H: 33 },
  },
  {
    team: { id: 2, name: "Bravo", code: "BRV" },
    stats: { R: 1, HR: 0, RBI: 1, SB: 0, H: 3, AB: 20, AVG: 0.15, W: 0, S: 0, K: 5, ERA: 6, WHIP: 1.8, ER: 4, IP: 6, BB_H: 11 },
  },
];

beforeEach(() => {
  mockComputeTeamStatsFromDb.mockReset();
  mockComputeTeamStatsFromDb.mockResolvedValue(rows);
});

describe("PointsScoringEngine.computePeriodStandings", () => {
  it("weights each stat by DEFAULT_POINTS_CONFIG, mapping SV to the S field", async () => {
    const standings = await new PointsScoringEngine().computePeriodStandings(20, 41);

    // Alpha: R10*1 + HR2*4 + RBI8*1 + SB1*2 + H20*0.5 + W3*7 + SV(S)2*5 + K40*1 = 109
    // Bravo: 1 + 0 + 1 + 0 + 1.5 + 0 + 0 + 5 = 8.5
    expect(standings).toEqual([
      { teamId: 1, teamName: "Alpha", teamCode: "ALP", points: 109, rank: 1 },
      { teamId: 2, teamName: "Bravo", teamCode: "BRV", points: 8.5, rank: 2 },
    ]);
    expect(mockComputeTeamStatsFromDb).toHaveBeenCalledWith(20, 41);
  });

  it("treats a stat missing from the row as 0", async () => {
    const standings = await new PointsScoringEngine({ R: 1, TD: 6 }).computePeriodStandings(20, 41);
    expect(standings.map((s) => s.points)).toEqual([10, 1]);
  });
});
