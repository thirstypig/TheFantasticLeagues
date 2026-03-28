
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { fetchJsonApi, API_BASE, yyyyMmDd, addDays } from "../api/base";
import { ChevronLeft, ChevronRight, Gavel, Trophy, Users, Calendar, Sparkles, ChevronDown, ChevronUp, ArrowLeftRight, TrendingUp, TrendingDown } from "lucide-react";
import { joinLeague } from "../features/leagues/api";
import { useToast } from "../contexts/ToastContext";
import { useLeague, findMyTeam } from "../contexts/LeagueContext";
import { gradeColor, NL_TEAMS, AL_TEAMS } from "../lib/sportConfig";
import { useSeasonGating } from "../hooks/useSeasonGating";

// Map MLB Trade Rumors team name tags to abbreviations for NL/AL filtering
const TEAM_NAME_TO_ABBR: Record<string, string> = {
  "Arizona Diamondbacks": "AZ", "Atlanta Braves": "ATL", "Chicago Cubs": "CHC",
  "Cincinnati Reds": "CIN", "Colorado Rockies": "COL", "Los Angeles Dodgers": "LAD",
  "Miami Marlins": "MIA", "Milwaukee Brewers": "MIL", "New York Mets": "NYM",
  "Philadelphia Phillies": "PHI", "Pittsburgh Pirates": "PIT", "San Diego Padres": "SD",
  "San Francisco Giants": "SF", "St. Louis Cardinals": "STL", "Washington Nationals": "WSH",
  "Baltimore Orioles": "BAL", "Boston Red Sox": "BOS", "Cleveland Guardians": "CLE",
  "Detroit Tigers": "DET", "Houston Astros": "HOU", "Kansas City Royals": "KC",
  "Los Angeles Angels": "LAA", "Minnesota Twins": "MIN", "New York Yankees": "NYY",
  "Athletics": "ATH", "Oakland Athletics": "OAK", "Seattle Mariners": "SEA",
  "Tampa Bay Rays": "TB", "Texas Rangers": "TEX", "Toronto Blue Jays": "TOR",
  "Chicago White Sox": "CWS",
};

// ─── Types ──────────────────────────────────────────────────────────

interface TeamScore {
  id: number;
  name: string;
  abbr: string;
  score: number;
  wins: number;
  losses: number;
}

interface GameScore {
  gamePk: number;
  status: string;
  detailedState: string;
  startTime: string;
  away: TeamScore;
  home: TeamScore;
  inning?: number;
  inningState?: string;
}

interface MlbTransaction {
  id: number;
  playerName: string;
  playerMlbId: number;
  teamName: string;
  teamAbbr: string;
  fromTeamName?: string;
  fromTeamAbbr?: string;
  type: string;
  typeCode: string;
  description: string;
  date: string;
}

// ─── Sub-Components ─────────────────────────────────────────────────

