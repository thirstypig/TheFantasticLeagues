import { describe, expect, it } from "vitest";

const noRow = <T extends { row?: number }>(xs: T[]) => xs.map(({ row: _row, ...rest }) => rest);
import {
  deriveKeepers, diffRoster, excelSerialToISO, findHeader, likelySamePlayer, nameKey, parseSheet, relabelSlots, type Grid,
} from "../workbookParser.js";

// Rows copied from Fantasy_Baseball_2024 (2).xls, trimmed to 2 slots per block.
// Roster layout: 4 teams, a repeated slot column at index 5, then 4 more teams.
const rosterSheet: Grid = [
  ["", "Diamond", "Demolition", "Dodger Dawgs", "Skunk Dogs", "", "RGing", "Devil Dawgs", "Los Doyers", "The Show"],
  ["", "Kings", "Lumber Co.", "", "", "", "Sluggers", "", "", ""],
  ["", "", "", "", "", "", "", "", "", ""],
  ["1B", "M. Busch", "C. Bellinger", "R. Hoskins", "M. Olson", "1B", "F. Freeman", "S. Steer", "C. Walker", "P. Alonso"],
  ["2B", "K. Marte", "B. Stott", "L. Garcia", "G. Lux", "2B", "L. Arraez", "J. Cronenworth", "M. Betts", "X. Bogaerts"],
  ["IL1", "", "R. Acuna Jr.", "", "C. Yelich", "IL1", "T. Edman", "O. Albies", "", ""],
  [45403, 56.5, 43.5, 44, 47, 45403, 43.5, 47.5, 40, 38],
  [45431, 39.5, 62.5, 45, 44.5, 45431, 52, 32.5, 44, 40],
  ["End", "", "", "", "", "End", "", "", "", ""],
  ["Total", 96, 106, 89, 91.5, "Total", 95.5, 80, 84, 78],
  ["", "2024 Standings", "Demolition Lumber Co.", 106, "", "", "2024 Standings", "", "", ""],
];

// Priced layout (Draft / Salaries): name column + value column per team.
const pricedSheet: Grid = [
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["", "Diamond", "", "Demolition", "", "Dodger Dawgs", "", "Skunk Dogs", "", "", "RGing", "", "Devil Dawgs", "", "Los Doyers", "", "The Show", ""],
  ["", "Kings", "", "Lumber Co.", "", "", "", "", "", "", "Sluggers", "", "", "", "", "", "", ""],
  ["OF", "F. Tatis Jr.", 36, "R. Acuna Jr.", 54, "J. Soto", "AL", "C. Yelich", 39, "OF", "B. Doyle", 5, "N. Jones", 23, "T. Hernandez", 72, "B. Harper", 30],
  ["C", "P. Bailey", 2, "S. Murphy", 34, "F. Alverez", 13, "G. Moreno", 13, "C", "William Contrera", 36, "L. Campusano", 10, "W. Smith", 17, "K. Ruiz", 15],
  ["", "Salary Cap", 400, "", 400, "", 435, "", 385, "", "", 400, "", 395, "", 395, "", 400],
];

describe("findHeader", () => {
  it("joins names wrapped onto the second row and finds 8 teams", () => {
    const h = findHeader(rosterSheet)!;
    expect(h.priced).toBe(false);
    expect(h.teams.map((t) => t.rawName)).toEqual([
      "Diamond Kings", "Demolition Lumber Co.", "Dodger Dawgs", "Skunk Dogs",
      "RGing Sluggers", "Devil Dawgs", "Los Doyers", "The Show",
    ]);
  });

  it("detects the priced layout even when the header starts on row 1", () => {
    const h = findHeader(pricedSheet)!;
    expect(h.headerRow).toBe(2); // last header row: "Kings" / "Lumber Co." wrap onto row 2
    expect(h.priced).toBe(true);
    expect(h.teams).toHaveLength(8);
    expect(h.teams[7]).toMatchObject({ rawName: "The Show", nameCol: 16, valueCol: 17 });
  });
});

describe("parseSheet", () => {
  it("reads rosters by slot, skipping blank slots", () => {
    const p = parseSheet(rosterSheet)!;
    expect(noRow(p.rosters["Diamond Kings"])).toEqual([
      { slot: "1B", name: "M. Busch" },
      { slot: "2B", name: "K. Marte" },
    ]);
    expect(p.rosters["Demolition Lumber Co."].map((e) => e.slot)).toEqual(["1B", "2B", "IL1"]);
  });

  it("reads points rows (blank End row kept, empty) and the Total row", () => {
    const p = parseSheet(rosterSheet)!;
    expect(p.pointsRows).toHaveLength(3);
    expect(p.pointsRows[0]).toMatchObject({ serial: 45403 });
    expect(p.pointsRows[0].points["The Show"]).toBe(38);
    expect(p.pointsRows[2]).toEqual({ serial: null, points: {} });
    expect(p.totals["Skunk Dogs"]).toBe(91.5);
  });

  it("does not read the standings block or the salary-cap row as roster", () => {
    const p = parseSheet(pricedSheet)!;
    expect(noRow(p.rosters["Dodger Dawgs"])).toEqual([
      { slot: "OF", name: "J. Soto", value: "AL" },
      { slot: "C", name: "F. Alverez", value: 13 },
    ]);
  });
});

