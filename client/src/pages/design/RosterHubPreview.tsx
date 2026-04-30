// client/src/pages/design/RosterHubPreview.tsx
//
// Static visual preview for the v2 hub-and-spokes Team page redesign
// specified in `docs/plans/2026-04-29-yahoo-style-roster-moves-plan.md`
// §0. This is the *second* design preview — the first (PR #169 at
// `/design/swap-mode`) explored the cards-based Swap Mode direction
// and was pivoted away from after user feedback + a 10-agent
// deepening pass.
//
// CRITICAL: NO BUSINESS LOGIC. All data is mocked, all "swaps" are
// local React state. The components under
// `client/src/features/teams/components/RosterHub/` are real PR2
// components — this page just feeds them mock props.
//
// Admin-gated via the `useAuth().user.isAdmin` flag, mirroring the
// pattern from `SwapModePreview.tsx` and `Admin.tsx`.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Glass, SectionLabel } from "../../components/aurora/atoms";
import { useAuth } from "../../auth/AuthProvider";
import {
  RosterHub,
  type RosterHubPlayer,
  type PendingChange,
  type DragSimState,
  type RosterHubPreviewState,
  type RowAction,
} from "../../features/teams/components/RosterHub";
import { slotsFor, type SlotCode } from "../../lib/positionEligibility";
import "../../features/teams/components/RosterHub/rosterHub.css";

/* ─── Mock data ─────────────────────────────────────────────────────
 *
 * 23 active players covering realistic position diversity, plus 3
 * IL-stashed players. `posList` follows the comma-separated format
 * consumed by `slotsFor()` from `client/src/lib/positionEligibility`.
 *
 * `assignedSlot` reflects today's lineup. `slotInstance` exists for
 * multi-capacity slots (5 OFs, 9 Ps) but the display ignores it —
 * only the SlotCode renders in the pill.
 */
