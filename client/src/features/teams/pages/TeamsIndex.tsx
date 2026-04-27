import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getLeague } from "../../leagues/api";
import { useLeague } from "../../../contexts/LeagueContext";
import PageHeader from "../../../components/ui/PageHeader";
import { PageSkeleton } from "../../../components/ui/Skeleton";
import type { LeagueTeam } from "../../../api/types";

/**
 * Teams index — the Explore section's "Teams" destination from the
 * Sitemap & Navigation design (PR #132). Lists all teams in the active
 * league with quick-glance metadata + a "View roster" link to the
 * existing `/teams/:teamCode` detail page.
 *
 * The design audit identified `/teams/:teamCode` as an orphan that
 * required URL guessing or hopping through Standings to reach. This
 * index page closes that gap and gives the new sidebar entry a real
 * destination.
 */
export default function TeamsIndex() {
  const { leagueId, currentLeagueName, currentSeason, myTeamId } = useLeague();
  const [teams, setTeams] = useState<LeagueTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    let canceled = false;
    setLoading(true);
    setError(null);
    getLeague(leagueId)
      .then(res => {
        if (canceled) return;
        setTeams(res.league?.teams ?? []);
      })
      .catch(err => {
        if (canceled) return;
        setError(err instanceof Error ? err.message : "Failed to load teams");
      })
      .finally(() => { if (!canceled) setLoading(false); });
    return () => { canceled = true; };
  }, [leagueId]);

  if (loading) return <PageSkeleton />;

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10">
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      </div>
    );
  }

  // Sort: my team first (when present), then by name.
  const sortedTeams = [...teams].sort((a, b) => {
    if (a.id === myTeamId) return -1;
    if (b.id === myTeamId) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <PageHeader
        title="Teams"
        subtitle={`All ${teams.length} teams in ${currentLeagueName}${currentSeason ? ` · ${currentSeason}` : ""}.`}
      />

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sortedTeams.map(team => {
          const isMyTeam = team.id === myTeamId;
          // Owner display: prefer the legacy single-owner name; fall
          // back to a count for multi-owner teams (the LeagueTeam shape
          // doesn't carry owner emails or names for the multi-owner
          // path — only userIds — so we can't render them inline here
          // without an additional fetch).
          const ownerCount = team.ownerships?.length ?? 0;
          const ownerDisplay =
            team.owner
              ? team.owner
              : ownerCount === 1
                ? "1 owner"
                : ownerCount > 1
                  ? `${ownerCount} owners`
                  : "Unassigned";

          return (
            <Link
              key={team.id}
              to={`/teams/${team.code}`}
              className={`group flex flex-col gap-3 rounded-xl border p-5 transition-all hover:border-[var(--lg-accent)] hover:bg-[var(--lg-tint)]/40 ${
                isMyTeam
                  ? "border-[var(--lg-accent)] bg-[var(--lg-accent)]/5"
                  : "border-[var(--lg-border-subtle)] bg-[var(--lg-bg-card)]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-mono uppercase tracking-wider text-[var(--lg-text-muted)]">
                    {team.code}
                  </div>
                  <div className="mt-1 text-lg font-bold text-[var(--lg-text-heading)] truncate">
                    {team.name}
                  </div>
                </div>
                {isMyTeam && (
                  <span className="rounded-full bg-[var(--lg-accent)]/20 border border-[var(--lg-accent)]/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--lg-accent)]">
                    My Team
                  </span>
                )}
              </div>

              <div className="text-xs text-[var(--lg-text-muted)]">
                {ownerDisplay}
              </div>

              <div className="mt-auto pt-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--lg-text-muted)] group-hover:text-[var(--lg-accent)] transition-colors">
                View roster →
              </div>
            </Link>
          );
        })}
      </div>

      {teams.length === 0 && (
        <div className="mt-12 text-center text-sm text-[var(--lg-text-muted)]">
          No teams in this league yet.
        </div>
      )}
    </div>
  );
}
