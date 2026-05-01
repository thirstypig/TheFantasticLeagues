// Complex-batch scenario tests for usePendingChanges.
//
// Covers the four direction-lock answers wired in this PR:
//   - Complex-#2: dependency detection + cascade-revert
//   - Complex-#3: save confirm threshold (caller-side; tested in
//     Team.complex.test.tsx — these focus on the hook primitives)
//   - Complex-#4 + #6: PendingChangeBatchError + state.failures
//   - Complex-#5: kindBreakdown / describeKindBreakdown helpers

import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  usePendingChanges,
  computeDependencies,
  kindBreakdown,
  describeKindBreakdown,
  PendingChangeBatchError,
  type PendingChange,
} from "../usePendingChanges";

function swap(
  id: string,
  fromRoster: number,
  fromSlot: string,
  toRoster: number,
  toSlot: string,
): PendingChange {
  return {
    id,
    kind: "swap",
    from: { rosterId: fromRoster, playerId: fromRoster + 1000, slot: fromSlot as any },
    to: { rosterId: toRoster, playerId: toRoster + 1000, slot: toSlot as any },
  };
}

function ilStash(id: string, rosterId: number, freed: string): PendingChange {
  return {
    id,
    kind: "il_stash",
    playerId: rosterId + 1000,
    mlbId: rosterId + 2000,
    rosterId,
    name: `Player ${rosterId}`,
    mlbStatus: "Injured 10-Day",
    freed: freed as any,
  };
}

function faAdd(
  id: string,
  targetSlot: string,
  displacedRosterId: number,
): PendingChange {
  return {
    id,
    kind: "fa_add",
    mlbId: 99999,
    faName: "Free Agent",
    targetSlot: targetSlot as any,
    displaced: {
      rosterId: displacedRosterId,
      playerId: displacedRosterId + 1000,
      mlbId: displacedRosterId + 2000,
      name: `Displaced ${displacedRosterId}`,
      slot: "BN" as any,
    },
  };
}

describe("computeDependencies", () => {
  it("returns no edges for an independent batch", () => {
    const edges = computeDependencies([
      swap("s1", 1, "2B", 2, "SS"),
      swap("s2", 50, "OF", 51, "DH"),
    ]);
    expect(edges).toHaveLength(0);
  });

  it("links an il_stash → fa_add chain that consumes the freed slot", () => {
    // Stash player from OF, then add a FA into the freed OF slot.
    const edges = computeDependencies([
      ilStash("st1", 7, "OF"),
      faAdd("fa1", "OF", 99),
    ]);
    expect(edges).toEqual([{ parent: "st1", child: "fa1" }]);
  });

  it("links a chain of three changes (swap → fa_add → fa_add)", () => {
    // swap frees rosterId 1; fa_add displaces rosterId 1 (depends on swap);
    // second fa_add displaces rosterId 50 (independent).
    const a = swap("a", 1, "2B", 2, "SS");
    const b = faAdd("b", "C", 1); // displaces rosterId 1, freed by `a`
    const c = faAdd("c", "DH", 50);
    const edges = computeDependencies([a, b, c]);
    expect(edges).toContainEqual({ parent: "a", child: "b" });
    expect(edges.find((e) => e.child === "c")).toBeUndefined();
  });

  it("does not link backwards — child must come after parent", () => {
    // Reverse the chain order; deps should be empty since fa_add comes
    // before the il_stash that would free its slot.
    const edges = computeDependencies([faAdd("fa1", "OF", 99), ilStash("st1", 7, "OF")]);
    expect(edges.find((e) => e.parent === "st1" && e.child === "fa1")).toBeUndefined();
  });
});

describe("revertChange cascade-revert", () => {
  it("reverts a parent and its dependent child together", () => {
    const { result } = renderHook(() =>
      usePendingChanges({ teamId: 7, saveFn: vi.fn(), persistDebounceMs: 0 }),
    );
    act(() => {
      result.current.addChange(ilStash("st1", 7, "OF"));
      result.current.addChange(faAdd("fa1", "OF", 99));
    });
    expect(result.current.state.changes).toHaveLength(2);
    act(() => {
      result.current.revertChange("st1");
    });
    // Both removed.
    expect(result.current.state.changes).toHaveLength(0);
  });

  it("does not cascade when reverting a child", () => {
    const { result } = renderHook(() =>
      usePendingChanges({ teamId: 7, saveFn: vi.fn(), persistDebounceMs: 0 }),
    );
    act(() => {
      result.current.addChange(ilStash("st1", 7, "OF"));
      result.current.addChange(faAdd("fa1", "OF", 99));
    });
    act(() => {
      result.current.revertChange("fa1");
    });
    expect(result.current.state.changes).toHaveLength(1);
    expect(result.current.state.changes[0].id).toBe("st1");
  });

  it("cascades through a chain of three", () => {
    const { result } = renderHook(() =>
      usePendingChanges({ teamId: 7, saveFn: vi.fn(), persistDebounceMs: 0 }),
    );
    // a frees roster 1 + slot 2B/SS; b displaces roster 1 (depends on a);
    // c displaces roster X (where X is freed by b's fa_add — fa_add
    // displaces b.displaced.rosterId == 1 actually no — fa_add's freed
    // slot is the displaced row's slot "BN"; we'd need a chain via
    // freed slots/rosters. Simulate: swap → swap → swap where each
    // touches a rosterId freed by the previous.
    act(() => {
      result.current.addChange(swap("a", 1, "2B", 2, "SS")); // frees 1, 2
      result.current.addChange(swap("b", 2, "SS", 3, "OF")); // touches 2 (child of a)
      result.current.addChange(swap("c", 3, "OF", 4, "DH")); // touches 3 (child of b)
    });
    expect(result.current.state.changes).toHaveLength(3);
    act(() => {
      result.current.revertChange("a");
    });
    // a has dependents b, b has dependent c — all three cascade-revert.
    expect(result.current.state.changes).toHaveLength(0);
  });
});