const MOCK_ACTIVE: RosterHubPlayer[] = [
  // Catchers (2 slots)
  { rosterId: 1, playerId: 101, name: "Will Smith", posList: "C", posPrimary: "C", assignedSlot: "C", slotInstance: 0, mlbTeam: "LAD", statSnapshot: "12 HR · .258" },
  { rosterId: 2, playerId: 102, name: "Adley Rutschman", posList: "C", posPrimary: "C", assignedSlot: "C", slotInstance: 1, mlbTeam: "BAL", statSnapshot: "9 HR · .272" },

  // Infield (1B/2B/3B/SS — single slot each)
  { rosterId: 3, playerId: 103, name: "Vladimir Guerrero Jr.", posList: "1B", posPrimary: "1B", assignedSlot: "1B", mlbTeam: "TOR", statSnapshot: "18 HR · .291" },
  { rosterId: 4, playerId: 104, name: "Trea Turner", posList: "2B,SS", posPrimary: "SS", assignedSlot: "2B", mlbTeam: "PHI", statSnapshot: "8 HR · 14 SB", isKeeper: true },
  { rosterId: 5, playerId: 105, name: "Alec Bohm", posList: "3B,1B", posPrimary: "3B", assignedSlot: "3B", mlbTeam: "PHI", statSnapshot: "11 HR · .280" },
  { rosterId: 6, playerId: 106, name: "Bobby Witt Jr.", posList: "SS", posPrimary: "SS", assignedSlot: "SS", mlbTeam: "KC", statSnapshot: "16 HR · 18 SB" },

  // MI (middle infield flex)
  { rosterId: 7, playerId: 107, name: "Marcus Semien", posList: "2B", posPrimary: "2B", assignedSlot: "MI", mlbTeam: "TEX", statSnapshot: "13 HR · 9 SB" },

  // CM (corner-man flex)
  { rosterId: 8, playerId: 108, name: "Pete Alonso", posList: "1B", posPrimary: "1B", assignedSlot: "CM", mlbTeam: "NYM", statSnapshot: "20 HR · .247" },

  // Outfield (5 slots — note multi-position eligibility on Mookie)
  { rosterId: 9, playerId: 109, name: "Mookie Betts", posList: "OF,2B", posPrimary: "OF", assignedSlot: "OF", slotInstance: 0, mlbTeam: "LAD", statSnapshot: "17 HR · .302", isKeeper: true },
  { rosterId: 10, playerId: 110, name: "Aaron Judge", posList: "OF", posPrimary: "OF", assignedSlot: "OF", slotInstance: 1, mlbTeam: "NYY", statSnapshot: "26 HR · .284" },
  { rosterId: 11, playerId: 111, name: "Juan Soto", posList: "OF", posPrimary: "OF", assignedSlot: "OF", slotInstance: 2, mlbTeam: "NYM", statSnapshot: "21 HR · .311" },
  { rosterId: 12, playerId: 112, name: "Kyle Tucker", posList: "OF", posPrimary: "OF", assignedSlot: "OF", slotInstance: 3, mlbTeam: "CHC", statSnapshot: "19 HR · .288" },
  { rosterId: 13, playerId: 113, name: "Corbin Carroll", posList: "OF", posPrimary: "OF", assignedSlot: "OF", slotInstance: 4, mlbTeam: "ARI", statSnapshot: "10 HR · 22 SB" },

  // DH
  { rosterId: 14, playerId: 114, name: "Shohei Ohtani", posList: "DH", posPrimary: "DH", assignedSlot: "DH", mlbTeam: "LAD", statSnapshot: "29 HR · .299", isKeeper: true },

  // Pitchers (9 slots)
  { rosterId: 15, playerId: 115, name: "Tarik Skubal", posList: "SP", posPrimary: "SP", assignedSlot: "P", slotInstance: 0, mlbTeam: "DET", statSnapshot: "10 W · 2.41 ERA" },
  { rosterId: 16, playerId: 116, name: "Paul Skenes", posList: "SP", posPrimary: "SP", assignedSlot: "P", slotInstance: 1, mlbTeam: "PIT", statSnapshot: "9 W · 2.05 ERA" },
  { rosterId: 17, playerId: 117, name: "Logan Gilbert", posList: "SP", posPrimary: "SP", assignedSlot: "P", slotInstance: 2, mlbTeam: "SEA", statSnapshot: "8 W · 3.02 ERA" },
  { rosterId: 18, playerId: 118, name: "Zack Wheeler", posList: "SP", posPrimary: "SP", assignedSlot: "P", slotInstance: 3, mlbTeam: "PHI", statSnapshot: "11 W · 2.68 ERA" },
  { rosterId: 19, playerId: 119, name: "Corbin Burnes", posList: "SP", posPrimary: "SP", assignedSlot: "P", slotInstance: 4, mlbTeam: "ARI", statSnapshot: "7 W · 3.21 ERA" },
  { rosterId: 20, playerId: 120, name: "Spencer Strider", posList: "SP", posPrimary: "SP", assignedSlot: "P", slotInstance: 5, mlbTeam: "ATL", statSnapshot: "9 W · 2.86 ERA" },
  { rosterId: 21, playerId: 121, name: "Edwin Díaz", posList: "RP", posPrimary: "RP", assignedSlot: "P", slotInstance: 6, mlbTeam: "NYM", statSnapshot: "18 SV · 2.10 ERA" },
  { rosterId: 22, playerId: 122, name: "Emmanuel Clase", posList: "RP", posPrimary: "RP", assignedSlot: "P", slotInstance: 7, mlbTeam: "CLE", statSnapshot: "21 SV · 1.78 ERA" },
  { rosterId: 23, playerId: 123, name: "Mason Miller", posList: "RP", posPrimary: "RP", assignedSlot: "P", slotInstance: 8, mlbTeam: "ATH", statSnapshot: "16 SV · 2.04 ERA" },
];

const MOCK_IL: RosterHubPlayer[] = [
  { rosterId: 24, playerId: 124, name: "Mike Trout", posList: "OF", posPrimary: "OF", assignedSlot: "IL", mlbTeam: "LAA", statSnapshot: "Knee · 60-day" },
  { rosterId: 25, playerId: 125, name: "Ronald Acuña Jr.", posList: "OF", posPrimary: "OF", assignedSlot: "IL", mlbTeam: "ATL", statSnapshot: "Knee · 10-day", isKeeper: true },
  { rosterId: 26, playerId: 126, name: "Jacob deGrom", posList: "SP", posPrimary: "SP", assignedSlot: "IL", mlbTeam: "TEX", statSnapshot: "Elbow · 60-day" },
];

