// server/src/lib/audit/__tests__/coverageGaps.test.ts
import { describe, it, expect } from "vitest";
import { computeTeamPeriodTotals, findCoverageGaps, isInPeriodWindow, type RosterStint } from "../fbstTotals.js";
import { emptyStatLine, type StatLine } from "../types.js";

const PERIOD = {
  id: 39,
  name: "Period 5",
  startDate: new Date("2026-07-05T00:00:00Z"),
  endDate: new Date("2026-08-01T00:00:00Z"),
};

const TEAMS = [{ id: 1, name: "Demolition Lumber Co" }];
const never = () => false;

function stint(p: Partial<RosterStint> & { playerId: number }): RosterStint {
  return {
    teamId: 1,
    acquiredAt: new Date("2026-01-01T00:00:00Z"),
    releasedAt: null,
    assignedPosition: "OF",
    posPrimary: "OF",
    isTwoWay: false,
    ...p,
  };
}

const NAMES = new Map([[1, "In Window"], [2, "Acquired After End"], [3, "Released Before Start"], [4, "On IL At Start"]]);

describe("findCoverageGaps", () => {
  it("flags an in-window player with no PlayerStatsPeriod row", () => {
    // The regression: computeTeamPeriodTotals `continue`s on a missing PSP row,
    // which is indistinguishable from a genuine zero. Without this check the
    // team is silently under-counted and the run still reports PASS.
    const got = findCoverageGaps({
      rosters: [stint({ playerId: 1 })],
      period: PERIOD,
      pspByPlayer: new Map(),
      isOnIlAtPeriodStart: never,
      playerNameById: NAMES,
    });
    expect(got.playersSkipped).toBe(1);
    expect(got.skipReasons[0]).toContain("In Window");
    expect(got.skipReasons[0]).toContain("no PlayerStatsPeriod row");
  });

  it("does not flag a player who is out of window for any of the three reasons", () => {
    // Over-reporting is not harmless: every gap forces INCOMPLETE, and an
    // audit that can never reach PASS is noise nobody reads.
    const got = findCoverageGaps({
      rosters: [
        stint({ playerId: 2, acquiredAt: new Date("2026-08-02T00:00:00Z") }),
        stint({ playerId: 3, releasedAt: new Date("2026-07-04T00:00:00Z") }),
        stint({ playerId: 4 }),
      ],
      period: PERIOD,
      pspByPlayer: new Map(),
      isOnIlAtPeriodStart: (id) => id === 4,
      playerNameById: NAMES,
    });
    expect(got).toEqual({ playersSkipped: 0, skipReasons: [] });
  });

  it("counts a same-period drop-and-re-add as ONE skip, not two", () => {
    // Mirrors the accumulator's PR #402 dedup guard. Two roster stints for the
    // same team+player are one player with one missing stat line; reporting 2
    // overstates the gap in a number the operator reads.
    const got = findCoverageGaps({
      rosters: [
        stint({ playerId: 1, releasedAt: new Date("2026-07-10T00:00:00Z") }),
        stint({ playerId: 1, acquiredAt: new Date("2026-07-20T00:00:00Z") }),
      ],
      period: PERIOD,
      pspByPlayer: new Map(),
      isOnIlAtPeriodStart: never,
      playerNameById: NAMES,
    });
    expect(got.playersSkipped).toBe(1);
    expect(got.skipReasons).toHaveLength(1);
  });

  it("stays silent when every in-window player has a PSP row", () => {
    const got = findCoverageGaps({
      rosters: [stint({ playerId: 1 })],
      period: PERIOD,
      pspByPlayer: new Map<number, StatLine>([[1, emptyStatLine()]]),
      isOnIlAtPeriodStart: never,
      playerNameById: NAMES,
    });
    expect(got.playersSkipped).toBe(0);
  });
});

describe("isInPeriodWindow — the shared predicate", () => {
  // These two functions used to hand-copy the same three predicates into
  // different files. The regression that motivated sharing them: flip one
  // boundary operator in either copy and a player the accumulator counts stops
  // being coverage-checked, so a run with missing data reports PASS instead of
  // INCOMPLETE — the outcome the spec's Global Constraint forbids.
  const cases: [string, Partial<RosterStint>, boolean][] = [
    ["acquired exactly ON the period end date", { acquiredAt: PERIOD.endDate }, true],
    ["acquired one day AFTER the period end", { acquiredAt: new Date("2026-08-02T00:00:00Z") }, false],
    ["released exactly ON the period start date", { releasedAt: PERIOD.startDate }, false],
    ["released one day AFTER the period start", { releasedAt: new Date("2026-07-06T00:00:00Z") }, true],
    ["released exactly ON the period end date", { releasedAt: PERIOD.endDate }, true],
    ["never released", { releasedAt: null }, true],
  ];

  for (const [label, patch, expected] of cases) {
    it(`${expected ? "includes" : "excludes"} a stint ${label}`, () => {
      expect(
        isInPeriodWindow({ stint: stint({ playerId: 1, ...patch }), period: PERIOD, isOnIlAtPeriodStart: never }),
      ).toBe(expected);
    });
  }

  it("excludes an IL-at-period-start player regardless of dates", () => {
    expect(
      isInPeriodWindow({ stint: stint({ playerId: 1 }), period: PERIOD, isOnIlAtPeriodStart: () => true }),
    ).toBe(false);
  });
});

describe("the accumulator and the gap-finder agree on who is in window", () => {
  it("every stint the accumulator counts is one the gap-finder would check", () => {
    // The differential invariant, stated directly. Feed the SAME roster to
    // both: with full PSP the accumulator credits exactly the in-window
    // players; with empty PSP the gap-finder flags exactly the same set. If
    // the two ever disagree, one of them is wrong and this fails.
    const rosters = [
      stint({ playerId: 1 }),
      stint({ playerId: 2, acquiredAt: new Date("2026-08-02T00:00:00Z") }),
      stint({ playerId: 3, releasedAt: new Date("2026-07-04T00:00:00Z") }),
      stint({ playerId: 4 }),
      stint({ playerId: 5, acquiredAt: PERIOD.endDate }),
      stint({ playerId: 6, releasedAt: PERIOD.endDate }),
    ];
    const isIl = (id: number) => id === 4;

    // One R apiece, so a counted player contributes exactly 1 to the team total.
    const fullPsp = new Map<number, StatLine>(
      rosters.map((r) => [r.playerId, { ...emptyStatLine(), R: 1 }]),
    );
    const counted = computeTeamPeriodTotals({
      teams: TEAMS,
      rosters,
      pspByPlayer: fullPsp,
      period: PERIOD,
      isOnIlAtPeriodStart: isIl,
    }).get(1)!.R;

    const flagged = findCoverageGaps({
      rosters,
      period: PERIOD,
      pspByPlayer: new Map(),
      isOnIlAtPeriodStart: isIl,
      playerNameById: NAMES,
    }).playersSkipped;

    expect(counted).toBe(3); // players 1, 5, 6
    expect(flagged).toBe(counted);
  });
});
