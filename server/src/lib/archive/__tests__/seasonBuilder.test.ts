import { describe, expect, it } from "vitest";

const noRow = <T extends { row?: number }>(xs: T[]) => xs.map(({ row: _row, ...rest }) => rest);
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
    expect(noRow(s.draft!.DDG)).toEqual([{ slot: "C", name: "C. Three", value: 9 }]);
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

describe("a team named twice in one header (2010 draft: 'Dodger Dawgs' over the Devil Dawgs column)", () => {
  const dupDraft: Grid = [
    ["", "Diamond", "", "Demolition", "", "Dodger Dawgs", "", "Dodger Dawgs", ""],
    ["", "Kings", "", "Lumber Co.", "", "", "", "", ""],
    ["C", "A. One", 5, "B. Two", 3, "C. Three", 9, "D. Four", 1],
  ];
  const sheets: Record<string, Grid> = { final, dupDraft };
  const load = (ref: { sheet: string }) => parseSheet(sheets[ref.sheet]);

  it("keeps both columns' players and gives the second column to the team in that position", () => {
    const s = buildSeason({ year: 2010, final: { file: "f", sheet: "final" }, draft: { file: "f", sheet: "dupDraft" } }, franchises, load);
    expect(s.draft!.DDG.map((e) => e.name)).toEqual(["C. Three"]);
    expect(s.draft!.SKD.map((e) => e.name)).toEqual(["D. Four"]);
    expect(s.checks.some((c) => c.level === "warn" && c.message.startsWith("draft: matched by column order"))).toBe(true);
  });

  it("is an error, not a silent overwrite, when the column count gives no safe fallback", () => {
    const s = buildSeason({ year: 2010, draft: { file: "f", sheet: "dupDraft" } }, franchises, (ref) => (ref.sheet === "dupDraft" ? parseSheet(dupDraft) : null));
    // No final sheet: the draft header is the team list, so there is no independent column order.
    expect(s.checks.some((c) => c.level === "error" && /named twice|unknown team/.test(c.message))).toBe(true);
  });
});

describe("an explicit Keepers sheet", () => {
  const keepersSheet: Grid = [
    ["", "Diamond", "", "Demolition", "", "Dodger Dawgs", "", "Skunk Dogs", ""],
    ["", "Kings", "", "Lumber Co.", "", "", "", "", ""],
    ["C", "A.  One", 5, "", "", "C. Three", 9, "Z. Gone", 2],
  ];
  const draft4: Grid = [
    ["", "Diamond", "", "Demolition", "", "Dodger Dawgs", "", "Skunk Dogs", ""],
    ["", "Kings", "", "Lumber Co.", "", "", "", "", ""],
    ["C", "A. One", 5, "B. Two", 3, "C. Three", 9, "D. Four", 1],
  ];
  const salaries4 = draft4; // every price matches: derivation alone would call all four keepers
  const sheets: Record<string, Grid> = { final, keepersSheet, draft4, salaries4 };
  const load = (ref: { sheet: string }) => parseSheet(sheets[ref.sheet]);
  const s = buildSeason({
    year: 2012, final: { file: "f", sheet: "final" }, draft: { file: "f", sheet: "draft4" },
    salaries: { file: "f", sheet: "salaries4" }, keepers: { file: "f", sheet: "keepersSheet" },
  }, franchises, load);

  it("wins over keepers derived from prices, using the draft roster's spelling", () => {
    expect(s.keepersSource).toBe("sheet");
    expect(s.keepers).toEqual({ DMK: ["A. One"], DLC: [], DDG: ["C. Three"], SKD: ["Z. Gone"] });
  });

  it("warns about a listed keeper who is not on the draft roster", () => {
    expect(s.checks.some((c) => c.message === "SKD: keeper not on the draft roster: Z. Gone")).toBe(true);
  });

  it("falls back to derived (possible) keepers without one", () => {
    const d = buildSeason({ year: 2012, final: { file: "f", sheet: "final" }, draft: { file: "f", sheet: "draft4" }, salaries: { file: "f", sheet: "salaries4" } }, franchises, load);
    expect(d.keepersSource).toBe("derived");
    expect(d.keepers!.DLC).toEqual(["B. Two"]);
  });
});
