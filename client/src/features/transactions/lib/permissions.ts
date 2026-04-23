// client/src/features/transactions/lib/permissions.ts
//
// Pure helper for deriving "can this user manage roster transactions on this
// team?" from the shared contexts. Mirror of the server-side authorization
// logic in `server/src/middleware/auth.ts#requireTeamOwnerOrCommissioner`.
//
// Returning a discriminated union (not a boolean + optional reason) forces
// call sites to handle the deny branch correctly via TS narrowing — a plain
// `{ canManageRoster: boolean; reason?: string }` would let callers access
// `reason` as `string | undefined` and silently render empty strings.
//
// Reason codes are an enum, not display text. The render layer maps codes
// to copy via a lookup — keeps i18n open and lets tests survive copy edits.

/** Discriminated result. */
export type TransactionPermission =
  | { kind: "loading" }
  | { kind: "allow" }
  | { kind: "deny"; reason: PermissionDenialReason };

/** Stable identifiers for each denial path. */
export type PermissionDenialReason =
  | "COMMISSIONER_ONLY"  // league's owner_self_serve rule is off
  | "NOT_OWN_TEAM"       // toggle is on, but user isn't on the target team
  | "NOT_A_MEMBER";      // user isn't a member of the league at all

/** UI copy keyed by reason. Keep tests asserting on the enum, not strings. */
export const REASON_COPY: Record<PermissionDenialReason, string> = {
  COMMISSIONER_ONLY: "Roster transactions are commissioner-only in this league.",
  NOT_OWN_TEAM: "You can only manage roster transactions on your own team.",
  NOT_A_MEMBER: "You are not a member of this league.",
};

interface Inputs {
  leagueId: number | null;
  teamId: number | null;
  isAdmin: boolean;
  /** From useAuth(). Takes leagueId as a STRING — matches existing convention. */
  isCommissioner: (leagueId: string) => boolean;
  /** From useLeague().myTeamId. */
  myTeamId: number | null;
  /** From useLeague().leagueRules — null while loading, {} when unavailable. */
  leagueRules: Record<string, Record<string, string>> | null;
  /** Whether the viewer has any membership in this league. */
  isLeagueMember: boolean;
}

/**
 * Pure derivation. No hooks, no side effects — call from any render context.
 *
 * Precedence mirrors the server middleware:
 *   1. Missing inputs → LOADING
 *   2. Admin → allow
 *   3. Commissioner → allow (toggle irrelevant)
 *   4. Not a league member → deny NOT_A_MEMBER
 *   5. `owner_self_serve === "true"` AND own team → allow
 *   6. otherwise → deny COMMISSIONER_ONLY or NOT_OWN_TEAM
 */
export function canManageRoster(inputs: Inputs): TransactionPermission {
  const { leagueId, teamId, isAdmin, isCommissioner, myTeamId, leagueRules, isLeagueMember } = inputs;

  if (!leagueId || !teamId || leagueRules === null) {
    return { kind: "loading" };
  }

  if (isAdmin) return { kind: "allow" };
  if (isCommissioner(String(leagueId))) return { kind: "allow" };

  if (!isLeagueMember) {
    return { kind: "deny", reason: "NOT_A_MEMBER" };
  }

  const selfServe = leagueRules.transactions?.owner_self_serve === "true";
  if (!selfServe) {
    return { kind: "deny", reason: "COMMISSIONER_ONLY" };
  }

  if (myTeamId !== teamId) {
    return { kind: "deny", reason: "NOT_OWN_TEAM" };
  }

  return { kind: "allow" };
}
