import { describe, expect, it } from "vitest";
import type { SeasonLine } from "../mlbFacts.js";
import {
  buildCandidate, canChangeDecision, CLOSE_CALL_RATIO, decisionError, decisionResolution, defaultResolution,
  formatInnings, importedDecision, planSeasonLoad, playingTime, rankCandidates, stableStringify, suggest, toMatchRow, unresolvedStatus,
  type ExistingMatchRow, type MatchRowData, type ReviewCandidate, type ReviewRecord,
} from "../playerReview.js";

const line = (over: Partial<SeasonLine>): SeasonLine =>
  ({ g: 0, pa: 0, hr: 0, avg: "", r: 0, rbi: 0, sb: 0, ip: 0, w: 0, sv: 0, k: 0, era: "", ...over });

const cand = (mlbId: number, eligibleSlots: number, time: number, over: Partial<ReviewCandidate> = {}): ReviewCandidate =>
  ({ mlbId, name: `Player ${mlbId}`, line: line({ pa: time }), playingTime: time, eligibleSlots, checks: [], ...over });

const hitterFacts = { games: { SS: 150 }, priorGames: {}, primaryPosition: "SS", careerAbBefore: 2000, careerIpBefore: 0 };

describe("playingTime", () => {
  it("is innings for a pitcher slot and plate appearances for a hitter slot", () => {
    const l = line({ pa: 72, ip: 201.5 });
    expect(playingTime(l, "P")).toBe(201.5);
    expect(playingTime(l, "H")).toBe(72);
  });
  it("takes the larger for an IL / rookie-spot name, which can be either", () => {
    expect(playingTime(line({ pa: 600, ip: 0 }), "X")).toBe(600);
    expect(playingTime(line({ pa: 10, ip: 100 }), "X")).toBe(300);
  });
  it("is zero with no line", () => {
    expect(playingTime(null, "H")).toBe(0);
  });
});

describe("formatInnings", () => {
  it("writes thirds as outs, the way a box score does", () => {
    expect(formatInnings(186 + 1 / 3)).toBe("186.1");
    expect(formatInnings(126 + 2 / 3)).toBe("126.2");
    expect(formatInnings(125)).toBe("125.0");
    expect(formatInnings(0)).toBe("0.0");
  });
  it("does not lose an out to floating point", () => {
    expect(formatInnings(201.66666666666666)).toBe("201.2");
    expect(formatInnings(61 + 2 / 3 + 6)).toBe("67.2");
  });
});

describe("buildCandidate", () => {
  it("checks every slot the name held and counts the eligible ones", () => {
    const c = buildCandidate({ mlbId: 7, name: "Alex Gonzalez" }, ["SS", "1B"], "H", hitterFacts, line({ pa: 601 }));
    expect(c.checks.map((x) => [x.slot, x.eligible])).toEqual([["SS", true], ["1B", false]]);
    expect(c.eligibleSlots).toBe(1);
    expect(c.playingTime).toBe(601);
    expect(c).not.toHaveProperty("note");
  });
  it("carries the reason a non-matching spelling is offered", () => {
    const c = buildCandidate({ mlbId: 7, name: "Brad Hawpe", note: "wrong first initial" }, ["SS"], "H", hitterFacts, null);
    expect(c.note).toBe("wrong first initial");
  });
});

