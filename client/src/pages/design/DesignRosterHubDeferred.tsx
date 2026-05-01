// client/src/pages/design/DesignRosterHubDeferred.tsx
//
// Design preview for the Roster Hub deferred items captured in
// `roster_hub_v3_shipped.md`:
//
//   1. Drag-to-mutate (PRIMARY) — dnd-kit wrapping `RosterRowV3` so
//      rows can be dragged onto other rows; legal drops swap slots,
//      illegal drops shake + toast.
//   2. Pending-changes save/revert (SECONDARY) — `PendingChangeBar`
//      across the top, per-row revert button, simulated save/error.
//
// Out of scope (tracked separately): real per-position GP, rosterVersion
// etag for cross-tab safety. These are invisible plumbing, not UX.
//
// CRITICAL: NO BACKEND CALLS. Pure local state. Production wiring
// happens after sign-off on this preview.

import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Glass, SectionLabel, Chip, IridText } from "../../components/aurora/atoms";
import { useAuth } from "../../auth/AuthProvider";
import {
  RosterHubV3,
  RosterRowV3,
  PendingChangeBar,
  type RosterHubPlayer,
  type RowAction,
} from "../../features/teams/components/RosterHub";
import { slotsFor, type SlotCode } from "../../lib/positionEligibility";
import "../../features/teams/components/RosterHub/rosterHub.css";

/* ─── Mock roster ───────────────────────────────────────────────────
 * 14 hitters + 9 pitchers + 0 IL (per scope). Mirrors the existing
 * v3 preview shape so the visuals are continuous. */

