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
    assignedPosition: "OF", posPrimary: "OF", isTwoWay: false, ...p,
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

  // ── todo #307: classify exactly like production ──────────────────
  //
  // Production `playerStatRoles` keys a non-two-way player on `posPrimary`
  // ALONE — a benched pitcher is still a pitcher. The audit used
  // `assignedPosition ?? posPrimary`, so a pitcher parked on BN or IL had his
  // pitching silently dropped BY THE AUDIT ONLY, and his hitting counted
  // instead. That reports a phantom divergence and sends someone chasing a
  // production bug that does not exist — the measuring-instrument trap.

  it("counts a benched pitcher's PITCHING, keyed on posPrimary not the slot", () => {
    const got = computeTeamPeriodTotals({
      teams: TEAMS,
      rosters: [stint({ assignedPosition: "BN", posPrimary: "SP" })],
      pspByPlayer: new Map([[10, psp({ W: 2, SV: 1, K: 30, ER: 8, IP: 40, BB_H: 45 })]]),
      period: PERIOD, isOnIlAtPeriodStart: noIl,
    });
    expect(got.get(1)!.W).toBe(2);
    expect(got.get(1)!.K).toBe(30);
    expect(got.get(1)!.IP).toBe(40);
  });

  it("does not leak a benched pitcher's line into the hitting categories", () => {
    // The old code counted him as a hitter, so his (zero) hitting was added and
    // his real pitching vanished. Pin both halves.
    const got = computeTeamPeriodTotals({
      teams: TEAMS,
      rosters: [stint({ assignedPosition: "BN", posPrimary: "SP" })],
      pspByPlayer: new Map([[10, psp({ K: 30, IP: 40, R: 1, H: 2, AB: 9 })]]),
      period: PERIOD, isOnIlAtPeriodStart: noIl,
    });
    expect(got.get(1)!.K).toBe(30);
    expect(got.get(1)!.R).toBe(0);
    expect(got.get(1)!.AB).toBe(0);
  });

  it("a position player's mop-up pitching does NOT count toward team pitching", () => {
    // Matches OnRoto scoring: a catcher who throws an inning is not on your staff.
    const got = computeTeamPeriodTotals({
      teams: TEAMS,
      rosters: [stint({ assignedPosition: "C", posPrimary: "C" })],
      pspByPlayer: new Map([[10, psp({ R: 5, H: 10, AB: 40, IP: 1, ER: 3, K: 1 })]]),
      period: PERIOD, isOnIlAtPeriodStart: noIl,
    });
    expect(got.get(1)!.R).toBe(5);
    expect(got.get(1)!.IP).toBe(0);
    expect(got.get(1)!.ER).toBe(0);
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

  it("routes pitchers to pitching cats and hitters to hitting cats", () => {
    // NOTE (todo #307): this test used to give the "pitcher" only
    // `assignedPosition: "P"`, leaving the helper's default `posPrimary: "OF"`.
    // That passed under the old slot-based split and encoded the very bug #307
    // fixes — production keys a non-two-way player on `posPrimary`, so an OF
    // sitting in a P slot is a position player doing mop-up and his pitching
    // must NOT count. The fixture now says what it means.
    const got = computeTeamPeriodTotals({
      teams: TEAMS,
      rosters: [
        stint({ playerId: 10, assignedPosition: "OF", posPrimary: "OF" }),
        stint({ playerId: 11, assignedPosition: "P", posPrimary: "SP" }),
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

  it("follows the SLOT for a two-way player (the documented exception)", () => {
    // Ohtani is slotted per period, so his contribution follows
    // assignedPosition. Production pre-splits him into two rows; the rule here
    // is the same one production applies.
    const asPitcher = computeTeamPeriodTotals({
      teams: TEAMS,
      rosters: [stint({ assignedPosition: "P", posPrimary: "DH", isTwoWay: true })],
      pspByPlayer: new Map([[10, psp({ K: 25, W: 2, R: 999 })]]),
      period: PERIOD, isOnIlAtPeriodStart: noIl,
    });
    expect(asPitcher.get(1)!.K).toBe(25);
    expect(asPitcher.get(1)!.R).toBe(0);

    const asHitter = computeTeamPeriodTotals({
      teams: TEAMS,
      rosters: [stint({ assignedPosition: "DH", posPrimary: "DH", isTwoWay: true })],
      pspByPlayer: new Map([[10, psp({ R: 30, HR: 8, K: 999 })]]),
      period: PERIOD, isOnIlAtPeriodStart: noIl,
    });
    expect(asHitter.get(1)!.R).toBe(30);
    expect(asHitter.get(1)!.K).toBe(0);
  });
});
