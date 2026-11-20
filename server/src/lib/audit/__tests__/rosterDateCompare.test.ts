import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseOnrotoTransactions, type OnrotoTransaction } from "../onrotoTransParser.js";
import { aliasMatches, aliasOf, compareRosterDates, type FbstStint } from "../rosterDateCompare.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "fixtures/onroto_trans_2026.html"), "utf8");

describe("parseOnrotoTransactions (real 2026 OGBA log)", () => {
  const { transactions, unknown } = parseOnrotoTransactions(html, 2026);

  it("reads every transaction row and recognises every wording", () => {
    expect(unknown).toEqual([]);
    expect(transactions).toHaveLength(482);
    const count = (raw: string) => transactions.filter((t) => t.raw === raw).length;
    expect(count("Release")).toBe(195);
    expect(count("Add to Actives")).toBe(195);
    expect(count("Trade")).toBe(4);
    expect(count("Acquire")).toBe(4);
    expect(count("Disable")).toBe(15);
    expect(count("Activate")).toBe(12);
    expect(transactions.filter((t) => t.raw.startsWith("Change Position to"))).toHaveLength(57);
  });

  it("maps wording to membership moves; IL and position changes are not moves", () => {
    const moves = transactions.filter((t) => t.move);
    expect(moves.filter((t) => t.move === "ADD")).toHaveLength(199);
    expect(moves.filter((t) => t.move === "DROP")).toHaveLength(199);
    expect(transactions.find((t) => t.raw === "Disable")!.move).toBeNull();
  });

  it("parses the first row's fields, with the season applied to the date", () => {
    expect(transactions[0]).toEqual({
      effDate: "2026-08-30", team: "Diamond Kings", alias: "DRushing", mlbTeam: "LAD", raw: "Release", submitted: "08.30 @ 12:09", move: "DROP",
    });
  });

  it("covers all eight OGBA teams", () => {
    expect(new Set(transactions.map((t) => t.team)).size).toBe(8);
  });

  it("reports an unrecognised wording instead of guessing", () => {
    const row = `<tr><td>05.01</td><td>The Show</td><td>XNew</td><td>SD</td><td>Waive</td><td>05.01 @ 10:00</td></tr>`;
    expect(parseOnrotoTransactions(row, 2026)).toEqual({ transactions: [], unknown: ['05.01 The Show XNew "Waive"'] });
  });
});

describe("aliasOf", () => {
  it.each([
    ["Dalton Rushing", "drushing"],
    ["Lourdes Gurriel Jr.", "lgurriel"],
    ["Agustín Ramírez", "aramirez"],
    ["Elly De La Cruz", "edelacruz"],
    ["Ke'Bryan Hayes", "khayes"],
  ])("%s → %s", (name, alias) => expect(aliasOf(name)).toBe(alias));
});

describe("aliasMatches (OnRoto's collision forms)", () => {
  it.each([
    ["DomSmith", "Dominic Smith"],
    ["TanScott", "Tanner Scott"],
    ["LGarciaJr", "Luis García Jr."],
    ["LGarcia", "Luis García Jr."],
    ["JoshBaez", "Joshua Báez"],
    ["DRushing", "Dalton Rushing"],
    ["SOhtani", "Shohei Ohtani (Pitcher)"],
  ])("%s denotes %s", (alias, name) => expect(aliasMatches(alias, name)).toBe(true));
  it.each([
    ["DomSmith", "Will Smith"],
    ["LeurGarcia", "Luis García Jr."],
    ["PPfaadt", "Brandon Pfaadt"],
    ["DSmith", "Dominic Smithson"],
  ])("%s does not denote %s", (alias, name) => expect(aliasMatches(alias, name)).toBe(false));
});

const W = { start: "2026-03-25", end: "2026-09-30" };
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const tx = (effDate: string, team: string, alias: string, raw: string, move: "ADD" | "DROP" | null, submitted = ""): OnrotoTransaction =>
  ({ effDate, team, alias, mlbTeam: "SD", raw, submitted, move });
