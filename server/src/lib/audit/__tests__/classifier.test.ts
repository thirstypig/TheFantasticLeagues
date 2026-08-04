// server/src/lib/audit/__tests__/classifier.test.ts
import { describe, it, expect } from "vitest";
import { classifyTeamDelta } from "../classifier.js";
import { emptyStatLine, type StatLine } from "../types.js";

function line(p: Partial<StatLine>): StatLine {
  return { ...emptyStatLine(), ...p };
}

describe("classifyTeamDelta", () => {
  it("reports the whole gap as residual when there are no candidates", () => {
    // The production path. Every caller passes [] — see classifier.ts header.
    const got = classifyTeamDelta({
      teamName: "Skunk Dogs",
      fbstTotals: line({ SB: 122 }),
      fgTotals: line({ SB: 124 }),
      candidates: [],
    });
    expect(got.explained.SB ?? 0).toBe(0);
    expect(got.residual.SB).toBe(-2);
  });

  it("reports an exact reconciliation as an explicit 0, not an absent key", () => {
    // `undefined` would render as "unknown" downstream and let decideVerdict
    // read a clean category as unchecked.
    const got = classifyTeamDelta({
      teamName: "Dodger Dawgs",
      fbstTotals: line({ R: 713, HR: 167 }),
      fgTotals: line({ R: 713, HR: 167 }),
      candidates: [],
    });
    expect(got.residual.R).toBe(0);
    expect(got.residual.HR).toBe(0);
    expect(Object.prototype.hasOwnProperty.call(got.residual, "R")).toBe(true);
  });

  it("sums multiple candidates into explained and closes the delta", () => {
    const got = classifyTeamDelta({
      teamName: "Demolition Lumber Co",
      fbstTotals: line({ HR: 164 }),
      fgTotals: line({ HR: 167 }),
      candidates: [
        { playerId: 1, playerName: "Player A", cause: "partial_ownership",
          expected: { HR: 2 }, evidence: "synthetic" },
        { playerId: 2, playerName: "Player B", cause: "partial_ownership",
          expected: { HR: 1 }, evidence: "synthetic" },
      ],
    });
    expect(got.explained.HR).toBe(3);
    expect(got.residual.HR).toBe(0);
  });

  it("keeps an unexplained remainder as residual instead of absorbing it", () => {
    // The anti-overfit property. FBST 637 + explained 7 = 644, FG 646 -> -2.
    const got = classifyTeamDelta({
      teamName: "Demolition Lumber Co",
      fbstTotals: line({ RBI: 637 }),
      fgTotals: line({ RBI: 646 }),
      candidates: [
        { playerId: 1, playerName: "Player A", cause: "partial_ownership",
          expected: { RBI: 2 }, evidence: "synthetic" },
        { playerId: 2, playerName: "Player B", cause: "partial_ownership",
          expected: { RBI: 5 }, evidence: "synthetic" },
      ],
    });
    expect(got.explained.RBI).toBe(7);
    expect(got.residual.RBI).toBe(-2);
  });

  it("never lets explained exceed the observed gap silently", () => {
    // An over-large candidate must flip residual positive and stay visible,
    // not be clamped to zero.
    const got = classifyTeamDelta({
      teamName: "Devil Dawgs",
      fbstTotals: line({ R: 100 }),
      fgTotals: line({ R: 101 }),
      candidates: [
        { playerId: 7, playerName: "Overclaim", cause: "partial_ownership",
          expected: { R: 50 }, evidence: "synthetic" },
      ],
    });
    expect(got.residual.R).toBe(49);
  });

  it("manufactures a residual when a candidate explains a gap that does not exist", () => {
    // THE FALSIFICATION SYMPTOM, pinned as a regression. This is exactly what
    // the deleted buildIlCandidates did to six already-reconciling teams on
    // 2026-08-03: FBST and FG agreed, a phantom explanation was added, and
    // `explained` and `residual` printed as identical columns.
    //
    // The arithmetic here is correct and must NOT be "fixed" by clamping —
    // the visible bogus residual is the signal that the candidate is wrong.
    // If a future producer makes this shape appear in a real run, the
    // producer is wrong, not this function.
    const got = classifyTeamDelta({
      teamName: "Already Reconciling FC",
      fbstTotals: line({ R: 500 }),
      fgTotals: line({ R: 500 }),
      candidates: [
        { playerId: 3, playerName: "Phantom", cause: "partial_ownership",
          expected: { R: 12 }, evidence: "synthetic" },
      ],
    });
    expect(got.explained.R).toBe(12);
    expect(got.residual.R).toBe(12);
    expect(got.residual.R).toBe(got.explained.R); // the tell
  });
});