const INITIAL_HITTERS: RosterHubPlayer[] = [
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
  {
    rosterId: 3, playerId: 103, name: "Vladimir Guerrero Jr.", posList: "1B", posPrimary: "1B",
    assignedSlot: "1B", mlbTeam: "TOR", isPitcher: false,
    gamesPlayedByPosition: { "1B": 38 },
    hitterStats: { R: 31, HR: 14, RBI: 36, SB: 0, AVG: 0.291 },
  },
  {
    rosterId: 4, playerId: 104, name: "Trea Turner", posList: "2B,SS", posPrimary: "SS",
    assignedSlot: "2B", mlbTeam: "PHI", isKeeper: true, isPitcher: false,
    gamesPlayedByPosition: { "2B": 38, SS: 12 },
    hitterStats: { R: 28, HR: 6, RBI: 19, SB: 14, AVG: 0.275 },
  },
  {
    rosterId: 5, playerId: 105, name: "Alec Bohm", posList: "3B,1B", posPrimary: "3B",
    assignedSlot: "3B", mlbTeam: "PHI", isPitcher: false,
    gamesPlayedByPosition: { "3B": 35, "1B": 5 },
    hitterStats: { R: 21, HR: 9, RBI: 28, SB: 1, AVG: 0.280 },
  },
  {
    rosterId: 6, playerId: 106, name: "Bobby Witt Jr.", posList: "SS", posPrimary: "SS",
    assignedSlot: "SS", mlbTeam: "KC", isPitcher: false,
    gamesPlayedByPosition: { SS: 41 },
    hitterStats: { R: 33, HR: 11, RBI: 24, SB: 18, AVG: 0.301 },
  },
  {
    rosterId: 7, playerId: 107, name: "Marcus Semien", posList: "2B", posPrimary: "2B",
    assignedSlot: "MI", mlbTeam: "TEX", isPitcher: false,
    gamesPlayedByPosition: { "2B": 40 },
    hitterStats: { R: 26, HR: 10, RBI: 22, SB: 9, AVG: 0.244 },
  },
  {
    rosterId: 8, playerId: 108, name: "Pete Alonso", posList: "1B", posPrimary: "1B",
    assignedSlot: "CM", mlbTeam: "NYM", isPitcher: false,
    gamesPlayedByPosition: { "1B": 39 },
    hitterStats: { R: 24, HR: 13, RBI: 32, SB: 0, AVG: 0.247 },
  },
  {
    rosterId: 9, playerId: 109, name: "Mookie Betts", posList: "OF,2B", posPrimary: "OF",
    assignedSlot: "OF", slotInstance: 0, mlbTeam: "LAD", isKeeper: true, isPitcher: false,
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
  {
    rosterId: 14, playerId: 114, name: "Shohei Ohtani", posList: "DH", posPrimary: "DH",
    assignedSlot: "DH", mlbTeam: "LAD", isKeeper: true, isPitcher: false,
    gamesPlayedByPosition: {},
    hitterStats: { R: 41, HR: 19, RBI: 38, SB: 7, AVG: 0.299 },
  },
];

const INITIAL_PITCHERS: RosterHubPlayer[] = [
  {
    rosterId: 15, playerId: 115, name: "Tarik Skubal", posList: "SP", posPrimary: "SP",
    assignedSlot: "P", slotInstance: 0, mlbTeam: "DET", isPitcher: true,
    gamesPlayedByPosition: { P: 9 },
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
    gamesPlayedByPosition: { P: 22 },
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

/* ─── Reducer state ─────────────────────────────────────────────────
 * The active roster is one flat list. We snapshot the original at
 * mount so revert is exact, and track save state separately. */

interface SaveState {
  /** "idle" | "saving" (1.5s spinner) | "saved" (2s checkmark) | "error" */
  phase: "idle" | "saving" | "saved" | "error";
  errorMessage?: string;
}

interface PreviewState {
  players: RosterHubPlayer[];
  /** Original snapshot — used by revert. Never mutated. */
  baseline: RosterHubPlayer[];
  /** Set of rosterIds whose `assignedSlot` differs from baseline. */
  pendingIds: Set<number>;
  /** Set of rosterIds that just completed a save (for green-dot 2s flash). */
  justSavedIds: Set<number>;
  save: SaveState;
}

type Action =
  | { type: "swap"; aId: number; bId: number }
  | { type: "revert" }
  | { type: "save_begin" }
  | { type: "save_complete" }
  | { type: "save_error"; message: string }
  | { type: "save_dismiss" }
  | { type: "reset"; players: RosterHubPlayer[] };

function computePending(players: RosterHubPlayer[], baseline: RosterHubPlayer[]): Set<number> {
  const baseSlot = new Map(baseline.map((p) => [p.rosterId, p.assignedSlot] as const));
  const out = new Set<number>();
  for (const p of players) {
    if (baseSlot.get(p.rosterId) !== p.assignedSlot) out.add(p.rosterId);
  }
  return out;
}

function reducer(state: PreviewState, action: Action): PreviewState {
  switch (action.type) {
    case "swap": {
      const a = state.players.find((p) => p.rosterId === action.aId);
      const b = state.players.find((p) => p.rosterId === action.bId);
      if (!a || !b) return state;
      const nextPlayers = state.players.map((p) => {
        if (p.rosterId === a.rosterId) {
          return { ...p, assignedSlot: b.assignedSlot, slotInstance: b.slotInstance };
        }
        if (p.rosterId === b.rosterId) {
          return { ...p, assignedSlot: a.assignedSlot, slotInstance: a.slotInstance };
        }
        return p;
      });
      return {
        ...state,
        players: nextPlayers,
        pendingIds: computePending(nextPlayers, state.baseline),
        justSavedIds: new Set(),
        save: { phase: "idle" },
      };
    }
    case "revert":
      return {
        ...state,
        players: state.baseline.map((p) => ({ ...p })),
        pendingIds: new Set(),
        justSavedIds: new Set(),
        save: { phase: "idle" },
      };
    case "save_begin":
      return { ...state, save: { phase: "saving" } };
    case "save_complete":
      return {
        ...state,
        // The new baseline IS the current players — pending clears.
        baseline: state.players.map((p) => ({ ...p })),
        pendingIds: new Set(),
        justSavedIds: new Set(state.pendingIds),
        save: { phase: "saved" },
      };
    case "save_error":
      return { ...state, save: { phase: "error", errorMessage: action.message } };
    case "save_dismiss":
      return { ...state, justSavedIds: new Set(), save: { phase: "idle" } };
    case "reset":
      return {
        players: action.players.map((p) => ({ ...p })),
        baseline: action.players.map((p) => ({ ...p })),
        pendingIds: new Set(),
        justSavedIds: new Set(),
        save: { phase: "idle" },
      };
  }
}

function initialState(): PreviewState {
  const all = [...INITIAL_HITTERS, ...INITIAL_PITCHERS];
  return {
    players: all.map((p) => ({ ...p })),
    baseline: all.map((p) => ({ ...p })),
    pendingIds: new Set(),
    justSavedIds: new Set(),
    save: { phase: "idle" },
  };
}

/* ─── Page ──────────────────────────────────────────────────────────
 *
 * Implementation note on layout: the production v3 hub uses a real
 * `<table>` for stat alignment. Wrapping table rows with dnd-kit in a
 * way that supports reorder-style drag is awkward (dnd-kit's draggable
 * needs a stable DOM node and table rows have layout quirks). For
 * THIS PREVIEW we keep the existing `<table>` chrome but wire drag
 * via a parallel `DndContext` that registers each row's `<tr>` as a
 * drop target via a `useDroppable` hook attached through a ref
 * callback. The drag SOURCE is initiated via a small grab-handle
 * button rendered in the actions cell — this is a deliberate UX
 * choice for the preview because long-press-to-grab on table rows
 * is unreliable across browsers. Production wiring may switch to a
 * dedicated drag column or a CSS grid layout (open question #1). */

export default function DesignRosterHubDeferred() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.isAdmin);

  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const [shakeRowId, setShakeRowId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const savedTimerRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  // Mock controls
  const [slowSave, setSlowSave] = useState(false);
  const [errorOnSave, setErrorOnSave] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const hitters = useMemo(() => state.players.filter((p) => !p.isPitcher), [state.players]);
  const pitchers = useMemo(() => state.players.filter((p) => p.isPitcher), [state.players]);

  const activeDragPlayer = useMemo(
    () => (activeDragId == null ? null : state.players.find((p) => p.rosterId === activeDragId) ?? null),
    [activeDragId, state.players],
  );

  // Compute drop-target eligibility: rows whose CURRENT slot is in the
  // dragged player's eligible-slots set (excluding self).
  const dropTargetIds = useMemo<ReadonlySet<number>>(() => {
    if (!activeDragPlayer) return new Set();
    const eligibleSlots = slotsFor(activeDragPlayer.posList);
    const out = new Set<number>();
    for (const p of state.players) {
      if (p.rosterId === activeDragPlayer.rosterId) continue;
      // Pitchers can only swap with pitchers and vice versa.
      if (p.isPitcher !== activeDragPlayer.isPitcher) continue;
      if (eligibleSlots.has(p.assignedSlot as SlotCode)) {
        out.add(p.rosterId);
      }
    }
    return out;
  }, [activeDragPlayer, state.players]);

  const dimSection: "hitters" | "pitchers" | null = useMemo(() => {
    if (!activeDragPlayer) return null;
    return activeDragPlayer.isPitcher ? "hitters" : "pitchers";
  }, [activeDragPlayer]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  const handleDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    if (id.startsWith("drag-")) {
      setActiveDragId(Number(id.slice(5)));
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const sourceId = activeDragId;
    setActiveDragId(null);
    if (!sourceId || !e.over) return;
    const overId = String(e.over.id);
    if (!overId.startsWith("drop-")) return;
    const targetId = Number(overId.slice(5));
    if (targetId === sourceId) return;

    const sourcePlayer = state.players.find((p) => p.rosterId === sourceId);
    const targetPlayer = state.players.find((p) => p.rosterId === targetId);
    if (!sourcePlayer || !targetPlayer) return;

    // Pitcher/hitter cross-section drops are illegal.
    if (sourcePlayer.isPitcher !== targetPlayer.isPitcher) {
      setShakeRowId(targetId);
      window.setTimeout(() => setShakeRowId(null), 400);
      showToast(`Can't drop a ${sourcePlayer.isPitcher ? "pitcher" : "hitter"} on a ${targetPlayer.isPitcher ? "pitcher" : "hitter"} slot`);
      return;
    }

    // Eligibility check.
    const eligibleSlots = slotsFor(sourcePlayer.posList);
    if (!eligibleSlots.has(targetPlayer.assignedSlot as SlotCode)) {
      setShakeRowId(targetId);
      window.setTimeout(() => setShakeRowId(null), 400);
      showToast(`${sourcePlayer.name} isn't eligible at ${targetPlayer.assignedSlot}`);
      return;
    }

    dispatch({ type: "swap", aId: sourceId, bId: targetId });
  };

  const handleDragCancel = () => setActiveDragId(null);

  const handleSave = useCallback(() => {
    if (state.pendingIds.size === 0) return;
    dispatch({ type: "save_begin" });
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    const delay = slowSave ? 4000 : 1500;
    saveTimerRef.current = window.setTimeout(() => {
      if (errorOnSave) {
        dispatch({ type: "save_error", message: "Simulated network error — try again" });
        showToast("Save failed (simulated)");
        return;
      }
      dispatch({ type: "save_complete" });
      // Auto-clear "just saved" indicators after 2s.
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => {
        dispatch({ type: "save_dismiss" });
      }, 2000);
    }, delay);
  }, [state.pendingIds.size, slowSave, errorOnSave, showToast]);

  const handleRevertAll = useCallback(() => {
    dispatch({ type: "revert" });
    showToast("Reverted to last saved state");
  }, [showToast]);

  const handleResetRoster = () => {
    dispatch({ type: "reset", players: [...INITIAL_HITTERS, ...INITIAL_PITCHERS] });
    showToast("Mock roster reset");
  };

  const onPillClick = (_rosterId: number) => {
    /* No-op in this preview; selection-to-move is the v3 alternative
     * affordance. Drag is the focus here. */
  };

  const buildActions = (player: RosterHubPlayer): RowAction[] => [
    {
      key: "grab",
      glyph: "↔",
      label: "Drag to move",
      onSelect: () => showToast(`Use the grab handle on ${player.name}'s row`),
    },
    {
      key: "view",
      glyph: "i",
      label: "View player details",
      onSelect: () => {},
    },
  ];

  if (!isAdmin) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <Glass strong>
          <SectionLabel>✦ Design preview · admin only</SectionLabel>
          <h1 style={{ fontFamily: "var(--am-display)", fontSize: 30, fontWeight: 300, margin: 0 }}>
            Roster Hub Deferred Items
          </h1>
        </Glass>
        <Glass>
          <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--am-text-muted)", fontSize: 13 }}>
            Admin access required.
          </div>
        </Glass>
      </div>
    );
  }

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
        <SectionLabel>✦ Design preview · roster hub deferred</SectionLabel>
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
          Design Preview — Roster Hub Deferred Items
        </h1>
        <p style={{ marginTop: 10, fontSize: 13, color: "var(--am-text-muted)", lineHeight: 1.6 }}>
          Direction lock for <strong>drag-to-mutate</strong> + <strong>pending-changes save/revert</strong>. Backend
          wiring follows after sign-off. Real per-position GP and the <code>rosterVersion</code> etag are
          out of scope for this preview — invisible plumbing.
        </p>
      </Glass>

      <DragRoster
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        hitters={hitters}
        pitchers={pitchers}
        pendingIds={state.pendingIds}
        justSavedIds={state.justSavedIds}
        pendingCount={state.pendingIds.size}
        savePhase={state.save.phase}
        saveErrorMessage={state.save.errorMessage}
        activeDragId={activeDragId}
        dropTargetIds={dropTargetIds}
        dimSection={dimSection}
        shakeRowId={shakeRowId}
        onPillClick={onPillClick}
        buildActions={buildActions}
        onRevertRow={(rosterId) => {
          // Revert single row — restore from baseline.
          const baseRow = state.baseline.find((p) => p.rosterId === rosterId);
          if (!baseRow) return;
          // Find the row currently occupying that baseline slot — it
          // belongs back to its original spot too. Easiest: full revert
          // is fine for preview semantics. (Open question: per-row
          // revert in production may require recompute via matcher.)
          dispatch({ type: "revert" });
        }}
        onSave={handleSave}
        onRevertAll={handleRevertAll}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--am-surface-strong)",
            border: "1px solid var(--am-border-strong)",
            borderRadius: 12,
            padding: "10px 16px",
            fontSize: 13,
            color: "var(--am-text)",
            backdropFilter: "blur(20px) saturate(160%)",
            WebkitBackdropFilter: "blur(20px) saturate(160%)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            zIndex: 100,
          }}
        >
          {toast}
        </div>
      )}

      <PreviewFooter
        slowSave={slowSave}
        errorOnSave={errorOnSave}
        onToggleSlow={() => setSlowSave((s) => !s)}
        onToggleError={() => setErrorOnSave((s) => !s)}
        onResetRoster={handleResetRoster}
      />
    </div>
  );
}

