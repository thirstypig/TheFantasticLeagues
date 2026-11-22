import { describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/mlbApi.js", () => ({ mlbGetJson: vi.fn() }));

import { factsUrl } from "../../../lib/archive/mlbFacts.js";
import { lookupPlayerName, MAX_RESULTS, nameMatches, searchCandidates } from "../services/playerSearchService.js";

// Shapes as statsapi returns them with fields=people,id,fullName,firstName,lastName,useName.
const jaret = { id: 124605, fullName: "Jaret Wright", firstName: "Jaret", lastName: "Wright", useName: "Jaret" };
const jamey = { id: 124604, fullName: "Jamey Wright", firstName: "Jamey", lastName: "Wright", useName: "Jamey" };
const alex = { id: 136460, fullName: "Álex González", firstName: "Alexander", lastName: "González", useName: "Álex" };
const nen = { id: 119718, fullName: "Robb Nen", firstName: "Robert", lastName: "Nen", useName: "Robb" };

const pitching = (id: number, ip: string, games: number) => ({
  id, fullName: "x", primaryPosition: { abbreviation: "P" },
  stats: [{ group: { displayName: "pitching" }, splits: [{ season: "2004", team: { id: 1 }, sport: { id: 1 }, stat: { gamesPlayed: games, inningsPitched: ip, wins: 1, saves: 0, strikeOuts: 9, era: "3.28" } }] }],
});
const fieldingP = (id: number, games: number) => ({
  id, stats: [{ group: { displayName: "fielding" }, splits: [{ season: "2004", team: { id: 1 }, sport: { id: 1 }, position: { abbreviation: "P" }, stat: { games } }] }],
});

describe("nameMatches", () => {
  it("needs every typed word to start a word of the name", () => {
    expect(nameMatches("jar wright", jaret)).toBe(true);
    expect(nameMatches("wright", jaret)).toBe(true);
    expect(nameMatches("jam wright", jaret)).toBe(false);
    expect(nameMatches("right", jaret)).toBe(false);
  });
  it("ignores accents and case, and knows the legal first name", () => {
    expect(nameMatches("ALEX GONZALEZ", alex)).toBe(true);
    expect(nameMatches("alexander gonz", alex)).toBe(true);
    expect(nameMatches("robert nen", nen)).toBe(true);
  });
  it("matches nothing for an empty query", () => {
    expect(nameMatches("  ", jaret)).toBe(false);
  });
});

describe("searchCandidates", () => {
  const ctx = { year: 2004, slots: ["P"], role: "P", keptFromSlot: null };

  it("searches that season's players, then ranks them like stored candidates", async () => {
    const getPeople = vi.fn(async (url: string) => {
      if (url.includes("/sports/1/players?season=2004")) return { people: [jaret, jamey, alex] };
      return { people: [] };
    });
    const getFacts = vi.fn(async (url: string) => {
      if (url === factsUrl.line([124605, 124604], 2004)) return { people: [pitching(124605, "186.1", 32), pitching(124604, "78.2", 14)] };
      if (url === factsUrl.fielding([124605, 124604], 2004)) return { people: [fieldingP(124605, 32), fieldingP(124604, 14)] };
      return { people: [] };
    });
    const result = await searchCandidates("wright", ctx, getPeople, getFacts);
    expect(getPeople.mock.calls[0][0]).toBe("https://statsapi.mlb.com/api/v1/sports/1/players?season=2004&fields=people,id,fullName,firstName,lastName,useName");
    expect(result.more).toBe(false);
    expect(result.candidates.map((c) => [c.mlbId, c.name, c.eligibleSlots])).toEqual([[124605, "Jaret Wright", 1], [124604, "Jamey Wright", 1]]);
    expect(result.candidates[0].playingTime).toBeCloseTo(186 + 1 / 3, 4);
    expect(result.candidates[0].checks).toEqual([{ slot: "P", eligible: true, reason: "32 G at P" }]);
  });

  it("also finds a player with no game that season through MLB's name search", async () => {
    const getPeople = vi.fn(async (url: string) => {
      if (url.includes("/sports/1/players")) return { people: [jaret] };
      if (url.includes("/people/search?names=nen&sportId=1")) return { people: [nen, { id: 5, fullName: "Dick Nen", firstName: "Richard", lastName: "Nen" }] };
      return { people: [] };
    });
    const result = await searchCandidates("nen", ctx, getPeople, async () => ({ people: [] }));
    expect(result.candidates.map((c) => c.name).sort()).toEqual(["Dick Nen", "Robb Nen"]);
    // Hurt all season: no games, but a pitcher always fits a P slot.
    expect(result.candidates.every((c) => c.playingTime === 0)).toBe(true);
  });

  it("lists everyone who played that season ahead of a namesake who didn't, even an 'eligible' one", async () => {
    // 2005, a 2B slot. Neil Walker had not debuted: no at-bats, so he is a
    // "rookie" and eligible at his primary position. Larry Walker played 100
    // games in right field and is not eligible at 2B. Larry still comes first.
    const larry = { id: 123833, fullName: "Larry Walker", firstName: "Larry", lastName: "Walker" };
    const neil = { id: 435522, fullName: "Neil Walker", firstName: "Neil", lastName: "Walker" };
    const hitterCtx = { year: 2005, slots: ["2B"], role: "H", keptFromSlot: null };
    const getPeople = vi.fn(async (url: string) => (url.includes("/sports/1/players") ? { people: [larry] } : { people: [neil] }));
    const getFacts = vi.fn(async (url: string) => {
      if (url === factsUrl.line([123833, 435522], 2005)) {
        return { people: [{ id: 123833, stats: [{ group: { displayName: "hitting" }, splits: [{ season: "2005", team: { id: 138 }, sport: { id: 1 }, stat: { gamesPlayed: 100, plateAppearances: 367, homeRuns: 15, avg: ".289" } }] }] }] };
      }
      if (url === factsUrl.fielding([123833, 435522], 2005)) {
        return { people: [{ id: 123833, stats: [{ group: { displayName: "fielding" }, splits: [{ season: "2005", team: { id: 138 }, sport: { id: 1 }, position: { abbreviation: "RF" }, stat: { games: 83 } }] }] }] };
      }
      if (url === factsUrl.career([123833, 435522])) {
        return { people: [
          { id: 123833, primaryPosition: { abbreviation: "RF" }, stats: [{ group: { displayName: "hitting" }, splits: [{ season: "2004", team: { id: 138 }, sport: { id: 1 }, stat: { atBats: 258 } }] }] },
          { id: 435522, primaryPosition: { abbreviation: "2B" }, stats: [] },
        ] };
      }
      return { people: [] };
    });
    const result = await searchCandidates("walker", hitterCtx, getPeople, getFacts);
    expect(result.candidates.map((c) => [c.name, c.eligibleSlots, c.playingTime])).toEqual([["Larry Walker", 0, 367], ["Neil Walker", 1, 0]]);
  });

  it("keeps the season matches when the name search fails", async () => {
    const getPeople = vi.fn(async (url: string) => {
      if (url.includes("/sports/1/players")) return { people: [jaret] };
      throw new Error("MLB API error 503");
    });
    const result = await searchCandidates("wright", ctx, getPeople, async () => ({ people: [] }));
    expect(result.candidates.map((c) => c.mlbId)).toEqual([124605]);
  });

  it("shows the top few and says there are more", async () => {
    const many = Array.from({ length: MAX_RESULTS + 3 }, (_, i) => ({ id: 100 + i, fullName: `Jose Garcia ${i}`, firstName: "Jose", lastName: "Garcia" }));
    const result = await searchCandidates("garcia", ctx, async () => ({ people: many }), async () => ({ people: [] }));
    expect(result.candidates).toHaveLength(MAX_RESULTS);
    expect(result.more).toBe(true);
  });

  it("fails when the season's player list can't be fetched", async () => {
    await expect(searchCandidates("wright", ctx, async () => { throw new Error("down"); }, async () => ({ people: [] }))).rejects.toThrow("down");
  });
});

describe("lookupPlayerName", () => {
  it("returns MLB's name for the id", async () => {
    const getPeople = vi.fn(async () => ({ people: [jaret] }));
    expect(await lookupPlayerName(124605, getPeople)).toBe("Jaret Wright");
    expect(getPeople).toHaveBeenCalledWith("https://statsapi.mlb.com/api/v1/people/124605?fields=people,id,fullName,firstName,lastName,useName");
  });
  it("returns null for an id MLB doesn't have (404)", async () => {
    expect(await lookupPlayerName(999999999, async () => { throw new Error("MLB API error 404 for https://statsapi.mlb.com/api/v1/people/999999999"); })).toBeNull();
  });
  it("throws when MLB is unreachable, so an outage is not read as 'no such player'", async () => {
    await expect(lookupPlayerName(124605, async () => { throw new Error("MLB API timeout for …"); })).rejects.toThrow("timeout");
  });
});
