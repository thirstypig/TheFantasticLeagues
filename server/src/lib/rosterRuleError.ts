// server/src/lib/rosterRuleError.ts
// Typed error shape for roster-rule guards. Discriminated by `code` so route
// handlers (and tests) can branch on a stable identifier instead of matching
// substrings of human-readable messages.
//
// HTTP status mapping lives in `server/src/index.ts` (rosterRuleErrorToStatus).
// Default is 400; specific codes map to 403/404/409/503 as appropriate.
// Unknown errors (non-RosterRuleError) fall through to the default 500 path.

export type RosterRuleErrorCode =
  | "GHOST_IL"                // team has a ghost-IL player blocking further stashes
  | "IL_SLOT_FULL"            // team has no open IL slots left
  | "NOT_MLB_IL"              // player's MLB status is not an "Injured …-Day" designation
  | "POSITION_INELIGIBLE"     // added player cannot fill the dropped player's slot
  | "ROSTER_CAP"              // transaction would violate per-league exact-cap invariant
  | "DROP_REQUIRED"           // in-season claim/waiver submission without a dropPlayerId
  | "MLB_IDENTITY_MISSING"    // player has no mlbId / mlbTeam — can't verify status
  | "MLB_FEED_UNAVAILABLE"    // 40-man feed unreachable and cache empty (fail closed) — maps to 503
  | "SEASON_NOT_IN_PROGRESS"  // operation requires Season.status === "IN_SEASON"
  | "IL_UNKNOWN_PLAYER"       // player referenced for IL op is not on this team's roster
  | "INVALID_EFFECTIVE_DATE"  // effectiveDate parse/clamp violation
  | "IDOR"                    // resource doesn't belong to the authorized league — maps to 404
  | "NOT_ON_IL"               // attempting to activate a player who isn't in an IL slot
  | "OWNERSHIP_CONFLICT"      // new Roster window would overlap an existing window — maps to 409
  | "NOT_AUTHORIZED"          // auth failure — not admin, not commissioner, not allowed via owner self-serve — maps to 403
  | "NOT_TEAM_OWNER";         // auth failure — league member but does not own the target team — maps to 403

/**
 * Typed error thrown by roster-rule guards. Route layer catches it and maps
 * to HTTP 400 with a stable response shape — `{ error: message, code }`.
 *
 * Prefer throwing this over `new Error(...)` so tests can assert on `.code`
 * instead of brittle substring matches.
 */
export class RosterRuleError extends Error {
  readonly code: RosterRuleErrorCode;
  readonly metadata: Record<string, unknown>;

  constructor(code: RosterRuleErrorCode, message: string, metadata: Record<string, unknown> = {}) {
    super(message);
    this.name = "RosterRuleError";
    this.code = code;
    this.metadata = metadata;
  }
}

/**
 * Type guard. Useful in try/catch to narrow `err: unknown`.
 */
export function isRosterRuleError(err: unknown): err is RosterRuleError {
  return err instanceof RosterRuleError;
}
