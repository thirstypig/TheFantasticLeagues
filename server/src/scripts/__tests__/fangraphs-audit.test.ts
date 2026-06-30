import { describe, it, expect } from "vitest";
import {
  accumulatePeriodStats,
  zeroAccum,
  type Accum,
  type AuditRoster,
  type AuditPspRow,
} from "../fangraphs-audit.js";
import type { IlWindow } from "../../lib/ilWindows.js";

// Period: 2026-05-12 .. 2026-05-25 (mirrors a real OGBA lineup window).
const PERIOD = { startDate: new Date("2026-05-12"), endDate: new Date("2026-05-25") };
const NO_IL = new Map<number, IlWindow[]>();

// A pitcher's whole-period PSP line (9 K, 1 W) — the Aaron Ashby Period 3 shape.
const PSP: AuditPspRow = { R: 0, HR: 0, RBI: 0, SB: 0, H: 0, AB: 0, W: 1, SV: 0, K: 9, ER: 3, IP: 10, BB_H: 11 };

function rosterRow(over: Partial<AuditRoster>): AuditRoster {
  return {
    teamId: 1,
    playerId: 100,
    acquiredAt: new Date("2026-05-12"),
    releasedAt: null,
    assignedPosition: "P",
    player: { mlbId: null, posPrimary: "P" },
    ...over,
  };
}

describe("accumulatePeriodStats", () => {
  it("counts a same-team drop-and-re-add within a period exactly once (regression: Aaron Ashby)", () => {
    // Two roster rows for the SAME player on the SAME team — dropped 05-22,
    // re-added 05-22. The bug credited both rows → 18 K / 2 W. Correct = 9 / 1.
    const rosters: AuditRoster[] = [
      rosterRow({ acquiredAt: new Date("2026-05-22"), releasedAt: null }), // re-add (latest)
      rosterRow({ acquiredAt: new Date("2026-04-19"), releasedAt: new Date("2026-05-22") }), // first stint
    ];
    const pspByPlayer = new Map([[100, PSP]]);
    const teamAccum = new Map<number, Accum>([[1, zeroAccum()]]);

    accumulatePeriodStats(rosters, PERIOD, pspByPlayer, NO_IL, teamAccum);

    expect(teamAccum.get(1)!.K).toBe(9);
    expect(teamAccum.get(1)!.W).toBe(1);
    expect(teamAccum.get(1)!.IP).toBe(10);
  });

  it("credits the same player to BOTH teams in a mid-period trade (overlap model)", () => {
    // Per the ownership-overlap model the audit uses (matching FG/Excel),
    // a player traded mid-period is credited the whole-period PSP under each
    // owning team. Dedup is per team+player, so this is NOT collapsed.
    const rosters: AuditRoster[] = [
      rosterRow({ teamId: 1, acquiredAt: new Date("2026-05-12"), releasedAt: new Date("2026-05-18") }),
      rosterRow({ teamId: 2, acquiredAt: new Date("2026-05-18"), releasedAt: null }),
    ];
    const pspByPlayer = new Map([[100, PSP]]);
    const teamAccum = new Map<number, Accum>([
      [1, zeroAccum()],
      [2, zeroAccum()],
    ]);

    accumulatePeriodStats(rosters, PERIOD, pspByPlayer, NO_IL, teamAccum);

    expect(teamAccum.get(1)!.K).toBe(9);
    expect(teamAccum.get(2)!.K).toBe(9);
  });

  it("excludes a player who was on IL at period start", () => {
    const rosters: AuditRoster[] = [rosterRow({})];
    const pspByPlayer = new Map([[100, PSP]]);
    const il = new Map<number, IlWindow[]>([
      [100, [{ startDate: new Date("2026-05-01"), endDate: null }]],
    ]);
    const teamAccum = new Map<number, Accum>([[1, zeroAccum()]]);

    accumulatePeriodStats(rosters, PERIOD, pspByPlayer, il, teamAccum);

    expect(teamAccum.get(1)!.K).toBe(0);
    expect(teamAccum.get(1)!.W).toBe(0);
  });

  it("skips a roster row whose ownership window does not overlap the period", () => {
    const rosters: AuditRoster[] = [
      // Released before the period started.
      rosterRow({ acquiredAt: new Date("2026-03-25"), releasedAt: new Date("2026-05-01") }),
      // Acquired after the period ended.
      rosterRow({ playerId: 101, acquiredAt: new Date("2026-06-01"), releasedAt: null }),
    ];
    const pspByPlayer = new Map([
      [100, PSP],
      [101, PSP],
    ]);
    const teamAccum = new Map<number, Accum>([[1, zeroAccum()]]);

    accumulatePeriodStats(rosters, PERIOD, pspByPlayer, NO_IL, teamAccum);

    expect(teamAccum.get(1)!.K).toBe(0);
  });

  it("counts a two-way player's pitching to the pitcher slot and hitting elsewhere", () => {
    // Sanity that the two-way split still applies through the extracted fn.
    // A non-two-way pitcher gets pitching stats credited (control case).
    const rosters: AuditRoster[] = [rosterRow({ assignedPosition: "SP" })];
    const pspByPlayer = new Map([[100, PSP]]);
    const teamAccum = new Map<number, Accum>([[1, zeroAccum()]]);

    accumulatePeriodStats(rosters, PERIOD, pspByPlayer, NO_IL, teamAccum);

    expect(teamAccum.get(1)!.K).toBe(9);
    expect(teamAccum.get(1)!.R).toBe(0);
  });
});
