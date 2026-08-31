import { describe, it, expect } from "vitest";
import { assignIlRanks } from "../ilFeeService.js";

/**
 * IL slot rank determines the fee: slot 1 costs `il_slot_1_cost` ($10 in OGBA),
 * slot 2 costs `il_slot_2_cost` ($15). Rank is decided at stash time by how many
 * of the team's other stints were already open.
 *
 * The tie case is the bug this pins. Two players stashed in the SAME transaction
 * share an identical `startedAt`, and the original predicate asked
 * `other.startedAt <= s.startedAt` — which is true in BOTH directions when the
 * timestamps are equal. Each stint therefore saw the other as already open, both
 * were ranked 2, and the team paid $15 + $15 instead of $10 + $15.
 *
 * Observed in prod: Los Doyers stashed Will Smith and Konnor Griffin on
 * 2026-08-02 and were billed $30 for Period 6 instead of $25.
 */

const d = (iso: string) => new Date(iso);
const stint = (playerId: number, startedAt: string, endedAt: string | null = null) => ({
  teamId: 147,
  playerId,
  startedAt: d(startedAt),
  endedAt: endedAt ? d(endedAt) : null,
});

describe("assignIlRanks", () => {
  it("ranks a lone stint as slot 1", () => {
    const out = assignIlRanks([stint(1, "2026-08-02T00:00:00Z")]);
    expect(out[0].rankAtEntry).toBe(1);
  });

  it("ranks a second, later, overlapping stint as slot 2", () => {
    const out = assignIlRanks([
      stint(1, "2026-08-02T00:00:00Z"),
      stint(2, "2026-08-10T00:00:00Z"),
    ]);
    expect(out.find((s) => s.playerId === 1)!.rankAtEntry).toBe(1);
    expect(out.find((s) => s.playerId === 2)!.rankAtEntry).toBe(2);
  });

  it("SIMULTANEOUS stashes get one slot-1 and one slot-2, never two slot-2s", () => {
    const out = assignIlRanks([
      stint(101, "2026-08-02T00:00:00Z"),
      stint(102, "2026-08-02T00:00:00Z"),
    ]);
    const ranks = out.map((s) => s.rankAtEntry).sort();
    expect(ranks).toEqual([1, 2]);
  });

  it("breaks the simultaneous tie deterministically — same input, same ranks", () => {
    const a = assignIlRanks([stint(101, "2026-08-02T00:00:00Z"), stint(102, "2026-08-02T00:00:00Z")]);
    // Reversed input order must not change who gets slot 1.
    const b = assignIlRanks([stint(102, "2026-08-02T00:00:00Z"), stint(101, "2026-08-02T00:00:00Z")]);
    const rankOf = (out: typeof a, pid: number) => out.find((s) => s.playerId === pid)!.rankAtEntry;
    expect(rankOf(a, 101)).toBe(rankOf(b, 101));
    expect(rankOf(a, 102)).toBe(rankOf(b, 102));
  });

  it("a stint that starts after another has CLOSED is slot 1 again", () => {
    const out = assignIlRanks([
      stint(1, "2026-06-01T00:00:00Z", "2026-07-01T00:00:00Z"),
      stint(2, "2026-08-01T00:00:00Z"),
    ]);
    expect(out.find((s) => s.playerId === 2)!.rankAtEntry).toBe(1);
  });

  it("keeps teams independent — another team's stint never raises your rank", () => {
    const out = assignIlRanks([
      { ...stint(1, "2026-08-02T00:00:00Z"), teamId: 141 },
      { ...stint(2, "2026-08-02T00:00:00Z"), teamId: 147 },
    ]);
    expect(out.every((s) => s.rankAtEntry === 1)).toBe(true);
  });

  it("caps rank at 2 when three stints overlap", () => {
    const out = assignIlRanks([
      stint(1, "2026-08-01T00:00:00Z"),
      stint(2, "2026-08-02T00:00:00Z"),
      stint(3, "2026-08-03T00:00:00Z"),
    ]);
    expect(out.find((s) => s.playerId === 3)!.rankAtEntry).toBe(2);
  });
});
