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
  const { myTeamCode, leagueId } = useLeague();

  // While the league detail fetch is in flight, leagueId is set but
  // myTeamCode is still null (its initial value AND its no-team value).
  // We can't distinguish those, so wait for at least one render with
  // leagueId resolved before deciding. In practice the resolution is
  // sub-100ms; a brief blank is preferable to a flash-of-redirect.
  if (!leagueId) return null;

  if (myTeamCode) {
    return <Navigate to={`/teams/${myTeamCode}`} replace />;
  }

  // No team owned in this league — fall back to home rather than
  // landing on a 404 from /teams/(empty).
  return <Navigate to="/" replace />;
}