/* ─── Visual-state derivation ─────────────────────────────────────── */

interface PreviewSnapshot {
  selectedRosterId: number | null;
  /**
   * When `pendingChanges` are present we need to override the visible
   * slot of moved players. The preview applies these to a derived
   * roster array (see buildVisibleRoster below) so the table reflects
   * the queued state without mutating MOCK_ACTIVE.
   */
  pendingChanges: PendingChange[];
  drag: DragSimState | null;
  dropTargetIds: ReadonlySet<number>;
  showFreeAgentModal: boolean;
}

function snapshotForState(state: RosterHubPreviewState): PreviewSnapshot {
  const empty: ReadonlySet<number> = new Set();
  switch (state) {
    case "idle":
      return {
        selectedRosterId: null,
        pendingChanges: [],
        drag: null,
        dropTargetIds: empty,
        showFreeAgentModal: false,
      };

    case "playerSelected":
      // Mookie Betts (rosterId 9, posList "OF,2B"). Selecting him glows
      // every other OF row + the 2B row + MI row (since 2B → MI).
      return {
        selectedRosterId: 9,
        pendingChanges: [],
        drag: null,
        dropTargetIds: empty,
        showFreeAgentModal: false,
      };

    case "pendingSingle":
      // Single tentative swap: Trea Turner (2B → SS) ↔ Bobby Witt Jr.
      return {
        selectedRosterId: null,
        pendingChanges: [
          {
            id: "p1",
            kind: "swap",
            movingRosterId: 4, // Turner
            displacedRosterId: 6, // Witt
            fromSlot: "2B",
            toSlot: "SS",
          },
        ],
        drag: null,
        dropTargetIds: empty,
        showFreeAgentModal: false,
      };

    case "pendingMultiple":
      // Three queued swaps to demo the bar with realistic load:
      //   - Turner 2B ↔ Witt SS
      //   - Mookie OF1 ↔ Tucker OF4
      //   - Skubal P1 ↔ Strider P6
      return {
        selectedRosterId: null,
        pendingChanges: [
          { id: "p1", kind: "swap", movingRosterId: 4, displacedRosterId: 6, fromSlot: "2B", toSlot: "SS" },
          { id: "p2", kind: "swap", movingRosterId: 9, displacedRosterId: 12, fromSlot: "OF", toSlot: "OF" },
          { id: "p3", kind: "swap", movingRosterId: 15, displacedRosterId: 20, fromSlot: "P", toSlot: "P" },
        ],
        drag: null,
        dropTargetIds: empty,
        showFreeAgentModal: false,
      };

    case "dragging":
      // Simulated drag-in-progress. Mookie (rosterId 9) is being
      // dragged; eligible drop targets are the other OF rows plus 2B.
      return {
        selectedRosterId: null,
        pendingChanges: [],
        drag: { rosterId: 9, ghostX: 480, ghostY: 320 },
        dropTargetIds: new Set([4, 10, 11, 12, 13]),
        showFreeAgentModal: false,
      };

    case "rowMenuOpen":
      // Same as idle — the toggler just instructs the user to click
      // the "..." trigger on any row to see the menu.
      return {
        selectedRosterId: null,
        pendingChanges: [],
        drag: null,
        dropTargetIds: empty,
        showFreeAgentModal: false,
      };

    case "mobile":
      return {
        selectedRosterId: null,
        pendingChanges: [],
        drag: null,
        dropTargetIds: empty,
        showFreeAgentModal: false,
      };

    case "freeAgentPanel":
      return {
        selectedRosterId: null,
        pendingChanges: [],
        drag: null,
        dropTargetIds: empty,
        showFreeAgentModal: true,
      };
  }
}

