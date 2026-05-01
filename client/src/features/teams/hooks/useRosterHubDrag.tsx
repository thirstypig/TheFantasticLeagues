// client/src/features/teams/hooks/useRosterHubDrag.tsx
//
// Drag-to-mutate wiring for the Hub + FA + IL scenarios. Encapsulates
// dnd-kit sensors, the active drag state, eligibility resolution, and
// the drop-resolution path:
//   - Hub source (hub-row-${rosterId}) → swap PendingChange OR
//     shake-reject + toast on illegal drops.
//   - FA source (fa-row-${mlbId}, FA scenario) → fa_add PendingChange
//     with the displaced roster player attached, OR shake-reject + toast
//     when the FA isn't eligible at the target slot.
//   - IL drop target (il-stash-empty-${index}, IL scenario, this PR) —
//     dragging an IL-eligible Hub row onto an empty IL slot queues an
//     `il_stash` PendingChange. Server checks MLB IL status; if not on
//     real IL the save will fail with NOT_MLB_IL.
//   - IL row source (il-row-${rosterId}, IL scenario) — dragging an IL
//     player onto an active hub row queues an `il_activate` PendingChange.
//     Cross-role activation rejected per IL #7 (hitter IL → hitter only).
//
// Per direction-lock:
//   - PointerSensor activation distance 6px (matches preview)
//   - TouchSensor 250ms long-press (mobile)
//   - KeyboardSensor (Space lift / arrows / Space drop / Escape cancel)
//   - Cross-section drops (hitter→pitcher slot or vice versa) shake-reject
//   - Same-section ineligible drops shake-reject + toast
//   - Eligible drops queue a swap/fa_add/il_stash/il_activate PendingChange
//     and exit drag
//
// The DndContext element + per-row useDraggable/useDroppable hooks live
// in sibling JSX components (`HubRosterDndProvider`, `DraggableRosterRow`,
// `DraggableMobileRow`) so React's rules-of-hooks aren't violated when
// the player list grows or shrinks.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { slotsFor, type SlotCode } from "../../../lib/positionEligibility";
import type { RosterHubPlayer } from "../components/RosterHub/types";
import type { PendingChangeInput } from "./usePendingChanges";
import type { FreeAgent } from "./useFreeAgents";
import { decodeFaDndId } from "../components/RosterHub/FreeAgentPanel";

export interface UseRosterHubDragOptions {
  /** Active roster players (hitters + pitchers, NOT IL). Drives both the
   *  Hub-source drag and the FA-target eligibility checks. */
  players: RosterHubPlayer[];
  /** IL roster (assignedSlot === "IL"). When present, IL row drags
   *  resolve to `il_activate` changes. Omit on view-only callsites. */
  ilPlayers?: ReadonlyArray<RosterHubPlayer>;
  /** Optional FA pool — when present, drops sourced from a FreeAgentPanel
   *  row are routed to onFaAdd instead of onSwap. Omit when the FA panel
   *  is closed; the hook then behaves identically to the Hub-only build. */
  freeAgents?: ReadonlyArray<FreeAgent>;
  /** Append a swap to the pending queue. */
  onSwap: (change: Extract<PendingChangeInput, { kind: "swap" }>) => void;
  /** Append an fa_add to the pending queue. Required iff freeAgents is set. */
  onFaAdd?: (change: Extract<PendingChangeInput, { kind: "fa_add" }>) => void;
  /** Append an il_stash to the pending queue. Required iff IL drops are
   *  enabled (i.e. the hub renders empty IL droppables). */
  onIlStash?: (change: Extract<PendingChangeInput, { kind: "il_stash" }>) => void;
  /** Append an il_activate to the pending queue. Required iff `ilPlayers`
   *  is set so IL rows are draggable. */
  onIlActivate?: (change: Extract<PendingChangeInput, { kind: "il_activate" }>) => void;
  /** Optional toast hook — fires on illegal drops. */
  onToast?: (message: string) => void;
}

