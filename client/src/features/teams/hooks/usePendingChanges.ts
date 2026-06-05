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
//
// Complex-batch scenario (this PR) extends the hook with:
//   - Dependency detection (Complex-#2): when a queued change references
//     a slot freed by a prior change in the same batch, both are linked
//     via `dependsOn` / `blockedBy` so per-item revert of a parent
//     cascades to children.
//   - Kind breakdown helper (Complex-#5 extension): callers can render
//     "3 swaps, 1 FA add, 1 IL stash" in the restore prompt before the
//     user commits to restoring the persisted batch.
//   - Per-change error mapping (Complex-#4 + #6): saveFn may throw a
//     `PendingChangeBatchError` carrying a structured `failures` array
//     keyed by change id. Atomic semantics — even if some mutations
//     succeeded server-side, the client treats the whole batch as
//     "kept in queue" and surfaces inline per-row error text.

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

/**
 * Per-change failure detail produced by the server (or surfaced
 * client-side) when a save batch fails. Maps 1:1 onto a queued change
 * via `changeId`. Powers the inline red banner row inside the diff
 * preview modal per Complex-#6 (server-side validation, inline per row).
 */
export interface PendingChangeFailure {
  changeId: string;
  /** Discriminator echoed back so the caller doesn't have to re-lookup. */
  kind: PendingChange["kind"];
  /** Human-readable reason — e.g. "Player no longer FA — cancel this change". */
  reason: string;
}

/**
 * Thrown by `saveFn` when a structured atomic-failure surface is needed.
 * Each failing change is captured by id so the diff preview modal can
 * render an inline banner per row instead of one global toast.
 *
 * Per Complex-#4 (atomic): even when only one of N mutations failed
 * server-side, the client treats the whole batch as "kept in queue".
 * This error carries a list of all the failures we could detect so the
 * UI can highlight each affected row.
 */
export class PendingChangeBatchError extends Error {
  readonly failures: ReadonlyArray<PendingChangeFailure>;
  constructor(message: string, failures: ReadonlyArray<PendingChangeFailure>) {
    super(message);
    this.name = "PendingChangeBatchError";
    this.failures = failures;
  }
}

export interface PendingChangesState {
  changes: PendingChange[];
  saving: boolean;
  error: string | null;
  lastSavedAt: number | null;
  /**
   * Per-change failures from the most recent save attempt. Cleared on
   * the next save start, on revertAll, or on clearError. Keyed by
   * change id so consumers can map back to the row to render the
   * inline error banner (Complex-#4 + Complex-#6).
   */
  failures: ReadonlyArray<PendingChangeFailure>;
  /**
   * Commissioner-mode backdate. When set, the saveFn is expected to
   * forward this value as `effectiveDate` on every mutation API call so
   * the server-side audit trail (TransactionEvent.effectiveDate) reflects
   * the chosen date. Owner-mode hubs leave this null and the server
   * defaults to "now". Persisted alongside changes so a 1hr-old batch
   * restored from localStorage carries its date too.
   *
   * Format: YYYY-MM-DD (HTML5 date input native shape) or full ISO.
   */
  effectiveDate: string | null;
}

interface PersistedState {
  /** Schema version — bump if PendingChange shape changes incompatibly.
   *  v1: swap-only (Hub scenario, PR #207).
   *  v2: adds fa_add variant (FA scenario).
   *  v3: adds il_stash + il_activate variants (IL scenario).
   *  v4: adds effectiveDate (commissioner-mode backdate).
   *  v1/v2/v3 entries are discarded silently rather than auto-migrated —
   *  the cost of a one-time discard is dwarfed by the safety win of
   *  "no partial-shape entries". */
  v: 4;
  /** Unix ms when this snapshot was written. Used for TTL discard. */
  savedAt: number;
  changes: PendingChange[];
  /** Commissioner-mode backdate, persisted alongside the queue so a
   *  1hr-old restored batch keeps its chosen date. Null in owner mode. */
  effectiveDate: string | null;
}

