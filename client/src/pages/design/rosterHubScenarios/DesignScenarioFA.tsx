// client/src/pages/design/rosterHubScenarios/DesignScenarioFA.tsx
//
// Scenario 2 — "Free agent add/drop".
//
// Side panel (NOT a modal) slides in from the right. Search +
// position filter narrow a fixed mock FA pool. User drags a FA into
// any roster slot — the slot's current occupant becomes the
// queued/displaced "drop" (collected in a small drop pool below the
// roster). Multiple adds stack as pending changes. Cancel returns
// each FA to the pool and restores displaced players.
//
// The "no modals when stats need to stay visible" principle from
// `feedback_yahoo_copy_no_modals.md` is the design driver: the FA
// panel is a side sheet that lets the roster keep all its stat
// columns readable while you scan FAs.

import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
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
  SectionHeader,
  Toast,
} from "./shared";
import {
  INITIAL_HITTERS,
  INITIAL_PITCHERS,
  FREE_AGENTS,
  type PreviewPlayer,
} from "./mockData";

interface PendingAdd {
  id: string;
  faPlayer: PreviewPlayer;
  /** rosterId of the player being displaced (dropped). */
  displacedRosterId: number;
  /** Slot the FA is taking. */
  toSlot: SlotCode;
}

interface FAState {
  /** Active roster (excluding pending FA additions). */
  roster: PreviewPlayer[];
  /** rosterIds that have been DISPLACED by pending FA adds. They sit
   *  visually in the drop pool until save. */
  displacedIds: Set<number>;
  /** rosterIds of FAs currently sitting in real roster slots (post add). */
  addedFaPlayerIds: Set<number>;
  /** All FAs currently rostered (added). Treated as PreviewPlayer rows. */
  inRosterFAs: PreviewPlayer[];
  pending: PendingAdd[];
}

type FAAction =
  | { type: "add"; fa: PreviewPlayer; displacedRosterId: number; toSlot: SlotCode }
  | { type: "cancel"; pendingId: string }
  | { type: "reset" };

function initialFAState(): FAState {
  return {
    roster: [...INITIAL_HITTERS, ...INITIAL_PITCHERS].map((p) => ({ ...p })),
    displacedIds: new Set(),
    addedFaPlayerIds: new Set(),
    inRosterFAs: [],
    pending: [],
  };
}

function reduceFA(state: FAState, action: FAAction): FAState {
  switch (action.type) {
    case "add": {
      // Mark displaced player and add FA into the slot.
      const fa: PreviewPlayer = {
        ...action.fa,
        // Use a synthetic stable rosterId (negative IDs for in-roster FAs).
        // Multiplying preserves uniqueness across multi-add.
        rosterId: action.fa.rosterId,
        assignedSlot: action.toSlot,
      };
      const displacedIds = new Set(state.displacedIds);
      displacedIds.add(action.displacedRosterId);
      const addedFaPlayerIds = new Set(state.addedFaPlayerIds);
      addedFaPlayerIds.add(action.fa.playerId);
      return {
        ...state,
        displacedIds,
        addedFaPlayerIds,
        inRosterFAs: [...state.inRosterFAs, fa],
        pending: [
          ...state.pending,
          {
            id: `add-${action.fa.playerId}-${action.displacedRosterId}`,
            faPlayer: fa,
            displacedRosterId: action.displacedRosterId,
            toSlot: action.toSlot,
          },
        ],
      };
    }
    case "cancel": {
      const target = state.pending.find((p) => p.id === action.pendingId);
      if (!target) return state;
      const displacedIds = new Set(state.displacedIds);
      displacedIds.delete(target.displacedRosterId);
      const addedFaPlayerIds = new Set(state.addedFaPlayerIds);
      addedFaPlayerIds.delete(target.faPlayer.playerId);
      return {
        ...state,
        displacedIds,
        addedFaPlayerIds,
        inRosterFAs: state.inRosterFAs.filter((f) => f.playerId !== target.faPlayer.playerId),
        pending: state.pending.filter((p) => p.id !== action.pendingId),
      };
    }
    case "reset":
      return initialFAState();
  }
}