/* ─── DragRoster ────────────────────────────────────────────────────
 *
 * Renders a `<DndContext>` around a layout that mirrors the v3 hub
 * but uses divs (not a <table>) so dnd-kit can wire `useDraggable` /
 * `useDroppable` cleanly. Stat columns are rendered via CSS grid for
 * tabular alignment. */

interface DragRosterProps {
  sensors: ReturnType<typeof useSensors>;
  onDragStart: (e: DragStartEvent) => void;
  onDragEnd: (e: DragEndEvent) => void;
  onDragCancel: () => void;
  hitters: RosterHubPlayer[];
  pitchers: RosterHubPlayer[];
  pendingIds: Set<number>;
  justSavedIds: Set<number>;
  pendingCount: number;
  savePhase: SaveState["phase"];
  saveErrorMessage?: string;
  activeDragId: number | null;
  dropTargetIds: ReadonlySet<number>;
  dimSection: "hitters" | "pitchers" | null;
  shakeRowId: number | null;
  onPillClick: (rosterId: number) => void;
  buildActions: (player: RosterHubPlayer) => RowAction[];
  onRevertRow: (rosterId: number) => void;
  onSave: () => void;
  onRevertAll: () => void;
}

function DragRoster({
  sensors,
  onDragStart,
  onDragEnd,
  onDragCancel,
  hitters,
  pitchers,
  pendingIds,
  justSavedIds,
  pendingCount,
  savePhase,
  saveErrorMessage,
  activeDragId,
  dropTargetIds,
  dimSection,
  shakeRowId,
  onPillClick,
  buildActions,
  onRevertRow,
  onSave,
  onRevertAll,
}: DragRosterProps) {
  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <Glass padded={false} style={{ overflow: "visible" }}>
        <div style={{ padding: 16, paddingBottom: 6 }}>
          <SectionLabel>✦ Active roster · drag-to-mutate enabled</SectionLabel>
          <p style={{ margin: 0, fontSize: 12, color: "var(--am-text-muted)" }}>
            Grab a row by the ⋮⋮ handle, drop it onto another row to swap slots. Illegal drops
            shake. Mobile: long-press to grab. Keyboard: Tab to handle, Space to lift, arrows
            to move, Space to drop, Escape to cancel.
          </p>
        </div>

        <div style={{ padding: "8px 16px 12px" }}>
          <PendingChangeBar count={pendingCount} onRevertAll={onRevertAll} onSave={onSave} />

          {savePhase === "saving" && (
            <SaveBanner
              tone="neutral"
              message="Saving…"
              icon={<Spinner />}
            />
          )}
          {savePhase === "saved" && (
            <SaveBanner tone="success" message="Saved · roster updated" icon={<span>✓</span>} />
          )}
          {savePhase === "error" && (
            <SaveBanner
              tone="error"
              message={saveErrorMessage ?? "Save failed"}
              icon={<span>!</span>}
            />
          )}

          <RosterSection
            label="Hitters"
            count={hitters.length}
            dimmed={dimSection === "hitters"}
            role="hitter"
          >
            <SectionHeader role="hitter" />
            {hitters.map((p) => (
              <DragRowGrid
                key={p.rosterId}
                player={p}
                role="hitter"
                isPending={pendingIds.has(p.rosterId)}
                isJustSaved={justSavedIds.has(p.rosterId)}
                isDragging={activeDragId === p.rosterId}
                isDropTarget={dropTargetIds.has(p.rosterId)}
                isShake={shakeRowId === p.rosterId}
                isAnyDragging={activeDragId != null}
                onPillClick={() => onPillClick(p.rosterId)}
                onRevert={pendingIds.has(p.rosterId) ? () => onRevertRow(p.rosterId) : undefined}
                actions={buildActions(p)}
              />
            ))}
          </RosterSection>

          <RosterSection
            label="Pitchers"
            count={pitchers.length}
            dimmed={dimSection === "pitchers"}
            role="pitcher"
          >
            <SectionHeader role="pitcher" />
            {pitchers.map((p) => (
              <DragRowGrid
                key={p.rosterId}
                player={p}
                role="pitcher"
                isPending={pendingIds.has(p.rosterId)}
                isJustSaved={justSavedIds.has(p.rosterId)}
                isDragging={activeDragId === p.rosterId}
                isDropTarget={dropTargetIds.has(p.rosterId)}
                isShake={shakeRowId === p.rosterId}
                isAnyDragging={activeDragId != null}
                onPillClick={() => onPillClick(p.rosterId)}
                onRevert={pendingIds.has(p.rosterId) ? () => onRevertRow(p.rosterId) : undefined}
                actions={buildActions(p)}
              />
            ))}
          </RosterSection>
        </div>
      </Glass>

      {/* `RosterHubV3` import retained as a side-effect to keep CSS
          tree-shaking honest; we re-use its CSS classes above. */}
      <HiddenStubForCss />
    </DndContext>
  );
}

