// client/src/pages/design/rosterHubScenarios/DesignScenarioWaiver.tsx
//
// Scenario 5 — "Waiver claim" (exploration, NOT direction-locked yet).
//
// Hypothesis being tested: waivers should live as a SECOND TAB on the
// existing FA side panel rather than as a parallel surface or staying
// in the current modal flow. The FA scenario is the lock-confirmed
// shape; waivers piggyback on it because:
//
//   • The mental model is identical — "find a player, drag onto a
//     slot, displace someone." The only differences are economic
//     (priority + FAAB bid + process date).
//   • Roster-stat columns must stay visible during selection (see
//     `feedback_yahoo_copy_no_modals.md`); modals break that.
//   • The pending-changes batch (direction-locked answer #4 — atomic
//     save) already supports mixed mutation types — adding a third
//     change-kind ("WAIVER CLAIM") is incremental, not a rewrite.
//
// The four visual moments captured here mirror the seven footer
// questions one-for-one so a reviewer can sign off (or push back) on
// each independently.
//
// Pure preview — NO backend calls. The "FAAB", "priority", "process
// date" values are local mock state. Real wiring lands only after
// sign-off; see PR description.

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

/* ─── Mock waiver context ────────────────────────────────────────── */

const MOCK_TEAM_PRIORITY = 6;
const MOCK_TEAM_PRIORITY_TOTAL = 8;
const MOCK_FAAB_REMAINING_INITIAL = 73;
const MOCK_FAAB_BUDGET_TOTAL = 100;
const MOCK_PROCESS_DATE_RELATIVE = "Tue, May 6";
const MOCK_PROCESS_DATE_ABSOLUTE = "2026-05-06 03:00 UTC";

/**
 * The waiver pool is a subset of FREE_AGENTS marked as "just dropped"
 * by another team — they're FA-shape rows but locked behind a waiver
 * period until the next clear date.
 */
interface WaiverPlayer extends PreviewPlayer {
  /** Mock claims-pending count (others bidding too). */
  claimsPending: number;
  /** Where this team currently slots if we entered a $1 bid right now. */
  yourPriorityIfBid1: number;
}

/** Pull 8 players from the FA pool and lock them behind a waiver period. */
const WAIVER_POOL: WaiverPlayer[] = [
  // High-claim, contested
  { ...FREE_AGENTS[3], claimsPending: 4, yourPriorityIfBid1: 3 }, // Matt Olson
  { ...FREE_AGENTS[12], claimsPending: 3, yourPriorityIfBid1: 2 }, // Jackson Chourio
  { ...FREE_AGENTS[19], claimsPending: 3, yourPriorityIfBid1: 2 }, // Garrett Crochet
  // Mid-contested
  { ...FREE_AGENTS[7], claimsPending: 2, yourPriorityIfBid1: 2 }, // Willy Adames
  { ...FREE_AGENTS[8], claimsPending: 2, yourPriorityIfBid1: 1 }, // Junior Caminero
  { ...FREE_AGENTS[14], claimsPending: 2, yourPriorityIfBid1: 2 }, // Wyatt Langford
  // Uncontested (just-dropped, less hype)
  { ...FREE_AGENTS[9], claimsPending: 1, yourPriorityIfBid1: 1 }, // Jordan Westburg
  { ...FREE_AGENTS[20], claimsPending: 1, yourPriorityIfBid1: 1 }, // Hunter Brown
];

/** True FA pool excludes anyone now sitting on waivers. */
const WAIVER_PLAYER_IDS = new Set(WAIVER_POOL.map((p) => p.playerId));
const TRUE_FA_POOL = FREE_AGENTS.filter((p) => !WAIVER_PLAYER_IDS.has(p.playerId));

/* ─── Pending-change shape ───────────────────────────────────────── */

interface PendingChange {
  id: string;
  kind: "fa-add" | "waiver-claim";
  player: PreviewPlayer;
  /** rosterId of the player being displaced (dropped). */
  displacedRosterId: number;
  toSlot: SlotCode;
  /** Only set on waiver-claim. */
  faabBid?: number;
}

