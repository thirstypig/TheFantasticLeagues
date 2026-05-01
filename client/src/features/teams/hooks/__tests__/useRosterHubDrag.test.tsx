import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  useRosterHubDrag,
  encodeDndId,
  decodeDndId,
  encodeIlDndId,
  decodeIlDndId,
  encodeIlEmptyDndId,
  isIlEmptyDndId,
  isMlbIlStatusUi,
} from "../useRosterHubDrag";
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

// ─── FA scenario (this PR) ────────────────────────────────────────
//
// FA-source drag uses a different id prefix (`fa-row-${mlbId}`). When
// activated, the hook routes drops to onFaAdd with the displaced
// roster player attached. Eligibility is one-way (FA → target slot)
// vs the Hub's bidirectional swap rule.

describe("useRosterHubDrag — FA scenario", () => {
  const HITTER_2B = mkPlayer({ rosterId: 1, posList: "2B,SS", assignedSlot: "2B" });
  const HITTER_OF = mkPlayer({ rosterId: 3, playerId: 103, posList: "OF", assignedSlot: "OF" });
  const PITCHER_SP = mkPlayer({ rosterId: 10, playerId: 110, isPitcher: true, posList: "SP", posPrimary: "SP", assignedSlot: "P" });

  const FA_OF = {
    rowKey: "545361-H",
    mlbId: 545361,
    name: "Mike Trout",
    posList: "OF",
    posPrimary: "OF",
    mlbTeam: "LAA",
    isPitcher: false,
    projectedDollars: 38,
    statSnapshot: "40 HR · .301 AVG",
  };
  const FA_2B = {
    rowKey: "111-H",
    mlbId: 111,
    name: "Some 2B",
    posList: "2B",
    posPrimary: "2B",
    mlbTeam: "BOS",
    isPitcher: false,
    projectedDollars: 12,
    statSnapshot: "",
  };

  const FA_PITCHER = {
    rowKey: "222-P",
    mlbId: 222,
    name: "Closer",
    posList: "RP",
    posPrimary: "RP",
    mlbTeam: "BOS",
    isPitcher: true,
    projectedDollars: 8,
    statSnapshot: "",
  };

  it("FA drag start populates activeFaDragMlbId (NOT activeDragId)", () => {
    const { result } = renderHook(() =>
      useRosterHubDrag({
        players: [HITTER_2B, HITTER_OF],
        freeAgents: [FA_OF, FA_2B],
        onSwap: vi.fn(),
        onFaAdd: vi.fn(),
      }),
    );
    act(() => {
      result.current.handleDragStart({ active: { id: "fa-row-545361" } } as any);
    });
    expect(result.current.activeFaDragMlbId).toBe(545361);
    expect(result.current.activeDragId).toBeNull();
  });

  it("FA drop on eligible roster slot fires onFaAdd with displaced metadata", () => {
    const onFaAdd = vi.fn();
    const onSwap = vi.fn();
    const { result } = renderHook(() =>
      useRosterHubDrag({
        players: [HITTER_2B, HITTER_OF],
        freeAgents: [FA_OF],
        onSwap,
        onFaAdd,
      }),
    );
    act(() => {
      result.current.handleDragStart({ active: { id: "fa-row-545361" } } as any);
    });
    act(() => {
      result.current.handleDragEnd({
        active: { id: "fa-row-545361" },
        over: { id: encodeDndId(3) }, // HITTER_OF
      } as any);
    });
    expect(onSwap).not.toHaveBeenCalled();
    expect(onFaAdd).toHaveBeenCalledTimes(1);
    const change = onFaAdd.mock.calls[0][0];
    expect(change.kind).toBe("fa_add");
    expect(change.mlbId).toBe(545361);
    expect(change.targetSlot).toBe("OF");
    expect(change.displaced.rosterId).toBe(3);
    expect(change.displaced.playerId).toBe(103);
    expect(change.displaced.slot).toBe("OF");
  });

  it("FA drop on ineligible slot shake-rejects + toasts (no onFaAdd)", () => {
    const onFaAdd = vi.fn();
    const onToast = vi.fn();
    const { result } = renderHook(() =>
      useRosterHubDrag({
        players: [HITTER_2B, HITTER_OF],
        freeAgents: [FA_2B], // 2B-only FA
        onSwap: vi.fn(),
        onFaAdd,
        onToast,
      }),
    );
    act(() => {
      result.current.handleDragStart({ active: { id: "fa-row-111" } } as any);
    });
    act(() => {
      result.current.handleDragEnd({
        active: { id: "fa-row-111" },
        over: { id: encodeDndId(3) }, // HITTER_OF — 2B FA can't fill OF
      } as any);
    });
    expect(onFaAdd).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledTimes(1);
    expect(onToast.mock.calls[0][0]).toMatch(/isn't eligible at OF/);
    expect(result.current.shakeRowId).toBe(3);
  });

  it("FA cross-section drop (hitter FA → pitcher slot) shake-rejects", () => {
    const onFaAdd = vi.fn();
    const onToast = vi.fn();
    const { result } = renderHook(() =>
      useRosterHubDrag({
        players: [HITTER_2B, PITCHER_SP],
        freeAgents: [FA_OF],
        onSwap: vi.fn(),
        onFaAdd,
        onToast,
      }),
    );
    act(() => {
      result.current.handleDragStart({ active: { id: "fa-row-545361" } } as any);
    });
    act(() => {
      result.current.handleDragEnd({
        active: { id: "fa-row-545361" },
        over: { id: encodeDndId(10) },
      } as any);
    });
    expect(onFaAdd).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Cannot place .* in a pitcher slot/));
  });

  it("FA drag dropTargetIds reflects one-way FA→slot eligibility", () => {
    const { result } = renderHook(() =>
      useRosterHubDrag({
        players: [HITTER_2B, HITTER_OF],
        freeAgents: [FA_OF],
        onSwap: vi.fn(),
        onFaAdd: vi.fn(),
      }),
    );
    act(() => {
      result.current.handleDragStart({ active: { id: "fa-row-545361" } } as any);
    });
    // FA is OF-only — only HITTER_OF is a valid target.
    expect(result.current.dropTargetIds.has(3)).toBe(true);
    expect(result.current.dropTargetIds.has(1)).toBe(false);
  });

  it("FA drag dimSection dims the opposite role (hitter FA dims pitchers)", () => {
    const { result } = renderHook(() =>
      useRosterHubDrag({
        players: [HITTER_2B, PITCHER_SP],
        freeAgents: [FA_OF, FA_PITCHER],
        onSwap: vi.fn(),
        onFaAdd: vi.fn(),
      }),
    );
    act(() => {
      result.current.handleDragStart({ active: { id: "fa-row-545361" } } as any);
    });
    expect(result.current.dimSection).toBe("pitchers");
    act(() => {
      result.current.handleDragCancel();
      result.current.handleDragStart({ active: { id: "fa-row-222" } } as any);
    });
    expect(result.current.dimSection).toBe("hitters");
  });
});

