// client/src/features/teams/lib/toHubPlayer.ts
//
// Pure mapper: Team.tsx's internal RosterPlayer shape → RosterHubV3's
// RosterHubPlayer shape. Extracted from Team.tsx so the mapping is unit-
// testable in isolation. The Team component still owns the RosterPlayer
// type (it includes view-only stat fields the mapper needs); this module
// just defines a structural input that captures what the mapping reads.

import { SlotCodeSchema, type SlotCode as WireSlotCode } from "@shared/api/rosterMoves";
import { isSlotCode, type SlotCode } from "../../../lib/positionEligibility";
import type { RosterHubPlayer } from "../components/RosterHub";

/**
 * Structural input — captures every field `toHubPlayer` reads from a
 * RosterPlayer row. Defined here (not imported from Team.tsx) so the
 * mapper has no React/component coupling and tests don't have to render
 * the page to exercise it.
 */
export interface RosterPlayerInput {
  rosterId: number;
  /** Prisma Player.id — stable across roster mutations. */
  playerId: number;
  mlbId?: number | string | null;
  playerName: string;
  posPrimary?: string;
  /** Comma-separated full eligibility list ("OF,2B"). Drives multi-chip render. */
  posList?: string;
  assignedPosition?: string;
  isPitcher?: boolean;
  mlbTeam?: string;
  isKeeper?: boolean;
  /** Per-position GP from Player.posGames (real MLB fielding data); synthetic 60/40 fallback until cron populates it. */
  gamesByPos?: Record<string, number>;
  /** Raw MLB statsapi status string ("Injured 10-Day", "Active", …).
   *  Verbatim per direction-lock IL #1 — never normalized. */
  mlbStatus?: string | null;
  /** Days since `mlbStatus` was observed — drives ghost-IL chip body. */
  mlbStatusDaysAgo?: number;
  // Hitter stats (when available)
  AB?: number;
  H?: number;
  AVG?: number | string;
  HR?: number;
  R?: number;
  RBI?: number;
  SB?: number;
  // Pitcher stats
  IP?: number | string;
  /** Hits + walks allowed combined (matches WHIP numerator). */
  BB_H?: number;
  ER?: number;
  W?: number;
  SV?: number;
  K?: number;
  ERA?: number | string;
  WHIP?: number | string;
}

/**
 * Map a RosterPlayer to a RosterHubPlayer for the v3 hub.
 *
 * Critical contracts the unit tests pin down:
 *   - `playerId` is the Prisma Player.id, NOT rosterId. Mutation flows
 *     and per-player API calls (eligible-slots, posGames — see todos/180) key off this.
 *   - `posList` carries the full multi-position eligibility (e.g.
 *     "OF,2B"). When null, falls back to posPrimary so single-position
 *     players still render a chip — never returns empty string when at
 *     least one position is known.
 *   - `assignedSlot` is canonicalized to uppercase. "IL" stays "IL"; any
 *     other value is treated as a slot code. Missing assignedPosition +
 *     missing posPrimary defaults to "BN".
 *   - Role-aware stats: hitterStats and pitcherStats are mutually
 *     exclusive — exactly one is defined based on `isPitcher`. Empty
 *     stat objects (all undefined fields) are still returned so the
 *     row's stat cells render as "—" rather than crashing on
 *     `.hitterStats!.HR`.
 *   - `gamesPlayedByPosition` passes through the Record<string, number>
 *     as-is. Cast through RosterHubPlayer's narrower type because this
 *     helper doesn't know the SlotCode union — runtime values come from
 *     the server's TeamService.buildGamesByPos which uses string keys.
 */
/**
 * Narrow an arbitrary string to the `RosterHubPlayer.assignedSlot` union via
 * the shared Zod schema. Returns "BN" when the input doesn't match the
 * canonical wire vocabulary — the safe fallback because BN is always
 * available on every roster, and the caller (RosterHubV3) treats unknowns
 * as bench rows. Per todo #132 — replaces an `as any` cast that would have
 * laundered any string into the SlotCode union.
 *
 * The wire SlotCode includes structural slots (BN, IL) and the pitcher
 * sub-codes (SP, RP) in addition to the 10 eligibility slots; the
 * RosterHubPlayer.assignedSlot field accepts that full vocabulary so we
 * pass parsed wire codes through directly.
 */
function narrowSlot(raw: string): WireSlotCode {
  const result = SlotCodeSchema.safeParse(raw);
  return result.success ? result.data : "BN";
}

/**
 * Filter a synthetic per-position GP record to eligibility-slot keys only.
 * The server may emit aggregate keys (e.g. "LF") that aren't in the
 * SlotCode vocabulary; rather than casting them through, drop them so the
 * downstream `Partial<Record<SlotCode, number>>` type holds at runtime.
 * Per todo #132 — replaces an `as any` cast.
 */
