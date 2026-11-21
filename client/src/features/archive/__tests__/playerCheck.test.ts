import { describe, expect, it } from "vitest";
import {
  explain, filterItems, filtersToParams, formatDecidedAt, formatInnings, formatLine, formatSeenIn,
  parseFilters, searchSeed, seasonRows, type CheckFilters,
} from "../lib/playerCheck";
import { flaggedPujols, JARET, line, openWright, picked, response, suggestedHawpe } from "./playerCheckFixtures";

const ALL: CheckFilters = { year: null, team: "", status: "", todoOnly: false };
const NONE = new Set<number>();

describe("formatInnings", () => {
  it("writes thirds of an inning as outs", () => {
    expect(formatInnings(186 + 1 / 3)).toBe("186.1");
    expect(formatInnings(78 + 2 / 3)).toBe("78.2");
    expect(formatInnings(125)).toBe("125.0");
  });
});

describe("formatLine", () => {
  const hitter = line({ g: 152, pa: 601, hr: 20, avg: ".228", sb: 3 });
  const pitcherWhoBats = line({ g: 32, pa: 72, hr: 0, avg: ".063", sb: 0, ip: 201 + 2 / 3, w: 14, sv: 0, k: 135, era: "3.88" });
  const mopUp = line({ g: 112, pa: 195, hr: 2, avg: ".236", sb: 1, ip: 1 / 3, era: "0.00" });

  it("shows the hitting line for a hitter slot", () => {
    expect(formatLine(hitter, "H")).toBe("152 G · 601 PA · 20 HR · .228 AVG · 3 SB");
  });
  it("shows the pitching line for a pitcher slot, not the pitcher's at-bats", () => {
    expect(formatLine(pitcherWhoBats, "P")).toBe("201.2 IP · 14 W · 0 SV · 135 K · 3.88 ERA");
  });
  it("for a slot that takes either, shows what he mostly did — never both", () => {
    expect(formatLine(pitcherWhoBats, "X")).toBe("201.2 IP · 14 W · 0 SV · 135 K · 3.88 ERA");
    expect(formatLine(mopUp, "X")).toBe("112 G · 195 PA · 2 HR · .236 AVG · 1 SB");
  });
  it("falls back to the other line when he did nothing in the slot's role", () => {
    expect(formatLine(hitter, "P")).toBe("152 G · 601 PA · 20 HR · .228 AVG · 3 SB");
    expect(formatLine(line({ g: 5, ip: 7, k: 9, era: "2.57" }), "H")).toBe("7.0 IP · 0 W · 0 SV · 9 K · 2.57 ERA");
  });
  it("says so when he has no stats that season", () => {
    expect(formatLine(null, "H")).toBe("No MLB stats that season");
    expect(formatLine(line(), "P")).toBe("No MLB stats that season");
  });
});

describe("formatSeenIn", () => {
  it("names the draft, the periods and the final roster in plain words", () => {
    expect(formatSeenIn(["draft", "P2", "P7", "final"])).toBe("draft day, period 2, period 7, the final roster");
  });
});

describe("explain", () => {
  it("names the slot a flagged player didn't qualify at", () => {
    expect(explain(flaggedPujols)).toBe("The name fits Albert Pujols, but he didn’t qualify at 3B.");
  });
  it("says a single noted candidate is a guess, not a match", () => {
    expect(explain(suggestedHawpe)).toBe("No player fits this spelling. This is the closest guess.");
  });
  it("tells an open name from a suggested one, and an empty one", () => {
    expect(explain(openWright)).toBe("More than one player fits this name.");
    expect(explain({ ...openWright, status: "SUGGESTED" })).toBe("More than one player fits this name. Only one qualifies for every slot he held.");
    expect(explain({ ...openWright, candidates: [], suggestion: null })).toBe("No MLB player fits this spelling.");
  });
});

describe("searchSeed", () => {
  it("starts the search from the surname as written", () => {
    expect(searchSeed("J. Wright")).toBe("Wright");
    expect(searchSeed("Wm. Contreras")).toBe("Contreras");
    expect(searchSeed("J. D. Martinez")).toBe("Martinez");
    expect(searchSeed("P. Crow-Armstron")).toBe("Crow-Armstron");
  });
  it("keeps a name with no initial as it is", () => {
    expect(searchSeed("Pujols")).toBe("Pujols");
  });
});

describe("filterItems", () => {
  const items = [openWright, flaggedPujols, suggestedHawpe];

  it("filters by season, team and status", () => {
    expect(filterItems(items, { ...ALL, year: 2004 }, NONE).map((i) => i.id)).toEqual([10, 11]);
    expect(filterItems(items, { ...ALL, team: "BOH" }, NONE).map((i) => i.id)).toEqual([12]);
    expect(filterItems(items, { ...ALL, status: "FLAGGED" }, NONE).map((i) => i.id)).toEqual([11]);
    expect(filterItems(items, { year: 2004, team: "MNB", status: "OPEN", todoOnly: false }, NONE).map((i) => i.id)).toEqual([10]);
  });

  it("'left to decide' hides decided names — except ones decided during this visit", () => {
    const done = [picked(openWright, JARET), flaggedPujols];
    expect(filterItems(done, { ...ALL, todoOnly: true }, NONE).map((i) => i.id)).toEqual([11]);
    expect(filterItems(done, { ...ALL, todoOnly: true }, new Set([10])).map((i) => i.id)).toEqual([10, 11]);
    expect(filterItems(done, ALL, NONE).map((i) => i.id)).toEqual([10, 11]);
  });
});

describe("seasonRows", () => {
  it("adds how many names in each season are still undecided", () => {
    const data = response([picked(openWright, JARET), flaggedPujols, suggestedHawpe]);
    expect(seasonRows(data.seasons, data.items).map((r) => [r.year, r.todo])).toEqual([[2005, 1], [2004, 1]]);
  });
});

describe("filters in the URL", () => {
  it("round-trips every filter", () => {
    const f: CheckFilters = { year: 2004, team: "MNB", status: "FLAGGED", todoOnly: true };
    const params = new URLSearchParams(filtersToParams(f));
    expect(params.toString()).toBe("season=2004&team=MNB&status=flagged&todo=1");
    expect(parseFilters(params)).toEqual(f);
  });
  it("writes nothing for the default view and ignores junk", () => {
    expect(filtersToParams(ALL)).toEqual({});
    expect(parseFilters(new URLSearchParams("season=abc&status=verified&todo=yes"))).toEqual(ALL);
    expect(parseFilters(new URLSearchParams(""))).toEqual(ALL);
  });
});

describe("formatDecidedAt", () => {
  const now = new Date("2026-11-21T12:00:00Z");
  it("drops the year for this year's decisions and keeps it for older ones", () => {
    expect(formatDecidedAt("2026-11-20T18:00:00.000Z", now)).toBe("Nov 20");
    expect(formatDecidedAt("2025-03-05T18:00:00.000Z", now)).toBe("Mar 5, 2025");
  });
  it("is empty for a missing or broken date", () => {
    expect(formatDecidedAt(null, now)).toBe("");
    expect(formatDecidedAt("not a date", now)).toBe("");
  });
});
