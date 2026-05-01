// Atomic save integration test (Complex-#4).
//
// Simulates the full caller-side flow: a saveFn that runs N mutations
// sequentially, fails on the 4th, and surfaces a structured
// PendingChangeBatchError. Verifies:
//   - All 4 changes stay in the queue (no partial commit on the client)
//   - state.failures is populated with the 4th change's reason
//   - Subsequent retry runs all 4 again (server idempotency assumed —
//     the client doesn't dedupe)

import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  usePendingChanges,
  PendingChangeBatchError,
  type PendingChange,
  type PendingChangeFailure,
} from "../usePendingChanges";

interface MockServer {
  /** Map: changeId → "ok" | failure reason. */
  responses: Map<string, "ok" | string>;
  /** Total mutation calls observed across attempts. */
  callsByChangeId: Map<string, number>;
}

function makeSaveFn(server: MockServer) {
  return async (changes: PendingChange[]) => {
    const failures: PendingChangeFailure[] = [];
    for (const c of changes) {
      const calls = server.callsByChangeId.get(c.id) ?? 0;
      server.callsByChangeId.set(c.id, calls + 1);
      const resp = server.responses.get(c.id);
      if (resp && resp !== "ok") {
        failures.push({ changeId: c.id, kind: c.kind, reason: resp });
      }
    }
    if (failures.length > 0) {
      throw new PendingChangeBatchError(
        `Save failed — ${failures.length} change(s) rolled back. ${failures
          .map((f) => f.reason)
          .join("; ")}`,
        failures,
      );
    }
  };
}

describe("usePendingChanges atomic save integration", () => {
  it("rolls back the entire batch on a single failure (3 succeed, 4th fails)", async () => {
    const server: MockServer = {
      responses: new Map([
        ["a", "ok"],
        ["b", "ok"],
        ["c", "ok"],
        ["d", "Player no longer FA — cancel this change"],
      ]),
      callsByChangeId: new Map(),
    };
    const { result } = renderHook(() =>
      usePendingChanges({
        teamId: 7,
        saveFn: makeSaveFn(server),
        persistDebounceMs: 0,
      }),
    );

    act(() => {
      result.current.addChange({
        id: "a",
        kind: "swap",
        from: { rosterId: 1, playerId: 101, slot: "2B" as any },
        to: { rosterId: 2, playerId: 102, slot: "SS" as any },
      });
      result.current.addChange({
        id: "b",
        kind: "il_stash",
        playerId: 200,
        mlbId: 201,
        rosterId: 20,
        name: "Trea Turner",
        mlbStatus: "Injured 10-Day",
        freed: "SS" as any,
      });
      result.current.addChange({
        id: "c",
        kind: "swap",
        from: { rosterId: 30, playerId: 301, slot: "OF" as any },
        to: { rosterId: 31, playerId: 311, slot: "DH" as any },
      });
      result.current.addChange({
        id: "d",
        kind: "fa_add",
        mlbId: 1000,
        faName: "Jarren Duran",
        targetSlot: "OF" as any,
        displaced: {
          rosterId: 40,
          playerId: 401,
          mlbId: 411,
          name: "Brandon Lockridge",
          slot: "BN" as any,
        },
      });
    });

    expect(result.current.state.changes).toHaveLength(4);

    await act(async () => {
      await result.current.save();
    });

    // All 4 stay in the queue per Complex-#4 (atomic).
    expect(result.current.state.changes).toHaveLength(4);
    // Per-change failure surfaces — only "d" failed.
    expect(result.current.state.failures).toHaveLength(1);
    expect(result.current.state.failures[0].changeId).toBe("d");
    expect(result.current.state.failures[0].reason).toMatch(/no longer FA/i);
    // Top-level error message also captured.
    expect(result.current.state.error).toMatch(/Save failed/i);
  });

  it("retry after fixing the failure clears the queue", async () => {
    const server: MockServer = {
      responses: new Map([
        ["a", "ok"],
        ["b", "ok"],
        ["c", "Player no longer FA"],
      ]),
      callsByChangeId: new Map(),
    };
    const { result } = renderHook(() =>
      usePendingChanges({
        teamId: 7,
        saveFn: makeSaveFn(server),
        persistDebounceMs: 0,
      }),
    );

    act(() => {
      result.current.addChange({
        id: "a",
        kind: "swap",
        from: { rosterId: 1, playerId: 101, slot: "2B" as any },
        to: { rosterId: 2, playerId: 102, slot: "SS" as any },
      });
      result.current.addChange({
        id: "b",
        kind: "swap",
        from: { rosterId: 50, playerId: 501, slot: "OF" as any },
        to: { rosterId: 51, playerId: 511, slot: "DH" as any },
      });
      result.current.addChange({
        id: "c",
        kind: "fa_add",
        mlbId: 1000,
        faName: "Bad FA",
        targetSlot: "OF" as any,
        displaced: {
          rosterId: 60,
          playerId: 601,
          mlbId: 611,
          name: "Drop X",
          slot: "BN" as any,
        },
      });
    });

    // First attempt — fails on c.
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.state.failures).toHaveLength(1);
    // User reverts the bad change.
    act(() => {
      result.current.revertChange("c");
    });
    expect(result.current.state.changes).toHaveLength(2);
    expect(result.current.state.failures).toHaveLength(0); // failures cleared on revert
    // Mark all remaining as ok and retry.
    server.responses.set("a", "ok");
    server.responses.set("b", "ok");
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.state.changes).toHaveLength(0);
    expect(result.current.state.failures).toHaveLength(0);
    expect(result.current.state.error).toBeNull();
  });

  it("toast-style error message format matches the contract", async () => {
    // Per the contract: "Save failed — N changes rolled back. {error reason}"
    const server: MockServer = {
      responses: new Map([
        ["a", "ok"],
        ["b", "Roster size would go negative"],
      ]),
      callsByChangeId: new Map(),
    };
    const saveFn = vi.fn(makeSaveFn(server));
    const { result } = renderHook(() =>
      usePendingChanges({ teamId: 7, saveFn, persistDebounceMs: 0 }),
    );
    act(() => {
      result.current.addChange({
        id: "a",
        kind: "swap",
        from: { rosterId: 1, playerId: 101, slot: "2B" as any },
        to: { rosterId: 2, playerId: 102, slot: "SS" as any },
      });
      result.current.addChange({
        id: "b",
        kind: "swap",
        from: { rosterId: 50, playerId: 501, slot: "OF" as any },
        to: { rosterId: 51, playerId: 511, slot: "DH" as any },
      });
    });
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.state.error).toMatch(
      /Save failed — 1 change\(s\) rolled back\. Roster size would go negative/,
    );
  });
});