function narrowGamesByPos(
  raw: Record<string, number> | undefined,
): Partial<Record<SlotCode, number>> | undefined {
  if (!raw) return undefined;
  const out: Partial<Record<SlotCode, number>> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isSlotCode(key)) out[key] = value;
  }
  return out;
}

/**
 * Enumerates EVERY field on `RosterPlayerInput` that `toHubPlayer` reads.
 * The cache key in `Team.tsx` (and any future memoizer) is derived from this
 * list — co-located with the mapper so adding a new input field forces a
 * sync edit here. Per todo #162.2 (option A): deriving the key from the
 * function's input contract eliminates the silent-stale-cache class of bug.
 *
 * Ordering matters only for stability of the resulting key string — keep
 * it alphabetical-ish for diff readability. The serializer below handles
 * undefined / null / Record<string, number> uniformly.
 */
export const HUB_PLAYER_CACHE_KEY_FIELDS = [
  "rosterId",
  "playerId",
  "mlbId",
  "playerName",
  "posPrimary",
  "posList",
  "assignedPosition",
  "isPitcher",
  "mlbTeam",
  "isKeeper",
  "gamesByPos",
  "mlbStatus",
  "mlbStatusDaysAgo",
  "AB", "H", "AVG", "HR", "R", "RBI", "SB",
  "IP", "BB_H", "ER", "W", "SV", "K", "ERA", "WHIP",
] as const satisfies readonly (keyof RosterPlayerInput)[];

/** Field unit separator —  (information separator one), avoids any plausible value. */
const FIELD_SEP = "";

/**
 * Stable cache key for `toHubPlayer(p)` results. Two inputs produce the same
 * key iff every enumerated field is identical (referentially or by JSON
 * shape, in the case of `gamesByPos`). Per todo #162.2 — derived from
 * `HUB_PLAYER_CACHE_KEY_FIELDS` so the key automatically widens when a new
 * input field is added (no chance of a silent stale cache).
 */
export function hubPlayerCacheKey(p: RosterPlayerInput): string {
  const parts: string[] = [];
  for (const field of HUB_PLAYER_CACHE_KEY_FIELDS) {
    const value = p[field];
    if (value === undefined || value === null) {
      parts.push("");
    } else if (field === "gamesByPos" && typeof value === "object") {
      // Stable serialization: sort keys so insertion order doesn't break
      // referential equality of two semantically-identical records.
      const entries = Object.entries(value as Record<string, number>).sort(
        ([a], [b]) => a.localeCompare(b),
      );
      parts.push(entries.map(([k, v]) => `${k}:${v}`).join("|"));
    } else if (typeof value === "boolean") {
      parts.push(value ? "1" : "0");
    } else {
      parts.push(String(value));
    }
  }
  return parts.join(FIELD_SEP);
}

export function toHubPlayer(p: RosterPlayerInput): RosterHubPlayer {
  const slot = (p.assignedPosition || p.posPrimary || "BN").toUpperCase();
  const base = {
    rosterId: p.rosterId,
    playerId: p.playerId,
    mlbId: p.mlbId,
    name: p.playerName,
    posList: p.posList || p.posPrimary || "",
    posPrimary: p.posPrimary || "",
    assignedSlot: narrowSlot(slot),
    mlbTeam: p.mlbTeam,
    isKeeper: p.isKeeper,
    gamesPlayedByPosition: narrowGamesByPos(p.gamesByPos),
    mlbStatus: p.mlbStatus ?? undefined,
    mlbStatusDaysAgo: p.mlbStatusDaysAgo,
  };
  // Per todo #153 — RosterHubPlayer is a discriminated union on
  // `isPitcher`. Branch the return value so the type system knows which
  // role-keyed stat object is populated. Hitter rows always carry a
  // hitterStats object (possibly empty) so RosterRowV3 renders "—" for
  // missing fields rather than crashing on `.hitterStats!.HR`.
  if (p.isPitcher) {
    return {
      ...base,
      isPitcher: true,
      pitcherStats: {
        IP: p.IP,
        BB_H: p.BB_H,
        K: p.K,
        W: p.W,
        SV: p.SV,
        ER: p.ER,
        ERA: p.ERA,
        WHIP: p.WHIP,
      },
    };
  }
  return {
    ...base,
    isPitcher: false,
    hitterStats: {
      AB: p.AB,
      H: p.H,
      R: p.R,
      HR: p.HR,
      RBI: p.RBI,
      SB: p.SB,
      AVG: p.AVG,
    },
  };
}