// ─── IL scenario (this PR) ────────────────────────────────────────
//
// Two flows:
//   - Stash: Hub-source row → empty IL slot droppable. Gated client-side
//     by `isMlbIlStatusUi(mlbStatus)`; server is authoritative.
//   - Activate: IL-source row → active hub row. Cross-role rejected.

describe("IL id helpers", () => {
  it("encodeIlDndId / decodeIlDndId round-trip", () => {
    expect(decodeIlDndId(encodeIlDndId(99))).toBe(99);
  });
  it("decodeIlDndId returns null for non-IL prefix", () => {
    expect(decodeIlDndId(encodeDndId(99))).toBeNull();
  });
  it("isIlEmptyDndId matches the empty-slot prefix", () => {
    expect(isIlEmptyDndId(encodeIlEmptyDndId(0))).toBe(true);
    expect(isIlEmptyDndId(encodeIlEmptyDndId(2))).toBe(true);
    expect(isIlEmptyDndId(encodeDndId(2))).toBe(false);
  });
  it("isMlbIlStatusUi accepts MLB IL statuses verbatim", () => {
    expect(isMlbIlStatusUi("Injured 10-Day")).toBe(true);
    expect(isMlbIlStatusUi("Injured 60-Day")).toBe(true);
    expect(isMlbIlStatusUi("Injured List 15-Day")).toBe(true); // legacy
    expect(isMlbIlStatusUi("Active")).toBe(false);
    expect(isMlbIlStatusUi("Paternity")).toBe(false);
    expect(isMlbIlStatusUi(null)).toBe(false);
    expect(isMlbIlStatusUi(undefined)).toBe(false);
  });
});

