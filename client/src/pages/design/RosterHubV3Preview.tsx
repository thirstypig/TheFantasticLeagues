// client/src/pages/design/RosterHubV3Preview.tsx
//
// v3 design preview — incorporates the 5 user refinements captured in
// `docs/plans/2026-04-29-yahoo-style-roster-moves-plan.md` §0.5:
//   1. Consolidated table replaces hitter+pitcher stats tables
//   2. NO popup modals — sub-routes inline-replace the table
//   3. Merged Position+Eligibility column with games-played numbers
//   4. Direction confirmed (preserves v2's affordances)
//   5. Yahoo copy permission — mirror Yahoo's pill+GP pattern
//
// CRITICAL: NO BUSINESS LOGIC. All data is mocked, all "swaps" are
// local React state. The components under
// `client/src/features/teams/components/RosterHub/` are real PR2
// components — this page just feeds them mock props.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Glass, SectionLabel, Chip, IridText } from "../../components/aurora/atoms";
import { useAuth } from "../../auth/AuthProvider";
import {
  RosterHubV3,
  SubrouteContainer,
  AddDropPanelMock,
  IlStashPanelMock,
  IlActivatePanelMock,
  type RosterHubPlayer,
  type PendingChange,
  type DragSimState,
  type RosterHubV3PreviewState,
  type RowAction,
} from "../../features/teams/components/RosterHub";
import { slotsFor, type SlotCode } from "../../lib/positionEligibility";
import "../../features/teams/components/RosterHub/rosterHub.css";

/* ─── Mock data ─────────────────────────────────────────────────────
 *
 * 14 hitters + 9 pitchers + 3 IL. `gamesPlayedByPosition` is the v3
 * addition — populated with realistic GP numbers that tell a story:
 *
 *   - Trea Turner (2B, SS): primary 2B with heavy GP, but eligible at
 *     SS too via Rule 1 (current ≥3 GP) since the season is in flight.
 *   - Mookie Betts (OF, 2B): "Rule 2 grandfathered" pattern — heavy
 *     OF GP this year, plus 2B from prior-season ≥20 GP carryover.
 *   - Pete Alonso (1B): single-position, fills the CM flex slot. The
 *     "(no GP threshold)" handling for CM is implicit (CM/MI/DH skip
 *     the suffix in `PositionEligibilityCell`).
 *   - Shohei Ohtani: plays as DH-only here. The dual-listed pitcher
 *     row would be a separate roster row in OGBA's data model
 *     (`Player.derivedId >= 1M`), so this preview keeps it simple
 *     and shows him as a hitter only. PR body documents the call.
 */