export interface UseRosterHubDragApi {
  /** Drag-start handler — pass to <DndContext onDragStart>. */
  handleDragStart: (e: DragStartEvent) => void;
  /** Drag-end handler — pass to <DndContext onDragEnd>. */
  handleDragEnd: (e: DragEndEvent) => void;
  /** Drag-cancel handler — pass to <DndContext onDragCancel>. */
  handleDragCancel: () => void;
  /** rosterId currently being dragged; null when idle (or when an FA is dragging). */
  activeDragId: number | null;
  /** mlbId of the FA currently being dragged from the FA panel; null
   *  when idle (or a Hub row is dragging). */
  activeFaDragMlbId: number | null;
  /** rosterId of the IL row currently being dragged (IL → activate). */
  activeIlDragId: number | null;
  /** Eligible drop-target rosterIds for the current drag — applies to
   *  Hub, FA, and IL sources. */
  dropTargetIds: ReadonlySet<number>;
  /** True when an IL stash drop is valid for the current drag (i.e. the
   *  source is an IL-eligible hub row). UI uses this to highlight empty
   *  IL slots during the drag. */
  ilStashEligible: boolean;
  /** "hitters" | "pitchers" | null — the section to dim during a drag. */
  dimSection: "hitters" | "pitchers" | null;
  /** rosterId currently in shake-reject state (cleared 400ms after drop). */
  shakeRowId: number | null;
}

