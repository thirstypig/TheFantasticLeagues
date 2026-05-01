// client/src/features/teams/components/RosterHub/RosterHubV3.tsx
//
// v3 hub container — replaces the separate hitter/pitcher stats tables
// on Team.tsx (per §0.5 refinement #1). Renders TWO sectioned `<table>`
// elements (Hitters / Pitchers), then the IL section below.
//
// Layout decision (post-PR-#216 polish, 2026-04-30):
//   <Glass>
//     <table aria-label="Hitter roster">
//       <colgroup> ... </colgroup>
//       <thead> Hitter columns </thead>
//       <tbody> hitter rows </tbody>
//     </table>
//     <table aria-label="Pitcher roster">
//       <colgroup> ... </colgroup>
//       <thead> Pitcher columns </thead>
//       <tbody> pitcher rows </tbody>
//     </table>
//   </Glass>
//   <IlSection />
//
// HISTORY: We previously rendered ONE <table> with `tableLayout: "fixed"`
// containing TWO thead+tbody pairs. The browser can't reconcile two
// different column counts (8 hitter cols vs 9 pitcher cols) under
// `table-layout: fixed` and falls back to equal-width distribution,
// ignoring `<th width>` props. Splitting into two tables lets each
// have its own `<colgroup>` so the position+eligibility column can
// breathe (180px) and the actions column gets explicit space (64px).
//
// All state is hoisted to the parent (preview page or PR2's Team owner
// view). This component is layout-only.

import { useEffect, useMemo, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Glass, SectionLabel } from "../../../../components/aurora/atoms";
import { PendingChangeBar } from "./PendingChangeBar";
import { RosterRowV3, type RosterRowDnd } from "./RosterRowV3";
import { MobileRowV3, type MobileRowDnd } from "./MobileRowV3";
import { IlSectionV3 } from "./IlSectionV3";
import type { RowAction } from "./RowActionMenu";
import type { DragSimState, RosterHubPlayer } from "./types";
import { encodeDndId } from "../../hooks/useRosterHubDrag";

interface RosterHubV3Props {
  /** Hitter rows (Yahoo-style sectioning). */
  hitters: RosterHubPlayer[];
  /** Pitcher rows. */
  pitchers: RosterHubPlayer[];
  /** IL roster. */
  ilPlayers: RosterHubPlayer[];

  selectedRosterId: number | null;
  eligibleRosterIds: ReadonlySet<number>;
  pendingRosterIds: ReadonlySet<number>;
  pendingCount: number;

  dragSim?: DragSimState | null;
  dropTargetIds?: ReadonlySet<number>;
  /**
   * If set, dim the entire opposite section during a drag. Hitters
   * being dragged dim the pitcher section and vice versa — pitchers
   * can't be dropped into hitter slots and vice versa.
   */
  dimSection?: "hitters" | "pitchers" | null;

  showSelectionBanner: boolean;
  selectedPlayerName?: string;

  onPillClick: (rosterId: number) => void;
  buildActions: (player: RosterHubPlayer) => RowAction[];
  onRevert?: (rosterId: number) => void;
  onRevertAll: () => void;
  onSave: () => void;

  /** Optional save state surface for the PendingChangeBar. */
  saving?: boolean;
  saveError?: string | null;
  onDismissError?: () => void;
  /** FA scenario: itemized pending-change rows in the bar. IL scenario
   *  extends with il_stash + il_activate kinds and an optional cascade-
   *  preview `secondary` line per direction-lock IL #5. */
  pendingItems?: ReadonlyArray<{
    id: string;
    kind: "swap" | "fa_add" | "il_stash" | "il_activate";
    text: string;
    secondary?: string;
  }>;
  /** FA scenario: per-item revert handler (Undo button on each row). */
  onRevertItem?: (id: string) => void;
  /** FA scenario: drop pool slot — rendered between active roster and IL. */
  dropPoolSlot?: React.ReactNode;

  /**
   * When true, each rendered row is wrapped in a per-row adapter that
   * calls `useDraggable` + `useDroppable` and passes the result through
   * to the row's `dnd` prop. The caller MUST render this hub inside a
   * `<DndContext>` and supply `useRosterHubDrag` handlers to it. When
   * false (default), rows render without drag affordance — view-only.
   */
  dndEnabled?: boolean;
  /** rosterId currently in shake-reject state, or null. */
  shakeRowId?: number | null;
  /** IL scenario: when true, an active drag is stash-eligible. Empty IL
   *  slots highlight a "Drop here to stash" affordance. */
  ilStashEligible?: boolean;

