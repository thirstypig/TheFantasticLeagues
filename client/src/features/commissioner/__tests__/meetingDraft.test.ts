import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  emptyDraft, draftKey, loadDraft, saveDraft, clearDraft, addMove, updateMove,
  removeMove, setMark, completeMoves, flagMoves, teamCountAfter,
  type DraftPlayer, type MeetingDraft,
} from "../lib/meetingDraft";

const p = (id: number, name = `P${id}`): DraftPlayer => ({ playerId: id, name, pos: "OF", mlbTeam: "LAD", mlbId: 1000 + id });
const names = { 1: "Bombers", 2: "Doyers" };

function withMove(d: MeetingDraft, teamId: number, add: DraftPlayer | null, drop: DraftPlayer | null): MeetingDraft {
  const a = addMove(d, teamId);
  return updateMove(a, a.moves[a.moves.length - 1].id, { add, drop });
}

describe("meetingDraft pure model", () => {
  it("emptyDraft shape", () => {
    expect(emptyDraft(20, 7)).toEqual({ leagueId: 20, periodId: 7, moves: [], marks: {}, selectedTeamId: null });
    expect(draftKey(20, 7)).toBe("fbst.meetingDraft.v1.20.7");
  });

  it("addMove/updateMove/removeMove/setMark do not mutate", () => {
    const d0 = emptyDraft(1, 1);
    const snap = JSON.stringify(d0);
    const d1 = addMove(d0, 5);
    expect(JSON.stringify(d0)).toBe(snap);
    expect(d1.moves).toHaveLength(1);
    expect(d1.moves[0]).toMatchObject({ teamId: 5, add: null, drop: null });
    const snap1 = JSON.stringify(d1);
    const d2 = updateMove(d1, d1.moves[0].id, { add: p(1), error: "x" });
    expect(JSON.stringify(d1)).toBe(snap1);
    expect(d2.moves[0].add?.playerId).toBe(1);
    expect(d2.moves[0].error).toBe("x");
    const d3 = setMark(d2, 5, "passed");
    expect(d2.marks).toEqual({});
    expect(d3.marks).toEqual({ 5: "passed" });
    expect(setMark(d3, 5, null).marks).toEqual({});
    expect(d3.marks).toEqual({ 5: "passed" });
    const d4 = removeMove(d3, d3.moves[0].id);
    expect(d3.moves).toHaveLength(1);
    expect(d4.moves).toHaveLength(0);
  });

  it("completeMoves keeps only add+drop moves", () => {
    let d = emptyDraft(1, 1);
    d = withMove(d, 1, p(1), p(2));
    d = withMove(d, 1, p(3), null);
    d = withMove(d, 1, null, p(4));
    expect(completeMoves(d)).toHaveLength(1);
  });

  it("flags incomplete moves", () => {
    let d = emptyDraft(1, 1);
    d = withMove(d, 1, p(1), null);
    d = withMove(d, 1, null, p(2));
    const f = flagMoves(d, names);
    expect(f.map((x) => x.message)).toEqual(["Needs a drop", "Needs an add"]);
    expect(f[0].moveId).toBe(d.moves[0].id);
  });

  it("flags the same add on two moves (later one)", () => {
    let d = emptyDraft(1, 1);
    d = withMove(d, 1, p(9), p(2));
    d = withMove(d, 2, p(9), p(3));
    const f = flagMoves(d, names);
    expect(f).toEqual([{ moveId: d.moves[1].id, message: "Already added by Bombers tonight" }]);
  });

  it("flags dropping a player added tonight by the same team", () => {
    let d = emptyDraft(1, 1);
    d = withMove(d, 1, p(9, "Smith"), p(2));
    d = withMove(d, 1, p(8), p(9, "Smith"));
    const f = flagMoves(d, names);
    expect(f).toEqual([{ moveId: d.moves[1].id, message: "Smith was added tonight and can't be dropped" }]);
  });

  it("flags the same drop twice (later one)", () => {
    let d = emptyDraft(1, 1);
    d = withMove(d, 1, p(8), p(2, "Jones"));
    d = withMove(d, 1, p(9), p(2, "Jones"));
    const f = flagMoves(d, names);
    expect(f).toEqual([{ moveId: d.moves[1].id, message: "Jones is already being dropped" }]);
  });

  it("no flags for a clean draft", () => {
    expect(flagMoves(withMove(emptyDraft(1, 1), 1, p(1), p(2)), names)).toEqual([]);
  });

  it("teamCountAfter counts complete moves only", () => {
    let d = withMove(emptyDraft(1, 1), 1, p(1), p(2));
    expect(teamCountAfter(23, d, 1)).toBe(23);
    d = withMove(d, 1, p(3), null);
    expect(teamCountAfter(23, d, 1)).toBe(23);
    expect(teamCountAfter(23, d, 2)).toBe(23);
  });
});

describe("meetingDraft storage", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("round trips and clears", () => {
    const d = setMark(withMove(emptyDraft(3, 4), 1, p(1), p(2)), 2, "done");
    saveDraft(d);
    expect(loadDraft(3, 4)).toEqual(d);
    clearDraft(3, 4);
    expect(loadDraft(3, 4)).toEqual(emptyDraft(3, 4));
  });

  it("returns emptyDraft for corrupt JSON, mismatched ids, bad moves", () => {
    localStorage.setItem(draftKey(3, 4), "{nope");
    expect(loadDraft(3, 4)).toEqual(emptyDraft(3, 4));
    localStorage.setItem(draftKey(3, 4), JSON.stringify({ ...emptyDraft(9, 9) }));
    expect(loadDraft(3, 4)).toEqual(emptyDraft(3, 4));
    localStorage.setItem(draftKey(3, 4), JSON.stringify({ ...emptyDraft(3, 4), moves: "x" }));
    expect(loadDraft(3, 4)).toEqual(emptyDraft(3, 4));
  });

  it("returns emptyDraft when getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    expect(loadDraft(3, 4)).toEqual(emptyDraft(3, 4));
  });

  it("saveDraft/clearDraft swallow storage errors", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("denied"); });
    expect(() => saveDraft(emptyDraft(3, 4))).not.toThrow();
    expect(() => clearDraft(3, 4)).not.toThrow();
  });
});
