// server/src/lib/audit/__tests__/classifier.test.ts
import { describe, it, expect } from "vitest";
import { buildIlCandidates, classifyTeamDelta } from "../classifier.js";
import { emptyStatLine, type StatLine } from "../types.js";

function line(p: Partial<StatLine>): StatLine {
  return { ...emptyStatLine(), ...p };
}

// Golden fixture — real, three-source-verified data from 2026-08-03.
// Acuna: IL_STASH 07-05, IL_ACTIVATE 08-02; Period 5 ran 07-05 -> 08-01.
// His P5 PSP (R5/HR2/RBI2/SB0/AB22) was confirmed identical in FBST,
// MLB statsapi, and Baseball Reference.
const PERIOD_5 = {
  id: 39,
  startDate: new Date("2026-07-05T00:00:00Z"),
  endDate: new Date("2026-08-01T00:00:00Z"),
};
const ACUNA_P5 = line({ R: 5, HR: 2, RBI: 2, SB: 0, AB: 22 });

describe("buildIlCandidates", () => {
  it("flags a player IL-stashed at period start as an expected divergence", () => {
    const got = buildIlCandidates({
      teamName: "Demolition Lumber Co",
      period: PERIOD_5,
      ilWindows: [{
        playerId: 1, playerName: "Ronald Acuña Jr.",
        start: new Date("2026-07-05T00:00:00Z"),
        end: new Date("2026-08-02T00:00:00Z"),
      }],
      pspByPlayer: new Map([[1, ACUNA_P5]]),
    });

    expect(got).toHaveLength(1);
    expect(got[0]!.cause).toBe("il_exclusion");
    expect(got[0]!.expected.R).toBe(5);
    expect(got[0]!.evidence).toMatch(/IL/i);
  });

  it("ignores an IL window that starts AFTER the period began", () => {
    // FBST excludes on IL-at-period-START, not any IL overlap.
    const got = buildIlCandidates({
      teamName: "Demolition Lumber Co",
      period: PERIOD_5,
      ilWindows: [{
        playerId: 1, playerName: "Ronald Acuña Jr.",
        start: new Date("2026-07-20T00:00:00Z"), end: null,
      }],
      pspByPlayer: new Map([[1, ACUNA_P5]]),
    });
    expect(got).toHaveLength(0);
  });

  it("produces NO candidate when the IL window closes exactly at the period start", () => {
    // Boundary equality on the other end of the window. The predicate is
    // `end === null || end > period.startDate`, so a player activated exactly at
    // the period start was NOT on IL for that period and must not be excluded.
    // Flipping `>` to `>=` would wrongly drop his whole period from the team's
    // total while quietly reporting it as "explained by IL" — a divergence
    // invented rather than derived, which is the one thing this file must never do.
    const got = buildIlCandidates({
      teamName: "Demolition Lumber Co",
      period: PERIOD_5,
      ilWindows: [{
        playerId: 1, playerName: "Ronald Acuña Jr.",
        start: new Date("2026-06-01T00:00:00Z"),
        end: new Date("2026-07-05T00:00:00Z"), // == PERIOD_5.startDate
      }],
      pspByPlayer: new Map([[1, ACUNA_P5]]),
    });
    expect(got).toHaveLength(0);
  });

  it("produces no candidate when the player has no PSP row", () => {
    const got = buildIlCandidates({
      teamName: "Demolition Lumber Co",
      period: PERIOD_5,
      ilWindows: [{
        playerId: 99, playerName: "Nobody",
        start: new Date("2026-07-05T00:00:00Z"), end: null,
      }],
      pspByPlayer: new Map(),
    });
    expect(got).toHaveLength(0);
  });
});

describe("classifyTeamDelta", () => {
  it("closes a delta fully explained by the IL window", () => {
    const got = classifyTeamDelta({
      teamName: "Demolition Lumber Co",
      fbstTotals: line({ HR: 164 }),
      fgTotals: line({ HR: 167 }),
      candidates: [
        { playerId: 1, playerName: "Ronald Acuña Jr.", cause: "il_exclusion",
          expected: { HR: 2 }, evidence: "IL 07-05..08-02" },
        { playerId: 2, playerName: "Andrew Vaughn", cause: "il_exclusion",
          expected: { HR: 1 }, evidence: "IL 04-19..05-17" },
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
        { playerId: 1, playerName: "Ronald Acuña Jr.", cause: "il_exclusion",
          expected: { RBI: 2 }, evidence: "IL 07-05..08-02" },
        { playerId: 2, playerName: "Andrew Vaughn", cause: "il_exclusion",
          expected: { RBI: 5 }, evidence: "IL 04-19..05-17" },
      ],
    });
    expect(got.explained.RBI).toBe(7);
    expect(got.residual.RBI).toBe(-2);
  });

  it("reports the whole gap as residual when there are no candidates", () => {
    const got = classifyTeamDelta({
      teamName: "Skunk Dogs",
      fbstTotals: line({ SB: 122 }),
      fgTotals: line({ SB: 124 }),
      candidates: [],
    });
    expect(got.explained.SB ?? 0).toBe(0);
    expect(got.residual.SB).toBe(-2);
  });

  it("never lets explained exceed the observed gap silently", () => {
    // An over-large candidate must flip residual positive and stay visible,
    // not be clamped to zero.
    const got = classifyTeamDelta({
      teamName: "Devil Dawgs",
      fbstTotals: line({ R: 100 }),
      fgTotals: line({ R: 101 }),
      candidates: [
        { playerId: 7, playerName: "Overclaim", cause: "il_exclusion",
          expected: { R: 50 }, evidence: "synthetic" },
      ],
    });
    expect(got.residual.R).toBe(49);
  });
});
