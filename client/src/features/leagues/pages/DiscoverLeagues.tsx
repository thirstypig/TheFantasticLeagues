import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getPublicLeagues, type PublicLeagueListItem } from "../api";
import { useAuth } from "../../../auth/AuthProvider";

export default function DiscoverLeagues() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leagues, setLeagues] = useState<PublicLeagueListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    getPublicLeagues()
      .then(res => setLeagues(res.leagues || []))
      .catch(() => setLeagues([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = search
    ? leagues.filter(l => l.name.toLowerCase().includes(search.toLowerCase()))
    : leagues;

  return (
    <div className="min-h-screen bg-[var(--lg-bg)] text-[var(--lg-text-primary)]">
      {/* Simple header */}
      <header className="border-b border-[var(--lg-border-subtle)] px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-[var(--lg-accent)] font-bold text-lg">
          <span>TFL</span>
          <span className="text-xs text-[var(--lg-text-muted)] font-normal">The Fantastic Leagues</span>
        </Link>
        <div className="flex items-center gap-3">
          {user ? (
            <Link to="/" className="text-sm text-[var(--lg-accent)] hover:underline">Dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="text-sm text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]">Log In</Link>
              <Link to="/signup" className="px-4 py-1.5 bg-[var(--lg-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90">Sign Up</Link>
            </>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-3 text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Early Access</span>
          <span className="text-sm text-[var(--lg-text-secondary)] ml-2">The 2026 season is free for all features while we build out the platform.</span>
        </div>

        <h1 className="text-3xl font-bold text-[var(--lg-accent)] mb-2">Discover Leagues</h1>
        <p className="text-[var(--lg-text-muted)] mb-8">Browse public fantasy baseball leagues and join the competition.</p>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search leagues..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full max-w-md px-4 py-2 rounded-lg bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] text-[var(--lg-text-primary)] text-sm focus:outline-none focus:border-[var(--lg-accent)]"
          />
        </div>

        {/* League Cards */}
        {loading ? (
          <div className="text-[var(--lg-text-muted)] py-12 text-center">Loading leagues...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-[var(--lg-text-muted)] mb-4">
              {search ? "No leagues match your search." : "No public leagues yet."}
            </div>
            {user && (
              <Link to="/create-league" className="px-4 py-2 bg-[var(--lg-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90">
                Create Your Own League
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(league => (
              <div
                key={league.id}
                className="bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-xl p-5 hover:border-[var(--lg-accent)]/30 transition-colors cursor-pointer"
                onClick={() => {
                  if (!user) {
                    navigate("/login");
                  }
                  // TODO: navigate to league detail page when built
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-bold text-[var(--lg-text-primary)]">{league.name}</h3>
                    <p className="text-xs text-[var(--lg-text-muted)]">{league.season} Season · {league.scoringFormat || "Roto"} · {league.draftMode || "Auction"}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                    league.visibility === "OPEN"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  }`}>
                    {league.visibility === "OPEN" ? "Open" : "Public"}
                  </span>
                </div>

                {league.description && (
                  <p className="text-sm text-[var(--lg-text-secondary)] mb-3 line-clamp-2">{league.description}</p>
                )}

                <div className="flex items-center gap-4 text-xs text-[var(--lg-text-muted)]">
                  <span>{league.teamsFilled}/{league.maxTeams} teams</span>
                  {league.commissioner && <span>Commissioner: {league.commissioner}</span>}
                  {league.entryFee ? <span>${league.entryFee} entry</span> : <span>Free</span>}
                </div>

                <div className="mt-3 flex justify-end">
                  <span className="text-xs text-[var(--lg-accent)] font-medium">
                    {league.visibility === "OPEN" ? "Join Now →" : "View Details →"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