describe("PendingChangeBatchError + state.failures", () => {
  it("captures structured failures from saveFn rejection", async () => {
    const failure = {
      changeId: "fa1",
      kind: "fa_add" as const,
      reason: "Player no longer FA — cancel this change",
    };
    const saveFn = vi.fn().mockRejectedValue(
      new PendingChangeBatchError("Save failed — 1 change rolled back", [failure]),
    );
    const { result } = renderHook(() =>
      usePendingChanges({ teamId: 7, saveFn, persistDebounceMs: 0 }),
    );
    act(() => {
      result.current.addChange({ ...faAdd("fa1", "OF", 99), id: "fa1" } as PendingChange);
    });
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.state.failures).toHaveLength(1);
    expect(result.current.state.failures[0].changeId).toBe("fa1");
    expect(result.current.state.failures[0].reason).toMatch(/no longer FA/);
    // Atomic — change stays in the queue.
    expect(result.current.state.changes).toHaveLength(1);
  });

  it("clears failures on the next saveStart", async () => {
    const saveFn = vi
      .fn()
      .mockRejectedValueOnce(
        new PendingChangeBatchError("first fail", [
          { changeId: "fa1", kind: "fa_add", reason: "x" },
        ]),
      )
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() =>
      usePendingChanges({ teamId: 7, saveFn, persistDebounceMs: 0 }),
    );
    act(() => {
      result.current.addChange({ ...faAdd("fa1", "OF", 99), id: "fa1" } as PendingChange);
    });
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.state.failures).toHaveLength(1);
    await act(async () => {
      await result.current.save();
    });
    // Success cleared everything.
    expect(result.current.state.failures).toHaveLength(0);
    expect(result.current.state.changes).toHaveLength(0);
  });

  it("clearError clears failures", async () => {
    const saveFn = vi.fn().mockRejectedValue(
      new PendingChangeBatchError("oops", [
        { changeId: "fa1", kind: "fa_add", reason: "x" },
      ]),
    );
    const { result } = renderHook(() =>
      usePendingChanges({ teamId: 7, saveFn, persistDebounceMs: 0 }),
    );
    act(() => {
      result.current.addChange({ ...faAdd("fa1", "OF", 99), id: "fa1" } as PendingChange);
    });
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.state.failures).toHaveLength(1);
    act(() => {
      result.current.clearError();
    });
    expect(result.current.state.failures).toHaveLength(0);
    expect(result.current.state.error).toBeNull();
  });

  it("plain Error rejection produces no structured failures", async () => {
    const saveFn = vi.fn().mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() =>
      usePendingChanges({ teamId: 7, saveFn, persistDebounceMs: 0 }),
    );
    act(() => {
      result.current.addChange({ ...faAdd("fa1", "OF", 99), id: "fa1" } as PendingChange);
    });
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.state.error).toBe("network down");
    expect(result.current.state.failures).toHaveLength(0);
  });
});

describe("kindBreakdown / describeKindBreakdown", () => {
  it("tallies an empty queue as zeros", () => {
    expect(kindBreakdown([])).toEqual({ swap: 0, fa_add: 0, il_stash: 0, il_activate: 0 });
    expect(describeKindBreakdown(kindBreakdown([]))).toBe("no changes");
  });

  it("tallies a mixed batch", () => {
    const changes: PendingChange[] = [
      swap("a", 1, "2B", 2, "SS"),
      swap("b", 3, "OF", 4, "DH"),
      swap("c", 5, "C", 6, "1B"),
      faAdd("d", "OF", 7),
      ilStash("e", 8, "P"),
    ];
    const tally = kindBreakdown(changes);
    expect(tally).toEqual({ swap: 3, fa_add: 1, il_stash: 1, il_activate: 0 });
    expect(describeKindBreakdown(tally)).toBe("3 swaps, 1 FA add, 1 IL stash");
  });

  it("singularizes correctly", () => {
    expect(
      describeKindBreakdown({ swap: 1, fa_add: 1, il_stash: 0, il_activate: 1 }),
    ).toBe("1 swap, 1 FA add, 1 IL activation");
  });

  it("handles plural IL stashes", () => {
    expect(
      describeKindBreakdown({ swap: 0, fa_add: 0, il_stash: 2, il_activate: 0 }),
    ).toBe("2 IL stashes");
  });
});

describe("save threshold semantics", () => {
  // The threshold lives in the caller (Team.tsx) — these tests pin
  // the contract that `save()` is identical regardless of count, so
  // the caller's threshold logic is purely a UX gate.
  it("save() runs unconditionally with 1 change", async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      usePendingChanges({ teamId: 7, saveFn, persistDebounceMs: 0 }),
    );
    act(() => {
      result.current.addChange(swap("a", 1, "2B", 2, "SS"));
    });
    await act(async () => {
      await result.current.save();
    });
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn.mock.calls[0][0]).toHaveLength(1);
  });

  it("save() runs unconditionally with 4 changes", async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      usePendingChanges({ teamId: 7, saveFn, persistDebounceMs: 0 }),
    );
    act(() => {
      result.current.addChange(swap("a", 1, "2B", 2, "SS"));
      result.current.addChange(swap("b", 50, "OF", 51, "DH"));
      result.current.addChange(faAdd("c", "C", 60));
      result.current.addChange(ilStash("d", 70, "P"));
    });
    await act(async () => {
      await result.current.save();
    });
    expect(saveFn.mock.calls[0][0]).toHaveLength(4);
  });
});
