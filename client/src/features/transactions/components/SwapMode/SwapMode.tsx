// client/src/features/transactions/components/SwapMode/SwapMode.tsx
//
// Top-level container for the Swap Mode roster-arrangement UI. Composes
// 5 PositionGroupCards (Catchers / Infield / Outfield / Flex / Pitchers)
// and a pinned SwapActionBar. The 5-card layout matches §8 of the plan.
//
// This is a *pure props* component — both the static design preview at
// `/design/swap-mode` and the future PR2 production wiring drive it
// from outside. PR2 will introduce a SwapStateProvider context that
// computes `eligibleSlotKeys`, `selectedRosterId`, the pending queue,
// etc., from real roster data + interaction handlers.

import { CSSProperties, useMemo } from "react";
import { PositionGroupCard, slotKeyOf } from "./PositionGroupCard";
import { SwapActionBar } from "./SwapActionBar";
import type {
  PendingSwap,
  SwapModePlayer,
  SwapModePositionGroup,
} from "./types";
import { slotsFor, type SlotCode } from "../../../../lib/positionEligibility";

export interface SwapModeProps {
  groups: SwapModePositionGroup[];
  players: SwapModePlayer[];
  /** Currently selected rosterId (highlighted, drives eligibility glow). */
  selectedRosterId: number | null;
  /** Pending swap queue — drives dashed iridescent outlines. */
  pendingSwaps: PendingSwap[];
  /**
   * Optional cell-click callback. The static preview wires this to its
   * state toggler; PR2 wires it to a SwapStateProvider reducer.
   */
  onCellClick?: (rosterId: number | null, slotKey: string) => void;
  onReset?: () => void;
  onSave?: () => void;
  busy?: boolean;
}

/**
 * Build the eligible / ineligible slot key sets given a selected player.
 *
 * - eligibleSlotKeys: slots where this player COULD legally play.
 * - ineligibleSlotKeys: every other slot — used to dim non-options.
 *
 * When no selection, returns empty sets (cells render in default state).
 */
function buildHighlightSets(
  selected: SwapModePlayer | null,
  groups: SwapModePositionGroup[],
): { eligible: Set<string>; ineligible: Set<string> } {
  const eligible = new Set<string>();
  const ineligible = new Set<string>();
  if (!selected) return { eligible, ineligible };

  const eligibleCodes: ReadonlySet<SlotCode> = slotsFor(selected.posList);
  for (const group of groups) {
    for (const slot of group.slots) {
      const key = slotKeyOf(slot.code, slot.instanceIndex);
      // The selected player's own current cell shouldn't be either —
      // they're already there. Skip both sets for that slot.
      if (slot.occupantRosterId === selected.rosterId) continue;
      if (eligibleCodes.has(slot.code)) {
        eligible.add(key);
      } else {
        ineligible.add(key);
      }
    }
  }
  return { eligible, ineligible };
}

const wrapperStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  position: "relative",
};

// Desktop grid layout per §8 — Pitchers full-width on the bottom row,
// the four hitting groups in a 2-col grid above. Mobile stacks.
const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 14,
};

export function SwapMode({
  groups,
  players,
  selectedRosterId,
  pendingSwaps,
  onCellClick,
  onReset,
  onSave,
  busy,
}: SwapModeProps) {
  // O(1) player lookup by rosterId.
  const playerMap = useMemo(() => {
    const m = new Map<number, SwapModePlayer>();
    for (const p of players) m.set(p.rosterId, p);
    return m;
  }, [players]);

  const selected = selectedRosterId != null ? playerMap.get(selectedRosterId) ?? null : null;

  const { eligible, ineligible } = useMemo(
    () => buildHighlightSets(selected, groups),
    [selected, groups],
  );

  const pendingSourceKeys = useMemo(() => {
    const s = new Set<string>();
    for (const sw of pendingSwaps) s.add(slotKeyOf(sw.sourceSlot.code, sw.sourceSlot.instanceIndex));
    return s;
  }, [pendingSwaps]);

  const pendingDestKeys = useMemo(() => {
    const s = new Set<string>();
    for (const sw of pendingSwaps) s.add(slotKeyOf(sw.destSlot.code, sw.destSlot.instanceIndex));
    return s;
  }, [pendingSwaps]);

  // Split groups into hitter row (first 4) and pitcher row (last 1) so
  // the pitcher card can span the full width on desktop. If a layout
  // arrives with a different group count we fall back to a flat grid.
  const hitterGroups = groups.filter((g) => g.key !== "pitchers");
  const pitcherGroup = groups.find((g) => g.key === "pitchers");

  return (
    <div style={wrapperStyle}>
      <div style={gridStyle}>
        {hitterGroups.map((g) => (
          <PositionGroupCard
            key={g.key}
            group={g}
            players={playerMap}
            selectedRosterId={selectedRosterId}
            eligibleSlotKeys={eligible}
            ineligibleSlotKeys={ineligible}
            pendingSourceKeys={pendingSourceKeys}
            pendingDestKeys={pendingDestKeys}
            onCellClick={onCellClick}
          />
        ))}
      </div>

      {pitcherGroup && (
        <PositionGroupCard
          group={pitcherGroup}
          players={playerMap}
          selectedRosterId={selectedRosterId}
          eligibleSlotKeys={eligible}
          ineligibleSlotKeys={ineligible}
          pendingSourceKeys={pendingSourceKeys}
          pendingDestKeys={pendingDestKeys}
          onCellClick={onCellClick}
        />
      )}

      <SwapActionBar
        pendingCount={pendingSwaps.length}
        onReset={onReset}
        onSave={onSave}
        busy={busy}
      />
    </div>
  );
}
