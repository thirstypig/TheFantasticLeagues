import { describe, expect, it } from "vitest";
import { buildSeasonView, type SeasonViewInput } from "../seasonView.js";

type Entry = SeasonViewInput["entries"][number];
const e = (teamCode: string, kind: Entry["kind"], periodNumber: number | null, slot: string, playerName: string, over: Partial<Entry> = {}): Entry =>
  ({ teamCode, kind, periodNumber, slot, playerName, salary: null, salaryNote: null, isKeeper: false, ...over });

const teams: SeasonViewInput["teams"] = [
  { code: "MNB", name: "MoneyBall", ownerName: "Mike Gin", recordedPeriodPoints: [40, 44.5], recordedTotal: 289, note: null },
  { code: "DDG", name: "Dodger Dawgs", ownerName: "Kurt Sakamoto", recordedPeriodPoints: [72.5, 42], recordedTotal: 394.5, note: "Total row 394.5 ≠ standings block 349.5." },
  { code: "LDY", name: "Los Doyers", ownerName: "James Chang", recordedPeriodPoints: [50, 50], recordedTotal: 289, note: null },
];

const entries: Entry[] = [
  e("DDG", "SALARIES", null, "C", "Should Not Appear"),
  e("DDG", "DRAFT", null, "C", "B. Posey", { salary: 25, isKeeper: true }),
  e("DDG", "DRAFT", null, "P", "J. Soto", { salaryNote: "AL" }),
  e("DDG", "PERIOD", 1, "C", "B. Posey"),
  e("DDG", "PERIOD", 1, "P", "J. Soto"),
  e("DDG", "PERIOD", 2, "C", "B. Posey"),
  e("DDG", "PERIOD", 2, "3B", "R. Roberts"),
  e("DDG", "PERIOD", 3, "C", "B. Posey"),
  e("DDG", "PERIOD", 3, "3B", "R.  Roberts"), // respelled, not a move
  e("DDG", "FINAL", null, "C", "B. Posey"),
  e("MNB", "DRAFT", null, "P", "J. Wright"),
  e("MNB", "PERIOD", 1, "P", "J. Wright"),
  e("MNB", "PERIOD", 2, "P", "J. Wright"),
  e("MNB", "PERIOD", 3, "P", "J. Wright"),
];

const matches = new Map([
  ["2012|DDG|b|posey|H", { mlbId: 457763, mlbName: "Buster Posey" }],
  ["2012|MNB|j|wright|P", { mlbId: null, mlbName: null }], // on the player check, undecided
]);

const periodEnds = ["2012-05-06", "2012-06-03", ""];
const view = buildSeasonView({ year: 2012, keepersFromSheet: true, periodEnds, teams, entries, matches });

describe("buildSeasonView", () => {
  it("orders teams by finish from the recorded totals; tied totals share a place", () => {
    expect(view.teams.map((t) => [t.code, t.rank])).toEqual([["DDG", 1], ["LDY", 2], ["MNB", 2]]);
    expect(view.teams[0]).toMatchObject({ owner: "Kurt Sakamoto", name: "Dodger Dawgs", points: [72.5, 42], total: 394.5, note: "Total row 394.5 ≠ standings block 349.5." });
    expect(view.periodCount).toBe(2);
  });

  it("gives each team its draft and final roster, never the salaries sheet", () => {
    expect(view.rosters.DDG.draft.map((x) => x.name)).toEqual(["B. Posey", "J. Soto"]);
    expect(view.rosters.DDG.final.map((x) => x.name)).toEqual(["B. Posey"]);
    expect(view.rosters.LDY).toEqual({ draft: [], final: [] });
  });

  it("names a player by his MLB name once the player check settled him", () => {
    expect(view.rosters.DDG.draft[0]).toEqual({ slot: "C", name: "B. Posey", mlbId: 457763, mlbName: "Buster Posey", price: 25, priceNote: null, keeper: true });
    expect(view.rosters.DDG.draft[1]).toMatchObject({ mlbId: null, mlbName: null, priceNote: "AL", keeper: false });
    expect(view.rosters.MNB.draft[0]).toMatchObject({ mlbId: null, mlbName: null });
  });

  it("works out the moves at each meeting, dated, ignoring a respelled name; the final roster is the last period", () => {
    expect(view.hasMoves).toBe(true);
    expect(view.moves.map((m) => [m.period, m.meetingDate])).toEqual([[1, null], [2, "2012-05-06"], [3, "2012-06-03"], [4, null]]);
    expect(view.moves[0].byTeam.DDG).toEqual({ added: [], dropped: [] }); // first sheet = the draft
    expect(view.moves[1].byTeam.DDG.added.map((x) => x.name)).toEqual(["R. Roberts"]);
    expect(view.moves[1].byTeam.DDG.dropped.map((x) => x.name)).toEqual(["J. Soto"]);
    expect(view.moves[2].byTeam.DDG).toEqual({ added: [], dropped: [] });
    expect(view.moves[3].byTeam.DDG.dropped.map((x) => x.name)).toEqual(["R.  Roberts"]);
    expect(view.moves[3].byTeam.MNB.dropped.map((x) => x.name)).toEqual(["J. Wright"]);
    expect(view.periodEnds).toEqual(["2012-05-06", "2012-06-03", null]);
  });

  it("reports no moves when the meeting rosters are missing or have a gap", () => {
    const noPeriods = buildSeasonView({ year: 2003, keepersFromSheet: false, periodEnds: [], teams, entries: entries.filter((x) => x.kind !== "PERIOD"), matches });
    expect(noPeriods.hasMoves).toBe(false);
    expect(noPeriods.moves).toEqual([]);
    const gap = buildSeasonView({ year: 2015, keepersFromSheet: false, periodEnds, teams, entries: entries.filter((x) => x.periodNumber !== 2), matches });
    expect(gap.hasMoves).toBe(false);
  });

  it("passes the keepers source through", () => {
    expect(view.keepersFromSheet).toBe(true);
  });
});