type Action =
  | { type: "add"; change: PendingChange }
  | { type: "revertItem"; ids: string[] }
  | { type: "revertAll" }
  | { type: "commitItem"; id: string }
  | { type: "saveStart" }
  | { type: "saveSuccess"; at: number }
  | {
      type: "saveError";
      message: string;
      failures: ReadonlyArray<PendingChangeFailure>;
    }
  | { type: "clearError" }
  | { type: "hydrate"; changes: PendingChange[]; effectiveDate?: string | null }
  | { type: "setEffectiveDate"; effectiveDate: string | null };

// ─── Reducer ───────────────────────────────────────────────────────

function reducer(state: PendingChangesState, action: Action): PendingChangesState {
  switch (action.type) {
    case "add":
      return {
        ...state,
        changes: [...state.changes, action.change],
        error: null,
        failures: [],
      };
    case "revertItem": {
      const idSet = new Set(action.ids);
      return {
        ...state,
        changes: state.changes.filter((c) => !idSet.has(c.id)),
        // Drop any failure entries pointing at the just-reverted ids so
        // the inline error banners disappear with the rows.
        failures: state.failures.filter((f) => !idSet.has(f.changeId)),
      };
    }
    case "revertAll":
      return { ...state, changes: [], error: null, failures: [] };
    case "commitItem":
      // Remove a single change that has been successfully committed to the
      // server. Called during a save to progressively shrink the queue as
      // each mutation lands — so on partial failure only the uncommitted
      // changes remain visible in the bar.
      return { ...state, changes: state.changes.filter((c) => c.id !== action.id) };
    case "saveStart":
      return { ...state, saving: true, error: null, failures: [] };
    case "saveSuccess":
      return {
        changes: [],
        saving: false,
        error: null,
        lastSavedAt: action.at,
        failures: [],
        // Reset the date to null on successful save so the next batch
        // starts fresh — the user can re-enter a backdate if needed.
        effectiveDate: null,
      };
    case "saveError":
      return {
        ...state,
        saving: false,
        error: action.message,
        failures: action.failures,
      };
    case "clearError":
      return { ...state, error: null, failures: [] };
    case "hydrate":
      return {
        ...state,
        changes: action.changes,
        effectiveDate:
          action.effectiveDate !== undefined ? action.effectiveDate : state.effectiveDate,
      };
    case "setEffectiveDate":
      return { ...state, effectiveDate: action.effectiveDate };
  }
}

// ─── Dependency detection (Complex-#2) ─────────────────────────────

/**
 * A "dependency" between two queued changes. Order matters — `parent`
 * is the change whose mutation FREES a slot/displaces a roster row,
 * and `child` is the change that consumes that vacancy. Per-item
 * revert of `parent` must cascade to revert `child` too (no partial
 * chained state), which is enforced in `revertChange()` below.
 */
export interface PendingChangeDependency {
  parent: string;
  child: string;
}

/**
 * Compute dependency edges for a queue. The semantics are conservative:
 *
 *   - `swap` displaces both endpoints — any later change that targets
 *     the freed slot ("from.slot" or "to.slot") through `targetSlot` is
 *     a dependent.
 *   - `il_stash` frees one slot (`freed`). A later `fa_add` whose
 *     `targetSlot` equals the freed slot is a dependent (the canonical
 *     "stash X to free up SS, then add a FA into SS").
 *   - `il_activate` displaces a roster row when present (`displaced`);
 *     a later change targeting that displaced rosterId via swap or
 *     fa_add.displaced is a dependent.
 *   - `fa_add` displaces a roster row (`displaced.rosterId`); same rule.
 *
 * The output edges are unordered with respect to siblings — a single
 * parent can have multiple children, and `revertChange()` walks the
 * graph transitively when revert-cascading.
 */