const MOCK_HITTERS: RosterHubPlayer[] = [
  // Catchers (2 slots)
  {
    rosterId: 1, playerId: 101, name: "Will Smith", posList: "C", posPrimary: "C",
    assignedSlot: "C", slotInstance: 0, mlbTeam: "LAD", isPitcher: false,
    gamesPlayedByPosition: { C: 28 },
    hitterStats: { R: 22, HR: 8, RBI: 27, SB: 0, AVG: 0.258 },
  },
  {
    rosterId: 2, playerId: 102, name: "Adley Rutschman", posList: "C", posPrimary: "C",
    assignedSlot: "C", slotInstance: 1, mlbTeam: "BAL", isPitcher: false,
    gamesPlayedByPosition: { C: 32 },
    hitterStats: { R: 24, HR: 7, RBI: 23, SB: 1, AVG: 0.272 },
  },

  // Infield (1B/2B/3B/SS)
  {
    rosterId: 3, playerId: 103, name: "Vladimir Guerrero Jr.", posList: "1B", posPrimary: "1B",
    assignedSlot: "1B", mlbTeam: "TOR", isPitcher: false,
    gamesPlayedByPosition: { "1B": 38 },
    hitterStats: { R: 31, HR: 14, RBI: 36, SB: 0, AVG: 0.291 },
  },
  {
    rosterId: 4, playerId: 104, name: "Trea Turner", posList: "2B,SS", posPrimary: "SS",
    assignedSlot: "2B", mlbTeam: "PHI", isKeeper: true, isPitcher: false,
    gamesPlayedByPosition: { "2B": 38, SS: 12 }, // 38 GP at 2B, 12 at SS this season
    hitterStats: { R: 28, HR: 6, RBI: 19, SB: 14, AVG: 0.275 },
  },
  {
    rosterId: 5, playerId: 105, name: "Alec Bohm", posList: "3B,1B", posPrimary: "3B",
    assignedSlot: "3B", mlbTeam: "PHI", isPitcher: false,
    gamesPlayedByPosition: { "3B": 35, "1B": 5 }, // mostly 3B, occasional 1B
    hitterStats: { R: 21, HR: 9, RBI: 28, SB: 1, AVG: 0.280 },
  },
  {
    rosterId: 6, playerId: 106, name: "Bobby Witt Jr.", posList: "SS", posPrimary: "SS",
    assignedSlot: "SS", mlbTeam: "KC", isPitcher: false,
    gamesPlayedByPosition: { SS: 41 },
    hitterStats: { R: 33, HR: 11, RBI: 24, SB: 18, AVG: 0.301 },
  },

  // MI flex (no GP threshold; eligibility via underlying 2B/SS)
  {
    rosterId: 7, playerId: 107, name: "Marcus Semien", posList: "2B", posPrimary: "2B",
    assignedSlot: "MI", mlbTeam: "TEX", isPitcher: false,
    gamesPlayedByPosition: { "2B": 40 }, // no MI count needed (flex)
    hitterStats: { R: 26, HR: 10, RBI: 22, SB: 9, AVG: 0.244 },
  },

  // CM flex
  {
    rosterId: 8, playerId: 108, name: "Pete Alonso", posList: "1B", posPrimary: "1B",
    assignedSlot: "CM", mlbTeam: "NYM", isPitcher: false,
    gamesPlayedByPosition: { "1B": 39 },
    hitterStats: { R: 24, HR: 13, RBI: 32, SB: 0, AVG: 0.247 },
  },

  // Outfield (5 slots)
  {
    rosterId: 9, playerId: 109, name: "Mookie Betts", posList: "OF,2B", posPrimary: "OF",
    assignedSlot: "OF", slotInstance: 0, mlbTeam: "LAD", isKeeper: true, isPitcher: false,
    // Rule 2 grandfathering story: 47 GP at OF this year + carryover at 2B
    gamesPlayedByPosition: { OF: 47, "2B": 8 },
    hitterStats: { R: 38, HR: 12, RBI: 26, SB: 5, AVG: 0.302 },
  },
  {
    rosterId: 10, playerId: 110, name: "Aaron Judge", posList: "OF", posPrimary: "OF",
    assignedSlot: "OF", slotInstance: 1, mlbTeam: "NYY", isPitcher: false,
    gamesPlayedByPosition: { OF: 44 },
    hitterStats: { R: 35, HR: 18, RBI: 41, SB: 1, AVG: 0.284 },
  },
  {
    rosterId: 11, playerId: 111, name: "Juan Soto", posList: "OF", posPrimary: "OF",
    assignedSlot: "OF", slotInstance: 2, mlbTeam: "NYM", isPitcher: false,
    gamesPlayedByPosition: { OF: 42 },
    hitterStats: { R: 32, HR: 14, RBI: 31, SB: 4, AVG: 0.311 },
  },
  {
    rosterId: 12, playerId: 112, name: "Kyle Tucker", posList: "OF", posPrimary: "OF",
    assignedSlot: "OF", slotInstance: 3, mlbTeam: "CHC", isPitcher: false,
    gamesPlayedByPosition: { OF: 39 },
    hitterStats: { R: 27, HR: 11, RBI: 28, SB: 6, AVG: 0.288 },
  },
  {
    rosterId: 13, playerId: 113, name: "Corbin Carroll", posList: "OF", posPrimary: "OF",
    assignedSlot: "OF", slotInstance: 4, mlbTeam: "ARI", isPitcher: false,
    gamesPlayedByPosition: { OF: 41 },
    hitterStats: { R: 30, HR: 7, RBI: 18, SB: 22, AVG: 0.262 },
  },

  // DH
  {
    rosterId: 14, playerId: 114, name: "Shohei Ohtani", posList: "DH", posPrimary: "DH",
    assignedSlot: "DH", mlbTeam: "LAD", isKeeper: true, isPitcher: false,
    gamesPlayedByPosition: {}, // DH has no defensive GP threshold
    hitterStats: { R: 41, HR: 19, RBI: 38, SB: 7, AVG: 0.299 },
  },
];

