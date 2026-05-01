// client/src/features/teams/components/RosterHub/RosterRowV3.tsx
//
// v3 row variant for the consolidated table that replaces the separate
// hitter/pitcher stats tables on Team.tsx (per §0.5 refinement #1).
//
// Differences vs v2 `RosterRow`:
//   - Uses the merged Position+Eligibility cell (refinement #3).
//   - Renders role-aware stat cells inline (R/HR/RBI/SB/AVG for hitters;
//     IP/W/SV/ERA/WHIP/K for pitchers) instead of a single statSnapshot.
//   - Number of `<td>`s is determined by the parent's column layout —
//     this component renders the cells, the parent owns the headers.
//
// Memoized via `React.memo` keyed on (rosterId, slot, isSelected,
// isEligible, isDimmed, isPending, isDragSource, isDropTarget).

import React, { useRef, useState } from "react";
import { ThemedTr, ThemedTd } from "../../../../components/ui/ThemedTable";
import { PositionEligibilityCell } from "./PositionEligibilityCell";
import { RowActionMenu, type RowAction } from "./RowActionMenu";
import type { RosterHubPlayer } from "./types";

/**
 * Optional DnD wiring supplied by a parent `<DndContext>`. When omitted,
 * the row renders without drag affordance — keeps the component usable
 * in static contexts (preview, view-only roster pages) without paying
 * the cost of dnd-kit refs.
 */
export interface RosterRowDnd {
  /** Ref forwarded to the underlying <tr>. Used as both drag and drop ref. */
  rowRef?: React.Ref<HTMLTableRowElement>;
  /** Spread on the grab-handle button — listeners + attributes from useDraggable. */
  dragHandleAttrs?: React.HTMLAttributes<HTMLButtonElement> & {
    role?: string;
    tabIndex?: number;
  };
  /** True when this row is currently lifted by dnd-kit. */
  isDragging?: boolean;
  /** True when a drag is hovering over this row AND it's a legal drop. */
  isOverEligible?: boolean;
  /** Inline transform/style from dnd-kit (translation while dragging). */
  rowStyle?: React.CSSProperties;
}

interface RosterRowV3Props {
  player: RosterHubPlayer;
  /** Which stat columns this row should render. Caller controls layout. */
  role: "hitter" | "pitcher";
  isSelected: boolean;
  isEligible: boolean;
  isDimmed: boolean;
  isPending: boolean;
  isDragSource: boolean;
  isDropTarget: boolean;
  onPillClick: () => void;
  onRevert?: () => void;
  actions: RowAction[];
  /** When provided, renders a ⋮⋮ grab handle and wires the row as a drop target. */
  dnd?: RosterRowDnd;
  /** True when row should shake (illegal drop landed on it). */
  isShakeRejecting?: boolean;
}

function fmt(v: number | string | undefined, digits = 0): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return digits > 0 ? n.toFixed(digits) : String(n);
}

function fmtAvg(v: number | string | undefined): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  // Strip leading zero per Yahoo/MLB convention: .302 not 0.302.
  const s = n.toFixed(3);
  return s.startsWith("0") ? s.slice(1) : s;
}