/** Stable id encoding for dnd-kit useDraggable / useDroppable. */
export const DND_ID_PREFIX = "hub-row-" as const;
export function encodeDndId(rosterId: number): string {
  return `${DND_ID_PREFIX}${rosterId}`;
}
export function decodeDndId(id: string | number): number | null {
  const s = String(id);
  if (!s.startsWith(DND_ID_PREFIX)) return null;
  const n = Number(s.slice(DND_ID_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}

/** IL row drag source id — the IL section uses these so the hook can
 *  distinguish an IL-row drag from a Hub-row drag (different drop logic). */
export const IL_DND_ID_PREFIX = "il-row-" as const;
export function encodeIlDndId(rosterId: number): string {
  return `${IL_DND_ID_PREFIX}${rosterId}`;
}
export function decodeIlDndId(id: string | number): number | null {
  const s = String(id);
  if (!s.startsWith(IL_DND_ID_PREFIX)) return null;
  const n = Number(s.slice(IL_DND_ID_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}

/** Empty IL slot drop-target id — one per index in the IL section so
 *  multiple slots can each accept a stash. The index isn't used for
 *  transport; the server picks any open IL slot. */
export const IL_EMPTY_DND_ID_PREFIX = "il-stash-empty-" as const;
export function encodeIlEmptyDndId(index: number): string {
  return `${IL_EMPTY_DND_ID_PREFIX}${index}`;
}
export function isIlEmptyDndId(id: string | number): boolean {
  return String(id).startsWith(IL_EMPTY_DND_ID_PREFIX);
}

/** Heuristic: is this Hub row IL-eligible based on its `mlbStatus`?
 *  Server is authoritative — this is a UI gate to prevent obvious
 *  mistakes during drag. Real check happens in checkMlbIlEligibility
 *  on the server. */
export function isMlbIlStatusUi(status: string | null | undefined): boolean {
  if (!status) return false;
  return /^Injured (List )?\d+-Day$/.test(status);
}

/**
 * Drag wiring for the Hub + FA + IL scenarios. Pure logic — JSX
 * (DndContext, useDraggable, useDroppable) lives in sibling components
 * that consume this api.
 */
export function useRosterHubDrag(opts: UseRosterHubDragOptions): UseRosterHubDragApi {
  const {
    players,
    ilPlayers,
    freeAgents,
    onSwap,
    onFaAdd,
    onIlStash,
    onIlActivate,
    onToast,
  } = opts;

  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const [activeFaDragMlbId, setActiveFaDragMlbId] = useState<number | null>(null);
  const [activeIlDragId, setActiveIlDragId] = useState<number | null>(null);
  const [shakeRowId, setShakeRowId] = useState<number | null>(null);
  const shakeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (shakeTimerRef.current) window.clearTimeout(shakeTimerRef.current);
    };
  }, []);

  const activeDragPlayer = useMemo(
    () => (activeDragId == null ? null : players.find((p) => p.rosterId === activeDragId) ?? null),
    [activeDragId, players],
  );

  const activeFaDrag = useMemo<FreeAgent | null>(
    () =>
      activeFaDragMlbId == null
        ? null
        : freeAgents?.find((fa) => fa.mlbId === activeFaDragMlbId) ?? null,
    [activeFaDragMlbId, freeAgents],
  );

  const activeIlDragPlayer = useMemo<RosterHubPlayer | null>(
    () =>
      activeIlDragId == null
        ? null
        : ilPlayers?.find((p) => p.rosterId === activeIlDragId) ?? null,
    [activeIlDragId, ilPlayers],
  );

  const dropTargetIds = useMemo<ReadonlySet<number>>(() => {
    // IL-source (activate): eligibility is one-way — the IL player must
    // be able to fill the target's slot. Cross-role activation rejected
    // per IL #7 (hitter IL → hitter only).
    if (activeIlDragPlayer) {
      const out = new Set<number>();
      const ilSlots = slotsFor(activeIlDragPlayer.posList);
      for (const p of players) {
        if (Boolean(p.isPitcher) !== Boolean(activeIlDragPlayer.isPitcher)) continue;
        if (p.assignedSlot === "IL") continue;
        if (!ilSlots.has(p.assignedSlot as SlotCode)) continue;
        out.add(p.rosterId);
      }
      return out;
    }
    // FA-source: eligibility is one-way — the FA must be able to fill
    // the target slot. Same-section gating still applies (hitter FA can
    // only displace a hitter; pitcher FA only a pitcher).
    if (activeFaDrag) {
      const out = new Set<number>();
      const faSlots = slotsFor(activeFaDrag.posList);
      for (const p of players) {
        if (Boolean(p.isPitcher) !== Boolean(activeFaDrag.isPitcher)) continue;
        if (p.assignedSlot === "IL") continue;
        if (!faSlots.has(p.assignedSlot as SlotCode)) continue;
        out.add(p.rosterId);
      }
      return out;
    }
    if (!activeDragPlayer) return new Set();
    const eligibleSlots = slotsFor(activeDragPlayer.posList);
    const targetEligibleNeeded = activeDragPlayer.assignedSlot;
    const out = new Set<number>();
    for (const p of players) {
      if (p.rosterId === activeDragPlayer.rosterId) continue;
      if (Boolean(p.isPitcher) !== Boolean(activeDragPlayer.isPitcher)) continue;
      if (p.assignedSlot === "IL") continue;
      if (!eligibleSlots.has(p.assignedSlot as SlotCode)) continue;
      // Bidirectional swap — target must also be eligible at source's slot
      // (unless source is in a structural slot we don't enforce against).
      if (
        targetEligibleNeeded !== "IL" &&
        !slotsFor(p.posList).has(targetEligibleNeeded as SlotCode)
      ) {
        continue;
      }
      out.add(p.rosterId);
    }
    return out;
  }, [activeDragPlayer, activeFaDrag, activeIlDragPlayer, players]);

  // IL stash eligibility: true when the active drag is a Hub-source row
  // and EITHER (a) its mlbStatus is an "Injured …-Day" designation, OR
  // (b) the mlbStatus is unknown (page-load payload may not include it
  // until the daily sync populates Player.mlbStatusSnapshot). Drives the
  // empty-IL slot affordance — server is authoritative on save.
  const ilStashEligible = useMemo<boolean>(() => {
    if (!activeDragPlayer) return false;
    if (activeDragPlayer.assignedSlot === "IL") return false;
    const status = activeDragPlayer.mlbStatus;
    if (!status) return true; // unknown — let user try; server gates the save
    return isMlbIlStatusUi(status);
  }, [activeDragPlayer]);

  const dimSection: "hitters" | "pitchers" | null = useMemo(() => {
    if (activeIlDragPlayer) return activeIlDragPlayer.isPitcher ? "hitters" : "pitchers";
    if (activeFaDrag) return activeFaDrag.isPitcher ? "hitters" : "pitchers";
    if (!activeDragPlayer) return null;
    return activeDragPlayer.isPitcher ? "hitters" : "pitchers";
  }, [activeDragPlayer, activeFaDrag, activeIlDragPlayer]);

  const triggerShake = useCallback((rosterId: number) => {
    setShakeRowId(rosterId);
    if (shakeTimerRef.current) window.clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = window.setTimeout(() => setShakeRowId(null), 400);
  }, []);

  const handleDragStart = useCallback((e: DragStartEvent) => {
    const ilId = decodeIlDndId(e.active.id);
    if (ilId != null) {
      setActiveIlDragId(ilId);
      setActiveDragId(null);
      setActiveFaDragMlbId(null);
      return;
    }
    const hubId = decodeDndId(e.active.id);
    if (hubId != null) {
      setActiveDragId(hubId);
      setActiveFaDragMlbId(null);
      setActiveIlDragId(null);
      return;
    }
    const faId = decodeFaDndId(e.active.id);
    if (faId != null) {
      setActiveFaDragMlbId(faId);
      setActiveDragId(null);
      setActiveIlDragId(null);
    }
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
    setActiveFaDragMlbId(null);
    setActiveIlDragId(null);
  }, []);

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      const sourceId = activeDragId;
      const faSourceId = activeFaDragMlbId;
      const ilSourceId = activeIlDragId;
      setActiveDragId(null);
      setActiveFaDragMlbId(null);
      setActiveIlDragId(null);

      // ── IL-source path (IL scenario: activate) ─────────────────
      if (ilSourceId != null) {
        if (!e.over) return;
        const ilPlayer = ilPlayers?.find((p) => p.rosterId === ilSourceId);
        if (!ilPlayer) return;
        const targetId = decodeDndId(e.over.id);
        if (targetId == null) return;
        const targetPlayer = players.find((p) => p.rosterId === targetId);
        if (!targetPlayer) return;

        // Cross-role activation rejected per IL #7.
        if (Boolean(ilPlayer.isPitcher) !== Boolean(targetPlayer.isPitcher)) {
          triggerShake(targetId);
          onToast?.(
            `Cannot activate ${ilPlayer.name} into a ${targetPlayer.isPitcher ? "pitcher" : "hitter"} slot`,
          );
          return;
        }
        if (targetPlayer.assignedSlot === "IL") {
          triggerShake(targetId);
          onToast?.("Pick an active-roster slot — IL → IL isn't a valid activation");
          return;
        }
        const ilSlots = slotsFor(ilPlayer.posList);
        if (!ilSlots.has(targetPlayer.assignedSlot as SlotCode)) {
          triggerShake(targetId);
          onToast?.(`${ilPlayer.name} isn't eligible at ${targetPlayer.assignedSlot}`);
          return;
        }

        onIlActivate?.({
          kind: "il_activate",
          playerId: ilPlayer.playerId,
          mlbId: 0, // not always carried on Hub player; server resolves via rosterId
          rosterId: ilPlayer.rosterId,
          name: ilPlayer.name,
          targetSlot: targetPlayer.assignedSlot as SlotCode,
          displaced: {
            rosterId: targetPlayer.rosterId,
            playerId: targetPlayer.playerId,
            mlbId: 0,
            name: targetPlayer.name,
          },
        });
        return;
      }

      // ── FA-source path (FA scenario) ───────────────────────────
      if (faSourceId != null) {
        if (!e.over) return;
        const targetId = decodeDndId(e.over.id);
        if (targetId == null) return;
        const targetPlayer = players.find((p) => p.rosterId === targetId);
        if (!targetPlayer) return;
        const fa = freeAgents?.find((f) => f.mlbId === faSourceId);
        if (!fa) return;

        // Cross-section drop → shake-reject (same rule as Hub).
        if (Boolean(fa.isPitcher) !== Boolean(targetPlayer.isPitcher)) {
          triggerShake(targetId);
          onToast?.(
            `Cannot place ${fa.name} in a ${targetPlayer.isPitcher ? "pitcher" : "hitter"} slot`,
          );
          return;
        }
        if (targetPlayer.assignedSlot === "IL") {
          triggerShake(targetId);
          onToast?.("Use 'Activate from IL' to swap with an IL player");
          return;
        }
        const faSlots = slotsFor(fa.posList);
        if (!faSlots.has(targetPlayer.assignedSlot as SlotCode)) {
          triggerShake(targetId);
          onToast?.(`${fa.name} isn't eligible at ${targetPlayer.assignedSlot}`);
          return;
        }

        onFaAdd?.({
          kind: "fa_add",
          mlbId: fa.mlbId,
          faName: fa.name,
          ...(fa.playerId ? { playerId: fa.playerId } : {}),
          targetSlot: targetPlayer.assignedSlot as SlotCode,
          displaced: {
            rosterId: targetPlayer.rosterId,
            playerId: targetPlayer.playerId,
            // Hub player rows don't always carry mlbId — fall back to 0
            // and let the server resolve the rosterId-based drop. The
            // client only uses displaced.mlbId for display, never wire.
            mlbId: 0,
            name: targetPlayer.name,
            slot: targetPlayer.assignedSlot,
          },
        });
        return;
      }

      // ── Hub-source path (existing + IL stash extension) ────────
      if (sourceId == null || !e.over) return;

      const sourcePlayer = players.find((p) => p.rosterId === sourceId);
      if (!sourcePlayer) return;

      // IL stash: hub row → empty IL slot.
      if (isIlEmptyDndId(e.over.id)) {
        // Client gate is best-effort — when we KNOW the mlbStatus and it's
        // NOT an Injured-Day designation, reject early. When mlbStatus is
        // unknown (server hasn't populated it on the page-load payload yet),
        // optimistically queue the change; the server will reject with
        // NOT_MLB_IL on save if the player isn't actually on real IL.
        const knownStatus = sourcePlayer.mlbStatus;
        if (knownStatus && !isMlbIlStatusUi(knownStatus)) {
          triggerShake(sourceId);
          onToast?.(
            `${sourcePlayer.name} isn't on the MLB IL — only "Injured …-Day" players can be stashed`,
          );
          return;
        }
        onIlStash?.({
          kind: "il_stash",
          playerId: sourcePlayer.playerId,
          mlbId: 0, // server resolves via rosterId; mlbId only carried for audit
          rosterId: sourcePlayer.rosterId,
          name: sourcePlayer.name,
          mlbStatus: sourcePlayer.mlbStatus ?? "",
          freed: sourcePlayer.assignedSlot as SlotCode,
        });
        return;
      }

      const targetId = decodeDndId(e.over.id);
      if (targetId == null || targetId === sourceId) return;

      const targetPlayer = players.find((p) => p.rosterId === targetId);
      if (!targetPlayer) return;

      // Cross-section drop → shake-reject (direction-lock #6).
      if (Boolean(sourcePlayer.isPitcher) !== Boolean(targetPlayer.isPitcher)) {
        triggerShake(targetId);
        onToast?.(
          `Cannot place ${sourcePlayer.name} in a ${targetPlayer.isPitcher ? "pitcher" : "hitter"} slot`,
        );
        return;
      }

      if (targetPlayer.assignedSlot === "IL") {
        triggerShake(targetId);
        onToast?.("Use 'Activate from IL' to swap with an IL player");
        return;
      }

      const eligibleSlots = slotsFor(sourcePlayer.posList);
      if (!eligibleSlots.has(targetPlayer.assignedSlot as SlotCode)) {
        triggerShake(targetId);
        onToast?.(`${sourcePlayer.name} isn't eligible at ${targetPlayer.assignedSlot}`);
        return;
      }

      const targetEligible = slotsFor(targetPlayer.posList);
      if (
        sourcePlayer.assignedSlot !== "IL" &&
        !targetEligible.has(sourcePlayer.assignedSlot as SlotCode)
      ) {
        triggerShake(targetId);
        onToast?.(
          `${targetPlayer.name} isn't eligible at ${sourcePlayer.assignedSlot} — can't swap`,
        );
        return;
      }

      onSwap({
        kind: "swap",
        from: {
          rosterId: sourcePlayer.rosterId,
          playerId: sourcePlayer.playerId,
          slot: sourcePlayer.assignedSlot,
        },
        to: {
          rosterId: targetPlayer.rosterId,
          playerId: targetPlayer.playerId,
          slot: targetPlayer.assignedSlot,
        },
      });
    },
    [
      activeDragId,
      activeFaDragMlbId,
      activeIlDragId,
      players,
      ilPlayers,
      freeAgents,
      onSwap,
      onFaAdd,
      onIlStash,
      onIlActivate,
      onToast,
      triggerShake,
    ],
  );

  return {
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
    activeDragId,
    activeFaDragMlbId,
    activeIlDragId,
    dropTargetIds,
    ilStashEligible,
    dimSection,
    shakeRowId,
  };
}