const MOCK_PITCHERS: RosterHubPlayer[] = [
  {
    rosterId: 15, playerId: 115, name: "Tarik Skubal", posList: "SP", posPrimary: "SP",
    assignedSlot: "P", slotInstance: 0, mlbTeam: "DET", isPitcher: true,
    gamesPlayedByPosition: { P: 9 }, // 9 starts
    pitcherStats: { IP: 56.2, W: 7, SV: 0, K: 78, ERA: 2.41, WHIP: 0.98 },
  },
  {
    rosterId: 16, playerId: 116, name: "Paul Skenes", posList: "SP", posPrimary: "SP",
    assignedSlot: "P", slotInstance: 1, mlbTeam: "PIT", isPitcher: true,
    gamesPlayedByPosition: { P: 8 },
    pitcherStats: { IP: 52.1, W: 6, SV: 0, K: 82, ERA: 2.05, WHIP: 0.94 },
  },
  {
    rosterId: 17, playerId: 117, name: "Logan Gilbert", posList: "SP", posPrimary: "SP",
    assignedSlot: "P", slotInstance: 2, mlbTeam: "SEA", isPitcher: true,
    gamesPlayedByPosition: { P: 9 },
    pitcherStats: { IP: 58.0, W: 5, SV: 0, K: 64, ERA: 3.02, WHIP: 1.12 },
  },
  {
    rosterId: 18, playerId: 118, name: "Zack Wheeler", posList: "SP", posPrimary: "SP",
    assignedSlot: "P", slotInstance: 3, mlbTeam: "PHI", isPitcher: true,
    gamesPlayedByPosition: { P: 9 },
    pitcherStats: { IP: 60.1, W: 7, SV: 0, K: 71, ERA: 2.68, WHIP: 1.04 },
  },
  {
    rosterId: 19, playerId: 119, name: "Corbin Burnes", posList: "SP", posPrimary: "SP",
    assignedSlot: "P", slotInstance: 4, mlbTeam: "ARI", isPitcher: true,
    gamesPlayedByPosition: { P: 8 },
    pitcherStats: { IP: 50.0, W: 4, SV: 0, K: 56, ERA: 3.21, WHIP: 1.15 },
  },
  {
    rosterId: 20, playerId: 120, name: "Spencer Strider", posList: "SP", posPrimary: "SP",
    assignedSlot: "P", slotInstance: 5, mlbTeam: "ATL", isPitcher: true,
    gamesPlayedByPosition: { P: 9 },
    pitcherStats: { IP: 55.2, W: 6, SV: 0, K: 88, ERA: 2.86, WHIP: 1.02 },
  },
  {
    rosterId: 21, playerId: 121, name: "Edwin Díaz", posList: "RP", posPrimary: "RP",
    assignedSlot: "P", slotInstance: 6, mlbTeam: "NYM", isPitcher: true,
    gamesPlayedByPosition: { P: 22 }, // 22 appearances
    pitcherStats: { IP: 22.0, W: 1, SV: 14, K: 31, ERA: 2.10, WHIP: 0.95 },
  },
  {
    rosterId: 22, playerId: 122, name: "Emmanuel Clase", posList: "RP", posPrimary: "RP",
    assignedSlot: "P", slotInstance: 7, mlbTeam: "CLE", isPitcher: true,
    gamesPlayedByPosition: { P: 24 },
    pitcherStats: { IP: 24.1, W: 2, SV: 18, K: 27, ERA: 1.78, WHIP: 0.88 },
  },
  {
    rosterId: 23, playerId: 123, name: "Mason Miller", posList: "RP", posPrimary: "RP",
    assignedSlot: "P", slotInstance: 8, mlbTeam: "ATH", isPitcher: true,
    gamesPlayedByPosition: { P: 21 },
    pitcherStats: { IP: 21.0, W: 1, SV: 12, K: 35, ERA: 2.04, WHIP: 0.93 },
  },
];

