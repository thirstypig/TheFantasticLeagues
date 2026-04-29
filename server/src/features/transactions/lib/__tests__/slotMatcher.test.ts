import { describe, it, expect } from "vitest";
import { resolveLineup, type RosterCandidate } from "../slotMatcher.js";

// OGBA's standard slot capacities: 14 batters + 9 pitchers = 23 active.
// (C:2, 1B:1, 2B:1, 3B:1, SS:1, MI:1, CM:1, OF:5, DH:1, P:9.)
// Tests use these unless they override slotCapacities for a specific shape.
const OGBA_SLOTS: Record<string, number> = {
  C: 2,
  "1B": 1,
  "2B": 1,
  "3B": 1,
  SS: 1,
  MI: 1,
  CM: 1,
  OF: 5,
  DH: 1,
  P: 9,
};

function cand(
  rosterId: number,
  playerId: number,
  posList: string,
  currentSlot: string | null,
  pinned = false,
): RosterCandidate {
  return { rosterId, playerId, posList, currentSlot, pinned };
}

describe("slotMatcher.resolveLineup — happy path", () => {
  it("simple legal assignment with 2-3 players", () => {
    const candidates: RosterCandidate[] = [
      cand(1, 100, "SS", "SS"),
      cand(2, 200, "OF", "OF"),
      cand(3, 300, "C", "C"),
    ];
    const result = resolveLineup(candidates, { SS: 1, OF: 1, C: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Everyone is already in their incumbent slot — no deltas.
      expect(result.assignments).toEqual([]);
    }
  });

  it("multi-position eligibility — picks the slot matching incumbent", () => {
    // Mookie-style: posList "OF,2B" eligible for OF and MI. He's currently in
    // 2B (which is also eligible via the 2B position). Matcher should keep
    // him at 2B since OF and 2B are both available.
    const candidates: RosterCandidate[] = [
      cand(1, 100, "OF,2B", "2B"),
      cand(2, 200, "OF", "OF"),
    ];
    const result = resolveLineup(candidates, { "2B": 1, OF: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.assignments).toEqual([]);
    }
  });
});

describe("slotMatcher.resolveLineup — failure modes", () => {
  it("unsolvable — 5 OF-only players, only 3 OF slots → NO_LEGAL_ASSIGNMENT", () => {
    const candidates: RosterCandidate[] = [
      cand(1, 100, "OF", null),
      cand(2, 200, "OF", null),
      cand(3, 300, "OF", null),
      cand(4, 400, "OF", null),
      cand(5, 500, "OF", null),
    ];
    const result = resolveLineup(candidates, { OF: 3 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NO_LEGAL_ASSIGNMENT");
      expect(result.unassignedPlayers.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("unfillable slot — no eligible C → NO_LEGAL_ASSIGNMENT with unfilledSlots: ['C']", () => {
    const candidates: RosterCandidate[] = [
      cand(1, 100, "OF", null),
      cand(2, 200, "OF", null),
    ];
    const result = resolveLineup(candidates, { C: 1, OF: 1 });
    // 2 players, 2 slots (one C, one OF). Player can't fill C → fails.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unfilledSlots).toContain("C");
    }
  });

  it("capacity overflow — more candidates than total slot capacity", () => {
    const candidates: RosterCandidate[] = [
      cand(1, 100, "OF", null),
      cand(2, 200, "OF", null),
      cand(3, 300, "OF", null),
    ];
    const result = resolveLineup(candidates, { OF: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NO_LEGAL_ASSIGNMENT");
      // Capacity check is the early-exit; unassigned should list everyone.
      expect(result.unassignedPlayers.length).toBe(3);
    }
  });
});

describe("slotMatcher.resolveLineup — IL / pinned rows", () => {
  it("IL preservation — pinned IL row stays at IL regardless", () => {
    const candidates: RosterCandidate[] = [
      cand(1, 100, "OF", "IL", /*pinned*/ true),
      cand(2, 200, "OF", "OF"),
    ];
    const result = resolveLineup(candidates, { OF: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The IL row was excluded from matching entirely — not in assignments.
      expect(result.assignments.find((a) => a.rosterId === 1)).toBeUndefined();
    }
  });

  it("mixed pinned/free — matcher only assigns the free ones", () => {
    const candidates: RosterCandidate[] = [
      cand(1, 100, "P", "IL", true),
      cand(2, 200, "P", "IL", true),
      cand(3, 300, "OF", "OF"),
      cand(4, 400, "C", "C"),
    ];
    const result = resolveLineup(candidates, { C: 1, OF: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Only roster IDs 3 and 4 could appear; both stayed put → no deltas.
      expect(result.assignments).toEqual([]);
    }
  });
});

describe("slotMatcher.resolveLineup — incumbent preference", () => {
  it("partial reshuffle — 1-player add triggers cascade, returns expected assignments", () => {
    // Adding a SS-only player to a roster where SS is taken by someone with
    // 2B/SS eligibility. Existing SS player should slide to 2B (or MI).
    const candidates: RosterCandidate[] = [
      cand(1, 100, "SS", null), // newly added SS-only — needs SS
      cand(2, 200, "2B,SS", "SS"), // incumbent SS but 2B-eligible
      cand(3, 300, "OF", "OF"),
    ];
    const result = resolveLineup(candidates, {
      SS: 1, "2B": 1, MI: 1, OF: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The new player needs SS; incumbent moves elsewhere.
      const newPlayerAssignment = result.assignments.find((a) => a.rosterId === 1);
      const incumbentAssignment = result.assignments.find((a) => a.rosterId === 2);
      // Either the new player (rosterId 1) is placed at SS, or the incumbent
      // moved off — the matcher must produce a legal assignment for both.
      expect(result.assignments.length).toBeGreaterThanOrEqual(1);
      // OF row (3) must be untouched.
      expect(result.assignments.find((a) => a.rosterId === 3)).toBeUndefined();
      // At least one of the SS pair should have moved or been placed.
      expect(newPlayerAssignment || incumbentAssignment).toBeDefined();
    }
  });

  it("incumbent preference — prefer fewer moves when two legal matchings exist", () => {
    // Two players, both could play either of two slots. With incumbents
    // already in place, matcher should leave them alone (zero assignments).
    const candidates: RosterCandidate[] = [
      cand(1, 100, "2B,SS", "SS"),
      cand(2, 200, "2B,SS", "2B"),
    ];
    const result = resolveLineup(candidates, { "2B": 1, SS: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Both incumbents → no deltas.
      expect(result.assignments).toEqual([]);
    }
  });
});

describe("slotMatcher.resolveLineup — slot expansion", () => {
  it("9-pitcher slot expansion — 9 pitchers fit in P:9", () => {
    const candidates: RosterCandidate[] = Array.from({ length: 9 }, (_, i) =>
      cand(i + 1, 100 + i, "SP", "P"),
    );
    const result = resolveLineup(candidates, { P: 9 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // All 9 incumbents stay at P → no assignments emitted.
      expect(result.assignments).toEqual([]);
    }
  });

  it("9-pitcher overflow — 10 pitchers, P:9 capacity → NO_LEGAL_ASSIGNMENT", () => {
    const candidates: RosterCandidate[] = Array.from({ length: 10 }, (_, i) =>
      cand(i + 1, 100 + i, "SP", null),
    );
    const result = resolveLineup(candidates, { P: 9 });
    expect(result.ok).toBe(false);
  });
});

describe("slotMatcher.resolveLineup — edge cases", () => {
  it("empty roster — no candidates → ok with empty assignments", () => {
    const result = resolveLineup([], OGBA_SLOTS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.assignments).toEqual([]);
    }
  });

  it("single-position-only roster — 2 C-only players, 2 slots (C:1, OF:1) → 1 unmatched", () => {
    // Capacity matches roster size (2=2), so the early-exit doesn't fire.
    // Augmenting-path matching can only fit one C-only player; the other
    // can't fill OF.
    const candidates: RosterCandidate[] = [
      cand(1, 100, "C", null),
      cand(2, 200, "C", null),
    ];
    const result = resolveLineup(candidates, { C: 1, OF: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unassignedPlayers.length).toBe(1);
      expect(result.unfilledSlots).toContain("OF");
    }
  });

  it("two-position downgrade — 2B/SS player matched to MI when SS/2B/MI all needed", () => {
    // Two SS-only players plus one 2B/SS swing — swing player must take MI.
    const candidates: RosterCandidate[] = [
      cand(1, 100, "SS", "SS"),
      cand(2, 200, "2B,SS", "MI"),
      cand(3, 300, "2B", "2B"),
    ];
    const result = resolveLineup(candidates, { SS: 1, "2B": 1, MI: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // All three already at incumbent slots in a valid arrangement.
      expect(result.assignments).toEqual([]);
    }
  });
});

describe("slotMatcher.resolveLineup — performance & stability", () => {
  it("Hopcroft-Karp-class performance — 23-player full roster runs in <50ms", () => {
    // Build a full OGBA roster (14 batters + 9 pitchers).
    const candidates: RosterCandidate[] = [
      cand(1, 1, "C", "C"),
      cand(2, 2, "C", "C"),
      cand(3, 3, "1B", "1B"),
      cand(4, 4, "2B", "2B"),
      cand(5, 5, "3B", "3B"),
      cand(6, 6, "SS", "SS"),
      cand(7, 7, "2B,SS", "MI"),
      cand(8, 8, "1B,3B", "CM"),
      cand(9, 9, "OF", "OF"),
      cand(10, 10, "OF", "OF"),
      cand(11, 11, "OF", "OF"),
      cand(12, 12, "OF", "OF"),
      cand(13, 13, "OF", "OF"),
      cand(14, 14, "DH", "DH"),
      cand(15, 15, "SP", "P"),
      cand(16, 16, "SP", "P"),
      cand(17, 17, "SP", "P"),
      cand(18, 18, "SP", "P"),
      cand(19, 19, "SP", "P"),
      cand(20, 20, "RP", "P"),
      cand(21, 21, "RP", "P"),
      cand(22, 22, "RP", "P"),
      cand(23, 23, "RP", "P"),
    ];

    const start = performance.now();
    const result = resolveLineup(candidates, OGBA_SLOTS);
    const elapsed = performance.now() - start;

    expect(result.ok).toBe(true);
    expect(elapsed).toBeLessThan(50); // CI-safe envelope; usually <2ms.
  });

  it("stable sort — multiple runs return same assignment shape (no Map iteration surprises)", () => {
    const candidates: RosterCandidate[] = [
      cand(1, 100, "OF,2B", null),
      cand(2, 200, "SS,2B", null),
      cand(3, 300, "OF", null),
    ];
    const slots = { "2B": 1, SS: 1, OF: 1 };

    const r1 = resolveLineup(candidates, slots);
    const r2 = resolveLineup(candidates, slots);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.assignments).toEqual(r2.assignments);
    }
  });
});
