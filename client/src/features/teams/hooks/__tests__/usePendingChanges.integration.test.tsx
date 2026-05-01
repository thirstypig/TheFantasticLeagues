// Integration test for the swap → save → success flow.
//
// Exercises usePendingChanges as the caller (Team.tsx) uses it: queue
// a swap, call save() with a saveFn that simulates 2 PATCH calls per
// change, verify the queue clears and persistence is removed.

import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePendingChanges, type PendingChange } from "../usePendingChanges";

interface MockApi {
  updateRosterPosition: (teamId: number, rosterId: number, slot: string) => Promise<void>;
}

function makeSaveFn(api: MockApi, teamId: number) {
  return async (changes: PendingChange[]) => {
    for (const c of changes) {
      if (c.kind !== "swap") continue;
      await api.updateRosterPosition(teamId, c.from.rosterId, c.to.slot);
      await api.updateRosterPosition(teamId, c.to.rosterId, c.from.slot);
    }
  };
}

describe("usePendingChanges integration — swap save flow", () => {
  it("dispatches 2 mutations per swap and clears the queue on success", async () => {
    const updateRosterPosition = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      usePendingChanges({
        teamId: 7,
        saveFn: makeSaveFn({ updateRosterPosition }, 7),
        persistDebounceMs: 0,
      }),
    );

    act(() => {
      result.current.addChange({
        kind: "swap",
        from: { rosterId: 1, playerId: 100, slot: "2B" },
        to: { rosterId: 2, playerId: 200, slot: "SS" },
      } as Omit<PendingChange, "id">);
    });

    await act(async () => {
      await result.current.save();
    });

    expect(updateRosterPosition).toHaveBeenCalledTimes(2);
    expect(updateRosterPosition).toHaveBeenNthCalledWith(1, 7, 1, "SS");
    expect(updateRosterPosition).toHaveBeenNthCalledWith(2, 7, 2, "2B");
    expect(result.current.state.changes).toHaveLength(0);
    expect(result.current.state.error).toBeNull();
  });

  it("propagates a mutation failure as the banner error and keeps the queue", async () => {
    const updateRosterPosition = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("conflict at SS"));
    const { result } = renderHook(() =>
      usePendingChanges({
        teamId: 7,
        saveFn: makeSaveFn({ updateRosterPosition }, 7),
        persistDebounceMs: 0,
      }),
    );

    act(() => {
      result.current.addChange({
        kind: "swap",
        from: { rosterId: 1, playerId: 100, slot: "2B" },
        to: { rosterId: 2, playerId: 200, slot: "SS" },
      } as Omit<PendingChange, "id">);
    });

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.state.error).toMatch(/conflict at SS/);
    expect(result.current.state.changes).toHaveLength(1);
  });

  it("retries successfully after a transient failure", async () => {
    const updateRosterPosition = vi
      .fn()
      .mockRejectedValueOnce(new Error("network glitch"))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      usePendingChanges({
        teamId: 7,
        saveFn: makeSaveFn({ updateRosterPosition }, 7),
        persistDebounceMs: 0,
      }),
    );

    act(() => {
      result.current.addChange({
        kind: "swap",
        from: { rosterId: 1, playerId: 100, slot: "2B" },
        to: { rosterId: 2, playerId: 200, slot: "SS" },
      } as Omit<PendingChange, "id">);
    });

    // First save fails on the first PATCH.
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.state.error).toMatch(/network glitch/);
    expect(result.current.state.changes).toHaveLength(1);

    // Retry — both PATCHes succeed.
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.state.error).toBeNull();
    expect(result.current.state.changes).toHaveLength(0);
  });
});
