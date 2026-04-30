// client/src/features/teams/components/RosterHub/RosterRow.tsx
//
// One row in the hub's main roster table. Strictly props-driven —
// knows nothing about state management or API calls — so PR2 can
// swap in real handlers without restructuring.
//
// Memoized via `React.memo` keyed on (playerId, slot, isSelected,
// isEligible, isPending) per the perf-oracle guidance. The default
// shallow-equality check is sufficient because the parent passes
// stable callback refs from `useCallback`.

import React, { useRef, useState } from "react";
import { ThemedTr, ThemedTd } from "../../../../components/ui/ThemedTable";
import { PositionPill } from "./PositionPill";
import { EligibilityChips } from "./EligibilityChips";
import { RowActionMenu, type RowAction } from "./RowActionMenu";
import type { RosterHubPlayer } from "./types";

interface RosterRowProps {
  player: RosterHubPlayer;
  /** True iff this row's player is the currently-selected player. */
  isSelected: boolean;
  /**
   * True iff a different player is selected and this row is a legal
   * destination for the swap. Drives the iridescent row glow.
   */
  isEligible: boolean;
  /**
   * True iff some other player is selected and this row is NOT
   * eligible — drives the dimmed treatment.
   */
  isDimmed: boolean;
  /** True iff this row is part of a queued pending change. */
  isPending: boolean;
  /** True iff this row is the source of an in-progress drag (preview-only). */
  isDragSource: boolean;
  /** True iff this row is currently a drop target for an in-progress drag. */
  isDropTarget: boolean;
  /** Click handler on the position pill. */
  onPillClick: () => void;
  /** Revert handler for pending rows (the inline ↩ icon at row end). */
  onRevert?: () => void;
  /** Action menu options — caller determines which apply per row. */
  actions: RowAction[];
}

function RosterRowImpl({
  player,
  isSelected,
  isEligible,
  isDimmed,
  isPending,
  isDragSource,
  isDropTarget,
  onPillClick,
  onRevert,
  actions,
}: RosterRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const onTriggerClick = () => {
    if (triggerRef.current) {
      setAnchorRect(triggerRef.current.getBoundingClientRect());
    }
    setMenuOpen(true);
  };

  // Compose the row className from visual states. Each is applied
  // independently — selected wins over eligible wins over dimmed via
  // CSS specificity rules baked into `rosterHub.css`.
  const rowClasses: string[] = [];
  if (isPending) rowClasses.push("am-roster-row-pending");
  if (isEligible && !isPending) rowClasses.push("am-roster-row-eligible");
  if (isDimmed) rowClasses.push("am-roster-row-dimmed");
  if (isDragSource) rowClasses.push("am-roster-row-dragging-source");
  if (isDropTarget) rowClasses.push("am-roster-row-drop-target");

  return (
    <ThemedTr className={rowClasses.join(" ")}>
      {/* Slot pill — primary affordance per the §0 north star. */}
      <ThemedTd>
        <PositionPill
          slot={player.assignedSlot}
          selected={isSelected}
          eligible={isEligible && !isSelected}
          dimmed={isDimmed}
          onClick={onPillClick}
          ariaLabel={`${player.name} — ${player.assignedSlot} slot — tap to ${
            isSelected ? "deselect" : "select"
          }`}
        />
      </ThemedTd>

      {/* Player name + team. The pending marker dot prefixes the name. */}
      <ThemedTd>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--am-text)" }}>
            {isPending && <span aria-hidden className="am-roster-name-modified-marker" />}
            {player.isKeeper && (
              <span aria-label="Keeper" style={{ color: "#fbbf24", marginRight: 6 }}>
                ★
              </span>
            )}
            {player.name}
          </span>
          <span style={{ fontSize: 11, color: "var(--am-text-faint)", letterSpacing: 0.4 }}>
            {(player.mlbTeam ?? "FA") + " · " + player.posPrimary}
          </span>
        </div>
      </ThemedTd>

      {/* Eligibility chip row — all SlotCodes the player can fill. */}
      <ThemedTd>
        <EligibilityChips posList={player.posList} />
      </ThemedTd>

      {/* Stat snapshot — display-only string. */}
      <ThemedTd>
        <span style={{ fontSize: 12, color: "var(--am-text-muted)", fontVariantNumeric: "tabular-nums" }}>
          {player.statSnapshot ?? "—"}
        </span>
      </ThemedTd>

      {/* Actions cell — "..." trigger + (when pending) revert icon. */}
      <ThemedTd align="right">
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
          {isPending && onRevert && (
            <button
              type="button"
              className="am-roster-revert-button"
              onClick={onRevert}
              aria-label={`Revert pending change for ${player.name}`}
              title="Revert this change"
            >
              ↩
            </button>
          )}
          <button
            type="button"
            ref={triggerRef}
            className="am-roster-action-trigger"
            onClick={onTriggerClick}
            aria-label={`Open actions menu for ${player.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            …
          </button>
          <RowActionMenu actions={actions} open={menuOpen} onClose={() => setMenuOpen(false)} anchorRect={anchorRect} />
        </div>
      </ThemedTd>
    </ThemedTr>
  );
}

/**
 * Memoization keyed on the visible-state inputs. Identity of the
 * `actions` array is allowed to change because the menu is only
 * mounted when open — closed-menu re-renders are cheap.
 */
export const RosterRow = React.memo(RosterRowImpl, (prev, next) => {
  return (
    prev.player.rosterId === next.player.rosterId &&
    prev.player.assignedSlot === next.player.assignedSlot &&
    prev.isSelected === next.isSelected &&
    prev.isEligible === next.isEligible &&
    prev.isDimmed === next.isDimmed &&
    prev.isPending === next.isPending &&
    prev.isDragSource === next.isDragSource &&
    prev.isDropTarget === next.isDropTarget
  );
});