export function DesignScenarioFA() {
  const [state, dispatch] = useReducer(reduceFA, undefined, initialFAState);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<"all" | "C" | "1B" | "2B" | "3B" | "SS" | "OF" | "DH" | "SP" | "RP">("all");
  const [panelOpen, setPanelOpen] = useState(true);
  const [landingTargetId, setLandingTargetId] = useState<number | null>(null);
  const landingTimer = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  // Filtered FA list — exclude any FA already added.
  const filteredFAs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return FREE_AGENTS.filter((fa) => {
      if (state.addedFaPlayerIds.has(fa.playerId)) return false;
      if (q && !fa.name.toLowerCase().includes(q)) return false;
      if (posFilter !== "all") {
        const eligible = slotsFor(fa.posList);
        if (!eligible.has(posFilter as SlotCode)) return false;
      }
      return true;
    });
  }, [search, posFilter, state.addedFaPlayerIds]);

  // The visible roster = original roster + in-roster FAs, with
  // displaced players shown in a separate "drop pool" below.
  const visibleRoster = useMemo(() => {
    const remaining = state.roster.filter((p) => !state.displacedIds.has(p.rosterId));
    return [...remaining, ...state.inRosterFAs];
  }, [state.roster, state.displacedIds, state.inRosterFAs]);

  const droppedPlayers = useMemo(
    () => state.roster.filter((p) => state.displacedIds.has(p.rosterId)),
    [state.roster, state.displacedIds],
  );

  const hitters = useMemo(() => visibleRoster.filter((p) => !p.isPitcher), [visibleRoster]);
  const pitchers = useMemo(() => visibleRoster.filter((p) => p.isPitcher), [visibleRoster]);

  const activeFAPlayer = useMemo(() => {
    if (!activeDragId || !activeDragId.startsWith("fa-")) return null;
    const playerId = Number(activeDragId.slice(3));
    return FREE_AGENTS.find((p) => p.playerId === playerId) ?? null;
  }, [activeDragId]);

  const dropTargetIds = useMemo<ReadonlySet<number>>(() => {
    if (!activeFAPlayer) return new Set();
    const eligible = slotsFor(activeFAPlayer.posList);
    const out = new Set<number>();
    for (const p of visibleRoster) {
      if (p.isPitcher !== activeFAPlayer.isPitcher) continue;
      if (eligible.has(p.assignedSlot as SlotCode)) out.add(p.rosterId);
    }
    return out;
  }, [activeFAPlayer, visibleRoster]);

  const handleDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setActiveDragId(id);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const dragId = activeDragId;
    setActiveDragId(null);
    if (!dragId || !e.over) return;

    if (dragId.startsWith("fa-")) {
      const faPlayerId = Number(dragId.slice(3));
      const fa = FREE_AGENTS.find((p) => p.playerId === faPlayerId);
      if (!fa) return;
      const overId = String(e.over.id);
      if (!overId.startsWith("drop-")) return;
      const targetRosterId = Number(overId.slice(5));
      const target = visibleRoster.find((p) => p.rosterId === targetRosterId);
      if (!target) return;

      // Eligibility / role checks
      if (target.isPitcher !== fa.isPitcher) {
        showToast(`${fa.name} can't take a ${target.isPitcher ? "pitcher" : "hitter"} slot`);
        return;
      }
      const eligible = slotsFor(fa.posList);
      if (!eligible.has(target.assignedSlot as SlotCode)) {
        showToast(`${fa.name} isn't eligible at ${target.assignedSlot}`);
        return;
      }
      // Don't displace another already-pending FA — show error.
      if (state.addedFaPlayerIds.has(target.playerId)) {
        showToast("Drop onto an existing roster row, not another pending FA");
        return;
      }

      dispatch({
        type: "add",
        fa,
        displacedRosterId: target.rosterId,
        toSlot: target.assignedSlot as SlotCode,
      });
      // Trigger landing animation for ~700ms.
      setLandingTargetId(target.rosterId);
      if (landingTimer.current) window.clearTimeout(landingTimer.current);
      landingTimer.current = window.setTimeout(() => setLandingTargetId(null), 700);
      showToast(`${fa.name} added · ${target.name} → drop pool`);
    }
  };

  const handleDragCancel = () => setActiveDragId(null);

  const handleSave = () => {
    if (state.pending.length === 0) return;
    showToast(`(Mock) Saved ${state.pending.length} change${state.pending.length === 1 ? "" : "s"}`);
    dispatch({ type: "reset" });
  };

  const handleRevertAll = () => {
    if (state.pending.length === 0) return;
    dispatch({ type: "reset" });
    showToast("All pending FA additions reverted");
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: panelOpen ? "1fr 360px" : "1fr",
          gap: 16,
          alignItems: "start",
          transition: "grid-template-columns 240ms ease",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Glass padded={false} style={{ overflow: "visible" }}>
            <div style={{ padding: 16, paddingBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <SectionLabel>✦ Active roster · drop FAs onto slots</SectionLabel>
                <p style={{ margin: 0, fontSize: 12, color: "var(--am-text-muted)" }}>
                  Drag a free agent (right panel) onto a roster row. The displaced player drops to
                  the pool below. Stack multiple adds before save.
                </p>
              </div>
              {!panelOpen && (
                <button
                  type="button"
                  onClick={() => setPanelOpen(true)}
                  style={ctlButton}
                >
                  + Add Player
                </button>
              )}
            </div>

            <div style={{ padding: "8px 16px 12px" }}>
              <PendingChangeBar
                count={state.pending.length}
                onRevertAll={handleRevertAll}
                onSave={handleSave}
              />

              <RosterSection label="Hitters" count={hitters.length} dimmed={false} role="hitter">
                <SectionHeader role="hitter" />
                {hitters.map((p) => (
                  <DragRowGrid
                    key={`${p.rosterId}-${p.playerId}`}
                    player={p}
                    role="hitter"
                    isPending={state.addedFaPlayerIds.has(p.playerId)}
                    isAnyDragging={activeDragId != null}
                    isDropTarget={dropTargetIds.has(p.rosterId)}
                    isLandingTarget={landingTargetId === p.rosterId}
                  />
                ))}
              </RosterSection>

              <RosterSection label="Pitchers" count={pitchers.length} dimmed={false} role="pitcher">
                <SectionHeader role="pitcher" />
                {pitchers.map((p) => (
                  <DragRowGrid
                    key={`${p.rosterId}-${p.playerId}`}
                    player={p}
                    role="pitcher"
                    isPending={state.addedFaPlayerIds.has(p.playerId)}
                    isAnyDragging={activeDragId != null}
                    isDropTarget={dropTargetIds.has(p.rosterId)}
                    isLandingTarget={landingTargetId === p.rosterId}
                  />
                ))}
              </RosterSection>

              {droppedPlayers.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div
                    style={{
                      padding: "8px 12px",
                      fontSize: 10,
                      letterSpacing: 1.4,
                      textTransform: "uppercase",
                      color: "#fbbf24",
                      fontWeight: 600,
                      background: "color-mix(in srgb, #fbbf24 12%, transparent)",
                      borderRadius: 10,
                      border: "1px solid rgba(251, 191, 36, 0.35)",
                      marginBottom: 6,
                    }}
                  >
                    Drop pool · {droppedPlayers.length} · these players will be released on save
                  </div>
                  {droppedPlayers.map((p) => (
                    <div
                      key={p.rosterId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        borderBottom: "1px solid var(--am-border)",
                        opacity: 0.75,
                        textDecoration: "line-through",
                      }}
                    >
                      <span style={{ fontSize: 13, color: "var(--am-text)" }}>
                        {p.name} <span style={{ color: "var(--am-text-faint)" }}>· {p.posPrimary} · {p.mlbTeam}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          // Find pending entry and cancel it
                          const pending = state.pending.find((q) => q.displacedRosterId === p.rosterId);
                          if (pending) dispatch({ type: "cancel", pendingId: pending.id });
                        }}
                        style={tinyBtn}
                        title="Restore"
                      >
                        ↩ Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Glass>

          <FAFooter />
        </div>

        {panelOpen && (
          <div style={{ animation: "amSlideInRight 240ms ease" }}>
            <Glass padded={false} style={{ position: "sticky", top: 16 }}>
              <div style={{ padding: 14, borderBottom: "1px solid var(--am-border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <SectionLabel>✦ Free agents · {filteredFAs.length}</SectionLabel>
                  <button type="button" onClick={() => setPanelOpen(false)} style={tinyBtn}>
                    Close
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Search by name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: "100%",
                    marginTop: 10,
                    padding: "7px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--am-border)",
                    background: "var(--am-chip)",
                    color: "var(--am-text)",
                    fontSize: 12.5,
                  }}
                />
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(["all", "C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPosFilter(p)}
                      style={{
                        padding: "3px 8px",
                        borderRadius: 99,
                        border: "1px solid var(--am-border)",
                        background: posFilter === p ? "var(--am-irid)" : "var(--am-chip)",
                        color: posFilter === p ? "#fff" : "var(--am-text-muted)",
                        fontSize: 10.5,
                        fontWeight: 600,
                        cursor: "pointer",
                        letterSpacing: 0.4,
                      }}
                    >
                      {p === "all" ? "All" : p}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ maxHeight: "calc(100svh - 220px)", overflowY: "auto" }}>
                {filteredFAs.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 12, color: "var(--am-text-muted)", textAlign: "center" }}>
                    No matches.
                  </div>
                ) : (
                  filteredFAs.map((fa) => (
                    <FACard key={fa.playerId} fa={fa} isDragging={activeDragId === `fa-${fa.playerId}`} />
                  ))
                )}
              </div>
            </Glass>
          </div>
        )}
      </div>

      {toast && <Toast message={toast} />}
    </DndContext>
  );
}

