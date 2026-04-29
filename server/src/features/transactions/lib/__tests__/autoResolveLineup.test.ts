// server/src/features/transactions/lib/__tests__/autoResolveLineup.test.ts
//
// Contract tests for the bridge module that wires `slotMatcher` into Prisma
// — `isAutoResolveEnabled`, `loadSlotCapacities`, `verifyEligibilityUnchanged`.
// Pure unit tests; the live Prisma client is mocked.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isAutoResolveEnabled,
  loadSlotCapacities,
  verifyEligibilityUnchanged,
} from "../autoResolveLineup.js";
import { _clearLeagueRuleCache } from "../../../../lib/leagueRuleCache.js";

function makeClient(rules: Array<{ category: string; key: string; value: string }>): any {
  return {
    leagueRule: {
      findMany: vi.fn().mockResolvedValue(rules),
    },
  };
}

beforeEach(() => {
  _clearLeagueRuleCache();
});

describe("isAutoResolveEnabled", () => {
  it("returns true when LeagueRule(transactions.auto_resolve_slots) === 'true'", async () => {
    const client = makeClient([
      { category: "transactions", key: "auto_resolve_slots", value: "true" },
    ]);
    expect(await isAutoResolveEnabled(client, 20)).toBe(true);
  });

  it("returns false when the rule is 'false'", async () => {
    const client = makeClient([
      { category: "transactions", key: "auto_resolve_slots", value: "false" },
    ]);
    expect(await isAutoResolveEnabled(client, 20)).toBe(false);
  });

  it("returns false when the rule row is missing (default)", async () => {
    const client = makeClient([]);
    expect(await isAutoResolveEnabled(client, 20)).toBe(false);
  });
});

describe("loadSlotCapacities", () => {
  it("merges roster_positions JSON with pitcher_count for full OGBA shape", async () => {
    const client = makeClient([
      { category: "roster", key: "pitcher_count", value: "9" },
      {
        category: "roster",
        key: "roster_positions",
        value: JSON.stringify({
          C: 2, "1B": 1, "2B": 1, "3B": 1, SS: 1, MI: 1, CM: 1, OF: 5, DH: 1,
        }),
      },
    ]);
    const caps = await loadSlotCapacities(client, 20);
    expect(caps).toEqual({
      C: 2, "1B": 1, "2B": 1, "3B": 1, SS: 1, MI: 1, CM: 1, OF: 5, DH: 1, P: 9,
    });
    // Total should be 23 active slots.
    expect(Object.values(caps).reduce((a, b) => a + b, 0)).toBe(23);
  });

  it("falls back to defaults when roster_positions rule is missing", async () => {
    const client = makeClient([]);
    const caps = await loadSlotCapacities(client, 20);
    expect(caps.P).toBe(9);
    expect(caps.C).toBe(2);
    expect(caps.OF).toBe(5);
  });

  it("falls back when roster_positions has invalid JSON", async () => {
    const client = makeClient([
      { category: "roster", key: "roster_positions", value: "{not json" },
      { category: "roster", key: "pitcher_count", value: "10" },
    ]);
    const caps = await loadSlotCapacities(client, 20);
    expect(caps.P).toBe(10); // pitcher_count still respected
    expect(caps.OF).toBe(5); // hitter fallback used
  });
});

describe("verifyEligibilityUnchanged", () => {
  function makeTx(players: Array<{ id: number; posList: string }>) {
    return {
      player: {
        findMany: vi.fn().mockResolvedValue(players),
      },
    } as any;
  }

  it("returns null when posLists match the pre-flight read", async () => {
    const tx = makeTx([
      { id: 100, posList: "OF" },
      { id: 200, posList: "SS,2B" },
    ]);
    const candidates = [
      { rosterId: 1, playerId: 100, posList: "OF", currentSlot: "OF" },
      { rosterId: 2, playerId: 200, posList: "SS,2B", currentSlot: "SS" },
    ];
    const result = await verifyEligibilityUnchanged(tx, candidates);
    expect(result).toBeNull();
  });

  it("returns updated candidates when posList drifted (sync race)", async () => {
    const tx = makeTx([
      { id: 100, posList: "OF" }, // unchanged
      { id: 200, posList: "SS" }, // 2B eligibility lost!
    ]);
    const candidates = [
      { rosterId: 1, playerId: 100, posList: "OF", currentSlot: "OF" },
      { rosterId: 2, playerId: 200, posList: "SS,2B", currentSlot: "SS" },
    ];
    const result = await verifyEligibilityUnchanged(tx, candidates);
    expect(result).not.toBeNull();
    if (result) {
      expect(result[1].posList).toBe("SS");
    }
  });

  it("returns null when there are no real players (synthetic only)", async () => {
    const tx = makeTx([]);
    const candidates = [
      { rosterId: 0, playerId: 0, posList: "OF", currentSlot: null },
    ];
    const result = await verifyEligibilityUnchanged(tx, candidates);
    expect(result).toBeNull();
  });
});

describe("LeagueRule contract — auto_resolve_slots", () => {
  it("OGBA league (id 20) seed migration should default 'true' on read", async () => {
    // This mirrors what the SQL migration would have inserted.
    const client = makeClient([
      { category: "transactions", key: "auto_resolve_slots", value: "true" },
    ]);
    expect(await isAutoResolveEnabled(client, 20)).toBe(true);
  });

  it("non-OGBA league seed migration should default 'false' on read", async () => {
    const client = makeClient([
      { category: "transactions", key: "auto_resolve_slots", value: "false" },
    ]);
    expect(await isAutoResolveEnabled(client, 99)).toBe(false);
  });
});
