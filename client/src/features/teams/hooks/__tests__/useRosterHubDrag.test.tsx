import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRosterHubDrag, encodeDndId, decodeDndId } from "../useRosterHubDrag";
import type { RosterHubPlayer } from "../../components/RosterHub/types";

// Minimal subset of player shape needed by the hook.
function mkPlayer(overrides: Partial<RosterHubPlayer>): RosterHubPlayer {
  return {
    rosterId: 1,
    playerId: 101,
    name: "Test",
    posList: "2B",
    posPrimary: "2B",
    assignedSlot: "2B",
    isPitcher: false,
    ...overrides,
  } as RosterHubPlayer;
}

describe("encodeDndId / decodeDndId", () => {
  it("round-trips a positive integer", () => {
    expect(decodeDndId(encodeDndId(42))).toBe(42);
  });

  it("returns null for unprefixed input", () => {
    expect(decodeDndId("42")).toBeNull();
  });

  it("returns null for non-numeric suffix", () => {
    expect(decodeDndId("hub-row-abc")).toBeNull();
  });
});

describe("useRosterHubDrag", () => {
  const HITTER_2B = mkPlayer({ rosterId: 1, posList: "2B,SS", assignedSlot: "2B" });
  const HITTER_SS = mkPlayer({ rosterId: 2, playerId: 102, posList: "SS,2B", assignedSlot: "SS" });
  const HITTER_OF = mkPlayer({ rosterId: 3, playerId: 103, posList: "OF", assignedSlot: "OF" });
  const PITCHER = mkPlayer({ rosterId: 10, playerId: 110, isPitcher: true, posList: "SP", posPrimary: "SP", assignedSlot: "P" });

  it("starts idle (no active drag, no targets)", () => {
    const { result } = renderHook(() =>
      useRosterHubDrag({ players: [HITTER_2B, HITTER_SS], onSwap: vi.fn() }),
    );
    expect(result.current.activeDragId).toBeNull();
    expect(result.current.dropTargetIds.size).toBe(0);
    expect(result.current.dimSection).toBeNull();
    expect(result.current.shakeRowId).toBeNull();
  });

  it("populates eligible drop targets on drag start (bidirectional swap eligibility)", () => {
    const { result } = renderHook(() =>
      useRosterHubDrag({ players: [HITTER_2B, HITTER_SS, HITTER_OF], onSwap: vi.fn() }),
    );
    act(() => {
      result.current.handleDragStart({ active: { id: encodeDndId(1) } } as any);
    });
    expect(result.current.activeDragId).toBe(1);
    // Player 1 (2B/SS) ↔ Player 2 (SS/2B) is bidirectional-eligible.
    // Player 3 (OF) is NOT eligible at 2B nor is player 1 eligible at OF.
    expect(result.current.dropTargetIds.has(2)).toBe(true);
    expect(result.current.dropTargetIds.has(3)).toBe(false);
  });

  it("dims the opposite section during a drag (hitter drag → dim hitters? no, dim opposite)", () => {
    const { result } = renderHook(() =>
      useRosterHubDrag({ players: [HITTER_2B, PITCHER], onSwap: vi.fn() }),
    );
    act(() => {
      result.current.handleDragStart({ active: { id: encodeDndId(1) } } as any);
    });
    // Hitter being dragged → pitchers section is the opposite, but the hook
    // returns "hitters" or "pitchers" referring to which section to dim.
    // Per the spec: when a hitter is dragged, pitcher slots can't accept;
    // dimSection signals to the hub which section to dim. The hook returns
    // "hitters" when a pitcher is dragged (dimming hitter section), and
    // "pitchers" when a hitter is dragged.
    expect(result.current.dimSection).toBe("pitchers");
  });

  it("queues an onSwap on a legal drop and clears active drag", () => {
    const onSwap = vi.fn();
    const { result } = renderHook(() =>
      useRosterHubDrag({ players: [HITTER_2B, HITTER_SS], onSwap }),
    );
    act(() => {
      result.current.handleDragStart({ active: { id: encodeDndId(1) } } as any);
    });
    act(() => {
      result.current.handleDragEnd({
        active: { id: encodeDndId(1) },
        over: { id: encodeDndId(2) },
      } as any);
    });
    expect(onSwap).toHaveBeenCalledTimes(1);
    expect(onSwap.mock.calls[0][0]).toMatchObject({
      kind: "swap",
      from: { rosterId: 1, slot: "2B" },
      to: { rosterId: 2, slot: "SS" },
    });
    expect(result.current.activeDragId).toBeNull();
  });

  it("rejects a cross-section drop with a shake + toast", () => {
    const onSwap = vi.fn();
    const onToast = vi.fn();
    const { result } = renderHook(() =>
      useRosterHubDrag({ players: [HITTER_2B, PITCHER], onSwap, onToast }),
    );
    act(() => {
      result.current.handleDragStart({ active: { id: encodeDndId(1) } } as any);
    });
    act(() => {
      result.current.handleDragEnd({
        active: { id: encodeDndId(1) },
        over: { id: encodeDndId(10) },
      } as any);
    });
    expect(onSwap).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledTimes(1);
    expect(onToast.mock.calls[0][0]).toMatch(/pitcher slot/i);
    expect(result.current.shakeRowId).toBe(10);
  });

  it("rejects an ineligible same-section drop with a shake + toast", () => {
    const onSwap = vi.fn();
    const onToast = vi.fn();
    const { result } = renderHook(() =>
      useRosterHubDrag({ players: [HITTER_2B, HITTER_OF], onSwap, onToast }),
    );
    act(() => {
      result.current.handleDragStart({ active: { id: encodeDndId(1) } } as any);
    });
    act(() => {
      result.current.handleDragEnd({
        active: { id: encodeDndId(1) },
        over: { id: encodeDndId(3) },
      } as any);
    });
    expect(onSwap).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledTimes(1);
    expect(onToast.mock.calls[0][0]).toMatch(/eligible at OF/i);
  });

  it("ignores a self-drop (drop on source row)", () => {
    const onSwap = vi.fn();
    const { result } = renderHook(() =>
      useRosterHubDrag({ players: [HITTER_2B], onSwap }),
    );
    act(() => {
      result.current.handleDragStart({ active: { id: encodeDndId(1) } } as any);
    });
    act(() => {
      result.current.handleDragEnd({
        active: { id: encodeDndId(1) },
        over: { id: encodeDndId(1) },
      } as any);
    });
    expect(onSwap).not.toHaveBeenCalled();
  });

  it("handleDragCancel clears the active drag without firing onSwap", () => {
    const onSwap = vi.fn();
    const { result } = renderHook(() =>
      useRosterHubDrag({ players: [HITTER_2B, HITTER_SS], onSwap }),
    );
    act(() => {
      result.current.handleDragStart({ active: { id: encodeDndId(1) } } as any);
      result.current.handleDragCancel();
    });
    expect(result.current.activeDragId).toBeNull();
    expect(onSwap).not.toHaveBeenCalled();
  });
});