function RosterRowV3Impl({
  player,
  role,
  isSelected,
  isEligible,
  isDimmed,
  isPending,
  isDragSource,
  isDropTarget,
  onPillClick,
  onRevert,
  actions,
  dnd,
  isShakeRejecting,
}: RosterRowV3Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const onTriggerClick = () => {
    if (triggerRef.current) {
      setAnchorRect(triggerRef.current.getBoundingClientRect());
    }
    setMenuOpen(true);
  };

  const rowClasses: string[] = [];
  if (isPending) rowClasses.push("am-roster-row-pending");
  if (isEligible && !isPending) rowClasses.push("am-roster-row-eligible");
  if (isDimmed) rowClasses.push("am-roster-row-dimmed");
  if (isDragSource || dnd?.isDragging) rowClasses.push("am-roster-row-dragging-source");
  if (isDropTarget || dnd?.isOverEligible) rowClasses.push("am-roster-row-drop-target");
  if (isShakeRejecting) rowClasses.push("am-roster-row-shake");

  return (
    <ThemedTr
      className={rowClasses.join(" ")}
      innerRef={dnd?.rowRef}
      style={dnd?.rowStyle}
      extraProps={{ "data-roster-row": String(player.rosterId) } as React.HTMLAttributes<HTMLTableRowElement>}
    >
      {/* Position + Eligibility (merged) */}
      <ThemedTd>
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
      </ThemedTd>

      {/* Player name + team. Pending dot + keeper star inline. The drag
          handle (⋮⋮) lives at the LEFT of the player name, matching
          Yahoo Fantasy convention. dnd-kit's `setNodeRef` is on the
          row (`<tr>`), so the handle's exact DOM position doesn't
          affect drag binding — only `dragHandleAttrs` (listeners +
          attributes) need to be on a focusable element. */}
      <ThemedTd>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {dnd?.dragHandleAttrs && (
            <button
              type="button"
              {...dnd.dragHandleAttrs}
              className="am-roster-drag-handle am-roster-drag-handle-left"
              aria-label={`Drag ${player.name} to reassign slot`}
              title="Drag to reassign slot"
            >
              ⋮⋮
            </button>
          )}
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
        </div>
      </ThemedTd>

      {/* Role-aware stat cells. The `role` prop drives the column layout
          (number of cells must match the parent's headers), and the
          `player.isPitcher` discriminant narrows which stat object is
          available — per todo #153, the discriminated union encodes the
          mutual-exclusion invariant in the type system. */}
      {!player.isPitcher ? (
        <>
          <StatTd>{fmt(player.hitterStats?.R)}</StatTd>
          <StatTd>{fmt(player.hitterStats?.HR)}</StatTd>
          <StatTd>{fmt(player.hitterStats?.RBI)}</StatTd>
          <StatTd>{fmt(player.hitterStats?.SB)}</StatTd>
          <StatTd>{fmtAvg(player.hitterStats?.AVG)}</StatTd>
        </>
      ) : (
        <>
          <StatTd>{fmt(player.pitcherStats?.IP, 1)}</StatTd>
          <StatTd>{fmt(player.pitcherStats?.W)}</StatTd>
          <StatTd>{fmt(player.pitcherStats?.SV)}</StatTd>
          <StatTd>{fmt(player.pitcherStats?.K)}</StatTd>
          <StatTd>{fmt(player.pitcherStats?.ERA, 2)}</StatTd>
          <StatTd>{fmt(player.pitcherStats?.WHIP, 2)}</StatTd>
        </>
      )}

      {/* Actions cell — drag handle has moved to the LEFT of the player
          name (Yahoo convention). Only the kebab `…` menu and the
          inline ↩ revert affordance live here now. */}
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
      </ThemedTd>
    </ThemedTr>
  );
}

/** Tabular-nums right-aligned stat cell. */
function StatTd({ children }: { children: React.ReactNode }) {
  return (
    <ThemedTd align="right">
      <span style={{ fontSize: 12, color: "var(--am-text-muted)", fontVariantNumeric: "tabular-nums" }}>
        {children}
      </span>
    </ThemedTd>
  );
}

export const RosterRowV3 = React.memo(RosterRowV3Impl, (prev, next) => {
  return (
    prev.player.rosterId === next.player.rosterId &&
    prev.player.assignedSlot === next.player.assignedSlot &&
    prev.role === next.role &&
    prev.isSelected === next.isSelected &&
    prev.isEligible === next.isEligible &&
    prev.isDimmed === next.isDimmed &&
    prev.isPending === next.isPending &&
    prev.isDragSource === next.isDragSource &&
    prev.isDropTarget === next.isDropTarget &&
    prev.isShakeRejecting === next.isShakeRejecting &&
    // dnd is a shallow object; compare its scalar fields. The two refs/
    // attrs change identity on every dnd-kit render, so we deliberately
    // re-render when they change.
    prev.dnd?.isDragging === next.dnd?.isDragging &&
    prev.dnd?.isOverEligible === next.dnd?.isOverEligible &&
    prev.dnd?.rowStyle === next.dnd?.rowStyle &&
    prev.dnd?.rowRef === next.dnd?.rowRef &&
    prev.dnd?.dragHandleAttrs === next.dnd?.dragHandleAttrs
  );
});
