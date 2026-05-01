// client/src/features/teams/hooks/usePendingChanges.ts
//
// Pending-changes state machine for the v3 roster hub. The Hub scenario
// (per docs/plans/2026-04-30-roster-hub-direction-lock.md) covers
// position swaps only — drops, FA add, and IL stash/activate are handled
// by the existing manage sub-routes and are explicitly out of scope here.
//
// Each pending change is a "swap" — two players exchanging assignedSlot
// values. The hook owns the queue, persistence, and save orchestration.
// Drag wiring (DndContext) and visual rendering (PendingChangeBar) live
// in the Team page + RosterHub component family respectively.
//
// Per direction-lock #4: per-row revert is a single-item undo (NOT
// "revert all"). Per #2 save is explicit-click only. Per #5 localStorage
// backup persists across navigation with 1hr TTL.

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { SlotCode } from "../../../lib/positionEligibility";

// ─── Types ─────────────────────────────────────────────────────────

/**
 * One queued change. Hub scenario only handles `swap`. The `kind`
 * discriminator is in place so future scenarios (FA add/drop, IL) can
 * extend without restructuring callers.
 */
export type PendingChange =
  | {
      id: string;
      kind: "swap";
      /**
       * The two endpoints of the swap. Order is irrelevant for the
       * mutation but `from` is conventionally the moving player and
       * `to` is the displaced one (for UI labelling).
       */
      from: { rosterId: number; playerId: number; slot: SlotCode | "IL" };
      to: { rosterId: number; playerId: number; slot: SlotCode | "IL" };
    };

export interface PendingChangesState {
  changes: PendingChange[];
  saving: boolean;
  error: string | null;
  lastSavedAt: number | null;
}

interface PersistedState {
  /** Schema version — bump if PendingChange shape changes incompatibly. */
  v: 1;
  /** Unix ms when this snapshot was written. Used for TTL discard. */
  savedAt: number;
  changes: PendingChange[];
}

type Action =
  | { type: "add"; change: PendingChange }
  | { type: "revertItem"; id: string }
  | { type: "revertAll" }
  | { type: "saveStart" }
  | { type: "saveSuccess"; at: number }
  | { type: "saveError"; message: string }
  | { type: "clearError" }
  | { type: "hydrate"; changes: PendingChange[] };

// ─── Reducer ───────────────────────────────────────────────────────

function reducer(state: PendingChangesState, action: Action): PendingChangesState {
  switch (action.type) {
    case "add":
      return { ...state, changes: [...state.changes, action.change], error: null };
    case "revertItem":
      return { ...state, changes: state.changes.filter((c) => c.id !== action.id) };
    case "revertAll":
      return { ...state, changes: [], error: null };
    case "saveStart":
      return { ...state, saving: true, error: null };
    case "saveSuccess":
      return { changes: [], saving: false, error: null, lastSavedAt: action.at };
    case "saveError":
      return { ...state, saving: false, error: action.message };
    case "clearError":
      return { ...state, error: null };
    case "hydrate":
      return { ...state, changes: action.changes };
  }
}

// ─── localStorage helpers ──────────────────────────────────────────

const STORAGE_PREFIX = "fbst:hub-pending:";
const TTL_MS = 60 * 60 * 1000; // 1 hour per direction-lock #5

function storageKey(teamId: number | null | undefined): string | null {
  if (teamId == null || !Number.isFinite(teamId) || teamId <= 0) return null;
  return `${STORAGE_PREFIX}${teamId}`;
}

/**
 * Read persisted pending changes for a team. Returns null when absent,
 * malformed, or expired beyond TTL. Side-effect: deletes the entry when
 * expired so we don't keep prompting "restore?" on stale data.
 */
export function readPersistedChanges(teamId: number): PendingChange[] | null {
  if (typeof window === "undefined") return null;
  const key = storageKey(teamId);
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.changes)) {
      window.localStorage.removeItem(key);
      return null;
    }
    if (Date.now() - parsed.savedAt > TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed.changes;
  } catch {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    return null;
  }
}