const MOCK_IL: RosterHubPlayer[] = [
  {
    rosterId: 24, playerId: 124, name: "Mike Trout", posList: "OF", posPrimary: "OF",
    assignedSlot: "IL", mlbTeam: "LAA", isPitcher: false,
    gamesPlayedByPosition: { OF: 18 },
    statSnapshot: "Knee · 60-day",
  },
  {
    rosterId: 25, playerId: 125, name: "Ronald Acuña Jr.", posList: "OF", posPrimary: "OF",
    assignedSlot: "IL", mlbTeam: "ATL", isKeeper: true, isPitcher: false,
    gamesPlayedByPosition: { OF: 22 },
    statSnapshot: "Knee · 10-day",
  },
  {
    rosterId: 26, playerId: 126, name: "Jacob deGrom", posList: "SP", posPrimary: "SP",
    assignedSlot: "IL", mlbTeam: "TEX", isPitcher: true,
    gamesPlayedByPosition: { P: 4 },
    statSnapshot: "Elbow · 60-day",
  },
];

/* ─── Visual-state derivation ─────────────────────────────────────── */

interface PreviewSnapshot {
  selectedRosterId: number | null;
  pendingChanges: PendingChange[];
  drag: DragSimState | null;
  dropTargetIds: ReadonlySet<number>;
  dimSection: "hitters" | "pitchers" | null;
  subroute: "claim" | "il-stash" | "il-activate" | null;
  /** When in a sub-route, the rosterId that triggered it (for context). */
  subrouteRosterId: number | null;
}

function snapshotForState(state: RosterHubV3PreviewState): PreviewSnapshot {
  const empty: ReadonlySet<number> = new Set();
  const base: PreviewSnapshot = {
    selectedRosterId: null,
    pendingChanges: [],
    drag: null,
    dropTargetIds: empty,
    dimSection: null,
    subroute: null,
    subrouteRosterId: null,
  };

  switch (state) {
    case "idle":
    case "rowMenuOpen":
    case "mobile":
      return base;

    case "playerSelected":
      // Mookie Betts (rosterId 9) — OF/2B eligibility lights up other
      // OFs + the 2B row + MI row.
      return { ...base, selectedRosterId: 9 };

    case "pendingMultiple":
      return {
        ...base,
        pendingChanges: [
          { id: "p1", kind: "swap", movingRosterId: 4, displacedRosterId: 6, fromSlot: "2B", toSlot: "SS" },
          { id: "p2", kind: "swap", movingRosterId: 9, displacedRosterId: 12, fromSlot: "OF", toSlot: "OF" },
          { id: "p3", kind: "swap", movingRosterId: 15, displacedRosterId: 20, fromSlot: "P", toSlot: "P" },
        ],
      };

    case "dragging":
      // Mookie (hitter) is being dragged → pitcher section dims.
      return {
        ...base,
        drag: { rosterId: 9, ghostX: 480, ghostY: 320 },
        dropTargetIds: new Set([4, 7, 10, 11, 12, 13]),
        dimSection: "pitchers",
      };

    case "subrouteClaim":
      return { ...base, subroute: "claim", subrouteRosterId: 9 };
    case "subrouteIlStash":
      return { ...base, subroute: "il-stash", subrouteRosterId: 9 };
    case "subrouteIlActivate":
      return { ...base, subroute: "il-activate", subrouteRosterId: 24 };
  }
}

