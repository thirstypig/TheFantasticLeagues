import { describe, expect, it } from "vitest";
import { buildSeason, resolveTeam, type FranchiseMap } from "../seasonBuilder.js";
import { parseSheet, type Grid } from "../workbookParser.js";

const franchises: FranchiseMap = {
  DMK: ["Diamond Kings", "Diamond"],
  DLC: ["Demolition Lumber Co.", "Demolition"],
  DDG: ["Dodger Dawgs", "Crush Brothers Inc.", "Disco Rover"],
  SKD: ["Skunk Dogs"],
};

describe("resolveTeam", () => {
  it("matches aliases exactly, with an owner prefix, or truncated", () => {
    expect(resolveTeam("Disco Rover", franchises)).toBe("DDG");
    expect(resolveTeam("Kent Diamond Kings", franchises)).toBe("DMK");
    expect(resolveTeam("Demolition Lumbe", franchises)).toBe("DLC");
    expect(resolveTeam("Kurt Mr. Rotoboto", franchises)).toBeNull();
  });
});

// A 4-team season keeps the fixtures readable; the builder doesn't care about 8.
const header = [["", "Diamond", "Demolition", "Dodger Dawgs", "Skunk Dogs"], ["", "Kings", "Lumber Co.", "", ""]];
const final: Grid = [
  ...header,
  ["C", "A. One", "B. Two", "C. Three", "D. Four"],
  [45403, 10, 20, 30, 40],
  ["End", 1, 2, 3, 4],
  ["Total", 11, 22, 33, 45], // SKD off by one
];
const draft: Grid = [
  ["", "Diamond", "", "Demolition", "", "Mr. Rotoboto", "", "Skunk Dogs", ""],
  ["", "Kings", "", "Lumber Co.", "", "", "", "", ""],
  ["C", "A. One", 5, "B. Two", 3, "C. Three", 9, "X. Old", 1],
];
const p2: Grid = [...header, ["C", "A. One", "B. Two", "C. Three", "D. Four"]];

describe("buildSeason", () => {
  const sheets: Record<string, Grid> = { final, draft, p2 };
  const load = (ref: { sheet: string }) => parseSheet(sheets[ref.sheet]);
  const s = buildSeason(
    { year: 2024, final: { file: "f", sheet: "final" }, draft: { file: "f", sheet: "draft" }, periods: ["p2"], periodsFile: "f" },
    franchises, load,
  );

  it("flags a team whose periods don't add up to its Total row, and only that team", () => {
    const errs = s.checks.filter((c) => c.level === "error").map((c) => c.message);
    expect(errs).toEqual(["SKD: periods sum to 44, Total row says 45"]);
  });

  it("maps an unrecognised draft header by column order and says so", () => {
    expect(s.draft!.DDG).toEqual([{ slot: "C", name: "C. Three", value: 9 }]);
    expect(s.checks).toContainEqual({ level: "warn", message: 'draft: matched by column order: "Mr. Rotoboto"→DDG' });
  });

  it("derives the meeting moves between the draft roster and the P2 roster", () => {
    expect(s.moves).toEqual([{
      period: 2,
      byTeam: {
        DMK: { added: [], dropped: [], respelled: [] },
        DLC: { added: [], dropped: [], respelled: [] },
        DDG: { added: [], dropped: [], respelled: [] },
        SKD: { added: ["D. Four"], dropped: ["X. Old"], respelled: [] },
      },
    }]);
  });

  it("records points per period in order, End last", () => {
    expect(s.recordedPoints).toEqual([
      { DMK: 10, DLC: 20, DDG: 30, SKD: 40 },
      { DMK: 1, DLC: 2, DDG: 3, SKD: 4 },
    ]);
  });
});
