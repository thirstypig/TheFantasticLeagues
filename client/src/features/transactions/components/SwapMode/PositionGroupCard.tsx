// client/src/features/transactions/components/SwapMode/PositionGroupCard.tsx
//
// One Aurora glass card per position group. Composes SlotCells in a
// CSS grid (Catchers / Infield / Outfield / Flex) or a vertical drag-
// reorderable list (Pitchers per resolved decision Q3).

import { CSSProperties } from "react";
import { Glass, SectionLabel } from "../../../../components/aurora/atoms";
import { SlotCell } from "./SlotCell";
import type { SwapModePlayer, SwapModePositionGroup } from "./types";

export interface PositionGroupCardProps {
  group: SwapModePositionGroup;
  /** Lookup: rosterId → player record. Pure prop in. */
  players: Map<number, SwapModePlayer>;
  /** rosterId currently selected (highlighted with iridescent ring). */
  selectedRosterId: number | null;
  /** Set of slot keys that should glow as eligible destinations. */
  eligibleSlotKeys: Set<string>;
  /** Set of slot keys that should appear dimmed/grayscaled. */
  ineligibleSlotKeys: Set<string>;
  /** Pending-swap source/dest highlights. */
  pendingSourceKeys: Set<string>;
  pendingDestKeys: Set<string>;
  /** Per-cell click handler (preview-only). */
  onCellClick?: (rosterId: number | null, slotKey: string) => void;
}

/** Compose slot key for set-membership lookups. */
export function slotKeyOf(code: string, idx: number): string {
  return `${code}:${idx}`;
}

export function PositionGroupCard({
  group,
  players,
  selectedRosterId,
  eligibleSlotKeys,
  ineligibleSlotKeys,
  pendingSourceKeys,
  pendingDestKeys,
  onCellClick,
}: PositionGroupCardProps) {
  // Layout choice: pitcher list is vertical to suggest drag reorder,
  // others use a responsive auto-fit grid. tuned `minmax` so cells stay
  // ~160-180px wide.
  const isDraggable = group.layout === "list-draggable";
  const innerStyle: CSSProperties = isDraggable
    ? {
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }
    : {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 10,
      };

  return (
    <Glass>
      <SectionLabel>{group.title}</SectionLabel>
      <div style={innerStyle}>
        {group.slots.map((slot) => {
          const key = slotKeyOf(slot.code, slot.instanceIndex);
          const occupant = slot.occupantRosterId != null ? players.get(slot.occupantRosterId) ?? null : null;
          const selected = occupant != null && occupant.rosterId === selectedRosterId;
          const eligibleHighlight = eligibleSlotKeys.has(key);
          const ineligibleDimmed = ineligibleSlotKeys.has(key);
          const pendingSource = pendingSourceKeys.has(key);
          const pendingDest = pendingDestKeys.has(key);

          return (
            <SlotCell
              key={key}
              slotCode={slot.code}
              instanceIndex={slot.instanceIndex}
              occupant={occupant}
              selected={selected}
              eligibleHighlight={eligibleHighlight}
              ineligibleDimmed={ineligibleDimmed}
              pendingSource={pendingSource}
              pendingDest={pendingDest}
              dragHandle={isDraggable}
              onClick={onCellClick ? () => onCellClick(occupant?.rosterId ?? null, key) : undefined}
            />
          );
        })}
      </div>
    </Glass>
  );
}