function HiddenStubForCss() {
  // Keep RosterRowV3 import live so CSS bundles ship even if the page
  // is loaded directly.
  void RosterRowV3;
  void RosterHubV3;
  return null;
}

/* ─── Section + Row primitives ──────────────────────────────────── */

const HITTER_GRID = "200px 220px 56px 56px 64px 56px 64px 80px";
const PITCHER_GRID = "200px 220px 60px 48px 56px 48px 64px 64px 80px";

function RosterSection({
  label,
  count,
  dimmed,
  role,
  children,
}: {
  label: string;
  count: number;
  dimmed: boolean;
  role: "hitter" | "pitcher";
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        marginTop: 14,
        opacity: dimmed ? 0.4 : 1,
        transition: "opacity 160ms ease",
      }}
    >
      <div
        style={{
          padding: "8px 12px",
          fontSize: 10,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: "var(--am-text-muted)",
          fontWeight: 600,
          background: "var(--am-surface-faint)",
          borderRadius: 10,
          marginBottom: 4,
        }}
      >
        {label} · {count} · {role === "hitter" ? "Hitters" : "Pitchers"}
      </div>
      {children}
    </div>
  );
}

function SectionHeader({ role }: { role: "hitter" | "pitcher" }) {
  const cols =
    role === "hitter"
      ? ["Pos · Eligibility", "Player", "R", "HR", "RBI", "SB", "AVG", ""]
      : ["Pos · Eligibility", "Player", "IP", "W", "SV", "K", "ERA", "WHIP", ""];
  const grid = role === "hitter" ? HITTER_GRID : PITCHER_GRID;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: grid,
        gap: 0,
        padding: "8px 12px",
        fontSize: 10,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: "var(--am-text-muted)",
        fontWeight: 600,
        borderBottom: "1px solid var(--am-border)",
      }}
    >
      {cols.map((c, i) => (
        <div
          key={i}
          style={{
            textAlign: i >= 2 && i < cols.length - 1 ? "right" : "left",
            paddingRight: 8,
          }}
        >
          {c}
        </div>
      ))}
    </div>
  );
}

