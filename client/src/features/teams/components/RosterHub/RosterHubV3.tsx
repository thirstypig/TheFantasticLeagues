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

import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Glass, SectionLabel } from "../../../../components/aurora/atoms";
import { getPlayerCareerStats, type CareerHittingRow, type CareerPitchingRow, type HOrP } from "../../../../api";
import { CareerTable } from "../../../../components/shared/PlayerDetailModal";
import { PendingChangeBar } from "./PendingChangeBar";
import { RosterRowV3, type RosterRowDnd } from "./RosterRowV3";
import { MobileRowV3, type MobileRowDnd } from "./MobileRowV3";
import { IlSectionV3 } from "./IlSectionV3";
import type { RowAction } from "./RowActionMenu";
import type { DragSimState, RosterHubPlayer } from "./types";
import { encodeDndId } from "../../hooks/useRosterHubDrag";
import { slotsFor } from "../../../../lib/positionEligibility";

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
   * Lineup intelligence slot — rendered between the active roster card
   * and the IL section, full-width. Session-89 polish moved AI insights
   * out of the right rail (`Team.tsx` was 8/4 split) and into the page
   * flow so the roster table can claim full horizontal real estate for
   * the wider stat column set (AB/H for hitters, BB+H/ER for pitchers).
   */
  intelSlot?: React.ReactNode;
  /**
   * Number of IL slots — drives both the section header ("Injured List · N
   * slots") and the count of empty drop targets. Plumbed from
   * `leagueRules.il.slot_count` in Team.tsx (default 2 — matches the
   * server-side `loadLeagueIlSlotCount` fallback in `ilSlotGuard.ts`).
   */
  ilTotalSlots?: number;

  /**
   * Commissioner-mode backdate. When defined, the PendingChangeBar
   * renders an "Apply moves on:" date picker. Owner-mode hubs leave both
   * `effectiveDate` and `onEffectiveDateChange` undefined and the picker
   * is suppressed. The wire format is YYYY-MM-DD (HTML5 date input).
   */
  effectiveDate?: string | null;
  /** Setter for the commissioner-mode backdate. Required when the picker
   *  should be rendered. */
  onEffectiveDateChange?: (effectiveDate: string | null) => void;

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

// Column widths: Slot carries the fixed roster assignment. Actions only carries the
// kebab `…` so 64px is plenty (the drag handle has moved to the left of
// the player name — see Player cell). Sums fit within the 1100px min-
// width minus a slack column to absorb padding.
//
// Session 89 widened the stat panel:
//   - Hitters added AB + H (so users can verify AVG = H/AB inline).
//   - Pitchers added BB+H (the WHIP numerator that the wire format
//     stores combined as `BB_H`) and ER (the ERA numerator). Hits-
//     allowed and walks-allowed are NOT split — that would require a
//     destructive Prisma migration. The combined column is labeled
//     `BB+H` so the relationship to WHIP = (BB+H)/IP is explicit.
const HITTER_COLS = [
  { key: "pos", label: "Slot", align: "left" as const, width: 72 },
  { key: "name", label: "Player", align: "left" as const, width: 200 },
  { key: "AB", label: "AB", align: "right" as const, width: 56 },
  { key: "H", label: "H", align: "right" as const, width: 48 },
  { key: "R", label: "R", align: "right" as const, width: 48 },
  { key: "HR", label: "HR", align: "right" as const, width: 56 },
  { key: "RBI", label: "RBI", align: "right" as const, width: 64 },
  { key: "SB", label: "SB", align: "right" as const, width: 56 },
  { key: "AVG", label: "AVG", align: "right" as const, width: 64 },
  { key: "act", label: "Actions", align: "right" as const, width: 64 },
];

