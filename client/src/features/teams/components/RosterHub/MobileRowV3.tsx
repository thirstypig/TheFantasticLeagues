// client/src/features/teams/components/RosterHub/MobileRowV3.tsx
//
// v3 mobile collapsed row — uses the merged Position+Eligibility cell
// (refinement #3) and shows a compact role-aware stat line below the
// name. Sectioned headers ("Hitters" / "Pitchers") are rendered by the
// parent (RosterHubV3); this component renders one row.
//
// Per todo #127, the action-menu state, name-decoration prefix, subtitle,
// revert button, kebab menu, and class-name builder are sourced from
// `./rowShared` so the desktop variant (`RosterRowV3`) shares them
// without drift. The container element type (`<div>` flex card vs the
// desktop `<tr>`) and the single dot-separated stat string vs the
// desktop's individual stat cells remain layout-specific — see
// `rowShared.tsx` for the rationale on why a full unified component
// was rejected.

import React from "react";
import { PositionEligibilityCell } from "./PositionEligibilityCell";
import { type RowAction } from "./RowActionMenu";
import {
  ActionMenuTrigger,
  PlayerNameContent,
  PlayerSubtitle,
  RevertButton,
  buildRowClasses,
} from "./rowShared";
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

export function MobileRowV3({
  player,
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
  const className = buildRowClasses({
    base: "am-roster-mobile-row",
    isPending,
    isEligible,
    isDimmed,
    isDragging: dnd?.isDragging,
    isOverEligible: dnd?.isOverEligible,
    isShakeRejecting,
  });

  return (
    <div
      className={className}
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
          showEligibility={true}
          ariaLabel={`${player.name} — ${player.assignedSlot} slot — tap to ${
            isSelected ? "deselect" : "select"
          }`}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--am-text)" }}>
          <PlayerNameContent player={player} isPending={isPending} />
        </span>
        <PlayerSubtitle player={player} />
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
        {isPending && onRevert && <RevertButton player={player} onRevert={onRevert} />}
        <ActionMenuTrigger player={player} actions={actions} />
      </div>
    </div>
  );
}
