// client/src/pages/design/rosterHubScenarios/DesignScenarioIL.tsx
//
// Scenario 3 — "IL management" (stash + activate).
//
// Two flows:
//
//  • Stash: drag an IL-eligible active player (red INJURED badge from
//    `mlbStatus`) into the IL section. Vacated slot fades through a
//    200ms shimmy then auto-fills with a placeholder "auto-resolved"
//    label. (We don't run a real bipartite matcher in the preview;
//    the visual is the spec.)
//
//  • Activate: drag a player FROM the IL section back to a position
//    slot. The displaced active player goes to the drop pool — same
//    visual treatment as the FA scenario.
//
// The IL section uses red accents per design system; the empty IL
// rows render with the dashed-red treatment from `shared.tsx` and a
// "Drop here to stash" affordance.

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
  EmptyIlRow,
  RosterSection,
  SectionHeader,
  Toast,
} from "./shared";
import {
  INITIAL_HITTERS,
  INITIAL_PITCHERS,
  INITIAL_IL,
  type PreviewPlayer,
} from "./mockData";

interface ILChange {
  id: string;
  kind: "stash" | "activate";
  /** rosterId of the player being moved (active → IL or IL → active). */
  movedRosterId: number;
  /** When kind === "activate", rosterId of the displaced active player. */
  displacedRosterId?: number;
  /** When kind === "activate", slot the IL player took. */
  toSlot?: SlotCode;
  /** When kind === "stash", the slot vacated. */
  fromSlot?: SlotCode;
}

interface ILState {
  active: PreviewPlayer[];
  il: PreviewPlayer[];
  pending: ILChange[];
}

type ILAction =
  | { type: "stash"; rosterId: number }
  | { type: "activate"; rosterId: number; targetActiveRosterId: number }
  | { type: "revert" };

function initial(): ILState {
  return {
    active: [...INITIAL_HITTERS, ...INITIAL_PITCHERS].map((p) => ({ ...p })),
    il: INITIAL_IL.map((p) => ({ ...p })),
    pending: [],
  };
}

function reduceIL(state: ILState, action: ILAction): ILState {
  switch (action.type) {
    case "stash": {
      const player = state.active.find((p) => p.rosterId === action.rosterId);
      if (!player) return state;
      const fromSlot = player.assignedSlot;
      return {
        active: state.active.filter((p) => p.rosterId !== action.rosterId),
        il: [...state.il, { ...player, assignedSlot: "IL" }],
        pending: [
          ...state.pending,
          {
            id: `stash-${action.rosterId}`,
            kind: "stash",
            movedRosterId: action.rosterId,
            fromSlot: fromSlot as SlotCode,
          },
        ],
      };
    }
    case "activate": {
      const ilPlayer = state.il.find((p) => p.rosterId === action.rosterId);
      const target = state.active.find((p) => p.rosterId === action.targetActiveRosterId);
      if (!ilPlayer || !target) return state;
      return {
        active: state.active
          .filter((p) => p.rosterId !== target.rosterId)
          .concat({
            ...ilPlayer,
            assignedSlot: target.assignedSlot,
            slotInstance: target.slotInstance,
          }),
        il: state.il
          .filter((p) => p.rosterId !== ilPlayer.rosterId)
          .concat({ ...target, assignedSlot: "IL" }),
        pending: [
          ...state.pending,
          {
            id: `activate-${action.rosterId}`,
            kind: "activate",
            movedRosterId: action.rosterId,
            displacedRosterId: target.rosterId,
            toSlot: target.assignedSlot as SlotCode,
          },
        ],
      };
    }
    case "revert":
      return initial();
  }
}

const IL_HITTER_SLOTS = 3;
const IL_PITCHER_SLOTS = 2;