  forceMobile?: boolean;
}

function useIsMobile(forceMobile?: boolean): boolean {
  const [mqMatch, setMqMatch] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia("(max-width: 640px)").matches,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = () => setMqMatch(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return forceMobile ?? mqMatch;
}

// Column widths: Pos·Eligibility carries multi-chip cells like
// `1B (12)·CM·DH·OF` so it needs the most room. Actions only carries the
// kebab `…` so 64px is plenty (the drag handle has moved to the left of
// the player name — see Player cell). Sums fit within the 880px min-width
// minus a slack column to absorb padding.
const HITTER_COLS = [
  { key: "pos", label: "Pos · Eligibility", align: "left" as const, width: 180 },
  { key: "name", label: "Player", align: "left" as const, width: 200 },
  { key: "R", label: "R", align: "right" as const, width: 56 },
  { key: "HR", label: "HR", align: "right" as const, width: 56 },
  { key: "RBI", label: "RBI", align: "right" as const, width: 64 },
  { key: "SB", label: "SB", align: "right" as const, width: 56 },
  { key: "AVG", label: "AVG", align: "right" as const, width: 64 },
  { key: "act", label: "Actions", align: "right" as const, width: 64 },
];

const PITCHER_COLS = [
  { key: "pos", label: "Pos · Eligibility", align: "left" as const, width: 180 },
  { key: "name", label: "Player", align: "left" as const, width: 200 },
  { key: "IP", label: "IP", align: "right" as const, width: 56 },
  { key: "W", label: "W", align: "right" as const, width: 48 },
  { key: "SV", label: "SV", align: "right" as const, width: 56 },
  { key: "K", label: "K", align: "right" as const, width: 48 },
  { key: "ERA", label: "ERA", align: "right" as const, width: 64 },
  { key: "WHIP", label: "WHIP", align: "right" as const, width: 64 },
  { key: "act", label: "Actions", align: "right" as const, width: 64 },
];

interface SectionTheadProps {
  cols: typeof HITTER_COLS;
}

/** Renders just the column header row (no section label — that's hoisted
 *  out of the table so it spans both tables uniformly). */
function SectionThead({ cols }: SectionTheadProps) {
  return (
    <thead className="am-roster-section-thead">
      <tr>
        {cols.map((c) => (
          <th
            key={c.key}
            scope="col"
            style={{
              textAlign: c.align,
              padding: "8px 12px",
              fontSize: 10,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "var(--am-text-muted)",
              fontWeight: 600,
              borderBottom: "1px solid var(--am-border)",
              background: "var(--am-surface-faint)",
              whiteSpace: "nowrap",
            }}
          >
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/** `<colgroup>` is the canonical way to drive `table-layout: fixed`
 *  column widths — `<th width>` is the legacy fallback and is ignored
 *  when multiple thead+tbody pairs share a single table. */
function SectionColgroup({ cols }: { cols: typeof HITTER_COLS }) {
  return (
    <colgroup>
      {cols.map((c) => (
        <col key={c.key} style={{ width: c.width }} />
      ))}
    </colgroup>
  );
}

/** Section label rendered ABOVE the table (not as a `<td colSpan>` row).
 *  Keeps both tables visually unified — same typography, consistent
 *  spacing rhythm, and the label aligns with the table's left edge. */
function SectionLabelRow({ label, count }: { label: string; count: number }) {
  return (
    <div
      style={{
        padding: "12px 12px 6px",
        fontSize: 10.5,
        letterSpacing: 1.6,
        textTransform: "uppercase",
        color: "var(--am-text-muted)",
        fontWeight: 600,
      }}
    >
      {label} · {count}
    </div>
  );
}

export function RosterHubV3({
  hitters,
  pitchers,
  ilPlayers,
  selectedRosterId,
  eligibleRosterIds,
  pendingRosterIds,
  pendingCount,
  dragSim,
  dropTargetIds,
  dimSection,
  showSelectionBanner,
  selectedPlayerName,
  onPillClick,
  buildActions,
  onRevert,
  onRevertAll,
  onSave,
  saving,
  saveError,
  onDismissError,
  pendingItems,
  onRevertItem,
  dropPoolSlot,
  dndEnabled,
  shakeRowId,
  ilStashEligible,
  forceMobile,
}: RosterHubV3Props) {
  const isMobile = useIsMobile(forceMobile);
  const dropIds = dropTargetIds ?? new Set<number>();

  const dimmedFor = (rosterId: number, role: "hitter" | "pitcher"): boolean => {
    if (dimSection === "hitters" && role === "hitter") return true;
    if (dimSection === "pitchers" && role === "pitcher") return true;
    if (selectedRosterId != null) {
      return !eligibleRosterIds.has(rosterId) && selectedRosterId !== rosterId;
    }
    return false;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Glass padded={false} style={{ overflow: "visible" }}>
        <div style={{ padding: 16, paddingBottom: 6 }}>
          <SectionLabel>✦ Active roster · 23 slots</SectionLabel>
          <p style={{ margin: 0, fontSize: 12, color: "var(--am-text-muted)" }}>
            Tap a position pill to select; eligible destinations glow. Drag the ⋮⋮ icon
            to swap roster positions. The "..." menu navigates to focused sub-routes for
            free agent / IL flows — no modals, the stats table stays visible until you
            commit.
          </p>
        </div>

        <div style={{ padding: "8px 16px 12px" }}>
          <PendingChangeBar
            count={pendingCount}
            onRevertAll={onRevertAll}
            onSave={onSave}
            saving={saving}
            saveError={saveError ?? null}
            onRetry={onSave}
            onDismissError={onDismissError}
            items={pendingItems}
            onRevertItem={onRevertItem}
          />
          {showSelectionBanner && selectedPlayerName && (
            <div
              role="status"
              aria-live="polite"
              style={{
                padding: "10px 14px",
                marginBottom: 12,
                borderRadius: 12,
                border: "1px solid var(--am-border-strong)",
                background: "color-mix(in srgb, #00b894 8%, transparent)",
                fontSize: 12.5,
                color: "var(--am-text)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span aria-hidden style={{ fontSize: 14 }}>
                ✦
              </span>
              <span>
                Tap a highlighted slot to move <strong>{selectedPlayerName}</strong>.
              </span>
            </div>
          )}

          {isMobile ? (
            <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 16 }}>
              <MobileSection
                label="Hitters"
                count={hitters.length}
                dimmed={dimSection === "hitters"}
              >
                {hitters.map((p) => (
                  <DraggableMobileRowAdapter
                    key={p.rosterId}
                    player={p}
                    role="hitter"
                    dndEnabled={!!dndEnabled}
                    dropEligibleIds={dropIds}
                    isSelected={selectedRosterId === p.rosterId}
                    isEligible={eligibleRosterIds.has(p.rosterId)}
                    isDimmed={dimmedFor(p.rosterId, "hitter")}
                    isPending={pendingRosterIds.has(p.rosterId)}
                    onPillClick={() => onPillClick(p.rosterId)}
                    onRevert={onRevert ? () => onRevert(p.rosterId) : undefined}
                    actions={buildActions(p)}
                    isShakeRejecting={shakeRowId === p.rosterId}
                  />
                ))}
              </MobileSection>
              <MobileSection
                label="Pitchers"
                count={pitchers.length}
                dimmed={dimSection === "pitchers"}
              >
                {pitchers.map((p) => (
                  <DraggableMobileRowAdapter
                    key={p.rosterId}
                    player={p}
                    role="pitcher"
                    dndEnabled={!!dndEnabled}
                    dropEligibleIds={dropIds}
                    isSelected={selectedRosterId === p.rosterId}
                    isEligible={eligibleRosterIds.has(p.rosterId)}
                    isDimmed={dimmedFor(p.rosterId, "pitcher")}
                    isPending={pendingRosterIds.has(p.rosterId)}
                    onPillClick={() => onPillClick(p.rosterId)}
                    onRevert={onRevert ? () => onRevert(p.rosterId) : undefined}
                    actions={buildActions(p)}
                    isShakeRejecting={shakeRowId === p.rosterId}
                  />
                ))}
              </MobileSection>
            </div>
          ) : (
            <div
              style={{
                overflowX: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {/* HITTERS — own table with explicit colgroup widths. */}
              <div>
                <SectionLabelRow label="Hitters" count={hitters.length} />
                <table
                  className="am-roster-v3-table"
                  aria-label="Hitter roster"
                  style={{
                    width: "100%",
                    borderCollapse: "separate",
                    borderSpacing: 0,
                    tableLayout: "fixed",
                    minWidth: 700,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <SectionColgroup cols={HITTER_COLS} />
                  <SectionThead cols={HITTER_COLS} />
                  <tbody
                    style={{
                      opacity: dimSection === "hitters" ? 0.42 : 1,
                      transition: "opacity 160ms ease",
                    }}
                  >
                    {hitters.map((p) => (
                      <DraggableDesktopRowAdapter
                        key={p.rosterId}
                        player={p}
                        role="hitter"
                        dndEnabled={!!dndEnabled}
                        dropEligibleIds={dropIds}
                        isSelected={selectedRosterId === p.rosterId}
                        isEligible={eligibleRosterIds.has(p.rosterId)}
                        isDimmed={dimmedFor(p.rosterId, "hitter")}
                        isPending={pendingRosterIds.has(p.rosterId)}
                        isDragSource={dragSim?.rosterId === p.rosterId}
                        isDropTarget={dropIds.has(p.rosterId)}
                        onPillClick={() => onPillClick(p.rosterId)}
                        onRevert={onRevert ? () => onRevert(p.rosterId) : undefined}
                        actions={buildActions(p)}
                        isShakeRejecting={shakeRowId === p.rosterId}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* PITCHERS — separate table so its 9-column layout doesn't
                  collide with hitters' 8-column layout under
                  table-layout:fixed. */}
              <div>
                <SectionLabelRow label="Pitchers" count={pitchers.length} />
                <table
                  className="am-roster-v3-table"
                  aria-label="Pitcher roster"
                  style={{
                    width: "100%",
                    borderCollapse: "separate",
                    borderSpacing: 0,
                    tableLayout: "fixed",
                    minWidth: 740,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <SectionColgroup cols={PITCHER_COLS} />
                  <SectionThead cols={PITCHER_COLS} />
                  <tbody
                    style={{
                      opacity: dimSection === "pitchers" ? 0.42 : 1,
                      transition: "opacity 160ms ease",
                    }}
                  >
                    {pitchers.map((p) => (
                      <DraggableDesktopRowAdapter
                        key={p.rosterId}
                        player={p}
                        role="pitcher"
                        dndEnabled={!!dndEnabled}
                        dropEligibleIds={dropIds}
                        isSelected={selectedRosterId === p.rosterId}
                        isEligible={eligibleRosterIds.has(p.rosterId)}
                        isDimmed={dimmedFor(p.rosterId, "pitcher")}
                        isPending={pendingRosterIds.has(p.rosterId)}
                        isDragSource={dragSim?.rosterId === p.rosterId}
                        isDropTarget={dropIds.has(p.rosterId)}
                        onPillClick={() => onPillClick(p.rosterId)}
                        onRevert={onRevert ? () => onRevert(p.rosterId) : undefined}
                        actions={buildActions(p)}
                        isShakeRejecting={shakeRowId === p.rosterId}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Glass>

      {/* FA scenario: drop pool surface (FA-#5) sits between active
          roster and IL. Render-prop'd by the parent so the hub stays
          agnostic to the pending-changes shape. */}
      {dropPoolSlot}

      <IlSectionV3
        players={ilPlayers}
        selectedRosterId={selectedRosterId}
        eligibleRosterIds={eligibleRosterIds}
        pendingRosterIds={pendingRosterIds}
        isMobile={isMobile}
        totalSlots={5}
        onPillClick={onPillClick}
        buildActions={buildActions}
        onRevert={onRevert}
        dndEnabled={dndEnabled}
        ilStashEligible={ilStashEligible}
        shakeRowId={shakeRowId}
      />

      {dragSim && (
        <div
          className="am-roster-ghost"
          aria-hidden
          style={{ left: dragSim.ghostX, top: dragSim.ghostY }}
        >
          <span style={{ fontSize: 11, color: "var(--am-text-muted)", letterSpacing: 0.6, textTransform: "uppercase" }}>
            Dragging
          </span>
          <span>
            {[...hitters, ...pitchers].find((p) => p.rosterId === dragSim.rosterId)?.name ?? "Player"}
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Draggable row adapters ─────────────────────────────────────────
 *
 * Each adapter calls `useDraggable` + `useDroppable` for its row, then
 * forwards the dnd-kit results into the row component's `dnd` prop.
 * Hooks are called UNCONDITIONALLY so React's rules-of-hooks aren't
 * violated when `dndEnabled` toggles. When `dndEnabled` is false, the
 * adapter still calls the hooks (cheap; both are no-ops without a
 * surrounding DndContext) but suppresses the `dnd` prop on the row, so
 * the grab handle / drop highlights aren't rendered.
 *
 * NOTE: When `dndEnabled` is false, the adapter is rendered OUTSIDE a
 * DndContext on the legacy view-only callsite. dnd-kit's hooks are
 * lenient about that — they fall back to no-op behavior when the
 * provider isn't present, which is what we want.
 */

interface DraggableDesktopRowAdapterProps {
  player: RosterHubPlayer;
  role: "hitter" | "pitcher";
  dndEnabled: boolean;
  dropEligibleIds: ReadonlySet<number>;
  isSelected: boolean;
  isEligible: boolean;
  isDimmed: boolean;
  isPending: boolean;
  isDragSource: boolean;
  isDropTarget: boolean;
  isShakeRejecting: boolean;
  onPillClick: () => void;
  onRevert?: () => void;
  actions: RowAction[];
}

function DraggableDesktopRowAdapter(props: DraggableDesktopRowAdapterProps) {
  const { player, dndEnabled, dropEligibleIds, ...rest } = props;
  const dnd = useRowDnd<HTMLTableRowElement>(player.rosterId, dndEnabled, dropEligibleIds);
  return <RosterRowV3 player={player} {...rest} dnd={dndEnabled ? dnd : undefined} />;
}

interface DraggableMobileRowAdapterProps {
  player: RosterHubPlayer;
  role: "hitter" | "pitcher";
  dndEnabled: boolean;
  dropEligibleIds: ReadonlySet<number>;
  isSelected: boolean;
  isEligible: boolean;
  isDimmed: boolean;
  isPending: boolean;
  isShakeRejecting: boolean;
  onPillClick: () => void;
  onRevert?: () => void;
  actions: RowAction[];
}

function DraggableMobileRowAdapter(props: DraggableMobileRowAdapterProps) {
  const { player, dndEnabled, dropEligibleIds, ...rest } = props;
  const dnd = useRowDnd<HTMLDivElement>(player.rosterId, dndEnabled, dropEligibleIds);
  return <MobileRowV3 player={player} {...rest} dnd={dndEnabled ? dnd : undefined} />;
}

/**
 * Shared dnd-kit row hook that wires both `useDraggable` (for the grab
 * handle) and `useDroppable` (for the row body). Returns a single dnd
 * object the row component can spread.
 */
function useRowDnd<T extends HTMLElement>(
  rosterId: number,
  enabled: boolean,
  dropEligibleIds: ReadonlySet<number>,
): RosterRowDnd & MobileRowDnd {
  const id = encodeDndId(rosterId);
  // Important: `disabled` toggles can race against the active drag. We
  // intentionally always register both hooks; the parent's drag handler
  // is the source of truth for what's a legal drop.
  const draggable = useDraggable({ id, disabled: !enabled });
  const droppable = useDroppable({ id, disabled: !enabled });

  return useMemo(() => {
    const setRefs = (el: T | null) => {
      draggable.setNodeRef(el as unknown as HTMLElement);
      droppable.setNodeRef(el as unknown as HTMLElement);
    };
    const transformStyle: React.CSSProperties | undefined = draggable.transform
      ? {
          transform: `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)`,
          // dnd-kit recommends transition:none during active drag.
          transition: "none",
          zIndex: 50,
        }
      : undefined;
    return {
      rowRef: setRefs as React.Ref<T>,
      dragHandleAttrs: {
        ...draggable.attributes,
        ...draggable.listeners,
      },
      isDragging: draggable.isDragging,
      isOverEligible: droppable.isOver && dropEligibleIds.has(rosterId),
      rowStyle: transformStyle,
    } as RosterRowDnd & MobileRowDnd;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rosterId,
    draggable.isDragging,
    draggable.transform,
    draggable.attributes,
    draggable.listeners,
    draggable.setNodeRef,
    droppable.isOver,
    droppable.setNodeRef,
    dropEligibleIds,
  ]);
}

/** Mobile-only section header used between hitter and pitcher rows. */
function MobileSection({
  label,
  count,
  dimmed,
  children,
}: {
  label: string;
  count: number;
  dimmed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ opacity: dimmed ? 0.42 : 1, transition: "opacity 160ms ease" }}>
      <div
        style={{
          padding: "8px 10px",
          fontSize: 10,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: "var(--am-text-muted)",
          fontWeight: 600,
          borderBottom: "1px solid var(--am-border)",
        }}
      >
        {label} · {count}
      </div>
      {children}
    </div>
  );
}
