import { describe, expect, it, vi } from "vitest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: { league: { findUnique: vi.fn() }, historicalTeam: { findMany: vi.fn() } },
}));
vi.mock("../../../lib/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { prisma } from "../../../db/prisma.js";
import { buildTrophyCase, computeTrophyCase, rankSeason, type SeasonResult } from "../services/trophyCaseService.js";

const db = prisma as unknown as { league: { findUnique: ReturnType<typeof vi.fn> }; historicalTeam: { findMany: ReturnType<typeof vi.fn> } };

// Recorded totals from the archive (prod, 2026-11-22), trimmed to four franchises.
const R = (year: number, code: string, name: string, total: number, owner: string | null = null): SeasonResult => ({ year, code, name, owner, total });
const results: SeasonResult[] = [
  R(2004, "DMK", "Diamond Kings", 361), R(2004, "LDY", "VIP BALCOS", 326.5), R(2004, "DDG", "Crush Brothers Inc.", 263), R(2004, "MNB", "MoneyBall", 329.5),
  R(2005, "DMK", "Kent Diamond Kings", 352), R(2005, "LDY", "VIP BALCOS", 307.5), R(2005, "DDG", "Disco Rover", 304), R(2005, "MNB", "MoneyBall", 349.5),
  R(2025, "DMK", "Diamond Kings", 261), R(2025, "LDY", "Los Doyers", 320), R(2025, "DDG", "Dodger Dawgs", 399),
];

describe("one franchise is one team, across every year and name", () => {
  const tc = buildTrophyCase(results);

  it("groups by franchise code, not by the name used that year", () => {
    expect(tc.allTimeStandings.map((r) => r.teamCode).sort()).toEqual(["DDG", "DMK", "LDY", "MNB"]);
    expect(tc.allTimeStandings.filter((r) => r.teamName.includes("Diamond Kings"))).toHaveLength(1);
  });

  it("shows each franchise by the name it used most recently", () => {
    const names = Object.fromEntries(tc.allTimeStandings.map((r) => [r.teamCode, r.teamName]));
    expect(names).toEqual({ DMK: "Diamond Kings", LDY: "Los Doyers", DDG: "Dodger Dawgs", MNB: "MoneyBall" });
  });

  it("but names a champion as the team was called that year", () => {
    expect(tc.championships).toEqual([
      { year: 2004, teamCode: "DMK", teamName: "Diamond Kings", owner: null },
      { year: 2005, teamCode: "DMK", teamName: "Kent Diamond Kings", owner: null },
      { year: 2025, teamCode: "DDG", teamName: "Dodger Dawgs", owner: null },
    ]);
    expect(tc.records.mostChampionships).toEqual({ teamCode: "DMK", teamName: "Diamond Kings", owners: ["Diamond Kings"], count: 2 });
  });

  it("adds up totals and averages finishes per franchise", () => {
    const dmk = tc.allTimeStandings.find((r) => r.teamCode === "DMK")!;
    expect(dmk).toEqual({ key: "DMK", owner: null, teamCode: "DMK", teamName: "Diamond Kings", totalPoints: 974, seasons: 3, avgRank: 1.67, avgScore: 324.7, championships: 2 });
    // DDG: 4th of 4, 4th of 4, 1st of 3
    expect(tc.allTimeStandings.find((r) => r.teamCode === "DDG")!.avgRank).toBe(3);
  });

  it("scores dynasties with titles, podiums and finishes", () => {
    const dmk = tc.dynastyScores.find((r) => r.teamCode === "DMK")!;
    // 2004 1st of 4: 100 + 4*5 + 5; 2005 1st of 4: same; 2025 3rd of 3: 40 + 1*5 + 5
    expect(dmk.score).toBe(125 + 125 + 50);
    expect(tc.dynastyScores[0].teamCode).toBe("DMK");
  });
});

describe("credited to owners", () => {
  // Kurt's franchise across three names; James's across three; one season with no owner on record.
  const owned: SeasonResult[] = [
    R(2004, "DDG", "Crush Brothers Inc.", 263, "Kurt Sakamoto"), R(2004, "LDY", "VIP BALCOS", 326.5, "James Chang"), R(2004, "DMK", "Diamond Kings", 361, "Kent Sakamoto"),
    R(2005, "DDG", "Disco Rover", 304, "Kurt Sakamoto"), R(2005, "LDY", "VIP BALCOS", 307.5, "James Chang"), R(2005, "DMK", "Diamond Kings", 352, "Kent Sakamoto"),
    R(2008, "LDY", "The Fluffers", 276, "James Chang"), R(2008, "DDG", "Dodger Dawgs", 350.5, "Kurt Sakamoto"), R(2008, "DMK", "Diamond Kings", 277.5, null),
  ];
  const tc = buildTrophyCase(owned);

  it("puts each owner on one row, with the team he ran most recently", () => {
    const rows = tc.allTimeStandings.map((r) => [r.key, r.owner, r.teamName, r.seasons]);
    expect(rows).toContainEqual(["Kurt Sakamoto", "Kurt Sakamoto", "Dodger Dawgs", 3]);
    expect(rows).toContainEqual(["James Chang", "James Chang", "The Fluffers", 3]);
  });

  it("falls back to the franchise code for a season with no owner on record", () => {
    expect(tc.allTimeStandings.find((r) => r.key === "DMK")).toMatchObject({ owner: null, teamName: "Diamond Kings", seasons: 1 });
    expect(tc.allTimeStandings.find((r) => r.key === "Kent Sakamoto")).toMatchObject({ owner: "Kent Sakamoto", seasons: 2 });
  });

  it("names the owner on a championship and on records", () => {
    expect(tc.championships[0]).toEqual({ year: 2004, teamCode: "DMK", teamName: "Diamond Kings", owner: "Kent Sakamoto" });
    expect(tc.records.mostChampionships).toEqual({ teamCode: "DMK", teamName: "Diamond Kings", owners: ["Kent Sakamoto"], count: 2 });
    expect(tc.records.bestSeason!.owner).toBe("Kent Sakamoto");
  });

  it("joins one owner's two franchises into one row", () => {
    const two = buildTrophyCase([R(2010, "AAA", "First Team", 300, "Pat Lee"), R(2010, "BBB", "Other", 200, "Sam Cho"), R(2011, "CCC", "Second Team", 300, "Pat Lee"), R(2011, "BBB", "Other", 200, "Sam Cho")]);
    expect(two.allTimeStandings[0]).toMatchObject({ key: "Pat Lee", seasons: 2, championships: 2, teamCode: "CCC", teamName: "Second Team" });
  });
});

describe("most championships", () => {
  it("names every franchise in a tie", () => {
    const tc = buildTrophyCase([R(2009, "SKD", "Skunk Dogs", 368.5), R(2009, "DMK", "Diamond Kings", 284.5), R(2011, "DMK", "Diamond Kings", 363.5), R(2011, "SKD", "Skunk Dogs", 321)]);
    expect(tc.records.mostChampionships).toEqual({ teamCode: "DMK, SKD", teamName: "Diamond Kings & Skunk Dogs", owners: ["Diamond Kings", "Skunk Dogs"], count: 1 });
  });
});

describe("the all-time leaderboard", () => {
  it("is ordered by average finish, not by points", () => {
    // MNB: 2nd and 2nd in two seasons (avg 2.0) beats LDY's 3 seasons (3, 3, 2 → 2.67)
    // even though LDY scored more points in total.
    const tc = buildTrophyCase(results);
    expect(tc.allTimeStandings.map((r) => [r.teamCode, r.avgRank])).toEqual([["DMK", 1.67], ["MNB", 2], ["LDY", 2.67], ["DDG", 3]]);
    const ldy = tc.allTimeStandings.find((r) => r.teamCode === "LDY")!;
    const mnb = tc.allTimeStandings.find((r) => r.teamCode === "MNB")!;
    expect(ldy.totalPoints).toBeGreaterThan(mnb.totalPoints);
  });

  it("breaks an exact tie on average finish by titles", () => {
    // 2010: A 1st, B 2nd, C 3rd. 2011: C 1st, B 2nd, A 3rd.
    // A and C average 2.0 with a title each; B averages 2.0 with none.
    const tc = buildTrophyCase([
      R(2010, "AAA", "A", 300), R(2010, "BBB", "B", 250), R(2010, "CCC", "C", 200),
      R(2011, "CCC", "C", 300), R(2011, "BBB", "B", 250), R(2011, "AAA", "A", 200),
    ]);
    expect(tc.allTimeStandings.map((r) => r.avgRank)).toEqual([2, 2, 2]);
    expect(tc.allTimeStandings[2].teamCode).toBe("BBB");
  });
});

describe("rankSeason", () => {
  it("gives tied totals the same place (2023: Dodger Dawgs and Los Doyers both 289)", () => {
    const ranked = rankSeason([R(2023, "DMK", "x", 316), R(2023, "DDG", "x", 289), R(2023, "LDY", "x", 289), R(2023, "DVD", "x", 291)]);
    expect(ranked.map((r) => [r.code, r.rank])).toEqual([["DMK", 1], ["DVD", 2], ["DDG", 3], ["LDY", 3]]);
  });
});

describe("best and worst season", () => {
  it("only full seasons compete: 2020 (60 games, 4 periods) and 2003 (6 periods) are left out", () => {
    const tc = buildTrophyCase([...results, R(2020, "LDY", "Los Doyers", 111.5), R(2020, "DMK", "Diamond Kings", 253), R(2003, "DDG", "Crush Brothers Inc.", 179.5)]);
    expect(tc.records.worstSeason).toEqual({ year: 2025, teamCode: "DMK", teamName: "Diamond Kings", owner: null, totalScore: 261 });
    expect(tc.records.bestSeason).toEqual({ year: 2025, teamCode: "DDG", teamName: "Dodger Dawgs", owner: null, totalScore: 399 });
    // ...but 2020 still counts as a championship.
    expect(tc.championships.some((c) => c.year === 2020 && c.teamCode === "DMK")).toBe(true);
  });
});

it("is empty with no seasons", () => {
  expect(buildTrophyCase([])).toEqual({
    championships: [], allTimeStandings: [], dynastyScores: [],
    records: { bestSeason: null, worstSeason: null, mostChampionships: null, bestCategoryBySeason: {} },
  });
});

describe("computeTrophyCase", () => {
  it("reads the archive of the league's franchise, so the current league (20) finds seasons stored under 2025's (1)", async () => {
    db.league.findUnique.mockResolvedValue({ franchiseId: 1 });
    db.historicalTeam.findMany.mockResolvedValue([{ code: "DMK", name: "Diamond Kings", ownerName: "Kent Sakamoto", recordedTotal: 361, season: { year: 2004 } }]);
    const tc = await computeTrophyCase(20);
    expect(db.league.findUnique).toHaveBeenCalledWith({ where: { id: 20 }, select: { franchiseId: true } });
    expect(db.historicalTeam.findMany.mock.calls[0][0].where).toEqual({ recordedTotal: { not: null }, season: { league: { franchiseId: 1 } } });
    expect(tc.championships).toEqual([{ year: 2004, teamCode: "DMK", teamName: "Diamond Kings", owner: "Kent Sakamoto" }]);
    expect(db.historicalTeam.findMany.mock.calls[0][0].select).toMatchObject({ ownerName: true });
  });

  it("is empty for an unknown league", async () => {
    db.league.findUnique.mockResolvedValue(null);
    expect((await computeTrophyCase(999)).allTimeStandings).toEqual([]);
  });
});
