import { describe, expect, it } from "vitest";
import { buildArchiveRows, ownerFor } from "../archiveRows.js";
import type { SeasonData } from "../seasonBuilder.js";

// Shaped like the parser's 2008 output: one team whose recorded total doesn't
// match its period rows in the source workbook.
const season: SeasonData = {
  year: 2008,
  teams: [{ code: "DDG", name: "Dodger Dawgs" }, { code: "LDY", name: "The Fluffers" }],
  salaries: { DDG: [{ slot: "C", name: "R. Martin", value: 31 }], LDY: [{ slot: "P", name: "J. Soto", value: "AL" }] },
  draft: { DDG: [{ slot: "C", name: "R. Martin", value: 31 }, { slot: "1B", name: "Ad. Gonzalez", value: 25 }], LDY: [] },
  keepers: { DDG: ["R. Martin"], LDY: [] },
  keepersSource: "derived",
  periodRosters: [
    { period: 1, source: "4-27", endDate: "2008-04-27", rosters: { DDG: [{ slot: "C", name: "R. Martin" }], LDY: [] } },
    { period: 2, source: "Keepers", endDate: null, rosters: { DDG: [{ slot: "C", name: "R. Martin" }], LDY: [{ slot: "OF", name: "J. Bay" }] } },
  ],
  moves: [],
  finalRosters: { DDG: [{ slot: "C", name: "R. Martin" }], LDY: [{ slot: "OF", name: "J. Bay" }] },
  recordedPoints: [{ DDG: 45, LDY: 32.5 }, { DDG: 58.5, LDY: 37.5 }],
  recordedTotals: { DDG: 104, LDY: 70 },
  checks: [
    { level: "ok", message: "7 periods of recorded points" },
    { level: "error", message: "DDG: periods sum to 103.5, Total row says 104" },
  ],
};

describe("buildArchiveRows", () => {
  const { teams, entries, periodEnds } = buildArchiveRows(season, { LDY: "Owner L" });

  it("stores recorded points and totals as recorded, with a note where the source doesn't add up", () => {
    expect(teams).toEqual([
      {
        code: "DDG", name: "Dodger Dawgs", ownerName: null, recordedPeriodPoints: [45, 58.5], recordedTotal: 104,
        note: "As recorded in the commissioner's workbook, which does not add up here: periods sum to 103.5, Total row says 104.",
      },
      { code: "LDY", name: "The Fluffers", ownerName: "Owner L", recordedPeriodPoints: [32.5, 37.5], recordedTotal: 70, note: null },
    ]);
  });

  it("writes every period sheet as PERIOD k, P1 included, and the draft with no period", () => {
    const kinds = entries.map((e) => `${e.kind}:${e.periodNumber ?? "-"}:${e.teamCode}:${e.playerName}`);
    expect(kinds).toEqual([
      "SALARIES:-:DDG:R. Martin", "SALARIES:-:LDY:J. Soto",
      "DRAFT:-:DDG:R. Martin", "DRAFT:-:DDG:Ad. Gonzalez",
      "PERIOD:1:DDG:R. Martin",
      "PERIOD:2:DDG:R. Martin", "PERIOD:2:LDY:J. Bay",
      "FINAL:-:DDG:R. Martin", "FINAL:-:LDY:J. Bay",
    ]);
  });

  it("lists the day each period ended, keeping a blank where a sheet name isn't a date", () => {
    expect(periodEnds).toEqual(["2008-04-27", ""]);
  });

  it("flags keepers on the draft rows only, and splits $ from text price cells", () => {
    const draft = entries.filter((e) => e.kind === "DRAFT");
    expect(draft.map((e) => [e.playerName, e.isKeeper, e.salary])).toEqual([["R. Martin", true, 31], ["Ad. Gonzalez", false, 25]]);
    expect(entries.find((e) => e.playerName === "J. Soto")).toMatchObject({ salary: null, salaryNote: "AL" });
    expect(entries.filter((e) => e.kind !== "DRAFT").every((e) => !e.isKeeper)).toBe(true);
  });
});

describe("ownerFor", () => {
  const owners = {
    LDY: "James Chang",
    SKD: [{ from: 2004, to: 2004, owner: "Tim Yuba & Jerrod Jue" }, { owner: "Tim Yuba" }],
    TSH: [{ to: 2017, owner: "Spencer Chao" }, { from: 2018, owner: "Jay & William Chan" }],
  };
  it("gives one owner for every season when the file has a name", () => {
    expect(ownerFor(owners, "LDY", 2004)).toBe("James Chang");
  });
  it("picks the season's owner from ranges, with an open entry as the default", () => {
    expect(ownerFor(owners, "SKD", 2004)).toBe("Tim Yuba & Jerrod Jue");
    expect(ownerFor(owners, "SKD", 2003)).toBe("Tim Yuba");
    expect(ownerFor(owners, "TSH", 2017)).toBe("Spencer Chao");
    expect(ownerFor(owners, "TSH", 2025)).toBe("Jay & William Chan");
  });
  it("is null for a team with no owner on file", () => {
    expect(ownerFor(owners, "DVD", 2010)).toBeNull();
  });
});