export function DesignScenarioIL() {
  const [state, dispatch] = useReducer(reduceIL, undefined, initial);
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [landingTargetId, setLandingTargetId] = useState<number | null>(null);
  const landingTimer = useRef<number | null>(null);
  const [landingIlIndex, setLandingIlIndex] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const hitters = useMemo(() => state.active.filter((p) => !p.isPitcher), [state.active]);
  const pitchers = useMemo(() => state.active.filter((p) => p.isPitcher), [state.active]);
  const ilHitters = useMemo(() => state.il.filter((p) => !p.isPitcher), [state.il]);
  const ilPitchers = useMemo(() => state.il.filter((p) => p.isPitcher), [state.il]);

  const activePlayer = useMemo(
    () => (activeDragId == null ? null : [...state.active, ...state.il].find((p) => p.rosterId === activeDragId) ?? null),
    [activeDragId, state.active, state.il],
  );
  const isDraggingFromIl = activePlayer ? activePlayer.assignedSlot === "IL" : false;

  // Drop-target eligibility:
  //   Dragging active IL-eligible player → eligible IL empty slots.
  //   Dragging IL player → active rows where role + position match.
  const dropTargetIds = useMemo<ReadonlySet<number>>(() => {
    if (!activePlayer) return new Set();
    if (activePlayer.assignedSlot === "IL") {
      // Activate: highlight eligible active rows
      const eligible = slotsFor(activePlayer.posList);
      const out = new Set<number>();
      for (const p of state.active) {
        if (p.isPitcher !== activePlayer.isPitcher) continue;
        if (eligible.has(p.assignedSlot as SlotCode)) out.add(p.rosterId);
      }
      return out;
    }
    return new Set();
  }, [activePlayer, state.active]);

  const handleDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    if (id.startsWith("drag-")) setActiveDragId(Number(id.slice(5)));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const sourceId = activeDragId;
    setActiveDragId(null);
    if (!sourceId || !e.over) return;

    const overId = String(e.over.id);
    const source = [...state.active, ...state.il].find((p) => p.rosterId === sourceId);
    if (!source) return;

    // Stash flow: dragging an IL-eligible active onto an IL empty row.
    if (source.assignedSlot !== "IL" && overId.startsWith("il-empty-")) {
      if (!source.mlbStatus) {
        showToast(`${source.name} isn't IL-eligible (no MLB IL status)`);
        return;
      }
      const idx = Number(overId.slice("il-empty-".length));
      dispatch({ type: "stash", rosterId: sourceId });
      setLandingIlIndex(idx);
      if (landingTimer.current) window.clearTimeout(landingTimer.current);
      landingTimer.current = window.setTimeout(() => setLandingIlIndex(null), 700);
      showToast(`${source.name} stashed on IL · auto-resolve filled vacated slot`);
      return;
    }

    // Activate flow: dragging an IL player onto an active row.
    if (source.assignedSlot === "IL" && overId.startsWith("drop-")) {
      const targetId = Number(overId.slice(5));
      const target = state.active.find((p) => p.rosterId === targetId);
      if (!target) return;
      if (target.isPitcher !== source.isPitcher) {
        showToast(`Can't activate ${source.name} into a ${target.isPitcher ? "pitcher" : "hitter"} slot`);
        return;
      }
      const eligible = slotsFor(source.posList);
      if (!eligible.has(target.assignedSlot as SlotCode)) {
        showToast(`${source.name} isn't eligible at ${target.assignedSlot}`);
        return;
      }
      dispatch({ type: "activate", rosterId: sourceId, targetActiveRosterId: targetId });
      setLandingTargetId(targetId);
      if (landingTimer.current) window.clearTimeout(landingTimer.current);
      landingTimer.current = window.setTimeout(() => setLandingTargetId(null), 700);
      showToast(`${source.name} activated → ${target.name} stashed on IL`);
      return;
    }

    // Cross-section drop with no IL involvement → ignore (the Hub
    // scenario already covers in-roster swaps).
    showToast("Drop on an IL slot to stash, or on an active row to activate");
  };

  const handleDragCancel = () => setActiveDragId(null);

  const handleSave = () => {
    if (state.pending.length === 0) return;
    showToast(`(Mock) Saved ${state.pending.length} IL change${state.pending.length === 1 ? "" : "s"}`);
    dispatch({ type: "revert" });
  };
  const handleRevert = () => {
    if (state.pending.length === 0) return;
    dispatch({ type: "revert" });
    showToast("All IL changes reverted");
  };

  const ilHitterEmpties = Math.max(0, IL_HITTER_SLOTS - ilHitters.length);
  const ilPitcherEmpties = Math.max(0, IL_PITCHER_SLOTS - ilPitchers.length);

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
            <SectionLabel>✦ IL management · stash + activate</SectionLabel>
            <p style={{ margin: 0, fontSize: 12, color: "var(--am-text-muted)" }}>
              IL-eligible players show a red <strong>INJURED</strong> badge sourced from the real MLB
              status string (e.g. "Injured 10-Day"). Drag them onto an IL slot to stash. Drag an
              IL player onto an active row to activate them — the displaced active player gets
              stashed on IL automatically.
            </p>
          </div>

          <div style={{ padding: "8px 16px 12px" }}>
            <PendingChangeBar
              count={state.pending.length}
              onRevertAll={handleRevert}
              onSave={handleSave}
            />

            <RosterSection label="Hitters" count={hitters.length} dimmed={false} role="hitter">
              <SectionHeader role="hitter" />
              {hitters.map((p) => (
                <DragRowGrid
                  key={p.rosterId}
                  player={p}
                  role="hitter"
                  isAnyDragging={activeDragId != null}
                  isDropTarget={dropTargetIds.has(p.rosterId)}
                  isDragging={activeDragId === p.rosterId}
                  isLandingTarget={landingTargetId === p.rosterId}
                />
              ))}
            </RosterSection>

            <RosterSection label="Pitchers" count={pitchers.length} dimmed={false} role="pitcher">
              <SectionHeader role="pitcher" />
              {pitchers.map((p) => (
                <DragRowGrid
                  key={p.rosterId}
                  player={p}
                  role="pitcher"
                  isAnyDragging={activeDragId != null}
                  isDropTarget={dropTargetIds.has(p.rosterId)}
                  isDragging={activeDragId === p.rosterId}
                  isLandingTarget={landingTargetId === p.rosterId}
                />
              ))}
            </RosterSection>

            {/* IL section */}
            <RosterSection
              label="Injured List"
              count={ilHitters.length + ilPitchers.length}
              dimmed={false}
              role="il"
              tone="il"
            >
              <SectionHeader role="hitter" />
              {ilHitters.map((p) => (
                <DragRowGrid
                  key={p.rosterId}
                  player={p}
                  role="hitter"
                  isAnyDragging={activeDragId != null}
                  isDropTarget={false}
                  isIl
                  isDragging={activeDragId === p.rosterId}
                />
              ))}
              {Array.from({ length: ilHitterEmpties }, (_, i) => {
                const idx = i;
                return (
                  <EmptyIlRow
                    key={`ilh-empty-${idx}`}
                    index={idx}
                    role="hitter"
                    isAnyDragging={activeDragId != null && !isDraggingFromIl}
                    isDropTarget={
                      activePlayer != null &&
                      activePlayer.assignedSlot !== "IL" &&
                      !!activePlayer.mlbStatus &&
                      !activePlayer.isPitcher
                    }
                    isLandingTarget={landingIlIndex === idx}
                  />
                );
              })}
              {ilPitchers.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <SectionHeader role="pitcher" />
                </div>
              )}
              {ilPitchers.map((p) => (
                <DragRowGrid
                  key={p.rosterId}
                  player={p}
                  role="pitcher"
                  isAnyDragging={activeDragId != null}
                  isDropTarget={false}
                  isIl
                  isDragging={activeDragId === p.rosterId}
                />
              ))}
              {Array.from({ length: ilPitcherEmpties }, (_, i) => {
                const idx = ilHitterEmpties + i;
                return (
                  <EmptyIlRow
                    key={`ilp-empty-${idx}`}
                    index={idx}
                    role="pitcher"
                    isAnyDragging={activeDragId != null && !isDraggingFromIl}
                    isDropTarget={
                      activePlayer != null &&
                      activePlayer.assignedSlot !== "IL" &&
                      !!activePlayer.mlbStatus &&
                      !!activePlayer.isPitcher
                    }
                    isLandingTarget={landingIlIndex === idx}
                  />
                );
              })}
            </RosterSection>
          </div>
        </Glass>
      </DndContext>

      {toast && <Toast message={toast} />}

      <ILFooter />
    </>
  );
}