const PREVIEW_STATES: { value: RosterHubPreviewState; label: string; blurb: string }[] = [
  { value: "idle", label: "1. Idle table view", blurb: "23 active rows + 5 IL slots, no selection." },
  { value: "playerSelected", label: "2. Player selected", blurb: "Mookie Betts pill clicked; eligible rows glow." },
  { value: "pendingSingle", label: "3. Pending swap (single)", blurb: "Turner 2B ↔ Witt SS; revert + save bar visible." },
  { value: "pendingMultiple", label: "4. Pending swaps (3)", blurb: "Three queued; bar shows count." },
  { value: "dragging", label: "5. Drag-and-drop", blurb: "Mookie dragged; eligible rows glow, source dims." },
  { value: "rowMenuOpen", label: "6. Per-row '...' menu", blurb: "Click any row's ... to see the action menu." },
  { value: "mobile", label: "7. Mobile collapsed", blurb: "Force ≤640px layout — list rows, 44px touch targets." },
  { value: "freeAgentPanel", label: "8. Free agent panel", blurb: "AddDropPanel placeholder modal opens from row menu." },
];

/* ─── Pending-change application ──────────────────────────────────── */

/**
 * Returns a new active-roster array with the queue applied. For each
 * `swap`, the moving row's `assignedSlot` is set to the destination
 * and the displaced row backfills the source. Also returns the set of
 * rosterIds touched (used to render the pending row treatment).
 */
function applyPending(
  active: RosterHubPlayer[],
  pending: PendingChange[],
): { players: RosterHubPlayer[]; touched: Set<number> } {
  if (pending.length === 0) return { players: active, touched: new Set() };

  const byId = new Map(active.map((p) => [p.rosterId, { ...p }]));
  const touched = new Set<number>();

  for (const pc of pending) {
    const moving = byId.get(pc.movingRosterId);
    const displaced = byId.get(pc.displacedRosterId);
    if (!moving || !displaced) continue;
    const movingOldSlot = moving.assignedSlot as SlotCode;
    moving.assignedSlot = displaced.assignedSlot;
    displaced.assignedSlot = movingOldSlot;
    touched.add(moving.rosterId);
    touched.add(displaced.rosterId);
  }

  // Preserve the original render order — the slot label changes, the
  // row position does not. Yahoo does the same: row order is stable
  // across pending swaps, only the pill text + visual state move.
  return {
    players: active.map((p) => byId.get(p.rosterId)!),
    touched,
  };
}

/* ─── Free-agent modal placeholder ───────────────────────────────── */

function FreeAgentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add free agent"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(5, 10, 20, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          background: "var(--am-surface-strong)",
          border: "1px solid var(--am-border-strong)",
          borderRadius: 22,
          padding: 24,
          boxShadow: "0 30px 80px rgba(0, 0, 0, 0.45)",
          backdropFilter: "blur(28px) saturate(160%)",
          WebkitBackdropFilter: "blur(28px) saturate(160%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <SectionLabel style={{ marginBottom: 0 }}>✦ Free agent panel</SectionLabel>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: 0,
              padding: 4,
              cursor: "pointer",
              fontSize: 16,
              color: "var(--am-text-muted)",
            }}
          >
            ✕
          </button>
        </div>
        <h2
          style={{
            fontFamily: "var(--am-display)",
            fontSize: 22,
            fontWeight: 300,
            color: "var(--am-text)",
            margin: 0,
            marginBottom: 8,
          }}
        >
          Add free agent
        </h2>
        <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--am-text-muted)", margin: 0 }}>
          PR2 wires the existing <code>AddDropPanel</code> here with the row's slot pre-selected.
          The panel already supports the auto-resolve flow shipped in PR1 — no changes needed.
        </p>
        <div
          style={{
            marginTop: 16,
            padding: "32px 16px",
            border: "1px dashed var(--am-border-strong)",
            borderRadius: 14,
            textAlign: "center",
            color: "var(--am-text-faint)",
            fontSize: 12,
          }}
        >
          AddDropPanel will render here
        </div>
      </div>
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────── */

