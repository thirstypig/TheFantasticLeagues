import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../auth/AuthProvider";
import { fetchJsonPublic } from "../../../api/base";

interface LeagueInfo {
  id: number;
  name: string;
  season: number;
  sport: string;
  scoringFormat: string;
  draftMode: string;
  visibility: string;
  maxTeams: number;
  teamsFilled: number;
  description: string | null;
  entryFee: number | null;
  entryFeeNote: string | null;
  commissioner: string | null;
  teams: { name: string }[];
}

const API_BASE = import.meta.env.VITE_API_URL || "/api";

export default function LeagueDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    // Use the public leagues endpoint and find by slug
    fetch(`${API_BASE}/leagues/public`)
      .then(r => r.json())
      .then(data => {
        const leagues = data.leagues || data || [];
        const found = leagues.find((l: any) => l.publicSlug === slug || l.name.toLowerCase().replace(/\s+/g, '-') === slug);
        if (found) {
          setLeague(found);
        } else {
          setError("League not found");
        }
      })
      .catch(() => setError("Failed to load league"))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--lg-bg)] text-[var(--lg-text-primary)] flex items-center justify-center">
        <div className="text-[var(--lg-text-muted)]">Loading...</div>
      </div>
    );
  }

  if (error || !league) {
    return (
      <div className="min-h-screen bg-[var(--lg-bg)] text-[var(--lg-text-primary)]">
        <header className="border-b border-[var(--lg-border-subtle)] px-6 py-4 flex items-center justify-between">
          <Link to="/discover" className="text-[var(--lg-accent)] font-bold text-lg">TFL</Link>
          <Link to="/discover" className="text-sm text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]">Back to Discover</Link>
        </header>
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-2">League Not Found</h1>
          <p className="text-[var(--lg-text-muted)] mb-6">{error || "This league doesn't exist or isn't public."}</p>
          <Link to="/discover" className="px-4 py-2 bg-[var(--lg-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90">
            Browse Leagues
          </Link>
        </div>
      </div>
    );
  }

  const isFull = league.teamsFilled >= league.maxTeams;

  return (
    <div className="min-h-screen bg-[var(--lg-bg)] text-[var(--lg-text-primary)]">
      <header className="border-b border-[var(--lg-border-subtle)] px-6 py-4 flex items-center justify-between">
        <Link to="/discover" className="flex items-center gap-2 text-[var(--lg-accent)] font-bold text-lg">
          <span>TFL</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/discover" className="text-sm text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]">Back to Discover</Link>
          {user ? (
            <Link to="/" className="text-sm text-[var(--lg-accent)] hover:underline">Dashboard</Link>
          ) : (
            <Link to="/signup" className="px-4 py-1.5 bg-[var(--lg-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90">Sign Up</Link>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        {/* League Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between mb-2">
            <h1 className="text-3xl font-bold text-[var(--lg-text-primary)]">{league.name}</h1>
            <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase ${
              league.visibility === "OPEN"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
            }`}>
              {league.visibility === "OPEN" ? "Open" : "Public"}
            </span>
          </div>
          <p className="text-[var(--lg-text-muted)]">{league.season} Season</p>
        </div>

        {/* Description */}
        {league.description && (
          <div className="bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-xl p-5 mb-6">
            <p className="text-[var(--lg-text-secondary)] leading-relaxed">{league.description}</p>
          </div>
        )}

        {/* League Info Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-[var(--lg-tint)] border border-[var(--lg-border-faint)] rounded-lg p-4 text-center">
            <div className="text-lg font-bold text-[var(--lg-text-primary)]">{league.teamsFilled}/{league.maxTeams}</div>
            <div className="text-xs text-[var(--lg-text-muted)]">Teams</div>
          </div>
          <div className="bg-[var(--lg-tint)] border border-[var(--lg-border-faint)] rounded-lg p-4 text-center">
            <div className="text-lg font-bold text-[var(--lg-text-primary)]">{league.scoringFormat || "Roto"}</div>
            <div className="text-xs text-[var(--lg-text-muted)]">Format</div>
          </div>
          <div className="bg-[var(--lg-tint)] border border-[var(--lg-border-faint)] rounded-lg p-4 text-center">
            <div className="text-lg font-bold text-[var(--lg-text-primary)]">{league.draftMode || "Auction"}</div>
            <div className="text-xs text-[var(--lg-text-muted)]">Draft</div>
          </div>
          <div className="bg-[var(--lg-tint)] border border-[var(--lg-border-faint)] rounded-lg p-4 text-center">
            <div className="text-lg font-bold text-[var(--lg-text-primary)]">{league.entryFee ? `$${league.entryFee}` : "Free"}</div>
            <div className="text-xs text-[var(--lg-text-muted)]">Entry</div>
          </div>
        </div>

        {/* Commissioner */}
        {league.commissioner && (
          <div className="mb-8 text-sm text-[var(--lg-text-muted)]">
            Commissioner: <span className="text-[var(--lg-text-primary)] font-medium">{league.commissioner}</span>
          </div>
        )}

        {/* Join CTA */}
        <div className="bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-xl p-6 text-center">
          {isFull ? (
            <>
              <div className="text-lg font-bold text-[var(--lg-text-muted)] mb-2">League Full</div>
              <p className="text-sm text-[var(--lg-text-muted)]">This league has reached its maximum of {league.maxTeams} teams.</p>
            </>
          ) : user ? (
            <>
              <div className="text-lg font-bold mb-2">
                {league.visibility === "OPEN" ? "Ready to Join?" : "Interested in Joining?"}
              </div>
              <p className="text-sm text-[var(--lg-text-muted)] mb-4">
                {league.visibility === "OPEN"
                  ? "This league accepts new members instantly."
                  : "Submit a request and the commissioner will review it."}
              </p>
              <button
                className="px-6 py-2.5 bg-[var(--lg-accent)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
                onClick={() => {
                  // TODO: Wire to join/request endpoint when Phase 3 is built
                  alert(league.visibility === "OPEN" ? "Join flow coming soon!" : "Request flow coming soon!");
                }}
              >
                {league.visibility === "OPEN" ? "Join League" : "Request to Join"}
              </button>
            </>
          ) : (
            <>
              <div className="text-lg font-bold mb-2">Sign Up to Join</div>
              <p className="text-sm text-[var(--lg-text-muted)] mb-4">Create a free account to join this league.</p>
              <Link
                to="/signup"
                className="inline-block px-6 py-2.5 bg-[var(--lg-accent)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                Create Account
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
