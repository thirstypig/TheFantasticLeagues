// client/src/pages/design/rosterHubScenarios/DesignScenarioHub.tsx
//
// Scenario 1 — "Hub mutations" (the original PR #198 preview).
//
// Drag-to-mutate + pending-changes save/revert. This is a refactor of
// the page that used to live entirely inside `DesignRosterHubDeferred.tsx`,
// extracted so the scenario switcher can host it alongside the FA, IL,
// and Complex scenarios.

import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";
import { PendingChangeBar } from "../../../features/teams/components/RosterHub";
import { slotsFor, type SlotCode } from "../../../lib/positionEligibility";
import {
  DragRowGrid,
  RosterSection,
  SaveBanner,
  SectionHeader,
  Spinner,
  Toast,
} from "./shared";
import { INITIAL_HITTERS, INITIAL_PITCHERS, type PreviewPlayer } from "./mockData";

/* ─── Reducer state ─────────────────────────────────────────────── */

interface SaveState {
  phase: "idle" | "saving" | "saved" | "error";
  errorMessage?: string;
}

interface PreviewState {
  players: PreviewPlayer[];
  baseline: PreviewPlayer[];
  pendingIds: Set<number>;
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
  | { type: "reset"; players: PreviewPlayer[] };

function computePending(players: PreviewPlayer[], baseline: PreviewPlayer[]): Set<number> {
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

/* ─── Component ─────────────────────────────────────────────────── */

export function DesignScenarioHub() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const [shakeRowId, setShakeRowId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const savedTimerRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);

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

  const dropTargetIds = useMemo<ReadonlySet<number>>(() => {
    if (!activeDragPlayer) return new Set();
    const eligibleSlots = slotsFor(activeDragPlayer.posList);
    const out = new Set<number>();
    for (const p of state.players) {
      if (p.rosterId === activeDragPlayer.rosterId) continue;
      if (p.isPitcher !== activeDragPlayer.isPitcher) continue;
      if (eligibleSlots.has(p.assignedSlot as SlotCode)) {
        out.add(p.rosterId);
      }
    }
    return out;
  }, [activeDragPlayer, state.players]);

  const dimSection: "hitter" | "pitcher" | null = useMemo(() => {
    if (!activeDragPlayer) return null;
    return activeDragPlayer.isPitcher ? "hitter" : "pitcher";
  }, [activeDragPlayer]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  const handleDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    if (id.startsWith("drag-")) setActiveDragId(Number(id.slice(5)));
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

    if (sourcePlayer.isPitcher !== targetPlayer.isPitcher) {
      setShakeRowId(targetId);
      window.setTimeout(() => setShakeRowId(null), 400);
      showToast(`Can't drop a ${sourcePlayer.isPitcher ? "pitcher" : "hitter"} on a ${targetPlayer.isPitcher ? "pitcher" : "hitter"} slot`);
      return;
    }

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
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => dispatch({ type: "save_dismiss" }), 2000);
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

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
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
            <PendingChangeBar
              count={state.pendingIds.size}
              onRevertAll={handleRevertAll}
              onSave={handleSave}
            />

            {state.save.phase === "saving" && (
              <SaveBanner tone="neutral" message="Saving…" icon={<Spinner />} />
            )}
            {state.save.phase === "saved" && (
              <SaveBanner tone="success" message="Saved · roster updated" icon={<span>✓</span>} />
            )}
            {state.save.phase === "error" && (
              <SaveBanner
                tone="error"
                message={state.save.errorMessage ?? "Save failed"}
                icon={<span>!</span>}
              />
            )}

            <RosterSection
              label="Hitters"
              count={hitters.length}
              dimmed={dimSection === "hitter"}
              role="hitter"
            >
              <SectionHeader role="hitter" />
              {hitters.map((p) => (
                <DragRowGrid
                  key={p.rosterId}
                  player={p}
                  role="hitter"
                  isPending={state.pendingIds.has(p.rosterId)}
                  isJustSaved={state.justSavedIds.has(p.rosterId)}
                  isDragging={activeDragId === p.rosterId}
                  isDropTarget={dropTargetIds.has(p.rosterId)}
                  isShake={shakeRowId === p.rosterId}
                  isAnyDragging={activeDragId != null}
                  onRevert={state.pendingIds.has(p.rosterId) ? handleRevertAll : undefined}
                />
              ))}
            </RosterSection>

            <RosterSection
              label="Pitchers"
              count={pitchers.length}
              dimmed={dimSection === "pitcher"}
              role="pitcher"
            >
              <SectionHeader role="pitcher" />
              {pitchers.map((p) => (
                <DragRowGrid
                  key={p.rosterId}
                  player={p}
                  role="pitcher"
                  isPending={state.pendingIds.has(p.rosterId)}
                  isJustSaved={state.justSavedIds.has(p.rosterId)}
                  isDragging={activeDragId === p.rosterId}
                  isDropTarget={dropTargetIds.has(p.rosterId)}
                  isShake={shakeRowId === p.rosterId}
                  isAnyDragging={activeDragId != null}
                  onRevert={state.pendingIds.has(p.rosterId) ? handleRevertAll : undefined}
                />
              ))}
            </RosterSection>
          </div>
        </Glass>
      </DndContext>

      {toast && <Toast message={toast} />}

      <HubFooter
        slowSave={slowSave}
        errorOnSave={errorOnSave}
        onToggleSlow={() => setSlowSave((s) => !s)}
        onToggleError={() => setErrorOnSave((s) => !s)}
        onResetRoster={handleResetRoster}
      />
    </>
  );
}

/* ─── Footer with hub-specific open questions ──────────────────── */

function HubFooter({
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
          <button type="button" onClick={onResetRoster} style={ctlButton}>Reset mock roster</button>
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
        <SectionLabel>✦ Open questions — Hub mutations</SectionLabel>
        <p style={{ fontSize: 12, color: "var(--am-text-muted)", marginTop: 6, marginBottom: 10 }}>
          Decisions to lock before backend wiring.
        </p>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, color: "var(--am-text)", lineHeight: 1.6 }}>
          <li><strong>Drop semantics</strong> — direct swap, or queue for the bipartite auto-resolve matcher?</li>
          <li><strong>Save trigger</strong> — explicit Save click only, or debounced auto-save (e.g. 2s)?</li>
          <li><strong>Navigate-away with pending</strong> — block + confirm, auto-save, or auto-revert?</li>
          <li><strong>Per-row revert UX</strong> — currently reverts ALL pending; should it ship at all?</li>
          <li><strong>Drag handle visibility</strong> — always-on ⋮⋮ vs. hover/focus only.</li>
          <li><strong>Cross-section drops</strong> — currently shake-rejected; vs. reinterpret as IL stash / drop.</li>
          <li><strong>Pending dot color</strong> — yellow conflicts with IL-amber elsewhere; palette pass needed.</li>
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
