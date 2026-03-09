import { describe, it, expect, vi } from "vitest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {},
}));

import {
  buildTeamNameMap,
  CATEGORY_CONFIG,
  computeCategoryRows,
  computeStandingsFromStats,
  rankPoints,
} from "../services/standingsService.js";

/**
 * Integration test: exercises the full standings computation pipeline
 * from raw stats through category ranking to final standings.
 *
 * Simulates a 4-team league where each team has different strengths.
 */
describe("standings computation pipeline", () => {
  // A realistic 4-team league scenario
  const teamStats = [
    {
      team: { id: 1, name: "Sluggers", code: "SLG" },
      R: 120, HR: 60, RBI: 110, SB: 5, AVG: 0.280,
      W: 8,  S: 3,  ERA: 4.50, WHIP: 1.40, K: 150,
    },
    {
      team: { id: 2, name: "Speedsters", code: "SPD" },
      R: 90,  HR: 20, RBI: 70,  SB: 40, AVG: 0.300,
      W: 10, S: 5,  ERA: 3.80, WHIP: 1.25, K: 130,
    },
    {
      team: { id: 3, name: "Aces", code: "ACE" },
      R: 80,  HR: 25, RBI: 75,  SB: 10, AVG: 0.260,
      W: 15, S: 12, ERA: 2.80, WHIP: 1.05, K: 220,
    },
    {
      team: { id: 4, name: "Balanced", code: "BAL" },
      R: 100, HR: 35, RBI: 90,  SB: 15, AVG: 0.275,
      W: 12, S: 8,  ERA: 3.50, WHIP: 1.20, K: 180,
    },
  ];

  it("computes category rankings correctly for HR (higher-is-better)", () => {
    const rows = computeCategoryRows(teamStats, "HR", false);
    expect(rows.map((r) => r.teamName)).toEqual([
      "Sluggers",  // 60
      "Balanced",  // 35
      "Aces",      // 25
      "Speedsters", // 20
    ]);
    expect(rows.map((r) => r.points)).toEqual([4, 3, 2, 1]);
  });

  it("computes category rankings correctly for ERA (lower-is-better)", () => {
    const rows = computeCategoryRows(teamStats, "ERA", true);
    expect(rows.map((r) => r.teamName)).toEqual([
      "Aces",       // 2.80
      "Balanced",   // 3.50
      "Speedsters", // 3.80
      "Sluggers",   // 4.50
    ]);
    expect(rows.map((r) => r.points)).toEqual([4, 3, 2, 1]);
  });

  it("computes final standings with correct aggregate points", () => {
    const standings = computeStandingsFromStats(teamStats);

    expect(standings).toHaveLength(4);

    // Verify rankings are 1-4
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3, 4]);

    // Points should be in descending order
    for (let i = 1; i < standings.length; i++) {
      expect(standings[i - 1].points).toBeGreaterThanOrEqual(standings[i].points);
    }

    // Verify total points across all teams equals expected sum
    // Each category distributes 4+3+2+1 = 10 points, 10 categories = 100 total
    const totalPoints = standings.reduce((sum, s) => sum + s.points, 0);
    expect(totalPoints).toBe(100);
  });

  it("produces consistent results across multiple calls", () => {
    const first = computeStandingsFromStats(teamStats);
    const second = computeStandingsFromStats(teamStats);
    expect(first).toEqual(second);
  });

  it("integrates buildTeamNameMap with standings data", () => {
    const seasonStandings = {
      rows: teamStats.map((s) => ({
        teamCode: s.team.name.substring(0, 3).toUpperCase(),
        teamName: s.team.name,
      })),
    };
    const seasonStats = teamStats.map((s) => ({
      ogba_team_code: s.team.name.substring(0, 3).toUpperCase(),
    }));

    const nameMap = buildTeamNameMap(seasonStandings, seasonStats);
    expect(Object.keys(nameMap)).toHaveLength(4);
    expect(nameMap["SLU"]).toBe("Sluggers");
    expect(nameMap["ACE"]).toBe("Aces");
  });

  it("rankPoints handles ties correctly in a multi-team scenario", () => {
    // Two teams tied for HR, affects point distribution
    const teams = [
      { teamCode: "SLU", value: 60 },
      { teamCode: "BAL", value: 60 }, // tied with SLU
      { teamCode: "ACE", value: 25 },
      { teamCode: "SPD", value: 20 },
    ];

    const { pointsByTeam, rankByTeam } = rankPoints(teams, true, 4);

    // SLU and BAL tie for 1st: avg of rank 1 (4 pts) and rank 2 (3 pts) = 3.5
    expect(rankByTeam["SLU"]).toBe(1);
    expect(rankByTeam["BAL"]).toBe(1);
    expect(pointsByTeam["SLU"]).toBe(3.5);
    expect(pointsByTeam["BAL"]).toBe(3.5);

    // ACE is 3rd (2 pts), SPD is 4th (1 pt)
    expect(rankByTeam["ACE"]).toBe(3);
    expect(pointsByTeam["ACE"]).toBe(2);
    expect(rankByTeam["SPD"]).toBe(4);
    expect(pointsByTeam["SPD"]).toBe(1);

    // Total points still sum correctly
    const totalPoints = Object.values(pointsByTeam).reduce((a, b) => a + b, 0);
    expect(totalPoints).toBe(10); // 4+3+2+1
  });

  it("validates category config covers all stat keys used", () => {
    // Config keys map to DB column names (SV → S)
    const KEY_TO_DB: Record<string, string> = { SV: "S" };
    const dbKeys = CATEGORY_CONFIG.map((c) => KEY_TO_DB[c.key] || c.key);
    // Every DB column key should exist as a property in our test data
    for (const key of dbKeys) {
      expect(teamStats[0]).toHaveProperty(key);
    }
  });
});