describe("useRosterHubDrag — IL stash (hub row → empty IL slot)", () => {
  function mkPlayer(overrides: Partial<RosterHubPlayer>): RosterHubPlayer {
    return {
      rosterId: 1,
      playerId: 101,
      name: "Test",
      posList: "OF",
      posPrimary: "OF",
      assignedSlot: "OF",
      isPitcher: false,
      ...overrides,
    } as RosterHubPlayer;
  }

  const HITTER_INJURED = mkPlayer({
    rosterId: 1,
    playerId: 101,
    name: "Trea Turner",
    posList: "SS",
    posPrimary: "SS",
    assignedSlot: "SS",
    mlbStatus: "Injured 10-Day",
  });

  const HITTER_HEALTHY = mkPlayer({
    rosterId: 2,
    playerId: 102,
    name: "Mookie",
    posList: "OF",
    posPrimary: "OF",
    assignedSlot: "OF",
    mlbStatus: "Active",
  });

  it("ilStashEligible flips true when an injured Hub row is being dragged", () => {
    const { result } = renderHook(() =>
      useRosterHubDrag({
        players: [HITTER_INJURED, HITTER_HEALTHY],
        onSwap: vi.fn(),
        onIlStash: vi.fn(),
      }),
    );
    act(() => {
      result.current.handleDragStart({ active: { id: encodeDndId(1) } } as any);
    });
    expect(result.current.ilStashEligible).toBe(true);
    act(() => {
      result.current.handleDragCancel();
      result.current.handleDragStart({ active: { id: encodeDndId(2) } } as any);
    });
    expect(result.current.ilStashEligible).toBe(false);
  });

  it("dropping an injured hub row on an empty IL slot fires onIlStash with verbatim mlbStatus", () => {
    const onIlStash = vi.fn();
    const { result } = renderHook(() =>
      useRosterHubDrag({
        players: [HITTER_INJURED, HITTER_HEALTHY],
        onSwap: vi.fn(),
        onIlStash,
      }),
    );
    act(() => {
      result.current.handleDragStart({ active: { id: encodeDndId(1) } } as any);
    });
    act(() => {
      result.current.handleDragEnd({
        active: { id: encodeDndId(1) },
        over: { id: encodeIlEmptyDndId(0) },
      } as any);
    });
    expect(onIlStash).toHaveBeenCalledTimes(1);
    const change = onIlStash.mock.calls[0][0];
    expect(change.kind).toBe("il_stash");
    expect(change.playerId).toBe(101);
    expect(change.rosterId).toBe(1);
    expect(change.mlbStatus).toBe("Injured 10-Day"); // verbatim per IL #1
    expect(change.freed).toBe("SS");
  });

  it("dropping a healthy hub row on an empty IL slot shake-rejects + toasts (no onIlStash)", () => {
    const onIlStash = vi.fn();
    const onToast = vi.fn();
    const { result } = renderHook(() =>
      useRosterHubDrag({
        players: [HITTER_INJURED, HITTER_HEALTHY],
        onSwap: vi.fn(),
        onIlStash,
        onToast,
      }),
    );
    act(() => {
      result.current.handleDragStart({ active: { id: encodeDndId(2) } } as any);
    });
    act(() => {
      result.current.handleDragEnd({
        active: { id: encodeDndId(2) },
        over: { id: encodeIlEmptyDndId(0) },
      } as any);
    });
    expect(onIlStash).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/isn't on the MLB IL/));
    expect(result.current.shakeRowId).toBe(2);
  });
});