describe("ranking and the suggestion", () => {
  it("puts the most eligible first, then whoever played more", () => {
    const ranked = rankCandidates([cand(1, 1, 50), cand(2, 2, 10), cand(3, 2, 400), cand(4, 0, 900)]);
    expect(ranked.map((c) => c.mlbId)).toEqual([3, 2, 1, 4]);
  });

  it("suggests the only fully eligible candidate", () => {
    const ranked = rankCandidates([cand(1, 1, 700), cand(2, 0, 900)]);
    expect(suggest(ranked, 1, "H")).toEqual({ mlbId: 1, why: "the only one eligible for every slot", closeCall: false });
    expect(unresolvedStatus(ranked, 1)).toBe("SUGGESTED");
  });

  it("with two eligible, suggests the one who played more and leaves the name open", () => {
    const ranked = rankCandidates([cand(1, 1, 304), cand(2, 1, 599)]);
    expect(suggest(ranked, 1, "H")).toEqual({ mlbId: 2, why: "eligible and played the most (599 PA)", closeCall: false });
    expect(unresolvedStatus(ranked, 1)).toBe("OPEN");
  });

  it("calls it close when the runner-up played at least 85% as much", () => {
    expect(CLOSE_CALL_RATIO).toBe(0.85);
    expect(suggest(rankCandidates([cand(1, 1, 1000), cand(2, 1, 850)]), 1, "H")!.closeCall).toBe(true);
    expect(suggest(rankCandidates([cand(1, 1, 1000), cand(2, 1, 849)]), 1, "H")!.closeCall).toBe(false);
  });

  it("is not a close call against a less eligible runner-up, or when nobody played", () => {
    expect(suggest(rankCandidates([cand(1, 2, 100), cand(2, 1, 100)]), 2, "H")!.closeCall).toBe(false);
    expect(suggest(rankCandidates([cand(1, 1, 0), cand(2, 1, 0)]), 1, "H")!.closeCall).toBe(false);
  });

  it("says so when no candidate is eligible", () => {
    const s = suggest(rankCandidates([cand(1, 0, 20), cand(2, 0, 300)]), 1, "H")!;
    expect(s).toEqual({ mlbId: 2, why: "none eligible; most playing time (300 PA)", closeCall: false });
  });

  it("quotes innings for a pitcher slot, and for a pitcher on an IL / rookie-spot name", () => {
    const pitcher = cand(1, 1, 186 + 1 / 3, { line: line({ ip: 186 + 1 / 3 }) });
    const other = cand(2, 1, 10, { line: line({ ip: 10 }) });
    expect(suggest([pitcher, other], 1, "P")!.why).toBe("eligible and played the most (186.1 IP)");
    expect(suggest([{ ...pitcher, playingTime: 559 }, other], 1, "X")!.why).toBe("eligible and played the most (186.1 IP)");
  });

  it("suggests nobody when there are no candidates", () => {
    expect(suggest([], 1, "H")).toBeNull();
    expect(unresolvedStatus([], 1)).toBe("OPEN");
  });
});

const record = (over: Partial<ReviewRecord>): ReviewRecord => ({
  key: "2004|MNB|j|wright|P", year: 2004, team: "MNB", role: "P", names: ["J. Wright"], slots: ["P"], seenIn: ["final"],
  keptFromSlot: null, status: "OPEN", match: null, candidates: [], suggestion: null, ...over,
});

describe("toMatchRow", () => {
  it("stores the matcher's player and his checks for a matched name", () => {
    const row = toMatchRow(record({
      status: "FLAGGED",
      match: { mlbId: 405395, name: "Albert Pujols", how: "exact", beat: "X by NL", checks: [{ slot: "3B", eligible: false, reason: "no" }], line: line({ pa: 692 }) },
    }));
    expect(row).toMatchObject({ key: "2004|MNB|j|wright|P", teamCode: "MNB", role: "P", status: "FLAGGED", autoMlbId: 405395, autoName: "Albert Pujols" });
    expect(row.detail).toEqual({
      keptFromSlot: null, how: "exact", beat: "X by NL", checks: [{ slot: "3B", eligible: false, reason: "no" }],
      line: line({ pa: 692 }), candidates: [], suggestion: null,
    });
  });

  it("stores candidates and no player for an unsettled name", () => {
    const candidates = [cand(124605, 1, 186), cand(124604, 1, 78)];
    const row = toMatchRow(record({ candidates, suggestion: { mlbId: 124605, why: "w", closeCall: false }, keptFromSlot: "P" }));
    expect(row.autoMlbId).toBeNull();
    expect(row.autoName).toBeNull();
    expect(row.detail).toEqual({ keptFromSlot: "P", how: null, checks: [], line: null, candidates, suggestion: { mlbId: 124605, why: "w", closeCall: false } });
  });
});

describe("who a name resolves to with no decision", () => {
  it("is the matcher's player when the name fits one person (verified or flagged)", () => {
    expect(defaultResolution({ status: "VERIFIED", autoMlbId: 5, autoName: "A" })).toEqual({ mlbId: 5, mlbName: "A" });
    expect(defaultResolution({ status: "FLAGGED", autoMlbId: 5, autoName: "A" })).toEqual({ mlbId: 5, mlbName: "A" });
  });
  it("is unknown until someone picks, for suggested and open names", () => {
    expect(defaultResolution({ status: "SUGGESTED", autoMlbId: null, autoName: null })).toEqual({ mlbId: null, mlbName: null });
    expect(defaultResolution({ status: "OPEN", autoMlbId: null, autoName: null })).toEqual({ mlbId: null, mlbName: null });
  });
});