describe("names", () => {
  it("normalizes the sheets' punctuation typos to one key", () => {
    expect(nameKey("N, Hoerner")).toBe(nameKey("N. Hoerner"));
    expect(nameKey("J.Chisholm Jr.")).toBe(nameKey("J. Chisholm Jr."));
    expect(nameKey("L. Gurriel Jr,")).toBe("l|gurriel");
    expect(nameKey("J-H. Lee")).toBe(nameKey("J.H. Lee"));
    expect(nameKey("J.D. Martinez")).toBe("j|martinez");
  });

  it("treats a one-letter surname typo as the same player, a different initial as not", () => {
    expect(likelySamePlayer("F. Alverez", "F. Alvarez")).toBe(true);
    expect(likelySamePlayer("William Contrera", "Wm. Contreras")).toBe(true);
    expect(likelySamePlayer("W. Smith", "M. Smith")).toBe(false);
    expect(likelySamePlayer("J. Asad", "J. Assad")).toBe(true); // 4-letter surname, 1 edit
    expect(likelySamePlayer("J. Bell", "J. Hill")).toBe(false); // 4 letters, 2 edits
    expect(likelySamePlayer("J. Kim", "J. Lim")).toBe(false); // under 4 letters: exact only
  });
});

describe("diffRoster", () => {
  it("reports adds and drops, ignores slot moves and respellings", () => {
    const before = [
      { slot: "1B", name: "C. Encarnacion" }, { slot: "2B", name: "K. Marte" },
      { slot: "C", name: "F. Alverez" },
    ];
    const after = [
      { slot: "1B", name: "J. Bauers" }, { slot: "MI", name: "K. Marte" },
      { slot: "C", name: "F. Alvarez" },
    ];
    const d = diffRoster(before, after);
    expect(d.added.map((e) => e.name)).toEqual(["J. Bauers"]);
    expect(d.dropped.map((e) => e.name)).toEqual(["C. Encarnacion"]);
    expect(d.respelled).toEqual([{ from: "F. Alverez", to: "F. Alvarez" }]);
  });
});

describe("deriveKeepers", () => {
  it("keeps players on both sheets at the same price only", () => {
    const salaries = [
      { slot: "OF", name: "M. Harris II", value: 30 }, { slot: "SS", name: "F. Tatis Jr.", value: 36 },
      { slot: "OF", name: "C. Yelich", value: 23 }, { slot: "P", name: "J. Urias", value: "IA" },
    ];
    const draft = [
      { slot: "OF", name: "F. Tatis Jr.", value: 36 }, { slot: "OF", name: "M. Harris II", value: 30 },
      { slot: "OF", name: "C. Yelich", value: 39 }, // re-bought at auction, not kept
      { slot: "P", name: "J. Urias", value: 5 },
    ];
    expect(deriveKeepers(salaries, draft).map((e) => e.name)).toEqual(["F. Tatis Jr.", "M. Harris II"]);
  });
});

describe("excelSerialToISO", () => {
  it("converts the 2024 period-end serials", () => {
    expect(excelSerialToISO(45403)).toBe("2024-04-21");
    expect(excelSerialToISO(45536)).toBe("2024-09-01");
  });
});