export default function RosterHubPreview() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.isAdmin);

  const [state, setState] = useState<RosterHubPreviewState>("idle");
  const [overrideSelected, setOverrideSelected] = useState<number | null>(null);
  const [overrideFreeAgentOpen, setOverrideFreeAgentOpen] = useState(false);

  const snap = useMemo(() => snapshotForState(state), [state]);

  // Allow the user to override which player is selected by clicking
  // any pill — gives the eligibility highlight a feel beyond the
  // canonical Mookie demo.
  const effectiveSelectedId =
    state === "playerSelected" && overrideSelected != null ? overrideSelected : snap.selectedRosterId;
  const effectiveFreeAgentOpen = snap.showFreeAgentModal || overrideFreeAgentOpen;

  // Apply the pending queue to derive the visible roster.
  const { players: visibleActive, touched: pendingRosterIds } = useMemo(
    () => applyPending(MOCK_ACTIVE, snap.pendingChanges),
    [snap.pendingChanges],
  );

  const selectedPlayer = useMemo(
    () =>
      effectiveSelectedId == null
        ? null
        : (visibleActive.find((p) => p.rosterId === effectiveSelectedId) ??
            MOCK_IL.find((p) => p.rosterId === effectiveSelectedId) ??
            null),
    [effectiveSelectedId, visibleActive],
  );

  // Compute eligible-row set: every roster row whose `assignedSlot` is
  // in `slotsFor(selected.posList)`. Memoized per the perf-oracle
  // guidance — recomputed only when selection or roster identity changes.
  const eligibleRosterIds = useMemo<ReadonlySet<number>>(() => {
    if (!selectedPlayer) return new Set();
    const eligibleSlots = slotsFor(selectedPlayer.posList);
    const out = new Set<number>();
    for (const p of visibleActive) {
      if (p.rosterId === selectedPlayer.rosterId) continue;
      if (p.assignedSlot !== "IL" && eligibleSlots.has(p.assignedSlot as SlotCode)) {
        out.add(p.rosterId);
      }
    }
    return out;
  }, [selectedPlayer, visibleActive]);

  const onPillClick = (rosterId: number) => {
    if (state === "playerSelected" && overrideSelected === rosterId) {
      setOverrideSelected(null);
      setState("idle");
      return;
    }
    setOverrideSelected(rosterId);
    setState("playerSelected");
  };

  const handleStateChange = (next: RosterHubPreviewState) => {
    setOverrideSelected(null);
    setOverrideFreeAgentOpen(false);
    setState(next);
  };

  // Action menu builder — the "..." dropdown content per row. Items
  // stay visible across all rows except "Activate from IL" which only
  // appears on IL rows.
  const buildActions = (player: RosterHubPlayer): RowAction[] => {
    const onIl = player.assignedSlot === "IL";
    return [
      {
        key: "move",
        glyph: "↕",
        label: "Move to slot…",
        onSelect: () => {
          // Visual-only: pretend the user picked a slot.
          handleStateChange("playerSelected");
          setOverrideSelected(player.rosterId);
        },
      },
      {
        key: "addFreeAgent",
        glyph: "＋",
        label: "Add free agent here…",
        onSelect: () => {
          setOverrideFreeAgentOpen(true);
        },
      },
      {
        key: "activate",
        glyph: "↑",
        label: "Activate from IL…",
        visible: onIl,
        onSelect: () => {
          // No-op visual; real wiring uses ActivateFromIlPanel.
        },
      },
      {
        key: "stash",
        glyph: "✚",
        label: "Stash on IL…",
        visible: !onIl,
        onSelect: () => {
          // No-op visual; real wiring uses PlaceOnIlPanel.
        },
      },
      {
        key: "view",
        glyph: "i",
        label: "View player details",
        onSelect: () => {
          // No-op visual; real wiring uses PlayerDetailModal.
        },
      },
      {
        key: "drop",
        glyph: "✕",
        label: "Drop player",
        destructive: true,
        onSelect: () => {
          // No-op visual; real wiring uses AddDropPanel's drop tab.
        },
      },
    ];
  };

  if (!isAdmin) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <Glass strong>
          <SectionLabel>✦ Design preview</SectionLabel>
          <h1
            style={{
              fontFamily: "var(--am-display)",
              fontSize: 30,
              fontWeight: 300,
              color: "var(--am-text)",
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            Roster Hub preview
          </h1>
        </Glass>
        <Glass>
          <div
            style={{
              height: 120,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--am-text-muted)",
              fontSize: 13,
            }}
          >
            Admin access required.
          </div>
        </Glass>
      </div>
    );
  }

  const showSelectionBanner = state === "playerSelected" && Boolean(selectedPlayer);
  const forceMobile = state === "mobile";

  return (
    <div
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        paddingBottom: 80,
        minHeight: "100svh",
      }}
    >
      <Glass strong>
        <SectionLabel>✦ Design preview · v2 · admin only</SectionLabel>
        <h1
          style={{
            fontFamily: "var(--am-display)",
            fontSize: 32,
            fontWeight: 300,
            color: "var(--am-text)",
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          Roster Hub — v2 hub-and-spokes Team page
        </h1>
        <p style={{ marginTop: 10, fontSize: 13, color: "var(--am-text-muted)", lineHeight: 1.6 }}>
          Static visual preview of the v2 design specified in <code>docs/plans/2026-04-29-yahoo-style-roster-moves-plan.md</code>{" "}
          §0. <strong>No business logic</strong> — all data is mocked, all "swaps" are local React state. Use the floating
          control panel (top-right) to cycle through eight canonical states. Clicking any position pill selects that
          player and lights up their eligible destination rows across active + IL.
        </p>
        <p style={{ marginTop: 8, fontSize: 12, color: "var(--am-text-faint)" }}>
          Comparing with the v1 cards approach? <Link to="/design/swap-mode" style={{ color: "var(--am-text-muted)" }}>← v1 preview at /design/swap-mode</Link>
        </p>
      </Glass>

      <RosterHub
        activePlayers={visibleActive}
        ilPlayers={MOCK_IL}
        selectedRosterId={effectiveSelectedId}
        eligibleRosterIds={eligibleRosterIds}
        pendingRosterIds={pendingRosterIds}
        pendingCount={snap.pendingChanges.length}
        dragSim={snap.drag}
        dropTargetIds={snap.dropTargetIds}
        showSelectionBanner={showSelectionBanner}
        selectedPlayerName={selectedPlayer?.name}
        onPillClick={onPillClick}
        buildActions={buildActions}
        onRevert={() => handleStateChange("idle")}
        onRevertAll={() => handleStateChange("idle")}
        onSave={() => handleStateChange("idle")}
        forceMobile={forceMobile}
      />

      <FreeAgentModal open={effectiveFreeAgentOpen} onClose={() => handleStateChange("idle")} />

      <StateToggler value={state} onChange={handleStateChange} />
    </div>
  );
}