describe("decisions", () => {
  const flagged = { status: "FLAGGED" as const, autoMlbId: 5, autoName: "Albert Pujols" };
  const open = { status: "OPEN" as const, autoMlbId: null, autoName: null };

  it("a pick resolves to the picked player on any unsettled name", () => {
    const pick = { decision: "PICK" as const, mlbId: 9, name: "Jaret Wright" };
    expect(decisionError(open, pick)).toBeNull();
    expect(decisionError(flagged, pick)).toBeNull();
    expect(decisionResolution(open, pick)).toEqual({ mlbId: 9, mlbName: "Jaret Wright" });
  });

  it("an exception keeps the flagged player; wrong and none leave the name unknown", () => {
    expect(decisionResolution(flagged, { decision: "EXCEPTION" })).toEqual({ mlbId: 5, mlbName: "Albert Pujols" });
    expect(decisionResolution(flagged, { decision: "WRONG" })).toEqual({ mlbId: null, mlbName: null });
    expect(decisionResolution(open, { decision: "NONE" })).toEqual({ mlbId: null, mlbName: null });
  });

  it("refuses an exception or 'wrong' where there is no matched player", () => {
    expect(decisionError(open, { decision: "EXCEPTION" })).toMatch(/no matched player/);
    expect(decisionError(open, { decision: "WRONG" })).toMatch(/no matched player/);
  });

  it("refuses 'none of these' on a matched player (that is 'wrong player')", () => {
    expect(decisionError(flagged, { decision: "NONE" })).toMatch(/Wrong player/);
    expect(decisionError(open, { decision: "NONE" })).toBeNull();
  });

  it("refuses any decision on a verified name", () => {
    const verified = { status: "VERIFIED" as const, autoMlbId: 5, autoName: "A" };
    for (const input of [{ decision: "PICK" as const, mlbId: 9, name: "B" }, { decision: "EXCEPTION" as const }, { decision: "WRONG" as const }, { decision: "NONE" as const }]) {
      expect(decisionError(verified, input)).toMatch(/already verified/);
    }
  });
});

describe("who may change a decision", () => {
  it("an admin may always", () => {
    expect(canChangeDecision({ isAdmin: true }, { decision: "PICK", decidedByAdmin: true })).toBe(true);
  });
  it("a member may decide an undecided name and revise another member's decision", () => {
    expect(canChangeDecision({ isAdmin: false }, { decision: null, decidedByAdmin: false })).toBe(true);
    expect(canChangeDecision({ isAdmin: false }, { decision: "PICK", decidedByAdmin: false })).toBe(true);
  });
  it("a member may not change what an admin decided", () => {
    expect(canChangeDecision({ isAdmin: false }, { decision: "PICK", decidedByAdmin: true })).toBe(false);
  });
});

describe("stableStringify", () => {
  it("ignores key order at every depth (jsonb reorders keys) but not array order", () => {
    expect(stableStringify({ b: 1, a: { d: [1, { y: 1, x: 2 }], c: null } })).toBe(stableStringify({ a: { c: null, d: [1, { x: 2, y: 1 }] }, b: 1 }));
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });
  it("treats an undefined key as absent", () => {
    expect(stableStringify({ a: 1, note: undefined })).toBe(stableStringify({ a: 1 }));
  });
});

