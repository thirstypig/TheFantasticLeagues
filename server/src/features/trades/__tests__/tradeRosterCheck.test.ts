import { describe, it, expect } from "vitest";
import { projectTradeCounts, tradeCapViolations } from "../lib/tradeRosterCheck.js";

const ids = (...n: number[]) => new Set(n);
const range = (from: number, n: number) => ids(...Array.from({ length: n }, (_, i) => from + i));
const p = (playerId: number, senderId: number, recipientId: number) => ({
  assetType: "PLAYER", playerId, senderId, recipientId,
});

describe("projectTradeCounts / tradeCapViolations", () => {
  it("1-for-1 leaves both teams unchanged (no violation)", () => {
    const active = new Map([[1, range(100, 23)], [2, range(200, 23)]]);
    const counts = projectTradeCounts([p(100, 1, 2), p(200, 2, 1)], active);
    expect(counts.get(1)).toEqual({ before: 23, after: 23 });
    expect(counts.get(2)).toEqual({ before: 23, after: 23 });
    expect(tradeCapViolations(counts, 23)).toEqual([]);
  });

  it("2-for-1 at cap 23 flags only the receiver", () => {
    const active = new Map([[1, range(100, 23)], [2, range(200, 23)]]);
    const counts = projectTradeCounts([p(100, 1, 2), p(101, 1, 2), p(200, 2, 1)], active);
    expect(counts.get(2)).toEqual({ before: 23, after: 24 });
    expect(counts.get(1)).toEqual({ before: 23, after: 22 });
    expect(tradeCapViolations(counts, 23)).toEqual([{ teamId: 2, after: 24 }]);
  });

  it("a team already at 24 doing a 1-for-1 is not flagged", () => {
    const active = new Map([[1, range(100, 24)], [2, range(200, 23)]]);
    const counts = projectTradeCounts([p(100, 1, 2), p(200, 2, 1)], active);
    expect(counts.get(1)).toEqual({ before: 24, after: 24 });
    expect(tradeCapViolations(counts, 23)).toEqual([]);
  });

  it("a player not in the sender's active set (IL) changes nothing", () => {
    const active = new Map([[1, range(100, 23)], [2, range(200, 23)]]);
    const counts = projectTradeCounts([p(999, 1, 2)], active);
    expect(counts.get(1)).toEqual({ before: 23, after: 23 });
    expect(counts.get(2)).toEqual({ before: 23, after: 23 });
    expect(tradeCapViolations(counts, 23)).toEqual([]);
  });

  it("ignores BUDGET items", () => {
    const active = new Map([[1, range(100, 23)], [2, range(200, 23)]]);
    const counts = projectTradeCounts(
      [{ assetType: "BUDGET", playerId: null, senderId: 1, recipientId: 2 }],
      active,
    );
    expect(counts.size).toBe(0);
  });
});