/* ─── State toggler ─────────────────────────────────────────────────── */

function StateToggler({
  value,
  onChange,
}: {
  value: RosterHubPreviewState;
  onChange: (s: RosterHubPreviewState) => void;
}) {
  const current = PREVIEW_STATES.find((s) => s.value === value) ?? PREVIEW_STATES[0];
  return (
    <div
      style={{
        position: "fixed",
        top: 80,
        right: 18,
        zIndex: 40,
        width: 280,
        background: "var(--am-surface-strong)",
        border: "1px solid var(--am-border-strong)",
        borderRadius: 18,
        padding: 14,
        backdropFilter: "blur(28px) saturate(160%)",
        WebkitBackdropFilter: "blur(28px) saturate(160%)",
        boxShadow: "0 18px 50px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.06) inset",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: "var(--am-text-faint)",
          fontWeight: 600,
        }}
      >
        ✦ Preview state · v2
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {PREVIEW_STATES.map((s) => {
          const active = s.value === value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onChange(s.value)}
              style={{
                textAlign: "left",
                fontSize: 12,
                padding: "7px 10px",
                borderRadius: 10,
                border: "1px solid " + (active ? "var(--am-border-strong)" : "transparent"),
                background: active ? "var(--am-chip-strong)" : "transparent",
                color: active ? "var(--am-text)" : "var(--am-text-muted)",
                cursor: "pointer",
                fontWeight: active ? 600 : 500,
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: "var(--am-text-faint)", lineHeight: 1.4, marginTop: 4 }}>{current.blurb}</div>
    </div>
  );
}