let id = 1;
const stint = (team: string, playerName: string, acq: string, rel: string | null): FbstStint =>
  ({ rosterId: id++, team, playerName, acquiredAt: d(acq), releasedAt: rel ? d(rel) : null });

describe("compareRosterDates", () => {
  it("passes when every in-season move matches by date", () => {
    const r = compareRosterDates(
      [tx("2026-05-03", "The Show", "DRushing", "Add to Actives", "ADD"), tx("2026-06-01", "The Show", "DRushing", "Release", "DROP")],
      [stint("The Show", "Dalton Rushing", "2026-05-03", "2026-06-01")],
      W,
    );
    expect(r).toMatchObject({ matched: 2, dateDiffs: [], missingInFbst: [], missingInOnroto: [], unmappedTeams: [], timeOfDay: [], pass: true });
  });

  it("reports a move dated differently (the 2026 Norby/Pratt 08-31 vs 08.30 shape)", () => {
    const r = compareRosterDates(
      [tx("2026-08-30", "Devil Dawgs", "CNorby", "Add to Actives", "ADD")],
      [stint("Devil Dawgs", "Connor Norby", "2026-08-31", null)],
      W,
    );
    expect(r.pass).toBe(false);
    expect(r.dateDiffs).toEqual([{ team: "Devil Dawgs", player: "Connor Norby", move: "ADD", date: "2026-08-30", onrotoDate: "2026-08-30", fbstDate: "2026-08-31" }]);
  });

  it("reports moves missing on either side (the Sheehan drop / Webb add shape)", () => {
    const r = compareRosterDates(
      [tx("2026-08-02", "Demolition Lumber Co", "ESheehan", "Release", "DROP"), tx("2026-08-02", "Demolition Lumber Co", "JWebb", "Add to Actives", "ADD")],
      [stint("Demolition Lumber Co.", "Emmet Sheehan", "2026-07-05", null), stint("Demolition Lumber Co.", "Ian Extra", "2026-07-10", null)],
      W,
    );
    expect(r.missingInFbst).toEqual([
      { team: "Demolition Lumber Co.", player: "Emmet Sheehan", move: "DROP", date: "2026-08-02" },
      { team: "Demolition Lumber Co.", player: "JWebb", move: "ADD", date: "2026-08-02" },
    ]);
    // Sheehan's 07-05 add and the unexplained extra add are both absent from OnRoto here
    expect(r.missingInOnroto.map((e) => e.player)).toEqual(["Emmet Sheehan", "Ian Extra"]);
    expect(r.pass).toBe(false);
  });

  it("ignores auction/keeper stints opened before the season and drops after it", () => {
    const r = compareRosterDates([], [stint("The Show", "Kept Player", "2026-03-20", "2026-11-05")], W);
    expect(r).toMatchObject({ matched: 0, missingInOnroto: [], pass: true });
  });

  it("cancels a same-day drop-and-re-add on one side as net zero", () => {
    const r = compareRosterDates(
      [],
      [stint("The Show", "Ron Twice", "2026-03-20", "2026-06-10"), stint("The Show", "Ron Twice", "2026-06-10", null)],
      W,
    );
    expect(r.pass).toBe(true);
  });

  it("does not let a net-zero pair swallow a real move of the other kind", () => {
    const r = compareRosterDates(
      [tx("2026-06-10", "The Show", "RTwice", "Release", "DROP")],
      [stint("The Show", "Ron Twice", "2026-03-20", "2026-06-10")],
      W,
    );
    expect(r).toMatchObject({ matched: 1, pass: true });
  });

  it("pairs trades: OnRoto Trade/Acquire against a release and a new stint", () => {
    const r = compareRosterDates(
      [tx("2026-08-30", "Diamond Kings", "THernandez", "Trade", "DROP"), tx("2026-08-30", "The Show", "THernandez", "Acquire", "ADD")],
      [stint("Diamond Kings", "Teoscar Hernández", "2026-03-20", "2026-08-30"), stint("The Show", "Teoscar Hernández", "2026-08-30", null)],
      W,
    );
    expect(r).toMatchObject({ matched: 2, pass: true });
  });

  it("fails and names an OnRoto team with no FBST counterpart, without comparing its moves", () => {
    const r = compareRosterDates([tx("2026-05-01", "Mystery Team", "AAny", "Release", "DROP")], [stint("The Show", "A B", "2026-03-20", null)], W);
    expect(r.unmappedTeams).toEqual(["Mystery Team"]);
    expect(r.missingInFbst).toEqual([]);
    expect(r.pass).toBe(false);
  });

  it("flags an in-season stint stamped with a time of day", () => {
    const s: FbstStint = { rosterId: 9, team: "The Show", playerName: "Dalton Rushing", acquiredAt: d("2026-05-03"), releasedAt: new Date("2026-06-01T19:09:00Z") };
    const r = compareRosterDates(
      [tx("2026-05-03", "The Show", "DRushing", "Add to Actives", "ADD"), tx("2026-06-01", "The Show", "DRushing", "Release", "DROP")],
      [s],
      W,
    );
    expect(r.matched).toBe(2);
    expect(r.timeOfDay).toEqual([{ rosterId: 9, team: "The Show", player: "Dalton Rushing", field: "releasedAt", value: "2026-06-01T19:09:00.000Z" }]);
    expect(r.pass).toBe(false);
  });

  it("does not match the same alias across different teams", () => {
    const r = compareRosterDates(
      [tx("2026-05-03", "Los Doyers", "DRushing", "Add to Actives", "ADD")],
      [stint("The Show", "Dalton Rushing", "2026-05-03", null), stint("Los Doyers", "Someone Else", "2026-03-20", null)],
      W,
    );
    expect(r.unmappedTeams).toEqual([]);
    expect(r.matched).toBe(0);
    expect(r.missingInFbst).toHaveLength(1);
    expect(r.missingInOnroto).toHaveLength(1);
  });

  it("resolves a lengthened alias to the one matching player on that team", () => {
    const r = compareRosterDates(
      [tx("2026-04-19", "Dodger Dawgs", "DomSmith", "Add to Actives", "ADD")],
      [stint("Dodger Dawgs", "Dominic Smith", "2026-04-19", null), stint("Dodger Dawgs", "Will Smith", "2026-03-20", null)],
      W,
    );
    expect(r).toMatchObject({ matched: 1, pass: true });
  });

  it("merges a move OnRoto logged twice, and says so (2026 McCann/Steer)", () => {
    const r = compareRosterDates(
      [tx("2026-08-02", "Los Doyers", "JMcCann", "Add to Actives", "ADD"), tx("2026-08-02", "Los Doyers", "JMcCann", "Add to Actives", "ADD")],
      [stint("Los Doyers", "James McCann", "2026-08-02", null)],
      W,
    );
    expect(r).toMatchObject({ matched: 1, duplicatesMerged: 1, pass: true });
  });

  it("lists opening-day moves from both sides instead of comparing them", () => {
    const r = compareRosterDates(
      [tx("2026-03-25", "Devil Dawgs", "LeurGarcia", "Release", "DROP")],
      [stint("Devil Dawgs", "Andrew Vaughn", "2026-03-25", null)],
      W,
    );
    expect(r.pass).toBe(true);
    expect(r.openingDay).toEqual([
      { team: "Devil Dawgs", player: "LeurGarcia", move: "DROP", date: "2026-03-25", source: "OnRoto" },
      { team: "Devil Dawgs", player: "Andrew Vaughn", move: "ADD", date: "2026-03-25", source: "FBST" },
    ]);
  });

  it("pairs an unresolvable alias on last name + team + move + date, and lists it (2026 PPfaadt)", () => {
    const r = compareRosterDates(
      [tx("2026-08-02", "Dodger Dawgs", "PPfaadt", "Add to Actives", "ADD")],
      [stint("Dodger Dawgs", "Brandon Pfaadt", "2026-08-02", null)],
      W,
    );
    expect(r).toMatchObject({ matched: 1, pass: true });
    expect(r.matchedByLastName).toEqual([{ team: "Dodger Dawgs", player: "Brandon Pfaadt", move: "ADD", date: "2026-08-02", onrotoAlias: "PPfaadt" }]);
  });

  it("does not pair on last name across different dates", () => {
    const r = compareRosterDates(
      [tx("2026-08-02", "Dodger Dawgs", "PPfaadt", "Add to Actives", "ADD")],
      [stint("Dodger Dawgs", "Brandon Pfaadt", "2026-08-03", null)],
      W,
    );
    expect(r.pass).toBe(false);
    expect(r.missingInFbst).toHaveLength(1);
    expect(r.missingInOnroto).toHaveLength(1);
  });

  it("ignores a time of day on a period's first day (scored by date there)", () => {
    const s: FbstStint = { rosterId: 5, team: "Dodger Dawgs", playerName: "Dylan Crews", acquiredAt: d("2026-03-20"), releasedAt: new Date("2026-08-30T15:41:33Z") };
    const r = compareRosterDates([tx("2026-08-30", "Dodger Dawgs", "DCrews", "Trade", "DROP")], [s], { ...W, periodStarts: ["2026-08-30"] });
    expect(r).toMatchObject({ matched: 1, timeOfDay: [], pass: true });
  });

  it("replays a same-minute release+add as a swap (2026 Zac Thornton placeholder record)", () => {
    // Page order (newest first), exactly as OnRoto shows it on 08-02.
    const r = compareRosterDates(
      [
        tx("2026-08-02", "The Show", "ZThornton", "Release", "DROP", "08.02 @ 21:05"),
        tx("2026-08-02", "The Show", "ZThornton", "Add to Actives", "ADD", "08.02 @ 21:05"),
        tx("2026-08-02", "The Show", "ZThornton", "Add to Actives", "ADD", "08.02 @ 12:23"),
      ],
      [stint("The Show", "Zac Thornton", "2026-08-02", null)],
      W,
    );
    expect(r).toMatchObject({ matched: 1, duplicatesMerged: 0, pass: true });
  });

  it("an add then a later-day release on OnRoto stays two moves", () => {
    const r = compareRosterDates(
      [tx("2026-06-01", "The Show", "DRushing", "Release", "DROP", "06.01 @ 12:00"), tx("2026-05-03", "The Show", "DRushing", "Add to Actives", "ADD", "05.03 @ 12:00")],
      [stint("The Show", "Dalton Rushing", "2026-05-03", "2026-06-01")],
      W,
    );
    expect(r).toMatchObject({ matched: 2, pass: true });
  });

  it("a same-day add and release entered hours apart nets to nothing on OnRoto", () => {
    const r = compareRosterDates(
      [tx("2026-06-01", "The Show", "DRushing", "Release", "DROP", "06.01 @ 18:00"), tx("2026-06-01", "The Show", "DRushing", "Add to Actives", "ADD", "06.01 @ 12:00")],
      [stint("The Show", "Other Guy", "2026-03-20", null)],
      W,
    );
    expect(r).toMatchObject({ matched: 0, missingInFbst: [], pass: true });
  });

  it("tells apart two players on one team who share an alias (2026 Jacob/Jared Young)", () => {
    const r = compareRosterDates(
      [tx("2026-08-30", "Los Doyers", "JYoung", "Add to Actives", "ADD", "08.30 @ 12:37"), tx("2026-05-17", "Los Doyers", "JYoung", "Add to Actives", "ADD", "05.17 @ 12:11")],
      [stint("Los Doyers", "Jacob Young", "2026-05-17", null), stint("Los Doyers", "Jared Young", "2026-08-30", null)],
      W,
    );
    expect(r).toMatchObject({ matched: 2, duplicatesMerged: 0, pass: true });
  });
});