export function computeDependencies(
  changes: ReadonlyArray<PendingChange>,
): ReadonlyArray<PendingChangeDependency> {
  const edges: PendingChangeDependency[] = [];
  for (let i = 0; i < changes.length; i++) {
    const parent = changes[i];
    const freedSlots: string[] = [];
    const freedRosterIds: number[] = [];
    if (parent.kind === "swap") {
      freedSlots.push(String(parent.from.slot), String(parent.to.slot));
      freedRosterIds.push(parent.from.rosterId, parent.to.rosterId);
    } else if (parent.kind === "il_stash") {
      freedSlots.push(parent.freed);
      freedRosterIds.push(parent.rosterId);
    } else if (parent.kind === "il_activate") {
      if (parent.displaced) freedRosterIds.push(parent.displaced.rosterId);
      freedRosterIds.push(parent.rosterId);
    } else if (parent.kind === "fa_add") {
      freedRosterIds.push(parent.displaced.rosterId);
    }
    for (let j = i + 1; j < changes.length; j++) {
      const child = changes[j];
      if (child.kind === "fa_add") {
        if (freedSlots.includes(String(child.targetSlot))) {
          edges.push({ parent: parent.id, child: child.id });
          continue;
        }
        if (freedRosterIds.includes(child.displaced.rosterId)) {
          edges.push({ parent: parent.id, child: child.id });
        }
      } else if (child.kind === "swap") {
        if (
          freedRosterIds.includes(child.from.rosterId) ||
          freedRosterIds.includes(child.to.rosterId)
        ) {
          edges.push({ parent: parent.id, child: child.id });
        }
      } else if (child.kind === "il_activate") {
        if (freedSlots.includes(String(child.targetSlot))) {
          edges.push({ parent: parent.id, child: child.id });
        }
      } else if (child.kind === "il_stash") {
        if (freedRosterIds.includes(child.rosterId)) {
          edges.push({ parent: parent.id, child: child.id });
        }
      }
    }
  }
  return edges;
}

/**
 * Walk the dependency graph from a single starting id, returning every
 * descendant id (children, their children, …). Used by `revertChange()`
 * to cascade-revert a parent and all changes that depend on it.
 */
function descendantsOf(
  startId: string,
  edges: ReadonlyArray<PendingChangeDependency>,
): string[] {
  const out = new Set<string>();
  const queue = [startId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const e of edges) {
      if (e.parent === cur && !out.has(e.child)) {
        out.add(e.child);
        queue.push(e.child);
      }
    }
  }
  return Array.from(out);
}

// ─── Kind breakdown (Complex-#5 extension) ─────────────────────────

export interface KindBreakdown {
  swap: number;
  fa_add: number;
  il_stash: number;
  il_activate: number;
}

/**
 * Tally a queue by kind. Used by the localStorage restore prompt to
 * show "3 swaps, 1 FA add, 1 IL stash" before the user commits to
 * restoring the persisted batch.
 */
export function kindBreakdown(
  changes: ReadonlyArray<PendingChange>,
): KindBreakdown {
  const out: KindBreakdown = { swap: 0, fa_add: 0, il_stash: 0, il_activate: 0 };
  for (const c of changes) out[c.kind]++;
  return out;
}

/**
 * Render a kind-breakdown as a short human-readable string suitable for
 * the restore prompt: "3 swaps, 1 FA add, 1 IL stash". Zero-count kinds
 * are omitted. Empty input returns "no changes" so callers don't have
 * to special-case it.
 */
export function describeKindBreakdown(b: KindBreakdown): string {
  const parts: string[] = [];
  if (b.swap > 0) parts.push(`${b.swap} swap${b.swap === 1 ? "" : "s"}`);
  if (b.fa_add > 0) parts.push(`${b.fa_add} FA add${b.fa_add === 1 ? "" : "s"}`);
  if (b.il_stash > 0) parts.push(`${b.il_stash} IL stash${b.il_stash === 1 ? "" : "es"}`);
  if (b.il_activate > 0)
    parts.push(`${b.il_activate} IL activation${b.il_activate === 1 ? "" : "s"}`);
  return parts.length === 0 ? "no changes" : parts.join(", ");
}