const PITCHER_COLS = [
  { key: "pos", label: "Slot", align: "left" as const, width: 72 },
  { key: "name", label: "Player", align: "left" as const, width: 200 },
  { key: "IP", label: "IP", align: "right" as const, width: 56 },
  { key: "BB_H", label: "BB+H", align: "right" as const, width: 64 },
  { key: "K", label: "K", align: "right" as const, width: 48 },
  { key: "W", label: "W", align: "right" as const, width: 48 },
  { key: "SV", label: "SV", align: "right" as const, width: 56 },
  { key: "ER", label: "ER", align: "right" as const, width: 48 },
  { key: "ERA", label: "ERA", align: "right" as const, width: 64 },
  { key: "WHIP", label: "WHIP", align: "right" as const, width: 64 },
  { key: "act", label: "Actions", align: "right" as const, width: 64 },
];

function n(v: number | string | undefined): number {
  if (v == null || v === "") return 0;
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtTotal(v: number, digits = 0): string {
  if (!Number.isFinite(v)) return "—";
  return digits > 0 ? v.toFixed(digits) : String(Math.round(v));
}

function fmtAvgTotal(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const s = v.toFixed(3);
  return s.startsWith("0") ? s.slice(1) : s;
}

function HitterTotalsRow({ players }: { players: RosterHubPlayer[] }) {
  const totals = useMemo(() => {
    let AB = 0, H = 0, R = 0, HR = 0, RBI = 0, SB = 0;
    for (const p of players) {
      if (p.isPitcher) continue;
      AB += n(p.hitterStats?.AB);
      H += n(p.hitterStats?.H);
      R += n(p.hitterStats?.R);
      HR += n(p.hitterStats?.HR);
      RBI += n(p.hitterStats?.RBI);
      SB += n(p.hitterStats?.SB);
    }
    return { AB, H, R, HR, RBI, SB, AVG: AB > 0 ? H / AB : 0 };
  }, [players]);

  return (
    <tr>
      <td style={totalCellStyle}>TOT</td>
      <td style={{ ...totalCellStyle, textAlign: "left" }}>Hitter Totals</td>
      <td style={totalCellStyle}>{fmtTotal(totals.AB)}</td>
      <td style={totalCellStyle}>{fmtTotal(totals.H)}</td>
      <td style={totalCellStyle}>{fmtTotal(totals.R)}</td>
      <td style={totalCellStyle}>{fmtTotal(totals.HR)}</td>
      <td style={totalCellStyle}>{fmtTotal(totals.RBI)}</td>
      <td style={totalCellStyle}>{fmtTotal(totals.SB)}</td>
      <td style={totalCellStyle}>{fmtAvgTotal(totals.AVG)}</td>
      <td style={totalCellStyle} />
    </tr>
  );
}

function PitcherTotalsRow({ players }: { players: RosterHubPlayer[] }) {
  const totals = useMemo(() => {
    let IP = 0, BB_H = 0, K = 0, W = 0, SV = 0, ER = 0;
    for (const p of players) {
      if (!p.isPitcher) continue;
      IP += n(p.pitcherStats?.IP);
      BB_H += n(p.pitcherStats?.BB_H);
      K += n(p.pitcherStats?.K);
      W += n(p.pitcherStats?.W);
      SV += n(p.pitcherStats?.SV);
      ER += n(p.pitcherStats?.ER);
    }
    return {
      IP,
      BB_H,
      K,
      W,
      SV,
      ER,
      ERA: IP > 0 ? (ER / IP) * 9 : 0,
      WHIP: IP > 0 ? BB_H / IP : 0,
    };
  }, [players]);

  return (
    <tr>
      <td style={totalCellStyle}>TOT</td>
      <td style={{ ...totalCellStyle, textAlign: "left" }}>Pitcher Totals</td>
      <td style={totalCellStyle}>{totals.IP > 0 ? fmtTotal(totals.IP, 1) : "—"}</td>
      <td style={totalCellStyle}>{fmtTotal(totals.BB_H)}</td>
      <td style={totalCellStyle}>{fmtTotal(totals.K)}</td>
      <td style={totalCellStyle}>{fmtTotal(totals.W)}</td>
      <td style={totalCellStyle}>{fmtTotal(totals.SV)}</td>
      <td style={totalCellStyle}>{fmtTotal(totals.ER)}</td>
      <td style={totalCellStyle}>{totals.IP > 0 ? fmtTotal(totals.ERA, 2) : "—"}</td>
      <td style={totalCellStyle}>{totals.IP > 0 ? fmtTotal(totals.WHIP, 2) : "—"}</td>
      <td style={totalCellStyle} />
    </tr>
  );
}

const totalCellStyle: CSSProperties = {
  padding: "9px 12px",
  borderTop: "1px solid var(--am-border-strong)",
  borderBottom: "1px solid var(--am-border)",
  background: "var(--am-chip)",
  color: "var(--am-text)",
  fontSize: 12,
  fontWeight: 750,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

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
  effectiveDate,
  onEffectiveDateChange,
  intelSlot,
  ilTotalSlots,
  dndEnabled,
  shakeRowId,
  ilStashEligible,
  forceMobile,
}: RosterHubV3Props) {
  const isMobile = useIsMobile(forceMobile);
  const dropIds = dropTargetIds ?? new Set<number>();
  const [expandedRosterId, setExpandedRosterId] = useState<number | null>(null);

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
            Tap a slot pill to select; eligible destinations glow. Drag the ⋮⋮ icon
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
            effectiveDate={effectiveDate}
            onEffectiveDateChange={onEffectiveDateChange}
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
                    minWidth: 880,
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
                      <Fragment key={p.rosterId}>
                        <DraggableDesktopRowAdapter
                          player={p}
                          role="hitter"
                          dndEnabled={!!dndEnabled}
                          dropEligibleIds={dropIds}
                          isSelected={selectedRosterId === p.rosterId}
                          isEligible={eligibleRosterIds.has(p.rosterId)}
                          isDimmed={dimmedFor(p.rosterId, "hitter")}
                          isPending={pendingRosterIds.has(p.rosterId)}
                          isExpanded={expandedRosterId === p.rosterId}
                          isDragSource={dragSim?.rosterId === p.rosterId}
                          isDropTarget={dropIds.has(p.rosterId)}
                          onPillClick={() => onPillClick(p.rosterId)}
                          onToggleExpand={() => setExpandedRosterId((cur) => (cur === p.rosterId ? null : p.rosterId))}
                          onRevert={onRevert ? () => onRevert(p.rosterId) : undefined}
                          actions={buildActions(p)}
                          isShakeRejecting={shakeRowId === p.rosterId}
                        />
                        {expandedRosterId === p.rosterId && (
                          <CareerStatsAccordionRow player={p} colSpan={HITTER_COLS.length} />
                        )}
                      </Fragment>
                    ))}
                    {hitters.length > 0 && <HitterTotalsRow players={hitters} />}
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
                    minWidth: 1020,
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
                      <Fragment key={p.rosterId}>
                        <DraggableDesktopRowAdapter
                          player={p}
                          role="pitcher"
                          dndEnabled={!!dndEnabled}
                          dropEligibleIds={dropIds}
                          isSelected={selectedRosterId === p.rosterId}
                          isEligible={eligibleRosterIds.has(p.rosterId)}
                          isDimmed={dimmedFor(p.rosterId, "pitcher")}
                          isPending={pendingRosterIds.has(p.rosterId)}
                          isExpanded={expandedRosterId === p.rosterId}
                          isDragSource={dragSim?.rosterId === p.rosterId}
                          isDropTarget={dropIds.has(p.rosterId)}
                          onPillClick={() => onPillClick(p.rosterId)}
                          onToggleExpand={() => setExpandedRosterId((cur) => (cur === p.rosterId ? null : p.rosterId))}
                          onRevert={onRevert ? () => onRevert(p.rosterId) : undefined}
                          actions={buildActions(p)}
                          isShakeRejecting={shakeRowId === p.rosterId}
                        />
                        {expandedRosterId === p.rosterId && (
                          <CareerStatsAccordionRow player={p} colSpan={PITCHER_COLS.length} />
                        )}
                      </Fragment>
                    ))}
                    {pitchers.length > 0 && <PitcherTotalsRow players={pitchers} />}
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

      {/* Session-89: Lineup Intelligence sits between the active
          roster and the IL section, full-width. Render-prop'd by the
          parent so the hub stays AI-agnostic. */}
      {intelSlot}

      <IlSectionV3
        players={ilPlayers}
        selectedRosterId={selectedRosterId}
        eligibleRosterIds={eligibleRosterIds}
        pendingRosterIds={pendingRosterIds}
        isMobile={isMobile}
        totalSlots={ilTotalSlots ?? 2}
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

