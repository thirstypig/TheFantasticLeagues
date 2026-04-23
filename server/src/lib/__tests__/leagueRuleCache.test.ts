import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getLeagueRules,
  invalidateLeagueRules,
  _clearLeagueRuleCache,
} from "../leagueRuleCache.js";

// The cache accepts any Prisma-like client — we pass a mock that counts
// findMany calls so we can verify cache hits don't re-query the DB.
function mockClient(rows: Array<{ category: string; key: string; value: string }>) {
  return {
    leagueRule: {
      findMany: vi.fn().mockResolvedValue(rows),
    },
  };
}

beforeEach(() => {
  _clearLeagueRuleCache();
});

describe("getLeagueRules — shape", () => {
  it("groups rows into { category: { key: value } }", async () => {
    const client = mockClient([
      { category: "roster", key: "pitcher_count", value: "9" },
      { category: "roster", key: "batter_count", value: "14" },
      { category: "il", key: "slot_count", value: "2" },
      { category: "transactions", key: "owner_self_serve", value: "false" },
    ]);

    const rules = await getLeagueRules(client as any, 1);

    expect(rules).toEqual({
      roster: { pitcher_count: "9", batter_count: "14" },
      il: { slot_count: "2" },
      transactions: { owner_self_serve: "false" },
    });
  });

  it("returns empty object when the league has no rules yet", async () => {
    const client = mockClient([]);
    const rules = await getLeagueRules(client as any, 1);
    expect(rules).toEqual({});
  });
});

describe("getLeagueRules — caching", () => {
  it("calls findMany once for repeated reads within the TTL", async () => {
    const client = mockClient([
      { category: "il", key: "slot_count", value: "2" },
    ]);

    await getLeagueRules(client as any, 1);
    await getLeagueRules(client as any, 1);
    await getLeagueRules(client as any, 1);

    expect(client.leagueRule.findMany).toHaveBeenCalledTimes(1);
  });

  it("caches separately per leagueId — does not leak one league's rules to another", async () => {
    const client1 = mockClient([
      { category: "il", key: "slot_count", value: "2" },
    ]);
    const client2 = mockClient([
      { category: "il", key: "slot_count", value: "5" },
    ]);

    const rules1 = await getLeagueRules(client1 as any, 1);
    const rules2 = await getLeagueRules(client2 as any, 2);

    expect(rules1.il?.slot_count).toBe("2");
    expect(rules2.il?.slot_count).toBe("5");
    expect(client1.leagueRule.findMany).toHaveBeenCalledTimes(1);
    expect(client2.leagueRule.findMany).toHaveBeenCalledTimes(1);
  });
});

describe("getLeagueRules — TTL expiry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("re-fetches after the 60s TTL elapses — guards against TTL-constant typos", async () => {
    const client = mockClient([
      { category: "il", key: "slot_count", value: "2" },
    ]);

    vi.setSystemTime(new Date("2026-04-23T00:00:00Z"));
    await getLeagueRules(client as any, 1);
    expect(client.leagueRule.findMany).toHaveBeenCalledTimes(1);

    // 59 seconds later — still cached.
    vi.setSystemTime(new Date("2026-04-23T00:00:59Z"));
    await getLeagueRules(client as any, 1);
    expect(client.leagueRule.findMany).toHaveBeenCalledTimes(1);

    // 61 seconds later — TTL expired, should re-fetch.
    vi.setSystemTime(new Date("2026-04-23T00:01:01Z"));
    await getLeagueRules(client as any, 1);
    expect(client.leagueRule.findMany).toHaveBeenCalledTimes(2);
  });
});

describe("invalidateLeagueRules", () => {
  it("forces the next read to hit the database", async () => {
    const client = mockClient([
      { category: "il", key: "slot_count", value: "2" },
    ]);

    await getLeagueRules(client as any, 1);
    expect(client.leagueRule.findMany).toHaveBeenCalledTimes(1);

    invalidateLeagueRules(1);
    await getLeagueRules(client as any, 1);
    expect(client.leagueRule.findMany).toHaveBeenCalledTimes(2);
  });

  it("only invalidates the specified league — other leagues stay cached", async () => {
    const client1 = mockClient([
      { category: "il", key: "slot_count", value: "2" },
    ]);
    const client2 = mockClient([
      { category: "il", key: "slot_count", value: "5" },
    ]);

    // Prime both caches.
    await getLeagueRules(client1 as any, 1);
    await getLeagueRules(client2 as any, 2);

    // Invalidate only league 1.
    invalidateLeagueRules(1);

    // League 1 re-fetches; league 2 should not.
    await getLeagueRules(client1 as any, 1);
    await getLeagueRules(client2 as any, 2);

    expect(client1.leagueRule.findMany).toHaveBeenCalledTimes(2);
    expect(client2.leagueRule.findMany).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when the league was never cached (no throw)", () => {
    expect(() => invalidateLeagueRules(99999)).not.toThrow();
  });
});

describe("_clearLeagueRuleCache (test-only)", () => {
  it("drops every league's cache, forcing a re-fetch on next read", async () => {
    const client1 = mockClient([
      { category: "il", key: "slot_count", value: "2" },
    ]);
    const client2 = mockClient([
      { category: "il", key: "slot_count", value: "5" },
    ]);

    await getLeagueRules(client1 as any, 1);
    await getLeagueRules(client2 as any, 2);

    _clearLeagueRuleCache();

    await getLeagueRules(client1 as any, 1);
    await getLeagueRules(client2 as any, 2);

    expect(client1.leagueRule.findMany).toHaveBeenCalledTimes(2);
    expect(client2.leagueRule.findMany).toHaveBeenCalledTimes(2);
  });
});

describe("getLeagueRules — write-path coverage expectation", () => {
  // This test doesn't exercise leagueRuleCache directly. It's a "reminder
  // checklist" — if you add a new LeagueRule write path anywhere in the
  // codebase, you must also call invalidateLeagueRules(leagueId). Grepping
  // is the enforcement, but naming the expectation here keeps the intent
  // discoverable when this test file is the starting point.
  it.todo("every new leagueRule write must call invalidateLeagueRules (grep enforcement)");
});