interface State {
  roster: PreviewPlayer[];
  displacedIds: Set<number>;
  addedPlayerIds: Set<number>;
  inRosterAdds: PreviewPlayer[];
  pending: PendingChange[];
}

type Action =
  | { type: "add"; kind: "fa-add" | "waiver-claim"; player: PreviewPlayer; displacedRosterId: number; toSlot: SlotCode; faabBid?: number }
  | { type: "cancel"; pendingId: string }
  | { type: "updateBid"; pendingId: string; faabBid: number }
  | { type: "reset" };

function initialState(): State {
  return {
    roster: [...INITIAL_HITTERS, ...INITIAL_PITCHERS].map((p) => ({ ...p })),
    displacedIds: new Set(),
    addedPlayerIds: new Set(),
    inRosterAdds: [],
    pending: [],
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "add": {
      const player: PreviewPlayer = {
        ...action.player,
        assignedSlot: action.toSlot,
      };
      const displacedIds = new Set(state.displacedIds);
      displacedIds.add(action.displacedRosterId);
      const addedPlayerIds = new Set(state.addedPlayerIds);
      addedPlayerIds.add(action.player.playerId);
      return {
        ...state,
        displacedIds,
        addedPlayerIds,
        inRosterAdds: [...state.inRosterAdds, player],
        pending: [
          ...state.pending,
          {
            id: `${action.kind}-${action.player.playerId}-${action.displacedRosterId}`,
            kind: action.kind,
            player,
            displacedRosterId: action.displacedRosterId,
            toSlot: action.toSlot,
            faabBid: action.kind === "waiver-claim" ? action.faabBid ?? 1 : undefined,
          },
        ],
      };
    }
    case "cancel": {
      const target = state.pending.find((p) => p.id === action.pendingId);
      if (!target) return state;
      const displacedIds = new Set(state.displacedIds);
      displacedIds.delete(target.displacedRosterId);
      const addedPlayerIds = new Set(state.addedPlayerIds);
      addedPlayerIds.delete(target.player.playerId);
      return {
        ...state,
        displacedIds,
        addedPlayerIds,
        inRosterAdds: state.inRosterAdds.filter((p) => p.playerId !== target.player.playerId),
        pending: state.pending.filter((p) => p.id !== action.pendingId),
      };
    }
    case "updateBid": {
      return {
        ...state,
        pending: state.pending.map((p) =>
          p.id === action.pendingId && p.kind === "waiver-claim"
            ? { ...p, faabBid: action.faabBid }
            : p,
        ),
      };
    }
    case "reset":
      return initialState();
  }
}

/* ─── Component ──────────────────────────────────────────────────── */

type PanelTab = "fa" | "waivers";

