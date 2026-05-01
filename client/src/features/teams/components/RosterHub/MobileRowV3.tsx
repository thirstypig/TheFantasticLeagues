// client/src/features/teams/components/RosterHub/MobileRowV3.tsx
//
// v3 mobile collapsed row — uses the merged Position+Eligibility cell
// (refinement #3) and shows a compact role-aware stat line below the
// name. Sectioned headers ("Hitters" / "Pitchers") are rendered by the
// parent (RosterHubV3); this component renders one row.

import React, { useRef, useState } from "react";
import { PositionEligibilityCell } from "./PositionEligibilityCell";
import { RowActionMenu, type RowAction } from "./RowActionMenu";
import type { RosterHubPlayer } from "./types";

/**
 * Mobile-row DnD wiring. Same shape as RosterRowV3's RosterRowDnd but
 * keyed for an HTMLDivElement. The grab handle uses long-press via
 * dnd-kit's TouchSensor (250ms activation distance).
 */
export interface MobileRowDnd {
  rowRef?: React.Ref<HTMLDivElement>;
  dragHandleAttrs?: React.HTMLAttributes<HTMLButtonElement> & {
    role?: string;
    tabIndex?: number;
  };
  isDragging?: boolean;
  isOverEligible?: boolean;
  rowStyle?: React.CSSProperties;
}

interface MobileRowV3Props {
  player: RosterHubPlayer;
  role: "hitter" | "pitcher";
  isSelected: boolean;
  isEligible: boolean;
  isDimmed: boolean;
  isPending: boolean;
  onPillClick: () => void;
  onRevert?: () => void;
  actions: RowAction[];
  dnd?: MobileRowDnd;
  isShakeRejecting?: boolean;
}

function statSummaryFor(player: RosterHubPlayer): string {
  // Per todo #153 — the `isPitcher` discriminant narrows the union so
  // the role-keyed stat object is statically known. No more dual-branch
  // optional-chaining on a wide type.
  if (!player.isPitcher) {
    const s = player.hitterStats ?? {};
    const parts: string[] = [];
    if (s.R != null) parts.push(`${s.R} R`);
    if (s.HR != null) parts.push(`${s.HR} HR`);
    if (s.RBI != null) parts.push(`${s.RBI} RBI`);
    if (s.SB != null) parts.push(`${s.SB} SB`);
    if (s.AVG != null) {
      const avg = typeof s.AVG === "number" ? s.AVG.toFixed(3) : String(s.AVG);
      parts.push(avg.startsWith("0") ? avg.slice(1) : avg);
    }
    return parts.join(" · ");
  }
  const s = player.pitcherStats ?? {};
  const parts: string[] = [];
  if (s.IP != null) {
    const ip = typeof s.IP === "number" ? s.IP.toFixed(1) : s.IP;
    parts.push(`${ip} IP`);
  }
  if (s.W != null) parts.push(`${s.W}W`);
  if (s.SV != null && s.SV > 0) parts.push(`${s.SV} SV`);
  if (s.K != null) parts.push(`${s.K} K`);
  if (s.ERA != null) parts.push(`${typeof s.ERA === "number" ? s.ERA.toFixed(2) : s.ERA} ERA`);
  if (s.WHIP != null) parts.push(`${typeof s.WHIP === "number" ? s.WHIP.toFixed(2) : s.WHIP} WHIP`);
  return parts.join(" · ");
}

function MobileRowV3Impl({
  player,
  role,
  isSelected,
  isEligible,
  isDimmed,
  isPending,
  onPillClick,
  onRevert,
  actions,
  dnd,
  isShakeRejecting,
}: MobileRowV3Props) {
  // `role` is still used by the React.memo comparator (so swapping a
  // hitter row for a pitcher row remounts cleanly) but stat rendering
  // narrows on `player.isPitcher` directly per todo #153.
  void role;
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const onTriggerClick = () => {
    if (triggerRef.current) {
      setAnchorRect(triggerRef.current.getBoundingClientRect());
    }
    setMenuOpen(true);
  };

  const classes = ["am-roster-mobile-row"];
  if (isPending) classes.push("am-roster-row-pending");
  if (isEligible && !isPending) classes.push("am-roster-row-eligible");
  if (isDimmed) classes.push("am-roster-row-dimmed");
  if (dnd?.isDragging) classes.push("am-roster-row-dragging-source");
  if (dnd?.isOverEligible) classes.push("am-roster-row-drop-target");
  if (isShakeRejecting) classes.push("am-roster-row-shake");

  return (
    <div
      className={classes.join(" ")}
      ref={dnd?.rowRef}
      style={dnd?.rowStyle}
      data-roster-row={String(player.rosterId)}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
        <PositionEligibilityCell
          posList={player.posList}
          assignedSlot={player.assignedSlot}
          gamesPlayedByPosition={player.gamesPlayedByPosition}
          selected={isSelected}
          eligible={isEligible && !isSelected}
          dimmed={isDimmed}
          onPillClick={onPillClick}
          ariaLabel={`${player.name} — ${player.assignedSlot} slot — tap to ${
            isSelected ? "deselect" : "select"
          }`}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
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
        <span style={{ fontSize: 11.5, color: "var(--am-text-muted)", fontVariantNumeric: "tabular-nums" }}>
          {statSummaryFor(player) || "—"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 2, justifyContent: "flex-end" }}>
        {dnd?.dragHandleAttrs && (
          <button
            type="button"
            {...dnd.dragHandleAttrs}
            className="am-roster-drag-handle"
            aria-label={`Drag ${player.name} to reassign slot`}
            title="Long-press to drag"
          >
            ⋮⋮
          </button>
        )}
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
        {actions.length > 0 && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}

export const MobileRowV3 = React.memo(MobileRowV3Impl, (prev, next) => {
  return (
    prev.player.rosterId === next.player.rosterId &&
    prev.player.assignedSlot === next.player.assignedSlot &&
    prev.role === next.role &&
    prev.isSelected === next.isSelected &&
    prev.isEligible === next.isEligible &&
    prev.isDimmed === next.isDimmed &&
    prev.isPending === next.isPending &&
    prev.isShakeRejecting === next.isShakeRejecting &&
    prev.dnd?.isDragging === next.dnd?.isDragging &&
    prev.dnd?.isOverEligible === next.dnd?.isOverEligible &&
    prev.dnd?.rowStyle === next.dnd?.rowStyle &&
    prev.dnd?.rowRef === next.dnd?.rowRef &&
    prev.dnd?.dragHandleAttrs === next.dnd?.dragHandleAttrs
  );
});
