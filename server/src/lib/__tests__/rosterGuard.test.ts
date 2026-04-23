import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadLeagueRosterCap,
  assertRosterLimit,
  assertRosterAtExactCap,
} from "../rosterGuard.js";
import { RosterRuleError, isRosterRuleError } from "../rosterRuleError.js";
import { _clearLeagueRuleCache } from "../leagueRuleCache.js";

// rosterGuard reads rules via the process-local leagueRuleCache. Clear it
// between tests so each test's mock tx returns the expected value.
beforeEach(() => _clearLeagueRuleCache());

function makeTx(overrides: Partial<{
  rules: Array<{ category: string; key: string; value: string }>;
  rosterCount: number;
}> = {}) {
  return {
    roster: {
      findFirst: vi.fn(),
      count: vi.fn().mockResolvedValue(overrides.rosterCount ?? 23),
    },
    leagueRule: {
      findMany: vi.fn().mockResolvedValue(overrides.rules ?? []),
    },
  };
}

describe("loadLeagueRosterCap", () => {
  it("reads pitcher_count + batter_count from rules (OGBA default)", async () => {
    const tx = makeTx({
      rules: [
        { category: "roster", key: "pitcher_count", value: "9" },
        { category: "roster", key: "batter_count", value: "14" },
      ],
    });
    expect(await loadLeagueRosterCap(tx as any, 1)).toBe(23);
  });

  it("handles arbitrary cap values per league", async () => {
    const tx = makeTx({
      rules: [
        { category: "roster", key: "pitcher_count", value: "10" },
        { category: "roster", key: "batter_count", value: "15" },
      ],
    });
    expect(await loadLeagueRosterCap(tx as any, 1)).toBe(25);
  });

  it("falls back to 23 when rules are missing", async () => {
    const tx = makeTx({ rules: [] });
    expect(await loadLeagueRosterCap(tx as any, 1)).toBe(23);
  });

  it("falls back to 23 when only one rule is present", async () => {
    const tx = makeTx({
      rules: [{ category: "roster", key: "pitcher_count", value: "9" }],
    });
    expect(await loadLeagueRosterCap(tx as any, 1)).toBe(23);
  });
});

describe("assertRosterLimit (≤-cap mode)", () => {
  it("passes when team is at cap and dropping a player (net 0)", async () => {
    const tx = makeTx({ rosterCount: 23 });
    await expect(assertRosterLimit(tx as any, 1, true, 23)).resolves.toBeUndefined();
  });

  it("passes when team is below cap and claim has no drop", async () => {
    const tx = makeTx({ rosterCount: 20 });
    await expect(assertRosterLimit(tx as any, 1, false, 23)).resolves.toBeUndefined();
  });

  it("rejects when claim without drop would exceed cap", async () => {
    const tx = makeTx({ rosterCount: 23 });
    try {
      await assertRosterLimit(tx as any, 1, false, 23);
      throw new Error("should have thrown");
    } catch (err) {
      expect(isRosterRuleError(err)).toBe(true);
      if (isRosterRuleError(err)) expect(err.code).toBe("ROSTER_CAP");
    }
  });

  it("excludes IL-slotted rows from active count", async () => {
    const tx = makeTx({ rosterCount: 23 });
    await assertRosterLimit(tx as any, 1, true, 23);
    const call = (tx.roster.count as any).mock.calls[0][0];
    expect(call.where.assignedPosition).toEqual({ not: "IL" });
  });
});

describe("assertRosterAtExactCap (in-season strict)", () => {
  it("passes when delta=0 and team is at cap (claim+drop, IL stash+add)", async () => {
    const tx = makeTx({ rosterCount: 23 });
    await expect(assertRosterAtExactCap(tx as any, 1, 23, 0)).resolves.toBeUndefined();
  });

  it("passes when delta=+1 and team was at 22 (under cap → back to cap)", async () => {
    const tx = makeTx({ rosterCount: 22 });
    await expect(assertRosterAtExactCap(tx as any, 1, 23, 1)).resolves.toBeUndefined();
  });

  it("rejects when team is at 22 and delta=0 (would stay at 22)", async () => {
    const tx = makeTx({ rosterCount: 22 });
    try {
      await assertRosterAtExactCap(tx as any, 1, 23, 0);
      throw new Error("should have thrown");
    } catch (err) {
      expect(isRosterRuleError(err)).toBe(true);
      if (isRosterRuleError(err)) {
        expect(err.code).toBe("ROSTER_CAP");
        expect(err.metadata.projected).toBe(22);
      }
    }
  });

  it("rejects when team is at 23 and delta=+1 (would go over)", async () => {
    const tx = makeTx({ rosterCount: 23 });
    try {
      await assertRosterAtExactCap(tx as any, 1, 23, 1);
      throw new Error("should have thrown");
    } catch (err) {
      expect(isRosterRuleError(err)).toBe(true);
      if (isRosterRuleError(err)) expect(err.metadata.projected).toBe(24);
    }
  });

  it("rejects when team is at 23 and delta=-1 (standalone active drop)", async () => {
    const tx = makeTx({ rosterCount: 23 });
    await expect(assertRosterAtExactCap(tx as any, 1, 23, -1)).rejects.toThrow(RosterRuleError);
  });

  it("ignores IL-slotted rows when counting active roster", async () => {
    const tx = makeTx({ rosterCount: 23 });
    await assertRosterAtExactCap(tx as any, 1, 23, 0);
    const call = (tx.roster.count as any).mock.calls[0][0];
    expect(call.where.assignedPosition).toEqual({ not: "IL" });
  });
});