export function DesignScenarioWaiver() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<"all" | "C" | "1B" | "2B" | "3B" | "SS" | "OF" | "DH" | "SP" | "RP">("all");
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<PanelTab>("waivers"); // start on waivers to show the new surface
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
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  /* ─── Filtered pools ─────────────────────────────────────────── */

  const filteredFAs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return TRUE_FA_POOL.filter((fa) => {
      if (state.addedPlayerIds.has(fa.playerId)) return false;
      if (q && !fa.name.toLowerCase().includes(q) && !fa.mlbTeam.toLowerCase().includes(q)) return false;
      if (posFilter !== "all") {
        const eligible = slotsFor(fa.posList);
        if (!eligible.has(posFilter as SlotCode)) return false;
      }
      return true;
    });
  }, [search, posFilter, state.addedPlayerIds]);

  const filteredWaivers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return WAIVER_POOL.filter((w) => {
      if (state.addedPlayerIds.has(w.playerId)) return false;
      if (q && !w.name.toLowerCase().includes(q) && !w.mlbTeam.toLowerCase().includes(q)) return false;
      if (posFilter !== "all") {
        const eligible = slotsFor(w.posList);
        if (!eligible.has(posFilter as SlotCode)) return false;
      }
      return true;
    });
  }, [search, posFilter, state.addedPlayerIds]);

  /* ─── Roster + drop pool ─────────────────────────────────────── */

  const visibleRoster = useMemo(() => {
    const remaining = state.roster.filter((p) => !state.displacedIds.has(p.rosterId));
    return [...remaining, ...state.inRosterAdds];
  }, [state.roster, state.displacedIds, state.inRosterAdds]);

  const droppedPlayers = useMemo(
    () => state.roster.filter((p) => state.displacedIds.has(p.rosterId)),
    [state.roster, state.displacedIds],
  );

  const hitters = useMemo(() => visibleRoster.filter((p) => !p.isPitcher), [visibleRoster]);
  const pitchers = useMemo(() => visibleRoster.filter((p) => p.isPitcher), [visibleRoster]);

  /* ─── FAAB math ──────────────────────────────────────────────── */

  const totalBids = useMemo(
    () =>
      state.pending
        .filter((p) => p.kind === "waiver-claim")
        .reduce((sum, p) => sum + (p.faabBid ?? 0), 0),
    [state.pending],
  );
  const faabRemaining = MOCK_FAAB_REMAINING_INITIAL - totalBids;
  const overBudget = totalBids > MOCK_FAAB_REMAINING_INITIAL;

  /* ─── Drag / drop ────────────────────────────────────────────── */

  const activeDragPlayer = useMemo(() => {
    if (!activeDragId) return null;
    if (activeDragId.startsWith("fa-")) {
      const id = Number(activeDragId.slice(3));
      return TRUE_FA_POOL.find((p) => p.playerId === id) ?? null;
    }
    if (activeDragId.startsWith("wv-")) {
      const id = Number(activeDragId.slice(3));
      return WAIVER_POOL.find((p) => p.playerId === id) ?? null;
    }
    return null;
  }, [activeDragId]);

  const dropTargetIds = useMemo<ReadonlySet<number>>(() => {
    if (!activeDragPlayer) return new Set();
    const eligible = slotsFor(activeDragPlayer.posList);
    const out = new Set<number>();
    for (const p of visibleRoster) {
      if (p.isPitcher !== activeDragPlayer.isPitcher) continue;
      if (eligible.has(p.assignedSlot as SlotCode)) out.add(p.rosterId);
    }
    return out;
  }, [activeDragPlayer, visibleRoster]);

  const handleDragStart = (e: DragStartEvent) => setActiveDragId(String(e.active.id));

  const handleDragEnd = (e: DragEndEvent) => {
    const dragId = activeDragId;
    setActiveDragId(null);
    if (!dragId || !e.over) return;

    const isFA = dragId.startsWith("fa-");
    const isWaiver = dragId.startsWith("wv-");
    if (!isFA && !isWaiver) return;

    const playerId = Number(dragId.slice(3));
    const player = isFA
      ? TRUE_FA_POOL.find((p) => p.playerId === playerId)
      : WAIVER_POOL.find((p) => p.playerId === playerId);
    if (!player) return;

    const overId = String(e.over.id);
    if (!overId.startsWith("drop-")) return;
    const targetRosterId = Number(overId.slice(5));
    const target = visibleRoster.find((p) => p.rosterId === targetRosterId);
    if (!target) return;

    if (target.isPitcher !== player.isPitcher) {
      showToast(`${player.name} can't take a ${target.isPitcher ? "pitcher" : "hitter"} slot`);
      return;
    }
    const eligible = slotsFor(player.posList);
    if (!eligible.has(target.assignedSlot as SlotCode)) {
      showToast(`${player.name} isn't eligible at ${target.assignedSlot}`);
      return;
    }
    if (state.addedPlayerIds.has(target.playerId)) {
      showToast("Drop onto an existing roster row, not another pending add");
      return;
    }

    dispatch({
      type: "add",
      kind: isWaiver ? "waiver-claim" : "fa-add",
      player,
      displacedRosterId: target.rosterId,
      toSlot: target.assignedSlot as SlotCode,
      faabBid: isWaiver ? 1 : undefined,
    });
    setLandingTargetId(target.rosterId);
    if (landingTimer.current) window.clearTimeout(landingTimer.current);
    landingTimer.current = window.setTimeout(() => setLandingTargetId(null), 700);
    if (isWaiver) {
      showToast(`Waiver claim queued · ${player.name} · $1 bid · clears ${MOCK_PROCESS_DATE_RELATIVE}`);
    } else {
      showToast(`${player.name} added · ${target.name} → drop pool`);
    }
  };

  const handleDragCancel = () => setActiveDragId(null);

  const handleSave = () => {
    if (state.pending.length === 0) return;
    if (overBudget) {
      showToast(`Total bids ($${totalBids}) exceed FAAB ($${MOCK_FAAB_REMAINING_INITIAL}). Reduce.`);
      return;
    }
    showToast(`(Mock) Saved ${state.pending.length} change${state.pending.length === 1 ? "" : "s"}`);
    dispatch({ type: "reset" });
  };

  const handleRevertAll = () => {
    if (state.pending.length === 0) return;
    dispatch({ type: "reset" });
    showToast("All pending changes reverted");
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
          gridTemplateColumns: panelOpen ? "1fr 380px" : "1fr",
          gap: 16,
          alignItems: "start",
          transition: "grid-template-columns 240ms ease",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Glass padded={false} style={{ overflow: "visible" }}>
            <div
              style={{
                padding: 16,
                paddingBottom: 6,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <SectionLabel>✦ Active roster · drag FAs or waiver claims onto slots</SectionLabel>
                <p style={{ margin: 0, fontSize: 12, color: "var(--am-text-muted)" }}>
                  Same panel, two tabs. <strong>Waiver claims</strong> queue until the next process
                  date and consume FAAB; <strong>free agents</strong> are instant. Pending-changes
                  panel mixes both kinds.
                </p>
              </div>
              {!panelOpen && (
                <button type="button" onClick={() => setPanelOpen(true)} style={ctlButton}>
                  + Add free agent
                </button>
              )}
            </div>

            <div style={{ padding: "8px 16px 12px" }}>
              <PendingChangeBar
                count={state.pending.length}
                onRevertAll={handleRevertAll}
                onSave={handleSave}
              />

              {/* Inline waiver bid summary — only shows when there are waiver claims */}
              {state.pending.some((p) => p.kind === "waiver-claim") && (
                <BidSummary
                  pending={state.pending}
                  onUpdateBid={(id, bid) => dispatch({ type: "updateBid", pendingId: id, faabBid: bid })}
                  totalBids={totalBids}
                  faabRemaining={faabRemaining}
                  overBudget={overBudget}
                />
              )}

              <RosterSection label="Hitters" count={hitters.length} dimmed={false} role="hitter">
                <SectionHeader role="hitter" />
                {hitters.map((p) => {
                  const pending = state.pending.find((q) => q.player.playerId === p.playerId);
                  return (
                    <DragRowGrid
                      key={`${p.rosterId}-${p.playerId}`}
                      player={p}
                      role="hitter"
                      isPending={state.addedPlayerIds.has(p.playerId)}
                      isAnyDragging={activeDragId != null}
                      isDropTarget={dropTargetIds.has(p.rosterId)}
                      isLandingTarget={landingTargetId === p.rosterId}
                    />
                  );
                  void pending;
                })}
              </RosterSection>

              <RosterSection label="Pitchers" count={pitchers.length} dimmed={false} role="pitcher">
                <SectionHeader role="pitcher" />
                {pitchers.map((p) => (
                  <DragRowGrid
                    key={`${p.rosterId}-${p.playerId}`}
                    player={p}
                    role="pitcher"
                    isPending={state.addedPlayerIds.has(p.playerId)}
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
                  {droppedPlayers.map((p) => {
                    const pending = state.pending.find((q) => q.displacedRosterId === p.rosterId);
                    const isWaiver = pending?.kind === "waiver-claim";
                    return (
                      <div
                        key={p.rosterId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          borderBottom: "1px solid var(--am-border)",
                          opacity: 0.85,
                        }}
                      >
                        <span style={{ fontSize: 13, color: "var(--am-text)" }}>
                          <ChangeKindBadge kind={pending?.kind ?? "fa-add"} />
                          <span style={{ textDecoration: "line-through", marginLeft: 8 }}>
                            {p.name}
                          </span>
                          <span style={{ color: "var(--am-text-faint)", marginLeft: 6 }}>
                            · {p.posPrimary} · {p.mlbTeam}
                          </span>
                          {pending && (
                            <span style={{ marginLeft: 10, fontSize: 11.5, color: "var(--am-text-muted)" }}>
                              ↩ Adding {pending.player.name}
                              {isWaiver && pending.faabBid != null && (
                                <>
                                  {" "}· <strong>${pending.faabBid} bid</strong> · process{" "}
                                  {MOCK_PROCESS_DATE_RELATIVE}
                                </>
                              )}
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (pending) dispatch({ type: "cancel", pendingId: pending.id });
                          }}
                          style={tinyBtn}
                          title="Restore"
                        >
                          ↩ Restore
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Glass>

          <WaiverFooter />
        </div>

        {panelOpen && (
          <div style={{ animation: "amSlideInRight 240ms ease" }}>
            <Glass padded={false} style={{ position: "sticky", top: 16 }}>
              <PanelHeader
                tab={panelTab}
                onTab={setPanelTab}
                faCount={filteredFAs.length}
                waiverCount={filteredWaivers.length}
                onClose={() => setPanelOpen(false)}
              />
              <div style={{ padding: "10px 14px 4px", borderBottom: "1px solid var(--am-border)" }}>
                <input
                  type="text"
                  placeholder={panelTab === "waivers" ? "Search waiver pool…" : "Search free agents…"}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--am-border)",
                    background: "var(--am-chip)",
                    color: "var(--am-text)",
                    fontSize: 12.5,
                  }}
                />
                <div style={{ marginTop: 8, marginBottom: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
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

              <div style={{ maxHeight: "calc(100svh - 320px)", overflowY: "auto" }}>
                {panelTab === "fa" ? (
                  filteredFAs.length === 0 ? (
                    <Empty />
                  ) : (
                    filteredFAs.map((fa) => (
                      <FACard
                        key={fa.playerId}
                        fa={fa}
                        isDragging={activeDragId === `fa-${fa.playerId}`}
                      />
                    ))
                  )
                ) : filteredWaivers.length === 0 ? (
                  <Empty />
                ) : (
                  filteredWaivers.map((w) => (
                    <WaiverCard
                      key={w.playerId}
                      w={w}
                      isDragging={activeDragId === `wv-${w.playerId}`}
                    />
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

/* ─── Panel header w/ tabs + priority + FAAB readout ─────────────── */

function PanelHeader({
  tab,
  onTab,
  faCount,
  waiverCount,
  onClose,
}: {
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  faCount: number;
  waiverCount: number;
  onClose: () => void;
}) {
  return (
    <div style={{ padding: 14, borderBottom: "1px solid var(--am-border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <SectionLabel>✦ Add player</SectionLabel>
        <button type="button" onClick={onClose} style={tinyBtn}>
          Close
        </button>
      </div>

      {/* Priority + FAAB context — only shown on Waivers tab to avoid noise on FA */}
      {tab === "waivers" && (
        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            padding: "8px 10px",
            borderRadius: 10,
            background: "color-mix(in srgb, #4a8cff 8%, transparent)",
            border: "1px solid rgba(74, 140, 255, 0.35)",
          }}
        >
          <div>
            <div style={{ fontSize: 9.5, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--am-text-muted)", fontWeight: 600 }}>
              Your priority
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#bfdbfe", fontVariantNumeric: "tabular-nums" }}>
              #{MOCK_TEAM_PRIORITY} <span style={{ fontSize: 11, fontWeight: 400, color: "var(--am-text-faint)" }}>of {MOCK_TEAM_PRIORITY_TOTAL}</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9.5, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--am-text-muted)", fontWeight: 600 }}>
              FAAB remaining
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#bfdbfe", fontVariantNumeric: "tabular-nums" }}>
              ${MOCK_FAAB_REMAINING_INITIAL}{" "}
              <span style={{ fontSize: 11, fontWeight: 400, color: "var(--am-text-faint)" }}>
                of ${MOCK_FAAB_BUDGET_TOTAL}
              </span>
            </div>
          </div>
        </div>
      )}

      <div
        role="tablist"
        aria-label="Player source"
        style={{
          marginTop: 10,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 4,
          padding: 3,
          borderRadius: 10,
          background: "var(--am-chip)",
          border: "1px solid var(--am-border)",
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "fa"}
          onClick={() => onTab("fa")}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            background: tab === "fa" ? "var(--am-surface-strong)" : "transparent",
            color: tab === "fa" ? "var(--am-text)" : "var(--am-text-muted)",
            fontSize: 12,
            fontWeight: 600,
            border: tab === "fa" ? "1px solid var(--am-border)" : "1px solid transparent",
            cursor: "pointer",
          }}
        >
          Free agents <span style={{ color: "var(--am-text-faint)", fontWeight: 400 }}>({faCount})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "waivers"}
          onClick={() => onTab("waivers")}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            background: tab === "waivers" ? "color-mix(in srgb, #4a8cff 22%, transparent)" : "transparent",
            color: tab === "waivers" ? "#fff" : "var(--am-text-muted)",
            fontSize: 12,
            fontWeight: 600,
            border: tab === "waivers" ? "1px solid rgba(74, 140, 255, 0.5)" : "1px solid transparent",
            cursor: "pointer",
          }}
        >
          On waivers <span style={{ color: tab === "waivers" ? "rgba(255,255,255,0.7)" : "var(--am-text-faint)", fontWeight: 400 }}>({waiverCount})</span>
        </button>
      </div>
    </div>
  );
}

/* ─── Bid summary banner ─────────────────────────────────────────── */

function BidSummary({
  pending,
  onUpdateBid,
  totalBids,
  faabRemaining,
  overBudget,
}: {
  pending: PendingChange[];
  onUpdateBid: (id: string, bid: number) => void;
  totalBids: number;
  faabRemaining: number;
  overBudget: boolean;
}) {
  const waiverPending = pending.filter((p) => p.kind === "waiver-claim");
  if (waiverPending.length === 0) return null;
  return (
    <div
      style={{
        padding: 12,
        marginBottom: 12,
        borderRadius: 10,
        background: overBudget
          ? "color-mix(in srgb, #ef4444 10%, transparent)"
          : "color-mix(in srgb, #4a8cff 8%, transparent)",
        border: overBudget
          ? "1px solid rgba(239, 68, 68, 0.55)"
          : "1px solid rgba(74, 140, 255, 0.35)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 11.5,
          color: overBudget ? "#fca5a5" : "var(--am-text-muted)",
          fontWeight: 600,
          letterSpacing: 0.3,
          marginBottom: 8,
        }}
      >
        <span>
          {waiverPending.length} waiver claim{waiverPending.length === 1 ? "" : "s"} · process{" "}
          <span style={{ color: "var(--am-text)" }}>{MOCK_PROCESS_DATE_RELATIVE}</span>
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          ${totalBids} bid · ${faabRemaining} remaining
        </span>
      </div>
      {overBudget && (
        <div style={{ fontSize: 12, color: "#fca5a5", marginBottom: 8 }}>
          Total bids ($
          {waiverPending.map((p) => p.faabBid ?? 0).join(" + ")}{" "}
          = ${totalBids}) exceed remaining FAAB (${MOCK_FAAB_REMAINING_INITIAL}). Reduce bids.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {waiverPending.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 12,
              color: "var(--am-text)",
              gap: 8,
            }}
          >
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <strong>{p.player.name}</strong>{" "}
              <span style={{ color: "var(--am-text-faint)" }}>· {p.toSlot}</span>
            </span>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11.5,
                color: "var(--am-text-muted)",
              }}
            >
              Bid $
              <input
                type="number"
                min={0}
                max={MOCK_FAAB_BUDGET_TOTAL}
                value={p.faabBid ?? 1}
                onChange={(e) => onUpdateBid(p.id, Math.max(0, Number(e.target.value) || 0))}
                style={{
                  width: 56,
                  padding: "3px 6px",
                  borderRadius: 6,
                  border: "1px solid var(--am-border)",
                  background: "var(--am-chip)",
                  color: "var(--am-text)",
                  fontSize: 12,
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "right",
                }}
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Cards ──────────────────────────────────────────────────────── */

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
        style={dragHandle(isDragging)}
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
          <span style={{ marginLeft: 8, padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: "#86efac", background: "color-mix(in srgb, #22c55e 14%, transparent)", border: "1px solid rgba(34, 197, 94, 0.35)" }}>
            FA · INSTANT
          </span>
        </div>
      </div>
    </div>
  );
}

function WaiverCard({ w, isDragging }: { w: WaiverPlayer; isDragging: boolean }) {
  const draggable = useDraggable({ id: `wv-${w.playerId}` });
  return (
    <div
      ref={draggable.setNodeRef}
      style={{
        padding: "10px 12px",
        borderBottom: "1px solid var(--am-border)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: isDragging
          ? "color-mix(in srgb, #4a8cff 14%, transparent)"
          : "color-mix(in srgb, #4a8cff 3%, transparent)",
        opacity: isDragging ? 0.6 : 1,
        cursor: "grab",
      }}
    >
      <button
        type="button"
        ref={draggable.setActivatorNodeRef}
        {...draggable.attributes}
        {...(draggable.listeners as React.HTMLAttributes<HTMLButtonElement>)}
        aria-label={`Drag ${w.name} onto a roster slot. Will queue as a waiver claim.`}
        style={dragHandle(isDragging)}
      >
        ⋮⋮
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--am-text)" }}>
          {w.name}
          <span style={{ marginLeft: 8, padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: "#bfdbfe", background: "color-mix(in srgb, #4a8cff 22%, transparent)", border: "1px solid rgba(74, 140, 255, 0.5)", textTransform: "uppercase" }}>
            On waivers
          </span>
        </div>
        <div style={{ fontSize: 11, color: "var(--am-text-faint)", letterSpacing: 0.4, marginTop: 2 }}>
          {w.posList} · {w.mlbTeam}
          {w.projectedValue != null && (
            <span style={{ color: "var(--am-text-muted)", marginLeft: 6 }}>· ${w.projectedValue} proj</span>
          )}
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 4,
            fontSize: 10.5,
            color: "var(--am-text-muted)",
            flexWrap: "wrap",
          }}
        >
          <span title="Date the waiver period clears and claims process">
            ⏱ Clears <strong style={{ color: "var(--am-text)" }}>{MOCK_PROCESS_DATE_RELATIVE}</strong>
          </span>
          <span
            title="Number of teams with pending claims on this player. Higher FAAB bid wins; ties broken by waiver priority."
            style={{
              padding: "1px 6px",
              borderRadius: 99,
              background: w.claimsPending >= 3 ? "color-mix(in srgb, #ef4444 14%, transparent)" : "var(--am-chip)",
              border: w.claimsPending >= 3 ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid var(--am-border)",
              color: w.claimsPending >= 3 ? "#fca5a5" : "var(--am-text-muted)",
              fontWeight: 600,
            }}
          >
            {w.claimsPending} claim{w.claimsPending === 1 ? "" : "s"} pending — you'd be #
            {w.yourPriorityIfBid1} by priority
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Small bits ─────────────────────────────────────────────────── */

function ChangeKindBadge({ kind }: { kind: "fa-add" | "waiver-claim" }) {
  const isWaiver = kind === "waiver-claim";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        color: isWaiver ? "#bfdbfe" : "#86efac",
        background: isWaiver
          ? "color-mix(in srgb, #4a8cff 20%, transparent)"
          : "color-mix(in srgb, #22c55e 14%, transparent)",
        border: isWaiver
          ? "1px solid rgba(74, 140, 255, 0.5)"
          : "1px solid rgba(34, 197, 94, 0.4)",
      }}
    >
      {isWaiver ? "Waiver claim" : "FA add"}
    </span>
  );
}

function Empty() {
  return (
    <div style={{ padding: 16, fontSize: 12, color: "var(--am-text-muted)", textAlign: "center" }}>
      No matches.
    </div>
  );
}

function dragHandle(isDragging: boolean): React.CSSProperties {
  return {
    background: "transparent",
    border: "1px solid var(--am-border)",
    borderRadius: 8,
    padding: "4px 6px",
    color: "var(--am-text-muted)",
    fontSize: 14,
    touchAction: "none",
    userSelect: "none",
    cursor: isDragging ? "grabbing" : "grab",
  };
}

/* ─── Footer — explanation + 7 direction-lock questions ──────────── */

function WaiverFooter() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <Glass>
        <SectionLabel>✦ How it works (proposed)</SectionLabel>
        <ul style={{ margin: "8px 0 0 0", paddingLeft: 20, fontSize: 12.5, color: "var(--am-text)", lineHeight: 1.6 }}>
          <li>Same side panel as FA — second tab toggles "On waivers".</li>
          <li>Header shows your <strong>waiver priority</strong> + <strong>FAAB remaining</strong> on the waivers tab.</li>
          <li>Each waiver row shows <strong>process date</strong> (clears Tue) and <strong>conflict count</strong>.</li>
          <li>Drag onto a slot — pending change is tagged <strong>WAIVER CLAIM</strong> (blue) instead of FA ADD (green).</li>
          <li>Inline bid summary lets you adjust each bid; total &gt; FAAB blocks save with inline error.</li>
          <li>Pending changes can mix FA-add + waiver-claim; save commits the whole batch atomically.</li>
        </ul>
      </Glass>
      <Glass>
        <SectionLabel>✦ Open questions — Waiver claim (5th scenario)</SectionLabel>
        <ol style={{ margin: "8px 0 0 0", paddingLeft: 20, fontSize: 12.5, color: "var(--am-text)", lineHeight: 1.6 }}>
          <li>
            <strong>Priority surfacing</strong> — show priority # always (current), or only when contested?
          </li>
          <li>
            <strong>FAAB input UX</strong> — inline bid summary with stepper after drop (current), or
            number stepper next to the drag handle in the panel?
          </li>
          <li>
            <strong>Process date display</strong> — "Clears Tue, May 6" relative format (current),
            or absolute "Process: 2026-05-06 03:00 UTC"?
          </li>
          <li>
            <strong>Tab vs filter</strong> — separate FA / On waivers tabs (current), or single
            list with a "waiver only" filter chip?
          </li>
          <li>
            <strong>Conflict transparency</strong> — show "3 claims pending — you'd be #2" upfront
            (current), or only at save-time?
          </li>
          <li>
            <strong>Mixed batch</strong> — should the pending-changes panel allow mixing FA-add +
            waiver-claim in one save batch? (Direction-lock #4 atomic implies yes — verify UX.)
          </li>
          <li>
            <strong>Modal escape hatch</strong> — keep the existing <code>/activity</code> +{" "}
            <code>/manage/claim</code> modal as a power-user surface, or deprecate once hub waivers
            ship?
          </li>
        </ol>
        <div
          style={{
            marginTop: 10,
            padding: 8,
            fontSize: 11.5,
            color: "var(--am-text-muted)",
            borderRadius: 8,
            border: "1px dashed var(--am-border)",
          }}
        >
          <strong>Recommendation:</strong> option (a) — extend the FA panel with a Waivers tab.
          Same mental model, same drag affordance, same atomic batch. Option (b) duplicates
          surfaces; option (c) leaves the hub feeling half-done.
        </div>
      </Glass>
    </div>
  );
}

/* ─── Inline button styles ───────────────────────────────────────── */

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