describe("useRosterHubDrag — IL activate (IL row → active hub row)", () => {
  function mkPlayer(overrides: Partial<RosterHubPlayer>): RosterHubPlayer {
    return {
      rosterId: 1,
      playerId: 101,
      name: "Test",
      posList: "OF",
      posPrimary: "OF",
      assignedSlot: "OF",
      isPitcher: false,
      ...overrides,
    } as RosterHubPlayer;
  }

  const ACTIVE_OF = mkPlayer({
    rosterId: 5,
    playerId: 505,
    name: "Active OF",
    posList: "OF",
    posPrimary: "OF",
    assignedSlot: "OF",
  });
  const ACTIVE_SS = mkPlayer({
    rosterId: 6,
    playerId: 606,
    name: "Active SS",
    posList: "SS",
    posPrimary: "SS",
    assignedSlot: "SS",
  });
  const ACTIVE_P = mkPlayer({
    rosterId: 7,
    playerId: 707,
    isPitcher: true,
    posList: "SP",
    posPrimary: "SP",
    assignedSlot: "P",
  });

  const IL_OF = mkPlayer({
    rosterId: 50,
    playerId: 5050,
    name: "Soto",
    posList: "OF",
    posPrimary: "OF",
    assignedSlot: "IL",
    mlbStatus: "Injured 60-Day",
  });
  const IL_PITCHER = mkPlayer({
    rosterId: 60,
    playerId: 6060,
    isPitcher: true,
    posList: "SP",
    posPrimary: "SP",
    name: "Yamamoto",
    assignedSlot: "IL",
    mlbStatus: "Injured 15-Day",
  });

  it("IL row drag start sets activeIlDragId (NOT activeDragId)", () => {
    const { result } = renderHook(() =>
      useRosterHubDrag({
        players: [ACTIVE_OF, ACTIVE_SS],
        ilPlayers: [IL_OF],
        onSwap: vi.fn(),
        onIlActivate: vi.fn(),
      }),
    );
    act(() => {
      result.current.handleDragStart({ active: { id: encodeIlDndId(50) } } as any);
    });
    expect(result.current.activeIlDragId).toBe(50);
    expect(result.current.activeDragId).toBeNull();
  });

  it("IL → eligible active slot fires onIlActivate with displaced metadata", () => {
    const onIlActivate = vi.fn();
    const { result } = renderHook(() =>
      useRosterHubDrag({
        players: [ACTIVE_OF, ACTIVE_SS],
        ilPlayers: [IL_OF],
        onSwap: vi.fn(),
        onIlActivate,
      }),
    );
    act(() => {
      result.current.handleDragStart({ active: { id: encodeIlDndId(50) } } as any);
    });
    act(() => {
      result.current.handleDragEnd({
        active: { id: encodeIlDndId(50) },
        over: { id: encodeDndId(5) }, // ACTIVE_OF
      } as any);
    });
    expect(onIlActivate).toHaveBeenCalledTimes(1);
    const change = onIlActivate.mock.calls[0][0];
    expect(change.kind).toBe("il_activate");
    expect(change.playerId).toBe(5050);
    expect(change.rosterId).toBe(50);
    expect(change.targetSlot).toBe("OF");
    expect(change.displaced.rosterId).toBe(5);
    expect(change.displaced.playerId).toBe(505);
  });

  it("IL → ineligible slot shake-rejects + toasts (no onIlActivate)", () => {
    const onIlActivate = vi.fn();
    const onToast = vi.fn();
    const { result } = renderHook(() =>
      useRosterHubDrag({
        players: [ACTIVE_OF, ACTIVE_SS],
        ilPlayers: [IL_OF],
        onSwap: vi.fn(),
        onIlActivate,
        onToast,
      }),
    );
    act(() => {
      result.current.handleDragStart({ active: { id: encodeIlDndId(50) } } as any);
    });
    act(() => {
      result.current.handleDragEnd({
        active: { id: encodeIlDndId(50) },
        over: { id: encodeDndId(6) }, // ACTIVE_SS — IL_OF only OF-eligible
      } as any);
    });
    expect(onIlActivate).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/isn't eligible at SS/));
    expect(result.current.shakeRowId).toBe(6);
  });

  it("Cross-role IL activation rejected per IL #7 (IL pitcher → hitter slot)", () => {
    const onIlActivate = vi.fn();
    const onToast = vi.fn();
    const { result } = renderHook(() =>
      useRosterHubDrag({
        players: [ACTIVE_OF, ACTIVE_P],
        ilPlayers: [IL_PITCHER],
        onSwap: vi.fn(),
        onIlActivate,
        onToast,
      }),
    );
    act(() => {
      result.current.handleDragStart({ active: { id: encodeIlDndId(60) } } as any);
    });
    act(() => {
      result.current.handleDragEnd({
        active: { id: encodeIlDndId(60) },
        over: { id: encodeDndId(5) }, // ACTIVE_OF — wrong role
      } as any);
    });
    expect(onIlActivate).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Cannot activate .* (in|into) a hitter slot/));
  });

  it("IL drag dropTargetIds reflects one-way IL→slot eligibility", () => {
    const { result } = renderHook(() =>
      useRosterHubDrag({
        players: [ACTIVE_OF, ACTIVE_SS],
        ilPlayers: [IL_OF],
        onSwap: vi.fn(),
        onIlActivate: vi.fn(),
      }),
    );
    act(() => {
      result.current.handleDragStart({ active: { id: encodeIlDndId(50) } } as any);
    });
    expect(result.current.dropTargetIds.has(5)).toBe(true); // OF row
    expect(result.current.dropTargetIds.has(6)).toBe(false); // SS row
  });
});
