// client/src/features/teams/components/RosterHub/RosterHubV3.tsx
//
// v3 hub container — replaces the separate hitter/pitcher stats tables
// on Team.tsx (per §0.5 refinement #1). Renders a single ThemedTable
// with two sectioned bodies (Hitters / Pitchers), then the IL section
// below.
//
// Layout decision (Option B from the spec):
//   <Glass>
//     <table>
//       <thead> Hitter columns </thead>
//       <tbody> hitter rows </tbody>
//       <thead> Pitcher columns </thead>
//       <tbody> pitcher rows </tbody>
//     </table>
//   </Glass>
//   <IlSection />
//
// One <table> element with two thead+tbody pairs. Yahoo does this and
// it's well-supported HTML. Browsers render the second `<thead>` as a
// row group with the same alignment as the first. We render `<thead>`
// using the `ThemedThead` styling primitive but raw `<tr>`/`<th>` so a
// nested table is well-formed.
//
// All state is hoisted to the parent (preview page or PR2's Team owner
// view). This component is layout-only.

import { useEffect, useState } from "react";
import { Glass, SectionLabel } from "../../../../components/aurora/atoms";
import { PendingChangeBar } from "./PendingChangeBar";
import { RosterRowV3 } from "./RosterRowV3";
import { MobileRowV3 } from "./MobileRowV3";
import { IlSectionV3 } from "./IlSectionV3";
import type { RowAction } from "./RowActionMenu";
import type { DragSimState, RosterHubPlayer } from "./types";

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

const HITTER_COLS = [
  { key: "pos", label: "Pos · Eligibility", align: "left" as const, width: 220 },
  { key: "name", label: "Player", align: "left" as const, width: 220 },
  { key: "R", label: "R", align: "right" as const, width: 56 },
  { key: "HR", label: "HR", align: "right" as const, width: 56 },
  { key: "RBI", label: "RBI", align: "right" as const, width: 64 },
  { key: "SB", label: "SB", align: "right" as const, width: 56 },
  { key: "AVG", label: "AVG", align: "right" as const, width: 64 },
  { key: "act", label: "Actions", align: "right" as const, width: 80 },
];

const PITCHER_COLS = [
  { key: "pos", label: "Pos · Eligibility", align: "left" as const, width: 220 },
  { key: "name", label: "Player", align: "left" as const, width: 220 },
  { key: "IP", label: "IP", align: "right" as const, width: 60 },
  { key: "W", label: "W", align: "right" as const, width: 48 },
  { key: "SV", label: "SV", align: "right" as const, width: 56 },
  { key: "K", label: "K", align: "right" as const, width: 48 },
  { key: "ERA", label: "ERA", align: "right" as const, width: 64 },
  { key: "WHIP", label: "WHIP", align: "right" as const, width: 64 },
  { key: "act", label: "Actions", align: "right" as const, width: 80 },
];

interface SectionTheadProps {
  cols: typeof HITTER_COLS;
  label: string;
}

function SectionThead({ cols, label }: SectionTheadProps) {
  return (
    <thead className="am-roster-section-thead">
      <tr>
        <td colSpan={cols.length} className="am-roster-section-label">
          {label}
        </td>
      </tr>
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
              width: c.width,
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
            Tap a position pill to select; eligible destinations glow. The "..." menu
            navigates to focused sub-routes for free agent / IL flows — no modals, the
            stats table stays visible until you commit.
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
                  <MobileRowV3
                    key={p.rosterId}
                    player={p}
                    role="hitter"
                    isSelected={selectedRosterId === p.rosterId}
                    isEligible={eligibleRosterIds.has(p.rosterId)}
                    isDimmed={dimmedFor(p.rosterId, "hitter")}
                    isPending={pendingRosterIds.has(p.rosterId)}
                    onPillClick={() => onPillClick(p.rosterId)}
                    onRevert={onRevert ? () => onRevert(p.rosterId) : undefined}
                    actions={buildActions(p)}
                  />
                ))}
              </MobileSection>
              <MobileSection
                label="Pitchers"
                count={pitchers.length}
                dimmed={dimSection === "pitchers"}
              >
                {pitchers.map((p) => (
                  <MobileRowV3
                    key={p.rosterId}
                    player={p}
                    role="pitcher"
                    isSelected={selectedRosterId === p.rosterId}
                    isEligible={eligibleRosterIds.has(p.rosterId)}
                    isDimmed={dimmedFor(p.rosterId, "pitcher")}
                    isPending={pendingRosterIds.has(p.rosterId)}
                    onPillClick={() => onPillClick(p.rosterId)}
                    onRevert={onRevert ? () => onRevert(p.rosterId) : undefined}
                    actions={buildActions(p)}
                  />
                ))}
              </MobileSection>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                className="am-roster-v3-table"
                aria-label="Active roster"
                style={{
                  width: "100%",
                  borderCollapse: "separate",
                  borderSpacing: 0,
                  tableLayout: "fixed",
                  minWidth: 880,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {/* HITTERS */}
                <SectionThead cols={HITTER_COLS} label={`Hitters · ${hitters.length}`} />
                <tbody
                  style={{
                    opacity: dimSection === "hitters" ? 0.42 : 1,
                    transition: "opacity 160ms ease",
                  }}
                >
                  {hitters.map((p) => (
                    <RosterRowV3
                      key={p.rosterId}
                      player={p}
                      role="hitter"
                      isSelected={selectedRosterId === p.rosterId}
                      isEligible={eligibleRosterIds.has(p.rosterId)}
                      isDimmed={dimmedFor(p.rosterId, "hitter")}
                      isPending={pendingRosterIds.has(p.rosterId)}
                      isDragSource={dragSim?.rosterId === p.rosterId}
                      isDropTarget={dropIds.has(p.rosterId)}
                      onPillClick={() => onPillClick(p.rosterId)}
                      onRevert={onRevert ? () => onRevert(p.rosterId) : undefined}
                      actions={buildActions(p)}
                    />
                  ))}
                </tbody>
                {/* PITCHERS */}
                <SectionThead cols={PITCHER_COLS} label={`Pitchers · ${pitchers.length}`} />
                <tbody
                  style={{
                    opacity: dimSection === "pitchers" ? 0.42 : 1,
                    transition: "opacity 160ms ease",
                  }}
                >
                  {pitchers.map((p) => (
                    <RosterRowV3
                      key={p.rosterId}
                      player={p}
                      role="pitcher"
                      isSelected={selectedRosterId === p.rosterId}
                      isEligible={eligibleRosterIds.has(p.rosterId)}
                      isDimmed={dimmedFor(p.rosterId, "pitcher")}
                      isPending={pendingRosterIds.has(p.rosterId)}
                      isDragSource={dragSim?.rosterId === p.rosterId}
                      isDropTarget={dropIds.has(p.rosterId)}
                      onPillClick={() => onPillClick(p.rosterId)}
                      onRevert={onRevert ? () => onRevert(p.rosterId) : undefined}
                      actions={buildActions(p)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Glass>

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