/* ─── FA card (draggable) ───────────────────────────────────────── */

function FACard({ fa, isDragging }: { fa: PreviewPlayer; isDragging: boolean }) {
  const draggable = useDraggable({ id: `fa-${fa.playerId}` });
  return (
    <div
      ref={draggable.setNodeRef}
      style={{
        padding: "10px 12px",
        borderBottom: "1px solid var(--am-border)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: isDragging ? "color-mix(in srgb, #d62b9b 10%, transparent)" : "transparent",
        opacity: isDragging ? 0.6 : 1,
        cursor: "grab",
      }}
    >
      <button
        type="button"
        ref={draggable.setActivatorNodeRef}
        {...draggable.attributes}
        {...(draggable.listeners as React.HTMLAttributes<HTMLButtonElement>)}
        aria-label={`Drag ${fa.name} onto a roster slot.`}
        style={{
          background: "transparent",
          border: "1px solid var(--am-border)",
          borderRadius: 8,
          padding: "4px 6px",
          color: "var(--am-text-muted)",
          fontSize: 14,
          touchAction: "none",
          userSelect: "none",
          cursor: isDragging ? "grabbing" : "grab",
        }}
      >
        ⋮⋮
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--am-text)" }}>{fa.name}</div>
        <div style={{ fontSize: 11, color: "var(--am-text-faint)", letterSpacing: 0.4 }}>
          {fa.posList} · {fa.mlbTeam}
          {fa.projectedValue != null && (
            <span style={{ color: "var(--am-text-muted)", marginLeft: 6 }}>· ${fa.projectedValue} proj</span>
          )}
        </div>
      </div>
    </div>
  );
}

