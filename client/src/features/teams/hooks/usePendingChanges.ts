// client/src/features/teams/hooks/usePendingChanges.ts
//
// Pending-changes state machine for the v3 roster hub. The Hub scenario
// (per docs/plans/2026-04-30-roster-hub-direction-lock.md) covers
// position swaps; the FA scenario adds free-agent adds with a displaced
// drop; the IL scenario (this PR) adds stash + activate variants.
//
// Each pending change is one of:
//   - `swap` — two roster players exchanging assignedSlot values.
//   - `fa_add` — pull a free agent onto the roster, displacing an
//     existing roster player into the drop pool. Save resolves via the
//     existing /api/transactions/claim endpoint (which handles the
//     bipartite auto-resolve matcher server-side).
//   - `il_stash` — move an IL-eligible roster player into an IL slot.
//     The freed active slot is auto-resolved server-side; per IL #4,
//     stash without a paired add is allowed (legacy `il-stash` endpoint
//     still expects an addPlayerId, so for v1 the hub passes the
//     dropped row's slot to the auto-resolver — but that's a server
//     concern; the variant only carries what the UI needs to render).
//   - `il_activate` — move a player back from IL onto an active slot,
//     optionally displacing an existing roster player. `displaced` is
//     OMITTED when bench has space (IL #4: "skip displacement").
//
// Drag wiring (DndContext) and visual rendering (PendingChangeBar) live
// in the Team page + RosterHub component family respectively.
//
// Per direction-lock #4 (Hub): per-row revert is a single-item undo (NOT
// "revert all"). Per #2 save is explicit-click only. Per #5 localStorage
// backup persists across navigation with 1hr TTL.
// Per direction-lock FA-#3: pending-changes panel IS the batch — fa_adds
// are queued like swaps and committed atomically on Save (FA-#4 inherited
// from Hub: all-or-nothing).

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { SlotCode } from "@shared/api/rosterMoves";

// ─── Types ─────────────────────────────────────────────────────────

/**
 * One queued change. The `kind` discriminator lets the hub-, FA-, and
 * IL-scenarios share a single queue. Save dispatches per-kind via the
 * caller-supplied `saveFn`.
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
    }
  | {
      id: string;
      kind: "fa_add";
      /** MLB stats id of the FA being claimed. Canonical wire key for
       *  /api/transactions/claim — accepts mlbId for FAs not yet in the
       *  Roster table. */
      mlbId: number;
      /** Display name of the FA (UI labelling only). */
      faName: string;
      /** Optional Prisma Player.id when the FA happens to be enriched
       *  client-side (rare for true FAs). Sent alongside mlbId when
       *  present. */
      playerId?: number;
      /** The slot the FA should occupy after the claim. Drives
       *  optimistic preview + server-side eligibility check. */
      targetSlot: SlotCode | "BN";
      /** Roster player who must be dropped to make room. The Hub's
       *  bipartite auto-resolver runs server-side via /transactions/claim;
       *  this field captures the user's chosen drop target so the UI
       *  can show "Add X · drop Y" and the drop-pool can list them. */
      displaced: {
        rosterId: number;
        playerId: number;
        mlbId: number;
        name: string;
        slot: SlotCode | "IL";
      };
    }
  | {
      id: string;
      kind: "il_stash";
      /** Prisma Player.id of the player being stashed. */
      playerId: number;
      /** MLB stats id (carried for /il-stash endpoint + audit). */
      mlbId: number;
      /** Roster row being moved — server uses this to locate the IL
       *  slot transition without relying on a fresh roster lookup. */
      rosterId: number;
      /** Display name of the stashed player (UI labelling). */
      name: string;
      /** Raw MLB statsapi status string ("Injured 10-Day"). Verbatim
       *  per direction-lock IL #1 — never normalized. */
      mlbStatus: string;
      /** The slot the stashed player vacates. The freed slot drives the
       *  cascade preview (IL #5) + the FA suggestion chip target (IL #6). */
      freed: SlotCode;
    }
  | {
      id: string;
      kind: "il_activate";
      /** Prisma Player.id of the IL-rostered player being activated. */
      playerId: number;
      /** MLB stats id of the activated player. */
      mlbId: number;
      /** rosterId of the IL row (for revert + UI labelling). */
      rosterId: number;
      /** Display name of the activated player. */
      name: string;
      /** Slot to occupy after activation. Server confirms eligibility. */
      targetSlot: SlotCode;
      /** Optional displaced roster player. OMITTED when bench has space
       *  per direction-lock IL #4 — the server-side matcher handles the
       *  no-displacement case via a free bench slot. */
      displaced?: {
        rosterId: number;
        playerId: number;
        mlbId: number;
        name: string;
      };
    };

/**
 * `PendingChange` minus its id — used as the input shape for
 * `addChange()`. Distributes correctly over the discriminated union
 * (so callers can pass either a swap-shaped or fa_add-shaped object
 * without TypeScript merging the variants into a no-keys-in-common
 * intersection).
 */
export type PendingChangeInput = PendingChange extends infer T
  ? T extends { id: string }
    ? Omit<T, "id">
    : never
  : never;

export interface PendingChangesState {
  changes: PendingChange[];
  saving: boolean;
  error: string | null;
  lastSavedAt: number | null;
}

interface PersistedState {
  /** Schema version — bump if PendingChange shape changes incompatibly.
   *  v1: swap-only (Hub scenario, PR #207).
   *  v2: adds fa_add variant (FA scenario).
   *  v3: adds il_stash + il_activate variants (IL scenario, this PR).
   *  v1/v2 entries are discarded silently rather than auto-migrated —
   *  the cost of a one-time discard is dwarfed by the safety win of
   *  "no partial-shape entries". */
  v: 3;
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
    if (!parsed || parsed.v !== 3 || !Array.isArray(parsed.changes)) {
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
    const payload: PersistedState = { v: 3, savedAt: Date.now(), changes };
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
  addChange: (change: PendingChangeInput & { id?: string }) => void;
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