function ILFooter() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
      <Glass>
        <SectionLabel>✦ How it works</SectionLabel>
        <ul style={{ margin: "8px 0 0 0", paddingLeft: 20, fontSize: 12.5, color: "var(--am-text)", lineHeight: 1.6 }}>
          <li>Trea Turner + Juan Soto are pre-flagged IL-eligible (red INJURED badge).</li>
          <li>Yoshinobu Yamamoto sits in the IL section — drag him onto a P slot to activate.</li>
          <li>Drag an injured player onto an empty IL row to stash.</li>
          <li>Status string ("Injured 10-Day", "Injured 60-Day", "Injured 15-Day") sourced from MLB API.</li>
          <li>Empty IL rows show "Drop here to stash" only while a stash-eligible drag is in flight.</li>
        </ul>
      </Glass>
      <Glass>
        <SectionLabel>✦ Open questions — IL management</SectionLabel>
        <ol style={{ margin: "8px 0 0 0", paddingLeft: 20, fontSize: 12.5, color: "var(--am-text)", lineHeight: 1.6 }}>
          <li><strong>Status string handling</strong> — show real MLB string verbatim ("Injured 10-Day") or normalize to "IL-10"?</li>
          <li><strong>Retroactive IL date</strong> — is there a date picker for backdating, or always "today"?</li>
          <li><strong>Ghost-IL</strong> — players still on roster but missing MLB IL status (post-activation lag). Surface a warning chip?</li>
          <li><strong>Activate without drop</strong> — when bench has space, should activation skip the displacement step?</li>
          <li><strong>Auto-resolve preview</strong> — current visual is a 200ms shimmy + slot-fill; should we show the matcher's chosen filler explicitly?</li>
          <li><strong>FA suggestion follow-up</strong> — after stash, should we surface "Add a FA to fill this slot"? Inline chip vs. side panel auto-open?</li>
          <li><strong>Cross-role activation</strong> — can a hitter IL slot accept a pitcher (no, by current rule) — confirm.</li>
        </ol>
      </Glass>
    </div>
  );
}
