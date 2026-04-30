// client/src/features/teams/components/RosterHub/RosterHub.tsx
//
// Top-level hub container — replaces RosterGrid for owner view in PR2.
// Renders the active roster as a ThemedTable (or MobileRow list at
// ≤640px), an IL section below, a pending-change action bar at the
// top of the table, and supporting overlays (drag ghost, free-agent
// modal placeholder).
//
// All state is hoisted to the parent (the preview page or PR2's Team
// owner view). Components accept stable callbacks so React.memo on
// rows can short-circuit re-renders.
//
// Plan reference: docs/plans/2026-04-29-yahoo-style-roster-moves-plan.md
// §0 (deepening synthesis) — abandons standalone Swap Mode in favor
// of the Team page table as the unified hub.

import { useEffect, useState, type ReactNode } from "react";
import { Glass, SectionLabel } from "../../../../components/aurora/atoms";
import {
  ThemedTable,
  ThemedThead,
  ThemedTbody,
  ThemedTr,
  ThemedTh,
} from "../../../../components/ui/ThemedTable";
import { PendingChangeBar } from "./PendingChangeBar";
import { RosterRow } from "./RosterRow";
import { MobileRow } from "./MobileRow";
import { IlSection } from "./IlSection";
import type { RowAction } from "./RowActionMenu";
import type { DragSimState, RosterHubPlayer } from "./types";

interface RosterHubProps {
  /** Active roster (23 rows in OGBA). Order = display order. */
  activePlayers: RosterHubPlayer[];
  /** IL roster (≤5 rows in OGBA). */
  ilPlayers: RosterHubPlayer[];
  /** rosterId of the currently-selected player (null = idle). */
  selectedRosterId: number | null;
  /** Set of rosterIds whose row is a legal destination given the selection. */
  eligibleRosterIds: ReadonlySet<number>;
  /** Set of rosterIds with a pending change applied. */
  pendingRosterIds: ReadonlySet<number>;
  /** Pending-change count for the action bar. */
  pendingCount: number;
  /** Drag simulation — preview-only; PR2 uses dnd-kit DragOverlay. */
  dragSim?: DragSimState | null;
  /** Set of rosterIds that are valid drop targets for the active drag. */
  dropTargetIds?: ReadonlySet<number>;
  /** True when the selection toast/banner should show. */
  showSelectionBanner: boolean;
  /** Selected player name for the toast copy (when banner is shown). */
  selectedPlayerName?: string;
  /** Click handler on a row's position pill. */
  onPillClick: (rosterId: number) => void;
  /** Caller builds the action menu per row. */
  buildActions: (player: RosterHubPlayer) => RowAction[];
  /** Revert handler keyed by rosterId. */
  onRevert?: (rosterId: number) => void;
  /** Action-bar callbacks. */
  onRevertAll: () => void;
  onSave: () => void;
  /** Force a given mobile vs desktop layout — used by the preview's
   * "mobile" toggle to demo the collapsed view at any viewport. */
  forceMobile?: boolean;
  /**
   * Optional secondary content rendered below the action bar but
   * above the table. The preview uses this for the selection banner
   * + the free-agent modal slot.
   */
  topSlot?: ReactNode;
}

/**
 * Local hook — read viewport width via matchMedia. Updated on
 * resize so toggling the preview's "mobile" state instantly reflects.
 * Returns the effective mobile flag combining the natural media query
 * with the optional `forceMobile` prop.
 */
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

export function RosterHub({
  activePlayers,
  ilPlayers,
  selectedRosterId,
  eligibleRosterIds,
  pendingRosterIds,
  pendingCount,
  dragSim,
  dropTargetIds,
  showSelectionBanner,
  selectedPlayerName,
  onPillClick,
  buildActions,
  onRevert,
  onRevertAll,
  onSave,
  forceMobile,
  topSlot,
}: RosterHubProps) {
  const isMobile = useIsMobile(forceMobile);
  const dropIds = dropTargetIds ?? new Set<number>();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Top action region: pending-change bar + selection banner + topSlot. */}
      <Glass padded={false} style={{ overflow: "visible" }}>
        <div style={{ padding: 16, paddingBottom: 6 }}>
          <SectionLabel>✦ Active roster · 23 slots</SectionLabel>
          <p style={{ margin: 0, fontSize: 12, color: "var(--am-text-muted)" }}>
            Tap any position pill to select a player; eligible destinations across the table glow.
            Drag-and-drop is supported on desktop. The "..." on each row exposes free agent /
            drop / IL flows.
          </p>
        </div>

        <div style={{ padding: "8px 16px 12px" }}>
          <PendingChangeBar count={pendingCount} onRevertAll={onRevertAll} onSave={onSave} />
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
          {topSlot}

          {isMobile ? (
            <div style={{ marginTop: 4 }}>
              {activePlayers.map((p) => (
                <MobileRow
                  key={p.rosterId}
                  player={p}
                  isSelected={selectedRosterId === p.rosterId}
                  isEligible={eligibleRosterIds.has(p.rosterId)}
                  isDimmed={
                    selectedRosterId != null &&
                    !eligibleRosterIds.has(p.rosterId) &&
                    selectedRosterId !== p.rosterId
                  }
                  isPending={pendingRosterIds.has(p.rosterId)}
                  onPillClick={() => onPillClick(p.rosterId)}
                  onRevert={onRevert ? () => onRevert(p.rosterId) : undefined}
                  actions={buildActions(p)}
                />
              ))}
            </div>
          ) : (
            <ThemedTable bare density="default" minWidth={680} aria-label="Active roster">
              <ThemedThead>
                <ThemedTr>
                  <ThemedTh scope="col">Slot</ThemedTh>
                  <ThemedTh frozen scope="col">
                    Player
                  </ThemedTh>
                  <ThemedTh scope="col">Eligibility</ThemedTh>
                  <ThemedTh scope="col">2026 stats</ThemedTh>
                  <ThemedTh align="right" scope="col">
                    Actions
                  </ThemedTh>
                </ThemedTr>
              </ThemedThead>
              <ThemedTbody>
                {activePlayers.map((p) => (
                  <RosterRow
                    key={p.rosterId}
                    player={p}
                    isSelected={selectedRosterId === p.rosterId}
                    isEligible={eligibleRosterIds.has(p.rosterId)}
                    isDimmed={
                      selectedRosterId != null &&
                      !eligibleRosterIds.has(p.rosterId) &&
                      selectedRosterId !== p.rosterId
                    }
                    isPending={pendingRosterIds.has(p.rosterId)}
                    isDragSource={dragSim?.rosterId === p.rosterId}
                    isDropTarget={dropIds.has(p.rosterId)}
                    onPillClick={() => onPillClick(p.rosterId)}
                    onRevert={onRevert ? () => onRevert(p.rosterId) : undefined}
                    actions={buildActions(p)}
                  />
                ))}
              </ThemedTbody>
            </ThemedTable>
          )}
        </div>
      </Glass>

      {/* IL section — same affordances, separate visual region. */}
      <IlSection
        players={ilPlayers}
        selectedRosterId={selectedRosterId}
        eligibleRosterIds={eligibleRosterIds}
        pendingRosterIds={pendingRosterIds}
        isMobile={isMobile}
        totalSlots={5}
        onPillClick={onPillClick}
        buildActions={buildActions}
        onRevert={onRevert}
      />

      {/* Drag ghost — fixed-positioned card that follows the cursor. */}
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
            {activePlayers.find((p) => p.rosterId === dragSim.rosterId)?.name ?? "Player"}
          </span>
        </div>
      )}
    </div>
  );
}
