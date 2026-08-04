// server/src/lib/audit/__tests__/fbstTotals.test.ts
import { describe, it, expect } from "vitest";
import { computeTeamPeriodTotals, type RosterStint } from "../fbstTotals.js";
import { emptyStatLine, type StatLine } from "../types.js";

const PERIOD = { startDate: new Date("2026-07-05T00:00:00Z"), endDate: new Date("2026-08-01T00:00:00Z") };
const TEAMS = [{ id: 1, name: "Team A" }];
const noIl = () => false;

function stint(p: Partial<RosterStint>): RosterStint {
  return {
    teamId: 1, playerId: 10,
    acquiredAt: new Date("2026-03-22T00:00:00Z"), releasedAt: null,
    assignedPosition: "OF", posPrimary: "OF", ...p,
  };
}
function psp(p: Partial<StatLine>): StatLine {
  return { ...emptyStatLine(), ...p };
}

describe("computeTeamPeriodTotals", () => {
  it("credits a hitter's period stats to the owning team", () => {
    const got = computeTeamPeriodTotals({
      teams: TEAMS, rosters: [stint({})],
      pspByPlayer: new Map([[10, psp({ R: 12, HR: 3, RBI: 9, SB: 1, H: 20, AB: 80 })]]),
      period: PERIOD, isOnIlAtPeriodStart: noIl,
    });
    expect(got.get(1)!.R).toBe(12);
    expect(got.get(1)!.AB).toBe(80);
  });

  it("counts a same-period drop-and-re-add ONCE", () => {
    // The PR #402 flaw: two stints for one player in one period must not
    // credit his whole-period PSP twice.
    const got = computeTeamPeriodTotals({
      teams: TEAMS,
      rosters: [
        stint({ releasedAt: new Date("2026-07-15T00:00:00Z") }),
        stint({ acquiredAt: new Date("2026-07-20T00:00:00Z") }),
      ],
      pspByPlayer: new Map([[10, psp({ R: 12, HR: 3 })]]),
      period: PERIOD, isOnIlAtPeriodStart: noIl,
    });
    expect(got.get(1)!.R).toBe(12);
    expect(got.get(1)!.HR).toBe(3);
  });

  it("excludes a player who was on IL at period start", () => {
    const got = computeTeamPeriodTotals({
      teams: TEAMS, rosters: [stint({})],
      pspByPlayer: new Map([[10, psp({ R: 5 })]]),
      period: PERIOD, isOnIlAtPeriodStart: (id) => id === 10,
    });
    expect(got.get(1)!.R).toBe(0);
  });

  it("excludes a stint released at or before the period start", () => {
    const got = computeTeamPeriodTotals({
      teams: TEAMS, rosters: [stint({ releasedAt: new Date("2026-07-05T00:00:00Z") })],
      pspByPlayer: new Map([[10, psp({ R: 5 })]]),
      period: PERIOD, isOnIlAtPeriodStart: noIl,
    });
    expect(got.get(1)!.R).toBe(0);
  });

  it("excludes a stint acquired after the period end", () => {
    const got = computeTeamPeriodTotals({
      teams: TEAMS, rosters: [stint({ acquiredAt: new Date("2026-08-02T00:00:00Z") })],
      pspByPlayer: new Map([[10, psp({ R: 5 })]]),
      period: PERIOD, isOnIlAtPeriodStart: noIl,
    });
    expect(got.get(1)!.R).toBe(0);
  });

  it("COUNTS a stint acquired exactly on the period end date", () => {
    // Boundary equality. The guard is `acquiredAt > period.endDate`, so a player
    // picked up on the final day of the period still counts. Flipping it to `>=`
    // silently drops him — no error, just a quietly smaller team total. The
    // existing "acquired after the period end" test uses 08-02, one day clear of
    // the boundary, so it cannot catch that flip.
    const got = computeTeamPeriodTotals({
      teams: TEAMS,
      rosters: [stint({ acquiredAt: new Date("2026-08-01T00:00:00Z") })],
      pspByPlayer: new Map([[10, psp({ R: 5, HR: 1 })]]),
      period: PERIOD, isOnIlAtPeriodStart: noIl,
    });
    expect(got.get(1)!.R).toBe(5);
    expect(got.get(1)!.HR).toBe(1);
  });

  it("COUNTS a stint released exactly on the period end date", () => {
    // The release guard is `releasedAt <= period.startDate`, so a release at the
    // period END is far outside it and must not exclude the player.
    const got = computeTeamPeriodTotals({
      teams: TEAMS,
      rosters: [stint({ releasedAt: new Date("2026-08-01T00:00:00Z") })],
      pspByPlayer: new Map([[10, psp({ R: 7 })]]),
      period: PERIOD, isOnIlAtPeriodStart: noIl,
    });
    expect(got.get(1)!.R).toBe(7);
  });

  it("routes pitcher slots to pitching cats and hitters to hitting cats", () => {
    const got = computeTeamPeriodTotals({
      teams: TEAMS,
      rosters: [
        stint({ playerId: 10, assignedPosition: "OF" }),
        stint({ playerId: 11, assignedPosition: "P" }),
      ],
      pspByPlayer: new Map([
        [10, psp({ R: 7, K: 999 })],   // hitter: K must be ignored
        [11, psp({ K: 40, W: 3, R: 999 })], // pitcher: R must be ignored
      ]),
      period: PERIOD, isOnIlAtPeriodStart: noIl,
    });
    expect(got.get(1)!.R).toBe(7);
    expect(got.get(1)!.K).toBe(40);
    expect(got.get(1)!.W).toBe(3);
  });
});
