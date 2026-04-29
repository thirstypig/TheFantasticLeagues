// server/src/features/transactions/lib/slotMatcher.ts
//
// Yahoo-style auto-resolve for OGBA's "no bench" roster constraint.
//
// Given a set of roster candidates (the team's active players after a proposed
// add/drop) and a slot-capacity map, find a legal end-state assignment using
// max bipartite matching (Hopcroft–Karp). Among matchings of equal size,
// prefer the one that retains incumbents in their current slot — implemented
// by ordering edges with incumbent edges first and using augmenting-path
// search (Kuhn's algorithm with greedy seeding) instead of pure Hopcroft–Karp,
// which gives us free-running incumbent preservation without weight bookkeeping.
//
// Multi-capacity slots (P:9, OF:N, etc.) are expanded to per-instance vertices
// (P0..P8). This keeps the matching strictly bipartite and lets us treat
// each pitcher slot interchangeably.
//
// Failure mode: matching size < total candidate count. We surface which slots
// went unfilled (per-instance vertices that ended up unmatched) and which
// players have no edge to any slot at all.
//
// Used by:
//   - /transactions/claim, /transactions/il-stash, /transactions/il-activate
//   - PR2's /api/teams/:teamId/lineup endpoint (not in this PR)
//
// See plan §4A: docs/plans/2026-04-29-yahoo-style-roster-moves-plan.md

import { positionToSlots } from "../../../lib/sports/baseball.js";

/** A single roster row participating in matching. */
export interface RosterCandidate {
  rosterId: number;
  playerId: number;
  /** From `Player.posList` — comma/slash/pipe/space-separated MLB positions. */
  posList: string;
  /** `Roster.assignedPosition` at read time. null = newly added (no incumbent slot). */
  currentSlot: string | null;
  /**
   * IL rows are pinned: matcher must not reassign them. We still include them
   * in the candidate list for completeness, but they consume no active slots
   * and are returned with no assignment change.
   */
  pinned?: boolean;
}

/** A single slot-assignment delta — only emitted for rows where slot changed. */
export interface SlotAssignment {
  rosterId: number;
  oldSlot: string | null;
  newSlot: string;
}

export type MatchResult =
  | { ok: true; assignments: SlotAssignment[] }
  | {
      ok: false;
      code: "NO_LEGAL_ASSIGNMENT";
      reason: string;
      unfilledSlots: string[];
      unassignedPlayers: number[];
    };

/**
 * Server-side mirror of `client/src/lib/positionEligibility.ts.slotsFor`.
 *
 * Copied (not cross-imported) per PR1 spec — we don't import client code from
 * server. The two implementations stay in sync via shared `positionToSlots`
 * (the actual eligibility ladder) which both modules import from baseball.ts.
 */