function CareerStatsAccordionRow({
  player,
  colSpan,
}: {
  player: RosterHubPlayer;
  colSpan: number;
}) {
  const [rows, setRows] = useState<Array<CareerHittingRow | CareerPitchingRow>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mode: HOrP = player.isPitcher ? "pitching" : "hitting";
  const mlbId = String(player.mlbId ?? "").trim();

  useEffect(() => {
    if (!mlbId) {
      setRows([]);
      setError("No MLB id is available for this player.");
      return;
    }
    let canceled = false;
    setLoading(true);
    setError(null);
    getPlayerCareerStats(mlbId, mode)
      .then((res) => {
        if (!canceled) setRows(res.rows ?? []);
      })
      .catch((err) => {
        if (!canceled) setError(err instanceof Error ? err.message : "Unable to load career stats.");
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [mlbId, mode]);

  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0, borderBottom: "1px solid var(--am-border)" }}>
        <div
          style={{
            padding: "14px 16px 16px",
            background: "var(--am-surface-faint)",
            borderTop: "1px solid var(--am-border)",
          }}
        >
          <div style={{ display: "grid", gap: 12, marginBottom: 14 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(180px, 1fr) minmax(220px, 2fr)",
                gap: 12,
                alignItems: "start",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    color: "var(--am-text-faint)",
                    marginBottom: 5,
                  }}
                >
                  Player
                </div>
                <div style={{ color: "var(--am-text)", fontWeight: 750, fontSize: 13 }}>
                  {player.name}
                </div>
                <div style={{ color: "var(--am-text-muted)", fontSize: 12, marginTop: 2 }}>
                  {player.mlbTeam || "MLB team unknown"} · assigned to {formatSlotInstance(player)}
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    color: "var(--am-text-faint)",
                    marginBottom: 6,
                  }}
                >
                  Eligibility detail
                </div>
                <EligibilityChips player={player} />
              </div>
            </div>

            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: "var(--am-text-faint)",
              }}
            >
              Career stats
            </div>
          </div>
          {loading ? (
            <div style={{ padding: 18, fontSize: 12, color: "var(--am-text-muted)" }}>
              Loading career stats…
            </div>
          ) : error ? (
            <div style={{ padding: 18, fontSize: 12, color: "var(--am-negative)" }}>
              {error}
            </div>
          ) : rows.length ? (
            <CareerTable rows={rows} mode={mode} />
          ) : (
            <div style={{ padding: 18, fontSize: 12, color: "var(--am-text-muted)" }}>
              No career stats available.
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function formatSlotInstance(player: RosterHubPlayer): string {
  if (!player.slotInstance || player.assignedSlot === "IL" || player.assignedSlot === "BN") {
    return player.assignedSlot;
  }
  return `${player.assignedSlot}${player.slotInstance}`;
}

function EligibilityChips({ player }: { player: RosterHubPlayer }) {
  const slots = Array.from(slotsFor(player.posList));
  const displaySlots: string[] = slots.length > 0 ? slots : [player.assignedSlot];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {displaySlots.map((slot) => {
        const gp = player.gamesPlayedByPosition?.[slot as keyof typeof player.gamesPlayedByPosition];
        return (
          <span
            key={slot}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 9px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              color: slot === player.assignedSlot ? "white" : "var(--am-text-muted)",
              background: slot === player.assignedSlot ? "var(--am-accent)" : "var(--am-chip)",
              border: "1px solid var(--am-border)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span>{slot}</span>
            {gp != null && <span style={{ opacity: 0.78 }}>({gp})</span>}
          </span>
        );
      })}
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
  isExpanded?: boolean;
  isDragSource: boolean;
  isDropTarget: boolean;
  isShakeRejecting: boolean;
  onPillClick: () => void;
  onToggleExpand?: () => void;
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