// ─── localStorage helpers ──────────────────────────────────────────

const STORAGE_PREFIX = "fbst:hub-pending:";
const TTL_MS = 60 * 60 * 1000; // 1 hour per direction-lock #5

/**
 * Build the per-(user, team) storage key. Commissioner mode introduced
 * a real cross-team scoping problem: a single admin bouncing between
 * `/teams/A` and `/teams/B` would otherwise overwrite the other team's
 * pending batch. The key is now `fbst:hub-pending:<userId>:<teamId>` —
 * legacy `fbst:hub-pending:<teamId>` entries are accepted on read for a
 * one-time grace period (logged out + re-loaded discards them via TTL).
 *
 * userId may be null/undefined — happens during the auth-resolve flicker.
 * In that window we fall back to the legacy team-only key so an
 * authenticated user doesn't lose a queue mid-session.
 */
function storageKey(
  teamId: number | null | undefined,
  userId?: number | string | null,
): string | null {
  if (teamId == null || !Number.isFinite(teamId) || teamId <= 0) return null;
  if (userId != null && (typeof userId === "number" ? userId > 0 : String(userId).length > 0)) {
    return `${STORAGE_PREFIX}${userId}:${teamId}`;
  }
  return `${STORAGE_PREFIX}${teamId}`;
}

/**
 * Read persisted pending changes for a team. Returns null when absent,
 * malformed, or expired beyond TTL. Side-effect: deletes the entry when
 * expired so we don't keep prompting "restore?" on stale data.
 *
 * Backwards compatibility: when called without a userId, reads the
 * legacy team-only key. When called with a userId, reads the scoped
 * key first and falls back to the legacy key (so a session opened
 * before the commissioner-mode rollout still finds its batch).
 */
export function readPersistedChanges(
  teamId: number,
  userId?: number | string | null,
): PendingChange[] | null {
  return readPersistedSnapshot(teamId, userId)?.changes ?? null;
}

/**
 * Lower-level read returning the full snapshot (changes + effectiveDate).
 * Callers that need to restore the full state — including a backdate
 * chosen in commissioner mode — should use this; the `readPersistedChanges`
 * narrow form is preserved for the existing call sites that only care
 * about the queue.
 */
