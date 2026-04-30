// client/src/features/teams/components/RosterHub/MobileRow.tsx
//
// Collapsed list-row layout used at viewport widths ≤640px. Three
// regions per row: position pill (left), name/team/eligibility (middle),
// "..." action trigger (right).
//
// Verified visually at 390px iPhone width — touch targets ≥ 44px on
// the pill and the trigger via shared CSS in `rosterHub.css`.

import React, { useRef, useState } from "react";
import { PositionPill } from "./PositionPill";
import { EligibilityChips } from "./EligibilityChips";
import { RowActionMenu, type RowAction } from "./RowActionMenu";
import type { RosterHubPlayer } from "./types";

interface MobileRowProps {
  player: RosterHubPlayer;
  isSelected: boolean;
  isEligible: boolean;
  isDimmed: boolean;
  isPending: boolean;
  onPillClick: () => void;
  onRevert?: () => void;
  actions: RowAction[];
}

function MobileRowImpl({
  player,
  isSelected,
  isEligible,
  isDimmed,
  isPending,
  onPillClick,
  onRevert,
  actions,
}: MobileRowProps) {
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

  return (
    <div className={classes.join(" ")}>
      <div>
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
          {player.statSnapshot && (
            <>
              <span style={{ margin: "0 6px" }}>·</span>
              <span style={{ color: "var(--am-text-muted)" }}>{player.statSnapshot}</span>
            </>
          )}
        </span>
        <EligibilityChips posList={player.posList} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 2, justifyContent: "flex-end" }}>
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
    </div>
  );
}

export const MobileRow = React.memo(MobileRowImpl, (prev, next) => {
  return (
    prev.player.rosterId === next.player.rosterId &&
    prev.player.assignedSlot === next.player.assignedSlot &&
    prev.isSelected === next.isSelected &&
    prev.isEligible === next.isEligible &&
    prev.isDimmed === next.isDimmed &&
    prev.isPending === next.isPending
  );
});