function FAFooter() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <Glass>
        <SectionLabel>✦ How it works</SectionLabel>
        <ul style={{ margin: "8px 0 0 0", paddingLeft: 20, fontSize: 12.5, color: "var(--am-text)", lineHeight: 1.6 }}>
          <li>Side panel — not a modal — keeps stat columns visible.</li>
          <li>Drag a FA onto a slot to add them; the occupant moves to the drop pool.</li>
          <li>Multiple FA adds stack as pending changes.</li>
          <li>Restore button on each dropped player rolls back that single add.</li>
          <li>Save commits the whole batch atomically (mock).</li>
        </ul>
      </Glass>
      <Glass>
        <SectionLabel>✦ Open questions — Free agent add/drop</SectionLabel>
        <ol style={{ margin: "8px 0 0 0", paddingLeft: 20, fontSize: 12.5, color: "var(--am-text)", lineHeight: 1.6 }}>
          <li><strong>Search ergonomics</strong> — name only, or also by team/MLB position? Fuzzy match?</li>
          <li><strong>Filter persistence</strong> — does the panel remember the last filter across opens?</li>
          <li><strong>Multi-add UX</strong> — current is sequential drop; should there be a batch add cart instead?</li>
          <li><strong>Eligibility hint during drag</strong> — highlight only eligible slots (current) vs. dim ineligible (alt)?</li>
          <li><strong>Drop pool placement</strong> — below roster (current) vs. inline with line-through?</li>
          <li><strong>Sort order</strong> — by projected $ desc (current implicit) vs. trending vs. alphabetical?</li>
          <li><strong>Mobile layout</strong> — full-screen sheet or bottom drawer? Long-press grab is awkward across the side panel boundary.</li>
        </ol>
      </Glass>
    </div>
  );
}

const ctlButton: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid var(--am-border)",
  background: "var(--am-irid)",
  color: "#fff",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

const tinyBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--am-border)",
  borderRadius: 8,
  padding: "3px 7px",
  fontSize: 11,
  color: "var(--am-text-muted)",
  cursor: "pointer",
};