export function readPersistedSnapshot(
  teamId: number,
  userId?: number | string | null,
): { changes: PendingChange[]; effectiveDate: string | null } | null {
  if (typeof window === "undefined") return null;

  // Try the user-scoped key first, then fall back to the legacy
  // team-only key so older persisted batches still restore.
  const candidates: string[] = [];
  const scopedKey = storageKey(teamId, userId);
  if (scopedKey) candidates.push(scopedKey);
  const legacyKey = storageKey(teamId);
  if (legacyKey && legacyKey !== scopedKey) candidates.push(legacyKey);

  for (const key of candidates) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as PersistedState;
      // Accept current (v4) — older versions are silently discarded.
      if (!parsed || parsed.v !== 4 || !Array.isArray(parsed.changes)) {
        window.localStorage.removeItem(key);
        continue;
      }
      if (Date.now() - parsed.savedAt > TTL_MS) {
        window.localStorage.removeItem(key);
        continue;
      }
      return {
        changes: parsed.changes,
        effectiveDate: parsed.effectiveDate ?? null,
      };
    } catch {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

/** Clear persisted changes for a team (called after successful save / discard). */
export function clearPersistedChanges(
  teamId: number,
  userId?: number | string | null,
): void {
  if (typeof window === "undefined") return;
  // Clear both the scoped and legacy keys so a stale legacy entry
  // doesn't resurrect after a save.
  const keys = new Set<string>();
  const scopedKey = storageKey(teamId, userId);
  if (scopedKey) keys.add(scopedKey);
  const legacyKey = storageKey(teamId);
  if (legacyKey) keys.add(legacyKey);
  for (const key of keys) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

function writePersistedChanges(
  teamId: number,
  changes: PendingChange[],
  effectiveDate: string | null,
  userId?: number | string | null,
): void {
  if (typeof window === "undefined") return;
  const key = storageKey(teamId, userId);
  if (!key) return;
  try {
    if (changes.length === 0 && !effectiveDate) {
      window.localStorage.removeItem(key);
      return;
    }
    const payload: PersistedState = {
      v: 4,
      savedAt: Date.now(),
      changes,
      effectiveDate,
    };
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
   * Authenticated user id used to scope the localStorage key per
   * (user, team). Optional — when omitted we fall back to the legacy
   * team-only key. This matters in commissioner mode, where a single
   * admin may bounce between different teams' hubs and would
   * otherwise see one team's pending batch on another team's page.
   */
  userId?: number | string | null;

  /**
   * Save fn supplied by the caller. Receives the queued changes plus
   * the optional commissioner-mode effectiveDate so the caller can
   * forward it on each per-change mutation API call.
   *
   * Resolves on success or rejects with an Error to surface as the
   * banner's `error` state. Implementation-side concerns (atomicity,
   * mutation-API choice) live in the caller.
   */
  saveFn: (
    changes: PendingChange[],
    ctx: { effectiveDate: string | null },
    /** Call after each mutation succeeds to remove it from the pending queue
     *  immediately. On partial save failure, only the uncommitted changes
     *  remain in the bar — no phantom "still pending" items from success.
     *  Optional for backward compatibility; callers that don't need
     *  progressive commit can ignore this parameter. */
    commitChange?: (id: string) => void,
  ) => Promise<void>;

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
  /**
   * Set or clear the commissioner-mode backdate. Owner-mode hubs leave
   * this null (the picker isn't rendered). The chosen value is
   * persisted alongside the queue for 1hr-restore parity.
   */
  setEffectiveDate: (effectiveDate: string | null) => void;
  /**
   * Remove a single change by id. Per Complex-#2: when the targeted
   * change is a parent in the dependency graph (i.e. another queued
   * change consumes a slot it freed), all dependent descendants are
   * cascade-reverted too. Use `revertChangeOnly(id)` if you need the
   * raw single-id removal (rare — pretty much only the inline drop-
   * pool restore button needs it).
   */
  revertChange: (id: string) => void;
  /** Drop every queued change. */
  revertAll: () => void;
  /**
   * Trigger the saveFn for all queued changes. Atomic — all-or-nothing.
   * If saveFn throws a `PendingChangeBatchError`, per-change failures
   * surface in `state.failures` for inline rendering.
   */
  save: () => Promise<void>;
  /** Clear the error banner + per-change failures without dropping changes. */
  clearError: () => void;
  /**
   * Mark a single change as committed (removed from the pending queue).
   * Intended for use inside saveFn: call after each individual mutation
   * succeeds so the bar shrinks progressively. On partial failure the
   * remaining uncommitted changes stay visible without manual bookkeeping.
   */
  commitChange: (id: string) => void;
  /**
   * Computed dependency edges for the current queue. Recomputed any
   * time `state.changes` changes. Read by `PendingChangeBar` to render
   * the "↳ depends on Drop #N" badge.
   */
  dependencies: ReadonlyArray<PendingChangeDependency>;
}

/**
 * State machine + persistence for the Hub scenario's pending-changes
 * queue. Save is delegated to `opts.saveFn` so the same hook works
 * across scenarios — Hub passes a swap-batch implementation; future
 * FA/IL scenarios will pass their own.
 */
export function usePendingChanges(opts: UsePendingChangesOptions): UsePendingChangesApi {
  const { teamId, userId = null, saveFn, persistDebounceMs = 500 } = opts;
  const [state, dispatch] = useReducer(reducer, {
    changes: [],
    saving: false,
    error: null,
    lastSavedAt: null,
    failures: [],
    effectiveDate: null,
  });

  // Hold the latest saveFn in a ref so `save()` doesn't re-create on
  // every parent render. Important for stable identity in
  // beforeunload/blocker effects downstream.
  const saveFnRef = useRef(saveFn);
  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  // Debounced localStorage writer. Persist both the queue and the
  // commissioner-mode backdate together so a 1hr-restored batch carries
  // its chosen date.
  const persistTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (teamId == null) return;
    if (typeof window === "undefined") return;
    if (persistDebounceMs <= 0) {
      writePersistedChanges(teamId, state.changes, state.effectiveDate, userId);
      return;
    }
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      writePersistedChanges(teamId, state.changes, state.effectiveDate, userId);
    }, persistDebounceMs);
    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [state.changes, state.effectiveDate, teamId, userId, persistDebounceMs]);

  const addChange = useCallback<UsePendingChangesApi["addChange"]>((change) => {
    const id = change.id ?? makeChangeId();
    dispatch({ type: "add", change: { ...change, id } as PendingChange });
  }, []);

  // Dependencies recomputed on every queue change. Cheap (O(N²) on a
  // queue that's typically <10 items) — no memoization needed beyond
  // the useMemo wrapping the public api.
  const dependencies = useMemo(
    () => computeDependencies(state.changes),
    [state.changes],
  );
  const dependenciesRef = useRef(dependencies);
  useEffect(() => {
    dependenciesRef.current = dependencies;
  }, [dependencies]);

  const revertChange = useCallback((id: string) => {
    // Cascade-revert any descendants per Complex-#2. The graph is
    // recomputed any time `state.changes` mutates, so reading from
    // the latest ref captures the current edges even if multiple
    // reverts fire in the same tick.
    const descendants = descendantsOf(id, dependenciesRef.current);
    dispatch({ type: "revertItem", ids: [id, ...descendants] });
  }, []);

  const revertAll = useCallback(() => {
    dispatch({ type: "revertAll" });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: "clearError" });
  }, []);

  const setEffectiveDate = useCallback((effectiveDate: string | null) => {
    dispatch({ type: "setEffectiveDate", effectiveDate });
  }, []);

  const commitChange = useCallback((id: string) => {
    dispatch({ type: "commitItem", id });
  }, []);

  const save = useCallback(async () => {
    if (state.changes.length === 0) return;
    dispatch({ type: "saveStart" });
    try {
      await saveFnRef.current(
        state.changes,
        { effectiveDate: state.effectiveDate },
        // Pass commitChange so saveFn can shrink the queue as each
        // mutation lands, giving accurate partial-success visibility.
        (id: string) => dispatch({ type: "commitItem", id }),
      );
      dispatch({ type: "saveSuccess", at: Date.now() });
      if (teamId != null) clearPersistedChanges(teamId, userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      // Queue preserved on error (reducer keeps changes). When saveFn
      // surfaces a structured PendingChangeBatchError, per-row failure
      // list surfaces inline banners in the diff preview modal.
      const failures =
        err instanceof PendingChangeBatchError ? err.failures : [];
      dispatch({ type: "saveError", message, failures });
    }
  }, [state.changes, state.effectiveDate, teamId, userId]);

  return useMemo(
    () => ({
      state,
      addChange,
      revertChange,
      revertAll,
      commitChange,
      save,
      clearError,
      dependencies,
      setEffectiveDate,
    }),
    [state, addChange, revertChange, revertAll, save, clearError, dependencies, setEffectiveDate],
  );
}

/** Stable id generator — avoids the runtime cost of crypto.randomUUID
 *  in the legacy Vitest environment used by some unit tests. */
function makeChangeId(): string {
  return `chg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