const PREVIEW_STATES: { value: RosterHubV3PreviewState; label: string; blurb: string }[] = [
  { value: "idle", label: "1. Idle consolidated view", blurb: "Hitters + Pitchers sections, GP numbers, IL below." },
  { value: "playerSelected", label: "2. Player selected", blurb: "Mookie's pill clicked; OF + 2B + MI rows glow." },
  { value: "pendingMultiple", label: "3. Pending swaps (3)", blurb: "Three queued; pending bar + per-row treatment." },
  { value: "dragging", label: "4. Drag in progress", blurb: "Hitter being dragged; pitcher section dims." },
  { value: "subrouteClaim", label: "5. Sub-route: Add free agent", blurb: "Table replaced with claim panel inline." },
  { value: "subrouteIlStash", label: "6. Sub-route: IL Stash", blurb: "Table replaced with IL stash panel inline." },
  { value: "subrouteIlActivate", label: "7. Sub-route: IL Activate", blurb: "Table replaced with IL activate panel inline." },
  { value: "mobile", label: "8. Mobile collapsed", blurb: "Force ≤640px layout — sectioned list rows." },
  { value: "rowMenuOpen", label: "9. Action menu open", blurb: "Click any '...' trigger — 5 nav items inline." },
];

/* ─── Pending-change application ──────────────────────────────────── */

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

  return {
    players: active.map((p) => byId.get(p.rosterId)!),
    touched,
  };
}

/* ─── Page ────────────────────────────────────────────────────────── */

