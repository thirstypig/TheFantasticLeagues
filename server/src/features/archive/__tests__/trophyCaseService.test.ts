import { describe, expect, it, vi } from "vitest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    league: { findUnique: vi.fn() }, historicalTeam: { findMany: vi.fn() },
    historicalRosterEntry: { findMany: vi.fn() }, historicalPlayerMatch: { findMany: vi.fn() },
  },
}));
vi.mock("../../../lib/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { prisma } from "../../../db/prisma.js";
import { buildTrophyCase, computeTrophyCase, favoriteKeepers, ownerLineages, rankSeason, teamRuns, type KeeperRow, type SeasonResult } from "../services/trophyCaseService.js";

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as { league: { findUnique: Fn }; historicalTeam: { findMany: Fn }; historicalRosterEntry: { findMany: Fn }; historicalPlayerMatch: { findMany: Fn } };

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
    expect(dmk).toEqual({ key: "DMK", owner: null, teamCode: "DMK", teamName: "Diamond Kings", teamNames: ["Diamond Kings", "Kent Diamond Kings"], totalPoints: 974, seasons: 3, avgRank: 1.67, avgScore: 324.7, championships: 2 });
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

  it("lists every team name an owner used, most recent first", () => {
    expect(tc.allTimeStandings.find((r) => r.key === "James Chang")!.teamNames).toEqual(["The Fluffers", "VIP BALCOS"]);
    expect(tc.allTimeStandings.find((r) => r.key === "Kurt Sakamoto")!.teamNames).toEqual(["Dodger Dawgs", "Disco Rover", "Crush Brothers Inc."]);
    expect(tc.dynastyScores.find((r) => r.key === "Kurt Sakamoto")!.teamNames).toEqual(["Dodger Dawgs", "Disco Rover", "Crush Brothers Inc."]);
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

describe("owner profiles", () => {
  const K = (year: number, owner: string, playerName: string, over: Partial<KeeperRow> = {}): KeeperRow =>
    ({ year, code: "DDG", owner, playerName, slot: "C", fromSheet: true, mlbId: null, mlbName: null, ...over });

  it("ranks favorite keepers by seasons kept, needing at least two", () => {
    const fav = favoriteKeepers([
      K(2012, "Kurt", "B. Posey", { mlbId: 457763, mlbName: "Buster Posey" }), K(2013, "Kurt", "B. Posey", { mlbId: 457763, mlbName: "Buster Posey" }), K(2014, "Kurt", "B. Posey", { mlbId: 457763, mlbName: "Buster Posey", fromSheet: false }),
      K(2009, "Kurt", "P. Sandoval"), K(2010, "Kurt", "P. Sandoval"),
      K(2011, "Kurt", "J. Once"),
    ]);
    expect(fav).toEqual([
      { name: "Buster Posey", mlbId: 457763, seasons: [2012, 2013, 2014], possible: true },
      { name: "P. Sandoval", mlbId: null, seasons: [2009, 2010], possible: false },
    ]);
  });

  it("lists team names as runs, most recent first", () => {
    expect(teamRuns([R(2003, "DDG", "Crush Brothers Inc.", 1), R(2004, "DDG", "Crush Brothers Inc.", 1), R(2005, "DDG", "Disco Rover", 1), R(2006, "DDG", "Dodger Dawgs", 1), R(2025, "DDG", "Dodger Dawgs", 1)]))
      .toEqual([{ name: "Dodger Dawgs", from: 2006, to: 2025 }, { name: "Disco Rover", from: 2005, to: 2005 }, { name: "Crush Brothers Inc.", from: 2003, to: 2004 }]);
  });

  it("gives every owner a profile with teams, title years and keepers", () => {
    const tc = buildTrophyCase(
      [R(2004, "LDY", "VIP BALCOS", 300, "James Chang"), R(2004, "DDG", "Crush Brothers Inc.", 250, "Kurt Sakamoto"), R(2016, "LDY", "Los Doyers", 200, "James Chang"), R(2016, "DDG", "Dodger Dawgs", 260, "Kurt Sakamoto")],
      [K(2016, "James Chang", "C. Kershaw", { code: "LDY" }), K(2017, "James Chang", "C. Kershaw", { code: "LDY" })],
    );
    expect(tc.profiles["James Chang"]).toEqual({
      key: "James Chang", owner: "James Chang",
      // The same owner on both sides of a gap is one run.
      owners: [{ name: "James Chang", from: 2004, to: 2016 }],
      teams: [{ name: "Los Doyers", from: 2016, to: 2016 }, { name: "VIP BALCOS", from: 2004, to: 2004 }],
      titleYears: [2004],
      favoriteKeepers: [{ name: "C. Kershaw", mlbId: null, seasons: [2016, 2017], possible: false }],
    });
    expect(tc.profiles["Kurt Sakamoto"].titleYears).toEqual([2016]);
    expect(tc.keeperSeasons).toEqual([2016, 2017]);
  });
});

describe("owner lineages (James, 2026-11-23)", () => {
  // Skunk Dogs: Tim Yuba with Jerrod Jue in 2004, Tim alone after. The Show: Spencer Chao in 2017, then the Chans.
  const seasons: SeasonResult[] = [
    R(2004, "SKD", "Skunk Dogs", 330.5, "Tim Yuba & Jerrod Jue"), R(2005, "SKD", "Skunk Dogs", 343.5, "Tim Yuba"), R(2009, "SKD", "Skunk Dogs", 368.5, "Tim Yuba"),
    R(2017, "TSH", "The Show", 304.5, "Spencer Chao"), R(2018, "TSH", "The Show", 260.5, "Jay & William Chan"), R(2022, "TSH", "The Show", 391, "Jay & William Chan"),
    R(2017, "SKD", "Skunk Dogs", 262, "Tim Yuba"), R(2018, "SKD", "Skunk Dogs", 323, "Tim Yuba"), R(2022, "SKD", "Skunk Dogs", 318, "Tim Yuba"),
    R(2004, "DMK", "Diamond Kings", 361, "Kent Sakamoto"), R(2005, "DMK", "Diamond Kings", 352, "Kent Sakamoto"), R(2009, "DMK", "Diamond Kings", 284.5, "Kent Sakamoto"),
  ];

  it("keeps a co-owned season on the continuing owner's row", () => {
    const l = ownerLineages(seasons);
    expect(l.get("2004|SKD")).toBe("Tim Yuba");
    expect(l.get("2005|SKD")).toBe("Tim Yuba");
  });

  it("starts a new row when the owner changes completely", () => {
    const l = ownerLineages(seasons);
    expect(l.get("2017|TSH")).toBe("Spencer Chao");
    expect(l.get("2018|TSH")).toBe("Jay & William Chan");
  });

  it("shows the owners in the profile and counts each season once", () => {
    const tc = buildTrophyCase(seasons);
    const tim = tc.allTimeStandings.find((r) => r.key === "Tim Yuba")!;
    expect(tim).toMatchObject({ owner: "Tim Yuba", seasons: 6 });
    expect(tc.profiles["Tim Yuba"].owners).toEqual([{ name: "Tim Yuba", from: 2005, to: 2022 }, { name: "Tim Yuba & Jerrod Jue", from: 2004, to: 2004 }]);
    expect(tc.allTimeStandings.find((r) => r.key === "Spencer Chao")).toMatchObject({ seasons: 1, teamNames: ["The Show"] });
    expect(tc.allTimeStandings.find((r) => r.key === "Jay & William Chan")).toMatchObject({ seasons: 2, championships: 1 });
    // 2009 and 2018 are Tim's; 2017 is Spencer's, 2022 the Chans'.
    expect(tc.profiles["Tim Yuba"].titleYears).toEqual([2009, 2018]);
    expect(tc.profiles["Spencer Chao"].titleYears).toEqual([2017]);
    expect(tc.profiles["Jay & William Chan"].titleYears).toEqual([2022]);
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
    profiles: {}, keeperSeasons: [],
  });
});

describe("computeTrophyCase", () => {
  it("reads the archive of the league's franchise, so the current league (20) finds seasons stored under 2025's (1)", async () => {
    db.league.findUnique.mockResolvedValue({ franchiseId: 1 });
    db.historicalTeam.findMany
      .mockResolvedValueOnce([{ code: "DMK", name: "Diamond Kings", ownerName: "Kent Sakamoto", recordedTotal: 361, season: { year: 2004 } }])
      .mockResolvedValueOnce([{ seasonId: 4, code: "DMK", ownerName: "Kent Sakamoto" }, { seasonId: 5, code: "DMK", ownerName: "Kent Sakamoto" }]);
    db.historicalRosterEntry.findMany.mockResolvedValue([
      { teamCode: "DMK", playerName: "M. Kemp", slot: "OF", season: { id: 4, year: 2008, keepersFromSheet: true } },
      { teamCode: "DMK", playerName: "Mt. Kemp", slot: "OF", season: { id: 5, year: 2009, keepersFromSheet: false } },
    ]);
    db.historicalPlayerMatch.findMany.mockResolvedValue([
      { seasonId: 4, key: "2008|DMK|m|kemp|H", mlbId: 461314, mlbName: "Matt Kemp" },
      { seasonId: 5, key: "2009|DMK|mt|kemp|H", mlbId: 461314, mlbName: "Matt Kemp" },
    ]);
    const tc = await computeTrophyCase(20);
    expect(db.league.findUnique).toHaveBeenCalledWith({ where: { id: 20 }, select: { franchiseId: true } });
    expect(db.historicalTeam.findMany.mock.calls[0][0].where).toEqual({ recordedTotal: { not: null }, season: { league: { franchiseId: 1 } } });
    expect(tc.championships).toEqual([{ year: 2004, teamCode: "DMK", teamName: "Diamond Kings", owner: "Kent Sakamoto" }]);
    expect(db.historicalTeam.findMany.mock.calls[0][0].select).toMatchObject({ ownerName: true });
    expect(db.historicalRosterEntry.findMany.mock.calls[0][0].where).toEqual({ kind: "DRAFT", isKeeper: true, season: { league: { franchiseId: 1 } } });
    // Two spellings in two seasons are one keeper, through the player check's MLB id.
    expect(tc.profiles["Kent Sakamoto"].favoriteKeepers).toEqual([{ name: "Matt Kemp", mlbId: 461314, seasons: [2008, 2009], possible: true }]);
    expect(tc.keeperSeasons).toEqual([2008, 2009]);
  });

  it("is empty for an unknown league", async () => {
    db.league.findUnique.mockResolvedValue(null);
    expect((await computeTrophyCase(999)).allTimeStandings).toEqual([]);
  });
});