function DateNavigator({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const today = yyyyMmDd(new Date());
  const isToday = date === today;
  const displayDate = isToday ? "Today" : new Date(date + "T12:00:00").toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="flex items-center justify-center gap-3 mb-4">
      <button
        onClick={() => onChange(yyyyMmDd(addDays(new Date(date + "T12:00:00"), -1)))}
        className="p-1.5 rounded-lg hover:bg-[var(--lg-tint)] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] transition-all"
      >
        <ChevronLeft size={18} />
      </button>
      <span className="text-sm font-semibold text-[var(--lg-text-heading)] min-w-[140px] text-center">
        {displayDate}
      </span>
      <button
        onClick={() => onChange(yyyyMmDd(addDays(new Date(date + "T12:00:00"), 1)))}
        disabled={isToday}
        className="p-1.5 rounded-lg hover:bg-[var(--lg-tint)] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] transition-all disabled:opacity-20"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

function GameCard({ game }: { game: GameScore }) {
  const isLive = game.status === "Live";
  const isFinal = game.status === "Final";
  const isPreview = game.status === "Preview";

  const gameTime = new Date(game.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const statusText = isLive
    ? `${game.inningState || ''} ${game.inning || ''}`
    : isFinal
    ? game.detailedState || 'Final'
    : gameTime;

  const mlbUrl = `https://www.mlb.com/gameday/${game.gamePk}`;

  return (
    <a
      href={mlbUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-lg border p-2.5 min-w-[150px] flex-1 hover:border-[var(--lg-accent)]/40 transition-colors ${
      isLive ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-[var(--lg-border-subtle)] bg-[var(--lg-tint)]'
    }`}>
      {/* Status */}
      <div className={`text-[9px] font-bold uppercase tracking-wide mb-1.5 ${
        isLive ? 'text-emerald-400' : 'text-[var(--lg-text-muted)]'
      }`}>
        {isLive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />}
        {statusText}
      </div>
      {/* Away */}
      <div className="flex justify-between items-center mb-0.5">
        <span className="flex items-baseline gap-1.5">
          <span className={`text-xs font-bold ${!isPreview && game.away.score > game.home.score ? 'text-[var(--lg-text-heading)]' : 'text-[var(--lg-text-secondary)]'}`}>
            {game.away.abbr}
          </span>
          <span className="text-[9px] text-[var(--lg-text-muted)] tabular-nums">{game.away.wins}-{game.away.losses}</span>
        </span>
        {!isPreview && <span className="text-xs font-bold tabular-nums text-[var(--lg-text-primary)]">{game.away.score}</span>}
      </div>
      {/* Home */}
      <div className="flex justify-between items-center">
        <span className="flex items-baseline gap-1.5">
          <span className={`text-xs font-bold ${!isPreview && game.home.score > game.away.score ? 'text-[var(--lg-text-heading)]' : 'text-[var(--lg-text-secondary)]'}`}>
            {game.home.abbr}
          </span>
          <span className="text-[9px] text-[var(--lg-text-muted)] tabular-nums">{game.home.wins}-{game.home.losses}</span>
        </span>
        {!isPreview && <span className="text-xs font-bold tabular-nums text-[var(--lg-text-primary)]">{game.home.score}</span>}
      </div>
    </a>
  );
}

const TYPE_COLORS: Record<string, string> = {
  TR: 'bg-blue-500/10 text-blue-400',
  SC: 'bg-amber-500/10 text-amber-400',
  CU: 'bg-emerald-500/10 text-emerald-400',
  ASG: 'bg-emerald-500/10 text-emerald-400',
  OPT: 'bg-red-500/10 text-red-400',
  REL: 'bg-red-500/10 text-red-400',
  DFA: 'bg-red-500/10 text-red-400',
  FA: 'bg-purple-500/10 text-purple-400',
};

function TransactionRow({ tx }: { tx: MlbTransaction }) {
  const color = TYPE_COLORS[tx.typeCode] || 'bg-[var(--lg-tint)] text-[var(--lg-text-muted)]';
  return (
    <div className="flex items-start gap-2 py-2 border-b border-[var(--lg-border-subtle)] last:border-0">
      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${color}`}>
        {tx.typeCode || tx.type.slice(0, 3)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-[var(--lg-text-primary)] leading-relaxed">{tx.description}</div>
      </div>
      <span className="text-[10px] font-bold text-[var(--lg-text-muted)] shrink-0">{tx.teamAbbr}</span>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────

interface MyTeamInfo {
  name: string;
  id: number;
  budget: number;
  rosterCount: number;
}

interface LeagueDash {
  leagueName: string;
  season: number;
  teamCount: number;
  myTeam: MyTeamInfo | null;
}

export default function Home() {
  const { user, loading: authLoading, refresh } = useAuth();
  const { toast } = useToast();
  const { leagueId: currentLeagueId } = useLeague();
  const gating = useSeasonGating();

  // Date state
  const [date, setDate] = useState(() => yyyyMmDd(new Date()));

  // League dashboard
  const [dash, setDash] = useState<LeagueDash | null>(null);

  // MLB data
  const [games, setGames] = useState<GameScore[]>([]);
  const [loadingScores, setLoadingScores] = useState(true);

  // Real-Time Stats Today
  const [rosterStats, setRosterStats] = useState<{ date: string; teamName: string; players: any[] }>({ date: '', teamName: '', players: [] });
  const [rosterStatsLoading, setRosterStatsLoading] = useState(true);

  // Trade Rumors
  const [rumors, setRumors] = useState<{ title: string; link: string; pubDate: string; categories: string[] }[]>([]);
  const [rumorsLoading, setRumorsLoading] = useState(true);
  const [rumorsFilter, setRumorsFilter] = useState<'ALL' | 'NL' | 'AL'>('NL'); // Default NL for NL-only league
  const [rumorsTeamFilter, setRumorsTeamFilter] = useState<string>('ALL'); // specific MLB team
  const [rumorsRosterOnly, setRumorsRosterOnly] = useState(false); // only show news mentioning rostered players
  const [rumorsFantasyTeam, setRumorsFantasyTeam] = useState<string>('ALL'); // filter by fantasy team's players
  const [leagueStatsSource, setLeagueStatsSource] = useState<string>("NL");

  // All rostered players in the league for cross-referencing with trade rumors
  const [leagueRoster, setLeagueRoster] = useState<Map<string, string>>(new Map()); // lowercase name → fantasy team name

  // YouTube player videos
  const [playerVideos, setPlayerVideos] = useState<any[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);

  // Reddit baseball feed
  const [redditPosts, setRedditPosts] = useState<any[]>([]);
  const [redditLoading, setRedditLoading] = useState(true);

  // Derive list of fantasy teams from roster data
  const fantasyTeams = useMemo(() => {
    const teams = new Set<string>();
    for (const team of leagueRoster.values()) teams.add(team);
    return [...teams].sort();
  }, [leagueRoster]);

  // Invite code
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [hasTeam, setHasTeam] = useState<boolean | null>(null);

  // League Digest
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [digest, setDigest] = useState<any | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  // Auto-expand on Mondays (day 1), collapsed other days
  const [digestExpanded, setDigestExpanded] = useState(() => new Date().getDay() === 1);
  const [voting, setVoting] = useState(false);

  const handleVote = async (v: "yes" | "no") => {
    if (!currentLeagueId || voting) return;
    setVoting(true);
    try {
      const result = await fetchJsonApi<{ yes: number; no: number; myVote: string }>(`${API_BASE}/mlb/league-digest/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId: currentLeagueId, vote: v }),
      });
      setDigest((prev: any) => prev ? { ...prev, voteResults: result } : prev);
    } catch { toast("Vote failed — please try again", "error"); } finally { setVoting(false); }
  };

  // Check if user has a team + build dashboard
  useEffect(() => {
    if (!user || !currentLeagueId) { setHasTeam(null); setDash(null); return; }
    fetchJsonApi<{ league: { name: string; season: number; teams: Array<{ id: number; name: string; budget: number; ownerUserId?: number | null; ownerships?: Array<{ userId: number }> }> } }>(`${API_BASE}/leagues/${currentLeagueId}`)
      .then(res => {
        const league = res.league;
        const teams = league?.teams || [];
        const mine = findMyTeam(teams, Number(user.id));
        setHasTeam(!!mine);
        setDash({
          leagueName: league?.name || '',
          season: league?.season || new Date().getFullYear(),
          teamCount: teams.length,
          myTeam: mine ? { name: mine.name, id: mine.id, budget: mine.budget, rosterCount: 0 } : null,
        });
        // Default trade rumors filter to user's team
        if (mine) setRumorsFantasyTeam(mine.name);
      })
      .catch(() => { setHasTeam(null); setDash(null); });

    // Also fetch league rules to get stats_source for rumors filter
    fetchJsonApi<{ rules: Array<{ key: string; value: string }> }>(`${API_BASE}/leagues/${currentLeagueId}/rules`)
      .then(res => {
        const src = (res.rules || []).find(r => r.key === "stats_source");
        if (src?.value) {
          const mapped = src.value === "MLB" || src.value === "ALL" ? "ALL" : src.value.toUpperCase() as "NL" | "AL";
          setLeagueStatsSource(mapped);
          setRumorsFilter(mapped as any);
        }
      })
      .catch(() => {});
  }, [user, currentLeagueId]);

  // Fetch scores
  useEffect(() => {
    setLoadingScores(true);
    fetchJsonApi<{ games: GameScore[] }>(`${API_BASE}/mlb/scores?date=${date}`)
      .then(res => setGames(res.games || []))
      .catch(() => setGames([]))
      .finally(() => setLoadingScores(false));
  }, [date]);

  // Fetch Real-Time Stats Today + league roster names (for trade rumors cross-reference)
  useEffect(() => {
    if (!currentLeagueId) { setRosterStatsLoading(false); return; }
    setRosterStatsLoading(true);
    Promise.allSettled([
      fetchJsonApi<{ date: string; teamName: string; players: any[] }>(`${API_BASE}/mlb/roster-stats-today?leagueId=${currentLeagueId}`),
      fetchJsonApi<{ stats: any[] }>(`${API_BASE}/player-season-stats?leagueId=${currentLeagueId}`),
    ]).then(([statsRes, rosterRes]) => {
      if (statsRes.status === "fulfilled") setRosterStats(statsRes.value);
      if (rosterRes.status === "fulfilled") {
        const m = new Map<string, string>();
        const players = rosterRes.value?.stats || [];
        for (const p of players) {
          const name = (p.player_name || "").trim();
          const team = (p.ogba_team_name || "").trim();
          if (name && team) m.set(name.toLowerCase(), team);
        }
        setLeagueRoster(m);
      }
    }).finally(() => setRosterStatsLoading(false));
  }, [currentLeagueId]);

  // Auto-refresh roster stats every 2 minutes when games are live
  useEffect(() => {
    const hasLive = rosterStats.players.some(p => p.gameStatus === "In Progress" || p.gameStatus === "Live");
    if (!hasLive || !currentLeagueId) return;
    const interval = setInterval(() => {
      fetchJsonApi<{ date: string; teamName: string; players: any[] }>(`${API_BASE}/mlb/roster-stats-today?leagueId=${currentLeagueId}`)
        .then(data => setRosterStats(data))
        .catch(() => {});
    }, 120_000);
    return () => clearInterval(interval);
  }, [rosterStats.players, currentLeagueId]);

  // Fetch Trade Rumors
  useEffect(() => {
    setRumorsLoading(true);
    fetchJsonApi<{ items: any[] }>(`${API_BASE}/mlb/trade-rumors`)
      .then(res => setRumors(res.items || []))
      .catch(() => setRumors([]))
      .finally(() => setRumorsLoading(false));
  }, []);

  // Fetch YouTube player videos
  useEffect(() => {
    if (!currentLeagueId) { setVideosLoading(false); return; }
    setVideosLoading(true);
    fetchJsonApi<{ videos: any[] }>(`${API_BASE}/mlb/player-videos?leagueId=${currentLeagueId}`)
      .then(res => setPlayerVideos(res.videos || []))
      .catch(() => setPlayerVideos([]))
      .finally(() => setVideosLoading(false));
  }, [currentLeagueId]);

  // Fetch Reddit baseball feed
  useEffect(() => {
    if (!currentLeagueId) { setRedditLoading(false); return; }
    setRedditLoading(true);
    fetchJsonApi<{ posts: any[] }>(`${API_BASE}/mlb/reddit-baseball?leagueId=${currentLeagueId}`)
      .then(res => setRedditPosts(res.posts || []))
      .catch(() => setRedditPosts([]))
      .finally(() => setRedditLoading(false));
  }, [currentLeagueId]);

  // Auto-refresh scores when live games
  useEffect(() => {
    const hasLive = games.some(g => g.status === 'Live');
    if (!hasLive) return;
    const interval = setInterval(() => {
      fetchJsonApi<{ games: GameScore[] }>(`${API_BASE}/mlb/scores?date=${date}`)
        .then(res => setGames(res.games || []))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, [games, date]);

  // Auto-load league digest (once per week, persisted)
  useEffect(() => {
    if (!currentLeagueId || digest || digestLoading) return;
    let ok = true;
    setDigestLoading(true);
    fetchJsonApi<any>(`${API_BASE}/mlb/league-digest?leagueId=${currentLeagueId}`)
      .then(data => { if (ok) setDigest(data); })
      .catch(() => {})
      .finally(() => { if (ok) setDigestLoading(false); });
    return () => { ok = false; };
  }, [currentLeagueId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Invite code handler
  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    setJoining(true);
    try {
      await joinLeague(inviteCode.trim());
      toast("Joined league!", "success");
      setInviteCode("");
      await refresh();
      setHasTeam(true);
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Failed to join", "error");
    } finally {
      setJoining(false);
    }
  };

  if (!user && !authLoading) return null;
  if (!user) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:px-6 md:py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-semibold text-[var(--lg-text-heading)]">
          MLB Today
        </h1>
        <p className="text-xs text-[var(--lg-text-muted)] mt-0.5">
          Welcome, <span className="text-[var(--lg-accent)] font-semibold">{user.name || user.email}</span>
        </p>
      </div>

      {/* Invite code banner + Create League CTA (only if no team) */}
      {hasTeam === false && (
        <div className="rounded-xl border border-[var(--lg-accent)]/20 bg-[var(--lg-accent)]/5 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="flex-1 text-sm text-[var(--lg-text-primary)]">
              <strong>Join a League</strong> — enter your invite code to get started
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
                placeholder="Invite code"
                maxLength={32}
                className="w-32 px-3 py-1.5 text-sm font-mono text-center rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-secondary)] text-[var(--lg-text-primary)] outline-none focus:ring-1 focus:ring-[var(--lg-accent)]"
              />
              <button
                onClick={handleJoin}
                disabled={joining || !inviteCode.trim()}
                className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-[var(--lg-accent)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {joining ? "..." : "Join"}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-[var(--lg-accent)]/10">
            <span className="text-xs text-[var(--lg-text-muted)]">Or</span>
            <Link to="/create-league" className="text-xs font-semibold text-[var(--lg-accent)] hover:underline">
              Create a New League →
            </Link>
          </div>
        </div>
      )}

      {/* Real-Time Stats Today */}
      {!rosterStatsLoading && rosterStats.players.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)]">
              <Users size={12} className="inline -mt-0.5 mr-1 text-[var(--lg-accent)]" />
              Real-Time Stats · {rosterStats.teamName}
            </h2>
            <span className="text-[10px] text-[var(--lg-text-muted)]">
              {new Date(rosterStats.date + "T12:00:00").toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>

          {/* Side-by-side: Hitters left, Pitchers right (stacked on mobile) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Hitters */}
            {(() => {
              const hitters = rosterStats.players.filter((p: any) => !p.isPitcher);
              if (hitters.length === 0) return null;
              return (
                <div className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[9px] font-bold uppercase text-[var(--lg-text-muted)] border-b border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)]/50">
                        <th className="px-1.5 py-1 text-left w-7">POS</th>
                        <th className="px-1 py-1 text-left">HITTER</th>
                        <th className="px-1 py-1 text-center w-6">AB</th>
                        <th className="px-1 py-1 text-center w-5">H</th>
                        <th className="px-1 py-1 text-center w-5">R</th>
                        <th className="px-1 py-1 text-center w-5">HR</th>
                        <th className="px-1 py-1 text-center w-6">RBI</th>
                        <th className="px-1 py-1 text-center w-5">SB</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--lg-border-faint)]">
                      {hitters.map((p: any, idx: number) => {
                        const h = p.hitting;
                        const hasStats = !!h;
                        const isLive = p.gameStatus === "In Progress";
                        const dim = 'text-[var(--lg-text-muted)] opacity-30';
                        return (
                          <tr key={`h-${idx}`} className={isLive ? 'bg-emerald-500/5' : ''}>
                            <td className="px-1.5 py-1"><span className="text-[9px] font-mono font-semibold text-[var(--lg-accent)]">{p.position}</span></td>
                            <td className="px-1 py-1 truncate max-w-[120px]">
                              <span className="font-medium text-[var(--lg-text-primary)]">{p.playerName}</span>
                              {!p.gameToday && <span className="ml-1 text-[8px] text-[var(--lg-text-muted)] opacity-50">off</span>}
                              {isLive && <span className="ml-1 text-[8px] text-emerald-400 animate-pulse font-bold">LIVE</span>}
                            </td>
                            <td className={`px-1 py-1 text-center tabular-nums ${hasStats ? '' : dim}`}>{h?.AB ?? '—'}</td>
                            <td className={`px-1 py-1 text-center tabular-nums ${h?.H > 0 ? 'text-emerald-400 font-semibold' : hasStats ? '' : dim}`}>{h?.H ?? '—'}</td>
                            <td className={`px-1 py-1 text-center tabular-nums ${h?.R > 0 ? 'text-blue-400 font-semibold' : hasStats ? '' : dim}`}>{h?.R ?? '—'}</td>
                            <td className={`px-1 py-1 text-center tabular-nums ${h?.HR > 0 ? 'text-amber-400 font-semibold' : hasStats ? '' : dim}`}>{h?.HR ?? '—'}</td>
                            <td className={`px-1 py-1 text-center tabular-nums ${h?.RBI > 0 ? 'text-purple-400 font-semibold' : hasStats ? '' : dim}`}>{h?.RBI ?? '—'}</td>
                            <td className={`px-1 py-1 text-center tabular-nums ${h?.SB > 0 ? 'text-cyan-400 font-semibold' : hasStats ? '' : dim}`}>{h?.SB ?? '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* Pitchers */}
            {(() => {
              const pitchers = rosterStats.players.filter((p: any) => p.isPitcher);
              if (pitchers.length === 0) return null;
              return (
                <div className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[9px] font-bold uppercase text-[var(--lg-text-muted)] border-b border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)]/50">
                        <th className="px-1.5 py-1 text-left w-7">POS</th>
                        <th className="px-1 py-1 text-left">PITCHER</th>
                        <th className="px-1 py-1 text-center w-6">IP</th>
                        <th className="px-1 py-1 text-center w-5">H</th>
                        <th className="px-1 py-1 text-center w-5">ER</th>
                        <th className="px-1 py-1 text-center w-5">K</th>
                        <th className="px-1 py-1 text-center w-5">BB</th>
                        <th className="px-1 py-1 text-center w-6">DEC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--lg-border-faint)]">
                      {pitchers.map((p: any, idx: number) => {
                        const s = p.pitching;
                        const hasStats = !!s;
                        const isLive = p.gameStatus === "In Progress";
                        const wl = s ? (s.W > 0 ? 'W' : s.L > 0 ? 'L' : s.SV > 0 ? 'SV' : '—') : '—';
                        const dim = 'text-[var(--lg-text-muted)] opacity-30';
                        return (
                          <tr key={`p-${idx}`} className={isLive ? 'bg-emerald-500/5' : ''}>
                            <td className="px-1.5 py-1"><span className="text-[9px] font-mono font-semibold text-[var(--lg-accent)]">P</span></td>
                            <td className="px-1 py-1 truncate max-w-[120px]">
                              <span className="font-medium text-[var(--lg-text-primary)]">{p.playerName}</span>
                              {!p.gameToday && <span className="ml-1 text-[8px] text-[var(--lg-text-muted)] opacity-50">off</span>}
                              {isLive && <span className="ml-1 text-[8px] text-emerald-400 animate-pulse font-bold">LIVE</span>}
                            </td>
                            <td className={`px-1 py-1 text-center tabular-nums ${hasStats ? '' : dim}`}>{s?.IP ?? '—'}</td>
                            <td className={`px-1 py-1 text-center tabular-nums ${hasStats ? '' : dim}`}>{s?.H ?? '—'}</td>
                            <td className={`px-1 py-1 text-center tabular-nums ${s?.ER > 0 ? 'text-red-400' : hasStats ? '' : dim}`}>{s?.ER ?? '—'}</td>
                            <td className={`px-1 py-1 text-center tabular-nums ${s?.K > 0 ? 'text-emerald-400 font-semibold' : hasStats ? '' : dim}`}>{s?.K ?? '—'}</td>
                            <td className={`px-1 py-1 text-center tabular-nums ${hasStats ? '' : dim}`}>{s?.BB ?? '—'}</td>
                            <td className={`px-1 py-1 text-center tabular-nums ${wl === 'W' || wl === 'SV' ? 'text-emerald-400 font-semibold' : wl === 'L' ? 'text-red-400' : hasStats ? '' : dim}`}>{wl}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Weekly League Digest */}
      {digestLoading && !digest && (
        <div className="flex items-center justify-center gap-2 py-4 text-xs text-[var(--lg-text-muted)] animate-pulse">
          <Sparkles size={14} className="text-blue-400" />
          Loading weekly digest...
        </div>
      )}
      {digest && (
        <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] overflow-hidden">
          {/* Header toggle */}
          <button
            onClick={() => setDigestExpanded(prev => !prev)}
            className="w-full flex items-center justify-between p-4 md:p-5 hover:bg-[var(--lg-bg-card)]/30 transition-colors text-left"
          >
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <Sparkles size={14} className="text-[var(--lg-accent)] flex-shrink-0" />
              <span className="text-xs font-semibold uppercase text-[var(--lg-text-muted)]">Weekly Digest</span>
              {digest.weekKey && (
                <span className="text-[10px] text-[var(--lg-text-muted)] opacity-60">{digest.weekKey}</span>
              )}
              {digest.generatedAt && (
                <span className="text-[10px] text-[var(--lg-text-muted)] opacity-60">
                  · {new Date(digest.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
            </div>
            {digestExpanded ? <ChevronUp size={14} className="text-[var(--lg-text-muted)]" /> : <ChevronDown size={14} className="text-[var(--lg-text-muted)]" />}
          </button>

          {digestExpanded && (
            <div className="px-4 pb-4 md:px-5 md:pb-5 space-y-4">
              {/* Overview */}
              <p className="text-sm text-[var(--lg-text-secondary)] leading-relaxed">{digest.overview}</p>

              {/* Hot & Cold */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {digest.hotTeam && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                    <TrendingUp size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                    <div className="text-[11px] min-w-0">
                      <span className="font-bold text-emerald-500">Hot: </span>
                      <span className="font-medium text-[var(--lg-text-primary)]">{digest.hotTeam.name}</span>
                      <span className="text-[var(--lg-text-muted)]"> — {digest.hotTeam.reason}</span>
                    </div>
                  </div>
                )}
                {digest.coldTeam && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/5">
                    <TrendingDown size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="text-[11px] min-w-0">
                      <span className="font-bold text-red-400">Cold: </span>
                      <span className="font-medium text-[var(--lg-text-primary)]">{digest.coldTeam.name}</span>
                      <span className="text-[var(--lg-text-muted)]"> — {digest.coldTeam.reason}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Team Grades */}
              {digest.teamGrades && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--lg-text-muted)] mb-2">Team Grades</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {digest.teamGrades.map((tg: any) => (
                      <button
                        key={tg.teamName}
                        onClick={(e) => {
                          const el = e.currentTarget.querySelector('[data-trend]') as HTMLElement;
                          if (el) el.classList.toggle('line-clamp-1');
                        }}
                        className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[var(--lg-bg-card)] border border-[var(--lg-border-faint)] text-left hover:bg-[var(--lg-tint)] transition-colors w-full"
                      >
                        <span className={`text-sm font-black tabular-nums w-7 text-center flex-shrink-0 mt-0.5 ${gradeColor(tg.grade || "")}`}>{tg.grade}</span>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[var(--lg-text-primary)]">{tg.teamName}</div>
                          <div data-trend className="text-[10px] text-[var(--lg-text-muted)] leading-relaxed line-clamp-1">{tg.trend}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Proposed Trade */}
              {digest.proposedTrade && (
                <div className="rounded-xl border border-[var(--lg-accent)]/20 bg-[var(--lg-accent)]/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowLeftRight size={14} className="text-[var(--lg-accent)]" />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--lg-accent)]">
                      Trade of the Week — {digest.proposedTrade.style}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-[var(--lg-text-primary)] mb-1">{digest.proposedTrade.title}</div>
                  <p className="text-xs text-[var(--lg-text-secondary)] mb-3">{digest.proposedTrade.description}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                    <div className="p-2.5 rounded-lg bg-[var(--lg-bg-card)] border border-[var(--lg-border-faint)]">
                      <div className="text-[10px] font-bold uppercase text-[var(--lg-text-muted)] mb-1">{digest.proposedTrade.teamA} sends</div>
                      <div className="text-xs text-[var(--lg-text-primary)]">{digest.proposedTrade.teamAGives}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[var(--lg-bg-card)] border border-[var(--lg-border-faint)]">
                      <div className="text-[10px] font-bold uppercase text-[var(--lg-text-muted)] mb-1">{digest.proposedTrade.teamB} sends</div>
                      <div className="text-xs text-[var(--lg-text-primary)]">{digest.proposedTrade.teamBGives}</div>
                    </div>
                  </div>
                  <p className="text-[11px] text-[var(--lg-text-secondary)] leading-relaxed italic">{digest.proposedTrade.reasoning}</p>

                  {/* Poll */}
                  {(() => {
                    const myVote = digest.voteResults?.myVote;
                    return (
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[var(--lg-accent)]/10">
                        <span className="text-[10px] font-bold uppercase text-[var(--lg-text-muted)]">Would you make this trade?</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleVote("yes")}
                            disabled={voting || myVote === "yes"}
                            className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                              myVote === "yes"
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : "bg-[var(--lg-bg-card)] text-[var(--lg-text-muted)] border border-[var(--lg-border-faint)] hover:border-emerald-500/30 hover:text-emerald-400"
                            }`}
                          >
                            Yes {digest.voteResults?.yes > 0 && `(${digest.voteResults.yes})`}
                          </button>
                          <button
                            onClick={() => handleVote("no")}
                            disabled={voting || myVote === "no"}
                            className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                              myVote === "no"
                                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                : "bg-[var(--lg-bg-card)] text-[var(--lg-text-muted)] border border-[var(--lg-border-faint)] hover:border-red-500/30 hover:text-red-400"
                            }`}
                          >
                            No {digest.voteResults?.no > 0 && `(${digest.voteResults.no})`}
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* AI Attribution */}
              <div className="text-center text-[10px] text-[var(--lg-text-muted)] opacity-50 mt-2">
                Powered by <strong>Google Gemini</strong> & <strong>Anthropic Claude</strong>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Date navigator */}
      <DateNavigator date={date} onChange={setDate} />

      {/* Scores */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)] mb-2">
          Scores {games.some(g => g.status === 'Live') && <span className="text-emerald-400 ml-1 animate-pulse">Live</span>}
        </h2>
        {loadingScores ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {[1,2,3,4].map(i => <div key={i} className="h-24 w-[150px] rounded-lg bg-[var(--lg-tint)] animate-pulse shrink-0" />)}
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-8 text-xs text-[var(--lg-text-muted)] opacity-50">No games scheduled</div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {games.map(g => <GameCard key={g.gamePk} game={g} />)}
          </div>
        )}
      </div>

      {/* MLB Trade Rumors */}
      <div>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)]">
            <Sparkles size={12} className="inline -mt-0.5 mr-1 text-orange-400" />
            MLB Trade Rumors
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Fantasy team dropdown */}
            <select
              value={rumorsFantasyTeam}
              onChange={(e) => { setRumorsFantasyTeam(e.target.value); setRumorsRosterOnly(e.target.value !== 'ALL'); }}
              className="bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded px-1.5 py-0.5 text-[10px] font-semibold text-[var(--lg-text-muted)] outline-none cursor-pointer"
            >
              <option value="ALL">All League News</option>
              <option value="MY_ROSTER">My Roster</option>
              {fantasyTeams.map(t => <option key={t} value={t}>{t}</option>)}
              <option value="FREE_AGENTS">Free Agents</option>
            </select>
            {/* MLB Team dropdown */}
            <select
              value={rumorsTeamFilter}
              onChange={(e) => setRumorsTeamFilter(e.target.value)}
              className="bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded px-1.5 py-0.5 text-[10px] font-semibold text-[var(--lg-text-muted)] outline-none cursor-pointer"
            >
              <option value="ALL">All Teams</option>
              <optgroup label="NL">
                {Object.entries(TEAM_NAME_TO_ABBR).filter(([, abbr]) => NL_TEAMS.has(abbr)).sort(([a], [b]) => a.localeCompare(b)).map(([name]) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </optgroup>
              <optgroup label="AL">
                {Object.entries(TEAM_NAME_TO_ABBR).filter(([, abbr]) => AL_TEAMS.has(abbr)).sort(([a], [b]) => a.localeCompare(b)).map(([name]) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </optgroup>
            </select>
            {/* NL/AL toggle */}
            <div className="flex bg-[var(--lg-tint)] rounded-md p-0.5 border border-[var(--lg-border-subtle)]">
              {(['ALL', 'NL', 'AL'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => { setRumorsFilter(f); setRumorsTeamFilter('ALL'); }}
                  className={`px-2.5 py-0.5 text-[10px] font-semibold uppercase rounded transition-all ${
                    rumorsFilter === f && rumorsTeamFilter === 'ALL' ? 'bg-[var(--lg-accent)] text-white' : 'text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>
        {rumorsLoading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-8 rounded bg-[var(--lg-tint)] animate-pulse" />)}
          </div>
        ) : (() => {
          // Step 1: Pre-compute roster matches for each rumor
          const rumorsWithMatches = rumors.map(r => {
            const matched: { name: string; fantasyTeam: string }[] = [];
            for (const cat of r.categories) {
              const fantasyTeam = leagueRoster.get(cat.toLowerCase());
              if (fantasyTeam) matched.push({ name: cat, fantasyTeam });
            }
            return { ...r, matchedPlayers: matched };
          });

          // Step 2: Apply filters
          let filtered = rumorsWithMatches;

          // Fantasy team filter: filter by specific fantasy team's players, or all rostered, or free agents
          if (rumorsFantasyTeam === 'FREE_AGENTS') {
            // Show items with player tags NOT on any league roster
            filtered = filtered.filter(r => {
              return r.categories.some(cat => {
                const isPlayer = !TEAM_NAME_TO_ABBR[cat] && !['Notes', 'Transactions', 'Newsstand', 'Front Office Originals', 'MLBTR Originals', 'MLBTR Polls', 'The Opener', 'Front Office Fantasy'].includes(cat);
                return isPlayer && !leagueRoster.has(cat.toLowerCase());
              });
            });
          } else if (rumorsFantasyTeam !== 'ALL' && rumorsFantasyTeam !== 'MY_ROSTER') {
            // Filter by specific fantasy team
            filtered = filtered.filter(r => r.matchedPlayers.some(mp => mp.fantasyTeam === rumorsFantasyTeam));
          } else if (rumorsFantasyTeam === 'MY_ROSTER' || rumorsRosterOnly) {
            filtered = filtered.filter(r => r.matchedPlayers.length > 0);
          } else {
            // Team dropdown filter: filter by specific MLB team name in categories
            if (rumorsTeamFilter !== 'ALL') {
              filtered = filtered.filter(r => r.categories.some(cat => cat === rumorsTeamFilter));
            }
          }

          // NL/AL league filter (only applies when no specific team is selected and not roster-only)
          if (!rumorsRosterOnly && rumorsTeamFilter === 'ALL' && rumorsFilter !== 'ALL') {
            filtered = filtered.filter(r => {
              return r.categories.some(cat => {
                const abbr = TEAM_NAME_TO_ABBR[cat];
                if (!abbr) return false;
                return rumorsFilter === 'NL' ? NL_TEAMS.has(abbr) : AL_TEAMS.has(abbr);
              }) || r.categories.length === 0;
            });
          }
          return filtered.length === 0 ? (
            <div className="text-center py-8 text-xs text-[var(--lg-text-muted)] opacity-50">
              {rumorsRosterOnly ? "No trade rumors mentioning your league's rostered players" : `No ${rumorsTeamFilter !== 'ALL' ? rumorsTeamFilter : rumorsFilter} trade rumors available`}
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] divide-y divide-[var(--lg-border-faint)] max-h-[400px] overflow-y-auto">
              {filtered.map((r, i) => {
                const ago = r.pubDate ? (() => {
                  const ms = Date.now() - new Date(r.pubDate).getTime();
                  const hours = Math.floor(ms / 3_600_000);
                  if (hours < 1) return "just now";
                  if (hours < 24) return `${hours}h ago`;
                  return `${Math.floor(hours / 24)}d ago`;
                })() : "";

                const { matchedPlayers } = r;

                return (
                  <a
                    key={i}
                    href={r.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-start gap-2 px-3 py-2.5 hover:bg-[var(--lg-tint-hover)] transition-colors ${
                      matchedPlayers.length > 0 ? 'border-l-2 border-l-[var(--lg-accent)]' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-[var(--lg-text-primary)] leading-relaxed">{r.title}</div>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {/* Show rostered player matches first with accent highlight */}
                        {matchedPlayers.map((mp, mi) => (
                          <span key={`match-${mi}`} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--lg-accent)]/20 text-[var(--lg-accent)] font-semibold border border-[var(--lg-accent)]/30">
                            {mp.name} · {mp.fantasyTeam}
                          </span>
                        ))}
                        {/* Show team tags */}
                        {r.categories.filter(cat => !leagueRoster.has(cat.toLowerCase())).slice(0, 3).map((cat, ci) => (
                          <span key={ci} className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 font-medium">{cat}</span>
                        ))}
                      </div>
                    </div>
                    <span className="text-[10px] text-[var(--lg-text-muted)] shrink-0 mt-0.5">{ago}</span>
                  </a>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* YouTube Player Highlights */}
      {!videosLoading && playerVideos.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)] mb-2">
            <TrendingUp size={12} className="inline -mt-0.5 mr-1 text-red-500" />
            Player Highlights
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {playerVideos.map((v: any, i: number) => (
              <a
                key={`yt-${i}`}
                href={`https://www.youtube.com/watch?v=${v.videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] overflow-hidden hover:border-[var(--lg-accent)]/30 transition-colors group"
              >
                <div className="relative aspect-video bg-black">
                  <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-red-600/90 flex items-center justify-center">
                      <div className="w-0 h-0 border-l-[10px] border-l-white border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent ml-1" />
                    </div>
                  </div>
                </div>
                <div className="p-2">
                  <div className="text-[11px] font-medium text-[var(--lg-text-primary)] leading-snug line-clamp-2">{v.title}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {v.matchedPlayer && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--lg-accent)]/20 text-[var(--lg-accent)] font-semibold border border-[var(--lg-accent)]/30">
                        {v.matchedPlayer}
                      </span>
                    )}
                    <span className="text-[9px] text-[var(--lg-text-muted)]">{v.channelTitle || v.source}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Reddit Baseball Feed */}
      {!redditLoading && redditPosts.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)] mb-2">
            <ArrowLeftRight size={12} className="inline -mt-0.5 mr-1 text-orange-500" />
            r/baseball
          </h2>
          <div className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] divide-y divide-[var(--lg-border-faint)] max-h-[350px] overflow-y-auto">
            {redditPosts.map((post: any, i: number) => {
              const ago = post.createdUtc ? (() => {
                const ms = Date.now() - post.createdUtc * 1000;
                const hours = Math.floor(ms / 3_600_000);
                if (hours < 1) return "just now";
                if (hours < 24) return `${hours}h ago`;
                return `${Math.floor(hours / 24)}d ago`;
              })() : "";
              return (
                <a
                  key={`rd-${i}`}
                  href={post.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-start gap-2 px-3 py-2 hover:bg-[var(--lg-tint-hover)] transition-colors ${
                    post.matchedPlayers?.length > 0 ? 'border-l-2 border-l-[var(--lg-accent)]' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-[var(--lg-text-primary)] leading-relaxed">{post.title}</div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {(post.matchedPlayers || []).map((mp: any, mi: number) => (
                        <span key={`rmp-${mi}`} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--lg-accent)]/20 text-[var(--lg-accent)] font-semibold border border-[var(--lg-accent)]/30">
                          {mp.name} · {mp.fantasyTeam}
                        </span>
                      ))}
                      {post.flair && <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 font-medium">{post.flair}</span>}
                      <span className="text-[9px] text-[var(--lg-text-muted)]">{post.score} pts · {post.numComments} comments</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-[var(--lg-text-muted)] shrink-0 mt-0.5">{ago}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