describe("planSeasonLoad", () => {
  const row = (key: string, over: Partial<MatchRowData> = {}): MatchRowData => ({
    key, teamCode: "MNB", role: "P", names: ["J. Wright"], slots: ["P"], seenIn: ["final"], status: "OPEN",
    autoMlbId: null, autoName: null,
    detail: { keptFromSlot: null, how: null, checks: [], line: null, candidates: [cand(1, 1, 10)], suggestion: null },
    ...over,
  });
  const stored = (id: number, r: MatchRowData, over: Partial<ExistingMatchRow> = {}): ExistingMatchRow =>
    ({ id, ...r, decision: null, mlbId: null, mlbName: null, ...over });
  const verified = (key: string) => row(key, { status: "VERIFIED", autoMlbId: 5, autoName: "A" });

  it("creates a new name already resolved to its default", () => {
    const plan = planSeasonLoad([verified("k1"), row("k2")], []);
    expect(plan.create.map((c) => [c.key, c.mlbId, c.mlbName])).toEqual([["k1", 5, "A"], ["k2", null, null]]);
    expect(plan.update).toEqual([]);
  });

  it("leaves an identical row alone even when the stored JSON comes back with its keys reordered", () => {
    const next = row("k1");
    const reordered = { suggestion: null, candidates: next.detail.candidates.map((c) => ({ checks: c.checks, name: c.name, mlbId: c.mlbId, playingTime: c.playingTime, line: c.line, eligibleSlots: c.eligibleSlots })), line: null, checks: [], how: null, keptFromSlot: null };
    const plan = planSeasonLoad([next], [stored(1, { ...next, detail: reordered as MatchRowData["detail"] })]);
    expect(plan).toMatchObject({ create: [], update: [], remove: [], unchanged: 1 });
  });

  it("updates an undecided row and re-resolves it when the audit changes its status", () => {
    const next = verified("k1");
    const plan = planSeasonLoad([next], [stored(7, row("k1"))]);
    expect(plan.update).toEqual([{ id: 7, data: next, resolved: { mlbId: 5, mlbName: "A" } }]);
  });

  it("never touches the resolution of a decided row, even when the audit changes around it", () => {
    const next = verified("k1");
    const plan = planSeasonLoad([next], [stored(7, row("k1"), { decision: "PICK", mlbId: 9, mlbName: "Jaret Wright" })]);
    expect(plan.update).toEqual([{ id: 7, data: next, resolved: null }]);
    expect(plan.disagreements).toEqual(["k1: decided Jaret Wright (9), the matcher now says A (5)"]);
  });

  it("does not rewrite a decided row whose audit data is unchanged", () => {
    const next = row("k1");
    const plan = planSeasonLoad([next], [stored(7, next, { decision: "PICK", mlbId: 9, mlbName: "Jaret Wright" })]);
    expect(plan).toMatchObject({ update: [], unchanged: 1, disagreements: [] });
  });

  it("repairs an undecided row whose stored resolution has drifted from its default", () => {
    const next = verified("k1");
    const plan = planSeasonLoad([next], [stored(7, next, { mlbId: null, mlbName: null })]);
    expect(plan.update).toEqual([{ id: 7, data: next, resolved: { mlbId: 5, mlbName: "A" } }]);
  });

  it("removes a name the audit dropped — unless someone decided it", () => {
    const plan = planSeasonLoad([], [stored(1, row("gone")), stored(2, row("kept"), { decision: "NONE" })]);
    expect(plan.remove).toEqual([1]);
    expect(plan.orphanedDecisions).toEqual(["kept"]);
  });
});

describe("importedDecision (picks made on the earlier review page)", () => {
  const open = { status: "OPEN" as const, autoMlbId: null, autoName: null };
  const flagged = { status: "FLAGGED" as const, autoMlbId: 405395, autoName: "Albert Pujols" };

  it("turns a saved pick into a PICK", () => {
    expect(importedDecision(open, { key: "k", decision: "pick", mlbId: 124605, name: "Jaret Wright" }))
      .toEqual({ input: { decision: "PICK", mlbId: 124605, name: "Jaret Wright" } });
  });
  it("accepts an exception only for the player it was made about", () => {
    expect(importedDecision(flagged, { key: "k", decision: "exception", mlbId: 405395, name: "Albert Pujols" })).toEqual({ input: { decision: "EXCEPTION" } });
    expect(importedDecision(flagged, { key: "k", decision: "exception", mlbId: 1, name: "Someone Else" })).toEqual({ error: "exception was for player 1, the match is now 405395" });
  });
  it("reports a pick with no player, an unknown kind, and a decision the name can't take", () => {
    expect(importedDecision(open, { key: "k", decision: "pick", mlbId: null, name: null })).toEqual({ error: "pick has no player" });
    expect(importedDecision(open, { key: "k", decision: "maybe", mlbId: null, name: null })).toEqual({ error: 'unknown decision "maybe"' });
    expect(importedDecision({ status: "VERIFIED", autoMlbId: 5, autoName: "A" }, { key: "k", decision: "none", mlbId: null, name: null })).toEqual({ error: "This player is already verified." });
  });
});