function slotsFor(posList: string): Set<string> {
  const out = new Set<string>();
  for (const raw of (posList ?? "").split(/[,/| ]+/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    for (const slot of positionToSlots(trimmed)) {
      out.add(slot);
    }
  }
  return out;
}

/**
 * Resolve a legal lineup assignment via bipartite matching.
 *
 * @param candidates - all roster rows on the team after the proposed mutation.
 *   Pinned rows (typically IL) are excluded from matching but accepted in the
 *   input for caller convenience.
 * @param slotCapacities - per-slot capacity (e.g. `{ C:2, OF:5, P:9, ... }`).
 *   Capacities expand to per-instance vertices internally.
 *
 * @returns `{ ok: true, assignments }` if every non-pinned candidate is matched
 *   to an eligible slot; `{ ok: false, code: "NO_LEGAL_ASSIGNMENT", ... }`
 *   otherwise. The `assignments` array contains only rows where the slot
 *   changed — callers can iterate without filtering.
 */
export function resolveLineup(
  candidates: RosterCandidate[],
  slotCapacities: Record<string, number>,
): MatchResult {
  // Filter out pinned rows — they keep their current slot and don't compete.
  const free = candidates.filter((c) => !c.pinned);

  if (free.length === 0) {
    return { ok: true, assignments: [] };
  }

  // Capacity sanity check: total slot capacity must accommodate the free roster.
  const totalCapacity = Object.values(slotCapacities).reduce((a, b) => a + b, 0);
  if (free.length > totalCapacity) {
    return {
      ok: false,
      code: "NO_LEGAL_ASSIGNMENT",
      reason: `Roster has ${free.length} active players but only ${totalCapacity} active slots.`,
      unfilledSlots: [],
      unassignedPlayers: free.map((c) => c.playerId),
    };
  }

  // ── Build slot vertex list (per-instance expansion) ────────────────────
  // Each entry is { slot: "OF", index: 2 } meaning the 3rd OF slot. Order is
  // stable: slots iterated in alphabetical key order, then 0..capacity-1.
  // Stable order matters for test determinism (no Map iteration surprises).
  interface SlotVertex {
    key: string; // e.g. "OF#2"
    slot: string; // canonical slot, e.g. "OF"
  }
  const slotVertices: SlotVertex[] = [];
  const slotKeys = Object.keys(slotCapacities).sort();
  for (const slot of slotKeys) {
    const cap = slotCapacities[slot] ?? 0;
    for (let i = 0; i < cap; i++) {
      slotVertices.push({ key: `${slot}#${i}`, slot });
    }
  }

  // ── Pre-compute eligibility edges per candidate ────────────────────────
  // Each candidate gets a list of eligible slot-vertex indices. Within that
  // list, incumbent edges (where slot === currentSlot) are listed first so
  // augmenting-path search visits them before alternatives — this is what
  // gives us incumbent preservation for free.
  const playerEdges: number[][] = [];
  const playerEligibleSlots: Set<string>[] = [];
  for (let p = 0; p < free.length; p++) {
    const cand = free[p];
    const eligibleSlots = slotsFor(cand.posList);
    playerEligibleSlots.push(eligibleSlots);

    const incumbent: number[] = [];
    const others: number[] = [];
    for (let s = 0; s < slotVertices.length; s++) {
      const v = slotVertices[s];
      if (!eligibleSlots.has(v.slot)) continue;
      if (cand.currentSlot && v.slot === cand.currentSlot) {
        incumbent.push(s);
      } else {
        others.push(s);
      }
    }
    playerEdges.push([...incumbent, ...others]);
  }

  // ── Detect players with no eligibility at all (early-exit) ─────────────
  const unassignedPlayers: number[] = [];
  for (let p = 0; p < free.length; p++) {
    if (playerEdges[p].length === 0) {
      unassignedPlayers.push(free[p].playerId);
    }
  }

  // ── Bipartite matching via augmenting-path (Kuhn's algorithm) ──────────
  // `matchSlot[s]` = player index assigned to slot vertex s, or -1 if unmatched.
  // `matchPlayer[p]` = slot vertex assigned to player p, or -1 if unmatched.
  //
  // We seed with incumbent assignments first (greedy on each player's first
  // edge, which is their incumbent slot if any). Then augment any unmatched
  // players. This keeps the incumbent in place whenever possible — only
  // displaced if doing so unlocks a strictly larger matching.
  const matchSlot: number[] = new Array(slotVertices.length).fill(-1);
  const matchPlayer: number[] = new Array(free.length).fill(-1);

  // Greedy seeding: walk players in order, take the first edge if free.
  for (let p = 0; p < free.length; p++) {
    for (const s of playerEdges[p]) {
      if (matchSlot[s] === -1) {
        matchSlot[s] = p;
        matchPlayer[p] = s;
        break;
      }
    }
  }

  // Augmenting-path search — DFS from each unmatched player.
  function tryAugment(p: number, visited: boolean[]): boolean {
    for (const s of playerEdges[p]) {
      if (visited[s]) continue;
      visited[s] = true;
      const occ = matchSlot[s];
      if (occ === -1 || tryAugment(occ, visited)) {
        matchSlot[s] = p;
        matchPlayer[p] = s;
        return true;
      }
    }
    return false;
  }

  for (let p = 0; p < free.length; p++) {
    if (matchPlayer[p] !== -1) continue;
    const visited = new Array(slotVertices.length).fill(false);
    tryAugment(p, visited);
  }

  // ── Check for completeness ────────────────────────────────────────────
  const stillUnmatched: number[] = [];
  for (let p = 0; p < free.length; p++) {
    if (matchPlayer[p] === -1) {
      stillUnmatched.push(free[p].playerId);
    }
  }
  if (stillUnmatched.length > 0) {
    // Slots that ended up empty point at the bottleneck — typically a
    // capacity tier (e.g. "no eligible C" if C went unfilled).
    const unfilledByKey = slotVertices
      .filter((_v, i) => matchSlot[i] === -1)
      .map((v) => v.slot);
    // Dedup unfilled by canonical slot name; the count of empty
    // per-instance vertices is what matters but the list is human-readable.
    const unfilledSlots = Array.from(new Set(unfilledByKey)).sort();

    // Players with literally no edge at all → headline case.
    const reason = unassignedPlayers.length > 0
      ? `No legal slot for ${unassignedPlayers.length} player(s): ${unassignedPlayers.join(", ")}.`
      : `Cannot fill all roster slots. Unfilled: ${unfilledSlots.join(", ")}. ` +
        `Reshuffle blocked by ${stillUnmatched.length} player(s) with no compatible slot.`;

    return {
      ok: false,
      code: "NO_LEGAL_ASSIGNMENT",
      reason,
      unfilledSlots,
      unassignedPlayers: stillUnmatched,
    };
  }

  // ── Emit assignment deltas ────────────────────────────────────────────
  const assignments: SlotAssignment[] = [];
  for (let p = 0; p < free.length; p++) {
    const cand = free[p];
    const slotIdx = matchPlayer[p];
    const newSlot = slotVertices[slotIdx].slot;
    if (cand.currentSlot !== newSlot) {
      assignments.push({
        rosterId: cand.rosterId,
        oldSlot: cand.currentSlot,
        newSlot,
      });
    }
  }

  return { ok: true, assignments };
}