interface DragRowGridProps {
  player: RosterHubPlayer;
  role: "hitter" | "pitcher";
  isPending: boolean;
  isJustSaved: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  isShake: boolean;
  isAnyDragging: boolean;
  onPillClick: () => void;
  onRevert?: () => void;
  actions: RowAction[];
}

/** A single row rendered as a CSS grid. Wraps both useDraggable
 * (for the grab-handle) and useDroppable (for the whole row). */
function DragRowGrid({
  player,
  role,
  isPending,
  isJustSaved,
  isDragging,
  isDropTarget,
  isShake,
  isAnyDragging,
  onPillClick,
  onRevert,
  actions: _actions,
}: DragRowGridProps) {
  const draggable = useDraggable({ id: `drag-${player.rosterId}` });
  const droppable = useDroppable({ id: `drop-${player.rosterId}` });

  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      draggable.setNodeRef(el);
      droppable.setNodeRef(el);
    },
    [draggable, droppable],
  );

  const grid = role === "hitter" ? HITTER_GRID : PITCHER_GRID;
  const eligibleHighlight = isAnyDragging && isDropTarget;

  const baseStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: grid,
    alignItems: "center",
    gap: 0,
    padding: "8px 12px",
    borderBottom: "1px solid var(--am-border-faint, var(--am-border))",
    transition: "background 140ms ease, transform 200ms ease, outline-color 140ms ease",
    background: isDragging
      ? "color-mix(in srgb, #d62b9b 10%, transparent)"
      : eligibleHighlight && droppable.isOver
        ? "color-mix(in srgb, #00b894 12%, transparent)"
        : eligibleHighlight
          ? "color-mix(in srgb, #2f6df0 5%, transparent)"
          : "transparent",
    outline: eligibleHighlight
      ? "1px solid rgba(74, 140, 255, 0.55)"
      : isDragging
        ? "1px dashed rgba(214, 43, 155, 0.7)"
        : "1px solid transparent",
    outlineOffset: -1,
    opacity: isDragging ? 0.6 : 1,
    position: "relative",
    transform: isShake ? "translateX(0)" : undefined,
    animation: isShake ? "amDragShake 380ms ease" : undefined,
  };

  const hStats = player.hitterStats;
  const pStats = player.pitcherStats;

  return (
    <div ref={setRefs} style={baseStyle} role="row" aria-label={`${player.name} — ${player.assignedSlot}`}>
      {/* Pos · Eligibility */}
      <div style={{ paddingRight: 8 }}>
        <PillCell
          slot={player.assignedSlot}
          posList={player.posList}
          gp={player.gamesPlayedByPosition}
          onClick={onPillClick}
          dimmed={false}
        />
      </div>

      {/* Player + grab handle */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <button
          type="button"
          ref={draggable.setActivatorNodeRef}
          {...draggable.attributes}
          {...(draggable.listeners as React.HTMLAttributes<HTMLButtonElement>)}
          aria-label={`Drag ${player.name}. Press space to lift, arrows to move, space to drop, escape to cancel.`}
          style={{
            cursor: isDragging ? "grabbing" : "grab",
            background: "transparent",
            border: "1px solid var(--am-border)",
            borderRadius: 8,
            padding: "4px 6px",
            color: "var(--am-text-muted)",
            fontSize: 14,
            lineHeight: 1,
            touchAction: "none",
            userSelect: "none",
          }}
          title="Drag to move"
        >
          ⋮⋮
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--am-text)" }}>
            {isPending && <PendingDot />}
            {isJustSaved && !isPending && <SavedDotInline />}
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

      {role === "hitter" ? (
        <>
          <Stat>{fmt(hStats?.R)}</Stat>
          <Stat>{fmt(hStats?.HR)}</Stat>
          <Stat>{fmt(hStats?.RBI)}</Stat>
          <Stat>{fmt(hStats?.SB)}</Stat>
          <Stat>{fmtAvg(hStats?.AVG)}</Stat>
        </>
      ) : (
        <>
          <Stat>{fmt(pStats?.IP, 1)}</Stat>
          <Stat>{fmt(pStats?.W)}</Stat>
          <Stat>{fmt(pStats?.SV)}</Stat>
          <Stat>{fmt(pStats?.K)}</Stat>
          <Stat>{fmt(pStats?.ERA, 2)}</Stat>
          <Stat>{fmt(pStats?.WHIP, 2)}</Stat>
        </>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
        {isPending && onRevert && (
          <button
            type="button"
            onClick={onRevert}
            aria-label={`Revert pending change for ${player.name}`}
            title="Revert"
            style={{
              background: "transparent",
              border: "1px solid var(--am-border)",
              borderRadius: 8,
              padding: "3px 7px",
              fontSize: 12,
              color: "var(--am-text-muted)",
              cursor: "pointer",
            }}
          >
            ↩
          </button>
        )}
      </div>
    </div>
  );
}

function PillCell({
  slot,
  posList,
  gp,
  onClick,
  dimmed,
}: {
  slot: RosterHubPlayer["assignedSlot"];
  posList: string;
  gp?: Partial<Record<SlotCode, number>>;
  onClick: () => void;
  dimmed: boolean;
}) {
  const eligible = slotsFor(posList);
  const secondary: SlotCode[] = [];
  for (const s of eligible) {
    if (s !== slot) secondary.push(s);
  }
  const NO_GP = new Set<SlotCode>(["MI", "CM", "DH"]);
  const primaryLabel =
    slot === "IL"
      ? "IL"
      : NO_GP.has(slot as SlotCode) || gp?.[slot as SlotCode] == null
        ? slot
        : `${slot} (${gp[slot as SlotCode]})`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", opacity: dimmed ? 0.5 : 1 }}>
      <button
        type="button"
        onClick={onClick}
        style={{
          padding: "4px 10px",
          borderRadius: 99,
          background: "var(--am-irid)",
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.4,
          border: "1px solid transparent",
          cursor: "pointer",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {primaryLabel}
      </button>
      {secondary.length > 0 && (
        <span aria-hidden style={{ color: "var(--am-text-faint)", fontSize: 11 }}>
          ·
        </span>
      )}
      {secondary.map((s, i) => (
        <span
          key={s}
          style={{
            padding: "2px 8px",
            borderRadius: 99,
            fontSize: 10.5,
            fontWeight: 600,
            color: "var(--am-text-muted)",
            background: "var(--am-chip)",
            border: "1px solid var(--am-border)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {s}
          {!NO_GP.has(s) && gp?.[s] != null ? ` (${gp[s]})` : ""}
          {i < secondary.length - 1 && (
            <span aria-hidden style={{ marginLeft: 6, color: "var(--am-text-faint)" }}>
              ·
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

function Stat({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        textAlign: "right",
        paddingRight: 8,
        fontSize: 12,
        color: "var(--am-text-muted)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {children}
    </div>
  );
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
  const s = n.toFixed(3);
  return s.startsWith("0") ? s.slice(1) : s;
}

function PendingDot() {
  return (
    <span
      aria-label="Pending change"
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: 99,
        background: "#fbbf24",
        boxShadow: "0 0 6px rgba(251, 191, 36, 0.5)",
        marginRight: 6,
        verticalAlign: 1,
      }}
    />
  );
}

function SavedDotInline() {
  return (
    <span
      aria-label="Just saved"
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: 99,
        background: "#22c55e",
        boxShadow: "0 0 6px rgba(34, 197, 94, 0.6)",
        marginRight: 6,
        verticalAlign: 1,
      }}
    />
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 12,
        height: 12,
        border: "2px solid currentColor",
        borderRightColor: "transparent",
        borderRadius: 99,
        animation: "amSpin 800ms linear infinite",
      }}
    />
  );
}

function SaveBanner({
  tone,
  message,
  icon,
}: {
  tone: "neutral" | "success" | "error";
  message: string;
  icon?: React.ReactNode;
}) {
  const palette =
    tone === "success"
      ? { bg: "color-mix(in srgb, #22c55e 12%, transparent)", border: "rgba(34,197,94,0.5)" }
      : tone === "error"
        ? { bg: "color-mix(in srgb, #ef4444 12%, transparent)", border: "rgba(239,68,68,0.5)" }
        : { bg: "color-mix(in srgb, #2f6df0 8%, transparent)", border: "rgba(74,140,255,0.4)" };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 12,
        marginBottom: 12,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        fontSize: 12.5,
        color: "var(--am-text)",
      }}
      role="status"
      aria-live="polite"
    >
      {icon}
      <span>{message}</span>
    </div>
  );
}

/* ─── Footer ────────────────────────────────────────────────────── */

function PreviewFooter({
  slowSave,
  errorOnSave,
  onToggleSlow,
  onToggleError,
  onResetRoster,
}: {
  slowSave: boolean;
  errorOnSave: boolean;
  onToggleSlow: () => void;
  onToggleError: () => void;
  onResetRoster: () => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <Glass>
        <SectionLabel>✦ Mock controls</SectionLabel>
        <p style={{ fontSize: 12, color: "var(--am-text-muted)", marginTop: 6, marginBottom: 10 }}>
          Toggles to exercise edge cases without a backend.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            onClick={onResetRoster}
            style={ctlButton}
          >
            Reset mock roster
          </button>
          <label style={ctlToggle}>
            <input type="checkbox" checked={slowSave} onChange={onToggleSlow} />
            <span>Simulate slow save (4s)</span>
          </label>
          <label style={ctlToggle}>
            <input type="checkbox" checked={errorOnSave} onChange={onToggleError} />
            <span>Simulate save error</span>
          </label>
        </div>
      </Glass>

      <Glass>
        <SectionLabel>✦ Open questions</SectionLabel>
        <p style={{ fontSize: 12, color: "var(--am-text-muted)", marginTop: 6, marginBottom: 10 }}>
          Decisions to lock before backend wiring.
        </p>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, color: "var(--am-text)", lineHeight: 1.6 }}>
          <li>
            <strong>Drop semantics</strong> — should drag swap the displaced player directly, or
            queue them for the bipartite auto-resolve matcher? (Current preview: direct swap.)
          </li>
          <li>
            <strong>Save trigger</strong> — explicit Save click only, or debounced auto-save (e.g.
            2s after the last change)? Implications for cross-tab races.
          </li>
          <li>
            <strong>Navigate-away with pending changes</strong> — block with confirm prompt, auto-save,
            or auto-revert? Mobile back-button behavior?
          </li>
          <li>
            <strong>Per-row revert UX</strong> — current preview reverts ALL pending on row revert
            click (correct semantics need the matcher). Should the per-row affordance ship at all,
            or only "Revert all"?
          </li>
          <li>
            <strong>Drag handle visibility</strong> — always-on ⋮⋮ handle (current), or hover/focus
            only? The latter is cleaner but harder to discover on touch.
          </li>
          <li>
            <strong>Cross-section drops</strong> — currently shake-rejected (hitter onto pitcher
            slot). Confirm this is desired — vs. reinterpret as "stash on IL" or "drop player"
            via a contextual prompt.
          </li>
          <li>
            <strong>Pending dot color</strong> — yellow vs. blue vs. iridescent. Yellow signals
            "uncommitted" but conflicts with IL-amber elsewhere. Worth a palette pass.
          </li>
        </ol>
      </Glass>
    </div>
  );
}

const ctlButton: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "1px solid var(--am-border)",
  background: "var(--am-chip)",
  color: "var(--am-text)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  textAlign: "left",
};

const ctlToggle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 8px",
  fontSize: 12.5,
  color: "var(--am-text-muted)",
  cursor: "pointer",
};

/* ─── Inline keyframes for shake + spin ────────────────────────── */

if (typeof document !== "undefined" && !document.getElementById("am-drag-shake-style")) {
  const s = document.createElement("style");
  s.id = "am-drag-shake-style";
  s.textContent = `
@keyframes amDragShake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}
@keyframes amSpin {
  to { transform: rotate(360deg); }
}
`;
  document.head.appendChild(s);
}

// Touch reference to silence "unused" warnings from helpers we may
// re-introduce in production but leave behind for now.
void Chip;
void IridText;