export default function RosterHubV3Preview() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.isAdmin);

  const [state, setState] = useState<RosterHubV3PreviewState>("idle");
  const [overrideSelected, setOverrideSelected] = useState<number | null>(null);

  const snap = useMemo(() => snapshotForState(state), [state]);

  const effectiveSelectedId =
    state === "playerSelected" && overrideSelected != null
      ? overrideSelected
      : snap.selectedRosterId;

  const allActive = useMemo(() => [...MOCK_HITTERS, ...MOCK_PITCHERS], []);

  // Apply pending swaps across the active roster, then re-split by role.
  const { hitters, pitchers, pendingRosterIds } = useMemo(() => {
    const { players, touched } = applyPending(allActive, snap.pendingChanges);
    return {
      hitters: players.filter((p) => !p.isPitcher),
      pitchers: players.filter((p) => p.isPitcher),
      pendingRosterIds: touched,
    };
  }, [allActive, snap.pendingChanges]);

  const visibleActive = useMemo(() => [...hitters, ...pitchers], [hitters, pitchers]);

  const selectedPlayer = useMemo(
    () =>
      effectiveSelectedId == null
        ? null
        : (visibleActive.find((p) => p.rosterId === effectiveSelectedId) ??
            MOCK_IL.find((p) => p.rosterId === effectiveSelectedId) ??
            null),
    [effectiveSelectedId, visibleActive],
  );

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

  const handleStateChange = (next: RosterHubV3PreviewState) => {
    setOverrideSelected(null);
    setState(next);
  };

  const buildActions = (player: RosterHubPlayer): RowAction[] => {
    const onIl = player.assignedSlot === "IL";
    return [
      {
        key: "move",
        glyph: "↕",
        label: "Move to slot…",
        onSelect: () => {
          handleStateChange("playerSelected");
          setOverrideSelected(player.rosterId);
        },
      },
      {
        key: "addFreeAgent",
        glyph: "＋",
        label: "Add free agent here…",
        onSelect: () => handleStateChange("subrouteClaim"),
      },
      {
        key: "activate",
        glyph: "↑",
        label: "Activate from IL…",
        visible: onIl,
        onSelect: () => handleStateChange("subrouteIlActivate"),
      },
      {
        key: "stash",
        glyph: "✚",
        label: "Stash on IL…",
        visible: !onIl,
        onSelect: () => handleStateChange("subrouteIlStash"),
      },
      {
        key: "view",
        glyph: "i",
        label: "View player details",
        onSelect: () => {
          /* PR2 wires PlayerDetailModal or a /players/:id sub-route */
        },
      },
      {
        key: "drop",
        glyph: "✕",
        label: "Drop player",
        destructive: true,
        onSelect: () => {
          /* PR2 wires the drop sub-route */
        },
      },
    ];
  };

  if (!isAdmin) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <Glass strong>
          <SectionLabel>✦ Design preview · v3 · admin only</SectionLabel>
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
            Roster Hub v3 preview
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
  const inSubroute = snap.subroute != null;

  const subrouteContextPlayer = snap.subrouteRosterId
    ? allActive.find((p) => p.rosterId === snap.subrouteRosterId) ??
      MOCK_IL.find((p) => p.rosterId === snap.subrouteRosterId)
    : null;

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
        <SectionLabel>✦ Design preview · v3 · admin only</SectionLabel>
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
          Roster Hub — v3 consolidated table + GP numbers + sub-routes
        </h1>
        <p style={{ marginTop: 10, fontSize: 13, color: "var(--am-text-muted)", lineHeight: 1.6 }}>
          Static visual preview of the v3 design specified in{" "}
          <code>docs/plans/2026-04-29-yahoo-style-roster-moves-plan.md</code> §0.5. Five
          refinements layered on v2: (1) the consolidated table replaces the separate
          hitter/pitcher stats tables on Team.tsx, (2) AddDrop / IL Stash / IL Activate
          flows render as inline sub-routes (no modals), (3) Position+Eligibility column
          now includes games-played numbers per Yahoo's pattern, (4) v2 affordances
          preserved, (5) Yahoo copy permission. <strong>No business logic</strong> — all
          data is mocked. Use the floating panel to cycle nine canonical states.
        </p>
        <p style={{ marginTop: 8, fontSize: 12, color: "var(--am-text-faint)" }}>
          Comparing iterations:{" "}
          <Link to="/design/swap-mode" style={{ color: "var(--am-text-muted)" }}>
            v1 (cards) at /design/swap-mode
          </Link>{" "}
        </p>
      </Glass>

      {/* Mocked Team page header — name + period selector. Stays
          visible when the user navigates into a sub-route, so the
          context is preserved (refinement #2's "stats stay visible"
          principle, generalized to "page context stays visible"). */}
      <Glass strong padded={false}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 24px" }}>
          <div
            style={{
              width: 64, height: 64, borderRadius: 16,
              background: "var(--am-irid)",
              display: "grid", placeItems: "center",
              fontFamily: "var(--am-display)", fontSize: 22, fontWeight: 600, color: "#fff",
              boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
            }}
          >
            DT
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <SectionLabel style={{ marginBottom: 0 }}>OGBA</SectionLabel>
              <Chip strong>Your team</Chip>
              <Chip>jcdesign</Chip>
            </div>
            <div style={{ fontFamily: "var(--am-display)", fontSize: 30, lineHeight: 1, letterSpacing: -0.4 }}>
              <IridText>Design Test Squad</IridText>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--am-text-muted)" }}>
              {hitters.length} hitters · {pitchers.length} pitchers · {MOCK_IL.length} IL
            </div>
          </div>
        </div>

        <div style={{ padding: "0 24px 20px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span
            style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase",
              color: "var(--am-text-faint)", marginRight: 4,
            }}
          >
            View
          </span>
          {[
            { key: "season", label: "Cumulative" },
            { key: "p1", label: "Period 1" },
            { key: "p2", label: "Period 2" },
            { key: "p3", label: "Period 3" },
          ].map((opt, idx) => {
            const isActive = idx === 0;
            return (
              <span
                key={opt.key}
                style={{
                  padding: "5px 12px", borderRadius: 99,
                  fontSize: 11, fontWeight: 600, letterSpacing: 0.2,
                  background: isActive ? "var(--am-chip-strong)" : "var(--am-chip)",
                  color: isActive ? "var(--am-text)" : "var(--am-text-muted)",
                  border: "1px solid " + (isActive ? "var(--am-border-strong)" : "var(--am-border)"),
                }}
              >
                {opt.label}
              </span>
            );
          })}
        </div>
      </Glass>

      {/* Body — table OR sub-route. */}
      {inSubroute ? (
        <>
          {snap.subroute === "claim" && (
            <SubrouteContainer
              title="Add free agent"
              blurb={
                subrouteContextPlayer
                  ? `Pre-selected slot: ${subrouteContextPlayer.assignedSlot}. Search free agents and choose a player to drop. The bipartite matcher will resolve any slot conflicts automatically.`
                  : "Search free agents and choose a player to drop."
              }
              onBack={() => handleStateChange("idle")}
            >
              <AddDropPanelMock
                preselectedSlot={
                  subrouteContextPlayer?.assignedSlot === "IL"
                    ? undefined
                    : (subrouteContextPlayer?.assignedSlot as string | undefined)
                }
              />
            </SubrouteContainer>
          )}
          {snap.subroute === "il-stash" && (
            <SubrouteContainer
              title="Stash on IL"
              blurb="Move an active player to your IL slots. The active spot becomes available for a free-agent claim."
              onBack={() => handleStateChange("idle")}
            >
              <IlStashPanelMock playerName={subrouteContextPlayer?.name} />
            </SubrouteContainer>
          )}
          {snap.subroute === "il-activate" && (
            <SubrouteContainer
              title="Activate from IL"
              blurb="Bring an IL player back to the active roster. The matcher will find a legal slot configuration."
              onBack={() => handleStateChange("idle")}
            >
              <IlActivatePanelMock playerName={subrouteContextPlayer?.name} />
            </SubrouteContainer>
          )}
        </>
      ) : (
        <RosterHubV3
          hitters={hitters}
          pitchers={pitchers}
          ilPlayers={MOCK_IL}
          selectedRosterId={effectiveSelectedId}
          eligibleRosterIds={eligibleRosterIds}
          pendingRosterIds={pendingRosterIds}
          pendingCount={snap.pendingChanges.length}
          dragSim={snap.drag}
          dropTargetIds={snap.dropTargetIds}
          dimSection={snap.dimSection}
          showSelectionBanner={showSelectionBanner}
          selectedPlayerName={selectedPlayer?.name}
          onPillClick={onPillClick}
          buildActions={buildActions}
          onRevert={() => handleStateChange("idle")}
          onRevertAll={() => handleStateChange("idle")}
          onSave={() => handleStateChange("idle")}
          forceMobile={forceMobile}
        />
      )}

      <StateToggler value={state} onChange={handleStateChange} />
    </div>
  );
}

/* ─── State toggler ─────────────────────────────────────────────────── */

function StateToggler({
  value,
  onChange,
}: {
  value: RosterHubV3PreviewState;
  onChange: (s: RosterHubV3PreviewState) => void;
}) {
  const current = PREVIEW_STATES.find((s) => s.value === value) ?? PREVIEW_STATES[0];
  return (
    <div
      style={{
        position: "fixed",
        top: 80,
        right: 18,
        zIndex: 40,
        width: 290,
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
        ✦ Preview state · v3
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
      <div style={{ fontSize: 11, color: "var(--am-text-faint)", lineHeight: 1.4, marginTop: 4 }}>
        {current.blurb}
      </div>
    </div>
  );
}
