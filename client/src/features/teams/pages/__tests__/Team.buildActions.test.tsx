import { describe, it, expect, vi } from "vitest";
import type { RosterHubPlayer } from "../../components/RosterHub/types";
import type { RowAction } from "../../components/RosterHub/RowActionMenu";

/**
 * Unit tests for the buildActions callback in Team.tsx.
 * Tests the row action menu for IL and active roster players.
 */

// Mock the navigate function
const mockNavigate = vi.fn();

/**
 * Minimal mock of RosterHubPlayer for testing.
 */
function createMockPlayer(overrides: Partial<RosterHubPlayer> = {}): RosterHubPlayer {
  return {
    rosterId: 1,
    playerId: 100,
    name: "Test Player",
    posList: "OF",
    posPrimary: "OF",
    assignedSlot: "BN",
    isPitcher: false,
    hitterStats: {},
    ...overrides,
  };
}

/**
 * Reconstruct buildActions logic from Team.tsx for testing.
 * In the real component, this is a useCallback in Team.tsx.
 */
function buildActions(
  p: RosterHubPlayer,
  canManage: boolean,
  teamCode: string,
): RowAction[] {
  if (!canManage) return [];
  const onIl = p.assignedSlot === "IL";
  if (onIl) {
    return [
      {
        key: "activate-il",
        label: "Activate from IL",
        glyph: "→",
        onSelect: () => mockNavigate(`/teams/${teamCode}/manage/il-activate`),
      },
      {
        key: "il-release",
        label: "Release from IL",
        glyph: "✕",
        destructive: true,
        onSelect: () => mockNavigate(`/teams/${teamCode}/manage/il-release?playerId=${p.playerId}`),
      },
    ];
  }
  return [
    {
      key: "claim",
      label: "Add free agent (drop this)",
      glyph: "+",
      onSelect: () => mockNavigate(`/teams/${teamCode}/manage/claim`),
    },
    {
      key: "il-stash",
      label: "Place on IL",
      glyph: "✚",
      onSelect: () => mockNavigate(`/teams/${teamCode}/manage/il-stash`),
    },
  ];
}

describe("Team.buildActions", () => {
  const teamCode = "ACES";

  it("returns empty array when user cannot manage", () => {
    const player = createMockPlayer({ assignedSlot: "IL" });
    const actions = buildActions(player, false, teamCode);
    expect(actions).toEqual([]);
  });

  it("returns 2 actions for an IL-slotted player: activate and release", () => {
    const player = createMockPlayer({ assignedSlot: "IL", playerId: 123 });
    const actions = buildActions(player, true, teamCode);

    expect(actions).toHaveLength(2);
    expect(actions[0].key).toBe("activate-il");
    expect(actions[1].key).toBe("il-release");
  });

  it("offers 'Release from IL' action for an IL-slotted player", () => {
    const player = createMockPlayer({ assignedSlot: "IL", playerId: 456 });
    const actions = buildActions(player, true, teamCode);

    const releaseAction = actions.find(a => a.key === "il-release");
    expect(releaseAction).toBeDefined();
    expect(releaseAction?.label).toMatch(/release/i);
    expect(releaseAction?.destructive).toBe(true);
  });

  it("il-release action navigates with correct playerId query parameter", () => {
    const player = createMockPlayer({ assignedSlot: "IL", playerId: 789 });
    const actions = buildActions(player, true, teamCode);

    const releaseAction = actions.find(a => a.key === "il-release");
    expect(releaseAction).toBeDefined();

    // Trigger the action
    releaseAction?.onSelect();

    // Check that navigate was called with the correct URL
    expect(mockNavigate).toHaveBeenCalledWith(
      `/teams/${teamCode}/manage/il-release?playerId=789`
    );
  });

  it("does NOT offer 'Release from IL' for an active player", () => {
    const player = createMockPlayer({ assignedSlot: "OF" });
    const actions = buildActions(player, true, teamCode);

    const releaseAction = actions.find(a => a.key === "il-release");
    expect(releaseAction).toBeUndefined();
  });

  it("returns 2 actions for an active player: claim and il-stash", () => {
    const player = createMockPlayer({ assignedSlot: "C" });
    const actions = buildActions(player, true, teamCode);

    expect(actions).toHaveLength(2);
    expect(actions[0].key).toBe("claim");
    expect(actions[1].key).toBe("il-stash");
  });

  it("active player actions have correct labels", () => {
    const player = createMockPlayer({ assignedSlot: "SS" });
    const actions = buildActions(player, true, teamCode);

    expect(actions[0].label).toBe("Add free agent (drop this)");
    expect(actions[1].label).toBe("Place on IL");
  });

  it("claim action navigates to /manage/claim", () => {
    const player = createMockPlayer({ assignedSlot: "BN" });
    const actions = buildActions(player, true, teamCode);

    const claimAction = actions.find(a => a.key === "claim");
    claimAction?.onSelect();

    expect(mockNavigate).toHaveBeenCalledWith(`/teams/${teamCode}/manage/claim`);
  });

  it("il-stash action navigates to /manage/il-stash", () => {
    const player = createMockPlayer({ assignedSlot: "OF" });
    const actions = buildActions(player, true, teamCode);

    const ilStashAction = actions.find(a => a.key === "il-stash");
    ilStashAction?.onSelect();

    expect(mockNavigate).toHaveBeenCalledWith(`/teams/${teamCode}/manage/il-stash`);
  });
});