// Older workbooks (2003–2008) — rows copied from the sheets that broke the first parser run.
describe("older layouts", () => {
  it("reads upper-case END / TOTAL rows and the standings block (FB.2005.xls, Final Rosters 2004)", () => {
    const g: Grid = [
      ["", "Diamond", "Demolition", "Crush", "Skunk Dogs", "", "RGing", "MoneyBall", "B.O.H.I.C.A.", "VIP"],
      ["", "Kings", "Lumber Co.", "Brothers Inc.", "", "", "Sluggers", "", "", "BALCOS"],
      ["C", "J. Phillips", "B. Ausmus", "P. Lo Duca", "K. Hill", "C", "M. Lieberthal", "J. Estrada", "M. Piazza", "J.D. Closser"],
      [38108, 62.5, 29, 34.5, 64, 38108, 45.5, 46, 45, 33.5],
      ["END", 30, 35.5, 32.5, 45.5, "END", 47.5, 61, 63, 45],
      ["TOTAL", 92.5, 64.5, 67, 109.5, "TOTAL", 93, 107, 108, 78.5],
      ["", "Final Standings:", "Diamond Kings", 361, "", "", "Final Standings:", "Diamond Kings", 361, ""],
      ["", "", "V.I.P. BALCOS", 326.5, "", "", "", "V.I.P. BALCOS", 326.5, ""],
      ["", "", "Demolition Lumbe", 238, "", "", "", "Demolition Lumbe", 238, ""],
    ];
    const p = parseSheet(g)!;
    expect(p.pointsRows).toHaveLength(2);
    expect(p.pointsRows[1]).toMatchObject({ serial: null });
    expect(p.pointsRows[1].points["VIP BALCOS"]).toBe(45);
    expect(p.totals["Crush Brothers Inc."]).toBe(67);
    expect(p.standings).toEqual({ "Diamond Kings": 361, "V.I.P. BALCOS": 326.5, "Demolition Lumbe": 238 });
  });

  it("joins a 3-row header with an owner row that skips a team (FB.2005.xls Draft Day)", () => {
    const g: Grid = [
      ["", "Kent", "", "Yuji", "", "Kurt", "", "Tim", "", "", "Burt", "", "Mike", "", "Chris", "", "", ""],
      ["", "Diamond", "", "Demolition", "", "Mr. Rotoboto", "", "Skunk Dogs", "", "", "RG Sluggers", "", "MoneyBall", "", "B.O.H.I.C.A.", "", "VIP", ""],
      ["", "Kings", "", "Lumber Co.", "", "", "", "", "", "", "", "", "", "", "", "", "BALCOS", ""],
      ["C", "J. Phillips", 7, "B. Ausmus", 1, "P. Lo Duca", 29, "K. Hill", 1, "C", "M. Lieberthal", 19, "J. Estrada", 20, "M. Piazza", 13, "J.D. Closser", 17],
    ];
    const h = findHeader(g)!;
    expect(h.teams.map((t) => t.rawName)).toEqual([
      "Kent Diamond Kings", "Yuji Demolition Lumber Co.", "Kurt Mr. Rotoboto", "Tim Skunk Dogs",
      "Burt RG Sluggers", "Mike MoneyBall", "Chris B.O.H.I.C.A.", "VIP BALCOS",
    ]);
    expect(h.priced).toBe(true);
  });

  it("stops at a side list to the right of the teams (2008 Keepers sheet)", () => {
    const g: Grid = [
      ["", "Kent", "", "Yuji", "", "Kurt", "", "Tim", "", "", "Burt", "", "Mike", "", "Chris", "", "Jimmy", "", "", 105, "K. Gregg", "RP", 11, "M"],
      ["", "Diamond", "", "Demolition", "", "Dodger Dawgs", "", "Skunk Dogs", "", "", "RGing", "", "MoneyBall", "", "B.O.H.I.C.A.", "", "The", "", "", 106, "A. LaRoche", "3B", 1, "H"],
      ["", "Kings", "", "Lumber Co.", "", "", "", "", "", "", "Sluggers", "", "", "", "", "", "Fluffers", "", "", 107, "D. Davis", "P", 3, "B"],
      ["C", "C. Ruiz", 12, "J.R. Towles", 26, "R. Martin", 31, "B. McCann", 41, "C", "B. Scheiner", 1, "D. Ross", 8, "G. Soto", 42, "B. Molina", 16, "", 110, "R. Johnson", "P", 2, "M"],
    ];
    const h = findHeader(g)!;
    expect(h.teams).toHaveLength(8);
    expect(h.teams[7].rawName).toBe("Jimmy The Fluffers");
    expect(noRow(parseSheet(g)!.rosters["Jimmy The Fluffers"])).toEqual([{ slot: "C", name: "B. Molina", value: 16 }]);
  });
});

describe("likelySamePlayer distance limit", () => {
  it("does not merge surnames 3 edits apart", () => {
    expect(likelySamePlayer("J. Castro", "J. Castillo")).toBe(false);
    expect(likelySamePlayer("M. Moore", "M. Montero")).toBe(false);
  });
});

describe("relabelSlots (End of Season 2020 kept the old label column)", () => {
  // Rows as entered: OF, OF, 1B, C, then a DL row. Labels as left in the sheet: C, C, 1B, 2B, DL.
  const stale: Grid = [
    ["", "Diamond", "Demolition", "Dodger Dawgs", "Skunk Dogs"], ["", "Kings", "Lumber Co.", "", ""],
    ["C", "J. Soto", "R. Acuna", "V. Robles", "T. Grisham"],
    ["C", "J. Heyward", "E. Hernandez", "C. Pache", "B. Nimmo"],
    ["1B", "J. Votto", "J. Aguilar", "J. McNeil", "K. Bryant"],
    ["2B", "W. Contreras", "JT. Realmuto", "J. Stallings", "C. Kelly"],
    ["DL", "", "", "M. Prior", ""],
  ];
  const reference = ["OF", "OF", "1B", "C", "IL1", "IL2"];

  it("takes lineup labels from the reference row by row and leaves IL/DL rows alone", () => {
    const p = relabelSlots(parseSheet(stale)!, reference);
    expect(p.rosters["Diamond Kings"].map((e) => `${e.slot}:${e.name}`)).toEqual(["OF:J. Soto", "OF:J. Heyward", "1B:J. Votto", "C:W. Contreras"]);
    expect(p.rosters["Dodger Dawgs"].at(-1)).toMatchObject({ slot: "DL", name: "M. Prior" });
  });

  it("refuses when the lineup rows don't line up", () => {
    expect(() => relabelSlots(parseSheet(stale)!, ["OF", "1B", "C"])).toThrow(/lineup rows/);
  });
});
