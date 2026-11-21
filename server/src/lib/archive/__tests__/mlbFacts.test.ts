import { describe, expect, it, vi } from "vitest";
import { isRookie } from "../archiveEligibility.js";
import {
  factsUrl, fetchPlayerFacts, inningsToNumber, parseCareer, parseFielding, parseSeasonLine, toSeasonFacts,
} from "../mlbFacts.js";
import { bayCareer, gorzelannyCareer, gorzelannyLine2007, pillarFielding2019, pillarLine2019 } from "./statsapiFixtures.js";

describe("inningsToNumber", () => {
  it("reads the digit after the dot as outs, not tenths", () => {
    expect(inningsToNumber("201.2")).toBeCloseTo(201 + 2 / 3, 6);
    expect(inningsToNumber("105.1")).toBeCloseTo(105 + 1 / 3, 6);
    expect(inningsToNumber("6.0")).toBe(6);
  });
  it("treats a missing value as zero", () => {
    expect(inningsToNumber(undefined)).toBe(0);
  });
});

describe("a player traded mid-season is counted once", () => {
  it("fielding: the combined split wins over the per-team ones (Pillar: 133 G in CF, not 266)", () => {
    const games = parseFielding(pillarFielding2019);
    expect(games.CF).toBe(133);
    // RF only has a per-team split (he played it for one club) — still counted.
    expect(games.RF).toBe(27);
  });

  it("season line: the combined split wins (Pillar: 645 PA, 161 G)", () => {
    const line = parseSeasonLine(pillarLine2019);
    expect(line.pa).toBe(645);
    expect(line.g).toBe(161);
  });

  it("career: a traded season is the combined split, not all three added up (Gorzelanny 2009: 47 IP, 14 AB)", () => {
    const career = parseCareer(gorzelannyCareer);
    expect(career.ipBy["2009"]).toBeCloseTo(47, 6);
    expect(career.abBy["2009"]).toBe(14);
    // A one-team season is unaffected.
    expect(career.ipBy["2007"]).toBeCloseTo(201 + 2 / 3, 6);
    expect(career.primary).toBe("P");
  });

  it("Jason Bay was still a rookie in 2004: 87 at-bats before it, not 174", () => {
    const career = parseCareer(bayCareer);
    expect(career.abBy["2003"]).toBe(87);
    const facts = toSeasonFacts({ games: {}, priorGames: {}, career }, 2004);
    expect(facts.careerAbBefore).toBe(87);
    expect(isRookie(facts)).toBe(true);
  });
});

describe("parseSeasonLine", () => {
  it("reads a pitcher's hitting and pitching lines together", () => {
    const line = parseSeasonLine(gorzelannyLine2007);
    expect(line.pa).toBe(72);
    expect(line.ip).toBeCloseTo(201 + 2 / 3, 6);
    expect(line.w).toBe(14);
    expect(line.k).toBe(135);
    expect(line.era).toBe("3.88");
    expect(line.g).toBe(32);
  });

  it("gives an empty line to a player with no stats that season", () => {
    expect(parseSeasonLine({ id: 1 })).toEqual({ g: 0, pa: 0, hr: 0, avg: "", r: 0, rbi: 0, sb: 0, ip: 0, w: 0, sv: 0, k: 0, era: "" });
  });
});

describe("toSeasonFacts", () => {
  it("counts only seasons before the one being checked", () => {
    const career = parseCareer(gorzelannyCareer);
    const facts = toSeasonFacts({ games: { P: 32 }, priorGames: { P: 11 }, career }, 2007, "P");
    expect(facts.careerIpBefore).toBeCloseTo(6 + 61 + 2 / 3, 6); // 2005 + 2006
    expect(facts.careerAbBefore).toBe(20);
    expect(facts.primaryPosition).toBe("P");
    expect(facts.keptFromSlot).toBe("P");
  });
});

describe("fetchPlayerFacts", () => {
  it("asks for this season's and last season's fielding, the career and the season line", async () => {
    const getJson = vi.fn(async (url: string) => {
      if (url === factsUrl.fielding([607680, 9], 2019)) return { people: [pillarFielding2019] };
      if (url === factsUrl.line([607680, 9], 2019)) return { people: [pillarLine2019] };
      return { people: [] };
    });
    const facts = await fetchPlayerFacts([607680, 9], 2019, getJson);
    expect(getJson.mock.calls.map((c) => c[0]).sort()).toEqual([
      factsUrl.career([607680, 9]),
      factsUrl.fielding([607680, 9], 2018),
      factsUrl.fielding([607680, 9], 2019),
      factsUrl.line([607680, 9], 2019),
    ].sort());
    expect(facts.get(607680)!.games.CF).toBe(133);
    expect(facts.get(607680)!.line.pa).toBe(645);
    // A player MLB returned nothing for still gets (empty) facts.
    expect(facts.get(9)).toEqual({
      games: {}, priorGames: {}, career: { primary: "", abBy: {}, ipBy: {} },
      line: { g: 0, pa: 0, hr: 0, avg: "", r: 0, rbi: 0, sb: 0, ip: 0, w: 0, sv: 0, k: 0, era: "" },
    });
  });

  it("makes no request for an empty list", async () => {
    const getJson = vi.fn();
    expect((await fetchPlayerFacts([], 2019, getJson)).size).toBe(0);
    expect(getJson).not.toHaveBeenCalled();
  });

  it("builds the season into the hydrate, and never the wrong one", () => {
    expect(factsUrl.fielding([1, 2], 2004)).toBe("https://statsapi.mlb.com/api/v1/people?personIds=1,2&hydrate=stats(group=[fielding],type=[season],season=2004)");
    expect(factsUrl.line([1], 2004)).toContain("type=[season],season=2004");
    expect(factsUrl.career([1])).toContain("type=[yearByYear]");
  });
});
