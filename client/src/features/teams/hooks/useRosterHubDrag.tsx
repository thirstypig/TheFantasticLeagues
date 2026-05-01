// client/src/features/teams/hooks/useRosterHubDrag.tsx
//
// Drag-to-mutate wiring for the Hub scenario. Encapsulates dnd-kit
// sensors, the active drag state, eligibility resolution, and the
// drop-resolution path (eligibility check → swap PendingChange OR
// shake-reject + toast).
//
// Per direction-lock:
//   - PointerSensor activation distance 6px (matches preview)
//   - TouchSensor 250ms long-press (mobile)
//   - KeyboardSensor (Space lift / arrows / Space drop / Escape cancel)
//   - Cross-section drops (hitter→pitcher slot or vice versa) shake-reject
//   - Same-section ineligible drops shake-reject + toast
//   - Eligible drops queue a swap PendingChange and exit drag
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
import type { PendingChange } from "./usePendingChanges";

export interface UseRosterHubDragOptions {
  players: RosterHubPlayer[];
  /** Append a swap to the pending queue. */
  onSwap: (change: Omit<PendingChange, "id">) => void;
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
  /** rosterId currently being dragged; null when idle. */
  activeDragId: number | null;
  /** Eligible drop-target rosterIds for the current drag. */
  dropTargetIds: ReadonlySet<number>;
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

/**
 * Drag wiring for the Hub scenario. Pure logic — JSX (DndContext,
 * useDraggable, useDroppable) lives in sibling components that consume
 * this api.
 */
export function useRosterHubDrag(opts: UseRosterHubDragOptions): UseRosterHubDragApi {
  const { players, onSwap, onToast } = opts;

  const [activeDragId, setActiveDragId] = useState<number | null>(null);
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

  const dropTargetIds = useMemo<ReadonlySet<number>>(() => {
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
  }, [activeDragPlayer, players]);

  const dimSection: "hitters" | "pitchers" | null = useMemo(() => {
    if (!activeDragPlayer) return null;
    return activeDragPlayer.isPitcher ? "hitters" : "pitchers";
  }, [activeDragPlayer]);

  const triggerShake = useCallback((rosterId: number) => {
    setShakeRowId(rosterId);
    if (shakeTimerRef.current) window.clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = window.setTimeout(() => setShakeRowId(null), 400);
  }, []);

  const handleDragStart = useCallback((e: DragStartEvent) => {
    const id = decodeDndId(e.active.id);
    if (id != null) setActiveDragId(id);
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
  }, []);

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      const sourceId = activeDragId;
      setActiveDragId(null);
      if (sourceId == null || !e.over) return;

      const targetId = decodeDndId(e.over.id);
      if (targetId == null || targetId === sourceId) return;

      const sourcePlayer = players.find((p) => p.rosterId === sourceId);
      const targetPlayer = players.find((p) => p.rosterId === targetId);
      if (!sourcePlayer || !targetPlayer) return;

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
    [activeDragId, players, onSwap, onToast, triggerShake],
  );

  return {
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
    activeDragId,
    dropTargetIds,
    dimSection,
    shakeRowId,
  };
}