/** Clear persisted changes for a team (called after successful save / discard). */
export function clearPersistedChanges(teamId: number): void {
  if (typeof window === "undefined") return;
  const key = storageKey(teamId);
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function writePersistedChanges(teamId: number, changes: PendingChange[]): void {
  if (typeof window === "undefined") return;
  const key = storageKey(teamId);
  if (!key) return;
  try {
    if (changes.length === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    const payload: PersistedState = { v: 1, savedAt: Date.now(), changes };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Quota exceeded or disabled storage — fail silently. Pending state
    // still works in-memory for the session.
  }
}

// ─── Public hook ───────────────────────────────────────────────────

export interface UsePendingChangesOptions {
  /**
   * Team id keyed for localStorage. Pass null to disable persistence
   * (e.g. while team metadata is still loading).
   */
  teamId: number | null;

  /**
   * Save fn supplied by the caller. Receives the queued changes and
   * resolves on success or rejects with an Error to surface as the
   * banner's `error` state. Implementation-side concerns (atomicity,
   * mutation-API choice) live in the caller.
   */
  saveFn: (changes: PendingChange[]) => Promise<void>;

  /**
   * Optional debounce window for localStorage writes. Defaults to
   * 500ms per scope. Set to 0 to write synchronously (used by tests).
   */
  persistDebounceMs?: number;
}

export interface UsePendingChangesApi {
  state: PendingChangesState;
  /** Queue a new change. Generates an id if not supplied. */
  addChange: (change: Omit<PendingChange, "id"> & { id?: string }) => void;
  /** Remove a single change by id. */
  revertChange: (id: string) => void;
  /** Drop every queued change. */
  revertAll: () => void;
  /** Trigger the saveFn for all queued changes. Atomic — all-or-nothing. */
  save: () => Promise<void>;
  /** Clear the error banner without dropping changes. */
  clearError: () => void;
}

/**
 * State machine + persistence for the Hub scenario's pending-changes
 * queue. Save is delegated to `opts.saveFn` so the same hook works
 * across scenarios — Hub passes a swap-batch implementation; future
 * FA/IL scenarios will pass their own.
 */
export function usePendingChanges(opts: UsePendingChangesOptions): UsePendingChangesApi {
  const { teamId, saveFn, persistDebounceMs = 500 } = opts;
  const [state, dispatch] = useReducer(reducer, {
    changes: [],
    saving: false,
    error: null,
    lastSavedAt: null,
  });

  // Hold the latest saveFn in a ref so `save()` doesn't re-create on
  // every parent render. Important for stable identity in
  // beforeunload/blocker effects downstream.
  const saveFnRef = useRef(saveFn);
  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  // Debounced localStorage writer.
  const persistTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (teamId == null) return;
    if (typeof window === "undefined") return;
    if (persistDebounceMs <= 0) {
      writePersistedChanges(teamId, state.changes);
      return;
    }
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      writePersistedChanges(teamId, state.changes);
    }, persistDebounceMs);
    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [state.changes, teamId, persistDebounceMs]);

  const addChange = useCallback<UsePendingChangesApi["addChange"]>((change) => {
    const id = change.id ?? makeChangeId();
    dispatch({ type: "add", change: { ...change, id } as PendingChange });
  }, []);

  const revertChange = useCallback((id: string) => {
    dispatch({ type: "revertItem", id });
  }, []);

  const revertAll = useCallback(() => {
    dispatch({ type: "revertAll" });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: "clearError" });
  }, []);

  const save = useCallback(async () => {
    if (state.changes.length === 0) return;
    dispatch({ type: "saveStart" });
    try {
      await saveFnRef.current(state.changes);
      dispatch({ type: "saveSuccess", at: Date.now() });
      if (teamId != null) clearPersistedChanges(teamId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      dispatch({ type: "saveError", message });
    }
  }, [state.changes, teamId]);

  return useMemo(
    () => ({ state, addChange, revertChange, revertAll, save, clearError }),
    [state, addChange, revertChange, revertAll, save, clearError],
  );
}

/** Stable id generator — avoids the runtime cost of crypto.randomUUID
 *  in the legacy Vitest environment used by some unit tests. */
function makeChangeId(): string {
  return `chg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
