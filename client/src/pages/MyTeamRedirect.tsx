import { Navigate } from "react-router-dom";
import { useLeague } from "../contexts/LeagueContext";

/**
 * Canonical "My Team" route. Resolves the active league's owned-team code
 * from `LeagueContext.myTeamCode` and redirects to the existing
 * `/teams/:teamCode` page.
 *
 * This is the canonical URL behind the sidebar's "My Team" shortcut
 * (PR #132). Direct `/teams/:code` links still work — this just gives
 * the shortcut a stable, bookmarkable URL that follows the user across
 * league switches without the link rewriting itself.
 *
 * Behavior:
 *   - `myTeamCode` resolved → redirect to `/teams/{code}`
 *   - `myTeamCode === null` (no team owned in current league) → home
 *   - LeagueContext still loading → render nothing (suspense-style);
 *     the next render with resolved context will redirect
 */
export default function MyTeamRedirect() {
  const { myTeamCode, leagueId, myTeamResolved } = useLeague();

  // Wait for both leagueId AND the league-detail fetch to settle.
  // `myTeamResolved` flips true after `/leagues/:id` returns (success
  // OR failure), at which point `myTeamCode === null` reliably means
  // "no team owned" rather than "still loading." Without this guard,
  // a fresh page load can race past the in-flight fetch and fall
  // through to the home redirect, leaving the user stranded back on
  // / instead of their team page.
  if (!leagueId || !myTeamResolved) return null;

  if (myTeamCode) {
    return <Navigate to={`/teams/${myTeamCode}`} replace />;
  }

  // No team owned in this league — fall back to home rather than
  // landing on a 404 from /teams/(empty).
  return <Navigate to="/" replace />;
}
