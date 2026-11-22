import { describe, expect, it } from "vitest";
import { buildArchiveRows } from "../archiveRows.js";
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
    { period: 1, source: "Keepers", rosters: { DDG: [{ slot: "C", name: "R. Martin" }], LDY: [] } },
    { period: 2, source: "May 1", rosters: { DDG: [{ slot: "C", name: "R. Martin" }], LDY: [{ slot: "OF", name: "J. Bay" }] } },
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
  const { teams, entries } = buildArchiveRows(season, { LDY: "Owner L" });

  it("stores recorded points and totals as recorded, with a note where the source doesn't add up", () => {
    expect(teams).toEqual([
      {
        code: "DDG", name: "Dodger Dawgs", ownerName: null, recordedPeriodPoints: [45, 58.5], recordedTotal: 104,
        note: "As recorded in the commissioner's workbook, which does not add up here: periods sum to 103.5, Total row says 104.",
      },
      { code: "LDY", name: "The Fluffers", ownerName: "Owner L", recordedPeriodPoints: [32.5, 37.5], recordedTotal: 70, note: null },
    ]);
  });

  it("writes each roster kind once: P1 comes from DRAFT, not duplicated as PERIOD", () => {
    const kinds = entries.map((e) => `${e.kind}:${e.periodNumber ?? "-"}:${e.teamCode}:${e.playerName}`);
    expect(kinds).toEqual([
      "SALARIES:-:DDG:R. Martin", "SALARIES:-:LDY:J. Soto",
      "DRAFT:1:DDG:R. Martin", "DRAFT:1:DDG:Ad. Gonzalez",
      "PERIOD:2:DDG:R. Martin", "PERIOD:2:LDY:J. Bay",
      "FINAL:-:DDG:R. Martin", "FINAL:-:LDY:J. Bay",
    ]);
  });

  it("flags keepers on the draft rows only, and splits $ from text price cells", () => {
    const draft = entries.filter((e) => e.kind === "DRAFT");
    expect(draft.map((e) => [e.playerName, e.isKeeper, e.salary])).toEqual([["R. Martin", true, 31], ["Ad. Gonzalez", false, 25]]);
    expect(entries.find((e) => e.playerName === "J. Soto")).toMatchObject({ salary: null, salaryNote: "AL" });
    expect(entries.filter((e) => e.kind !== "DRAFT").every((e) => !e.isKeeper)).toBe(true);
  });
});
