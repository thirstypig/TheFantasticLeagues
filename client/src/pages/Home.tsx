
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { fetchJsonApi, API_BASE, yyyyMmDd, addDays } from "../api/base";
import { ChevronLeft, ChevronRight, Gavel, Trophy, Users, Calendar, Sparkles, ChevronDown, ChevronUp, ArrowLeftRight, TrendingUp, TrendingDown } from "lucide-react";
import { joinLeague } from "../features/leagues/api";
import { useToast } from "../contexts/ToastContext";
import { useLeague, findMyTeam } from "../contexts/LeagueContext";
import { gradeColor } from "../lib/sportConfig";
import { useSeasonGating } from "../hooks/useSeasonGating";
import { formatLocalDate, formatLocalTime, formatEventTime, safeParseDate } from "../lib/timeUtils";
import type { DigestResponse, PowerRanking, CategoryMover, TeamGrade } from "./home/types";
import DeadlineWarnings from "../components/shared/DeadlineWarnings";
import RosterAlertAccordion from "../components/shared/RosterAlertAccordion";

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
  const displayDate = isToday ? "Today" : formatLocalDate(safeParseDate(date), { weekday: 'short', month: 'short', day: 'numeric' });

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

  const gameTime = formatLocalTime(game.startTime).replace(/\s[A-Z]{2,4}$/, ''); // strip timezone abbreviation for compact display

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

  // YouTube video modal + pagination
  const [activeVideo, setActiveVideo] = useState<{ videoId: string; title: string } | null>(null);
  const [ytPage, setYtPage] = useState(0);
  const YT_PER_PAGE = 6; // 2 rows of 3

  // News feeds — shared filter + tab
  const [newsFilter, setNewsFilter] = useState<string>('ALL'); // "ALL" | "MY_ROSTER" | team name | "FREE_AGENTS"
  const [newsTab, setNewsTab] = useState<'rumors' | 'reddit' | 'yahoo' | 'mlb' | 'espn'>('rumors');

  // Trade Rumors
  const [rumors, setRumors] = useState<{ title: string; link: string; pubDate: string; categories: string[] }[]>([]);
  const [rumorsLoading, setRumorsLoading] = useState(true);

  // All rostered players in the league for cross-referencing with trade rumors
  const [leagueRoster, setLeagueRoster] = useState<Map<string, string>>(new Map()); // lowercase name → fantasy team name

  // YouTube player videos
  const [playerVideos, setPlayerVideos] = useState<any[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);

  // Reddit baseball feed
  const [redditPosts, setRedditPosts] = useState<any[]>([]);
  const [redditLoading, setRedditLoading] = useState(true);

  // Yahoo Sports MLB feed
  const [yahooArticles, setYahooArticles] = useState<any[]>([]);
  const [yahooLoading, setYahooLoading] = useState(true);

  // MLB.com news feed
  const [mlbArticles, setMlbArticles] = useState<any[]>([]);
  const [mlbLoading, setMlbLoading] = useState(true);

  // ESPN MLB news feed
  const [espnArticles, setEspnArticles] = useState<any[]>([]);
  const [espnLoading, setEspnLoading] = useState(true);

  // Roster status alerts (IL, minors)
  const [rosterAlerts, setRosterAlerts] = useState<any[]>([]);

  // Depth Charts
  const [depthTeamId, setDepthTeamId] = useState(119); // Default LAD
  const [depthChart, setDepthChart] = useState<{ position: string; label: string; players: { name: string; mlbId: number; status: string; isInjured: boolean }[] }[]>([]);
  const [depthLoading, setDepthLoading] = useState(false);
  const [depthPlayerCount, setDepthPlayerCount] = useState(0);
  const [depthCachedAt, setDepthCachedAt] = useState<string | null>(null);

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
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  // Auto-expand on Mondays (day 1), collapsed other days
  const [digestExpanded, setDigestExpanded] = useState(() => new Date().getDay() === 1);
  const [voting, setVoting] = useState(false);
  // Week tabs
  const [digestWeeks, setDigestWeeks] = useState<{ weekKey: string; generatedAt: string | null; label: string }[]>([]);
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);
  const [currentWeekKey, setCurrentWeekKey] = useState<string | null>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  const handleVote = async (v: "yes" | "no") => {
    if (!currentLeagueId || voting) return;
    setVoting(true);
    try {
      const result = await fetchJsonApi<{ yes: number; no: number; myVote: string }>(`${API_BASE}/mlb/league-digest/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId: currentLeagueId, vote: v }),
      });
      setDigest(prev => prev ? { ...prev, voteResults: result } : prev);
    } catch { toast("Vote failed — please try again", "error"); } finally { setVoting(false); }
  };

  // Check if user has a team + build dashboard
  useEffect(() => {
    if (!user || !currentLeagueId) { setHasTeam(null); setDash(null); return; }
    let ok = true;
    fetchJsonApi<{ league: { name: string; season: number; teams: Array<{ id: number; name: string; budget: number; ownerUserId?: number | null; ownerships?: Array<{ userId: number }> }> } }>(`${API_BASE}/leagues/${currentLeagueId}`)
      .then(res => {
        if (!ok) return;
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
      })
      .catch(() => { if (ok) { setHasTeam(null); setDash(null); } });
    return () => { ok = false; };
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
    let ok = true;
    setRosterStatsLoading(true);
    Promise.allSettled([
      fetchJsonApi<{ date: string; teamName: string; players: any[] }>(`${API_BASE}/mlb/roster-stats-today?leagueId=${currentLeagueId}`),
      fetchJsonApi<{ stats: any[] }>(`${API_BASE}/player-season-stats?leagueId=${currentLeagueId}`),
    ]).then(([statsRes, rosterRes]) => {
      if (!ok) return;
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
    }).finally(() => { if (ok) setRosterStatsLoading(false); });
    return () => { ok = false; };
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
    let ok = true;
    setVideosLoading(true);
    fetchJsonApi<{ videos: any[] }>(`${API_BASE}/mlb/player-videos?leagueId=${currentLeagueId}`)
      .then(res => { if (ok) setPlayerVideos(res.videos || []); })
      .catch(() => { if (ok) setPlayerVideos([]); })
      .finally(() => { if (ok) setVideosLoading(false); });
    return () => { ok = false; };
  }, [currentLeagueId]);

  // Fetch Reddit baseball feed
  useEffect(() => {
    if (!currentLeagueId) { setRedditLoading(false); return; }
    let ok = true;
    setRedditLoading(true);
    fetchJsonApi<{ posts: any[] }>(`${API_BASE}/mlb/reddit-baseball?leagueId=${currentLeagueId}`)
      .then(res => { if (ok) setRedditPosts(res.posts || []); })
      .catch(() => { if (ok) setRedditPosts([]); })
      .finally(() => { if (ok) setRedditLoading(false); });
    return () => { ok = false; };
  }, [currentLeagueId]);

  // Fetch Yahoo Sports, MLB.com, ESPN feeds in parallel
  useEffect(() => {
    setYahooLoading(true); setMlbLoading(true); setEspnLoading(true);
    Promise.allSettled([
      fetchJsonApi<{ articles: any[] }>(`${API_BASE}/mlb/yahoo-sports`),
      fetchJsonApi<{ articles: any[] }>(`${API_BASE}/mlb/mlb-news`),
      fetchJsonApi<{ articles: any[] }>(`${API_BASE}/mlb/espn-news`),
    ]).then(([yahoo, mlb, espn]) => {
      setYahooArticles(yahoo.status === "fulfilled" ? yahoo.value.articles || [] : []);
      setMlbArticles(mlb.status === "fulfilled" ? mlb.value.articles || [] : []);
      setEspnArticles(espn.status === "fulfilled" ? espn.value.articles || [] : []);
      setYahooLoading(false); setMlbLoading(false); setEspnLoading(false);
    });
  }, []);

  // Fetch roster status alerts (IL, minors)
  useEffect(() => {
    if (!currentLeagueId) return;
    let ok = true;
    fetchJsonApi<{ players: any[] }>(`${API_BASE}/mlb/roster-status?leagueId=${currentLeagueId}`)
      .then(res => { if (ok) setRosterAlerts((res.players || []).filter((p: any) => p.isInjured || p.isMinors)); })
      .catch(() => { if (ok) setRosterAlerts([]); });
    return () => { ok = false; };
  }, [currentLeagueId]);

  // Fetch depth chart when team selection changes
  useEffect(() => {
    if (!depthTeamId) return;
    let ok = true;
    setDepthLoading(true);
    fetchJsonApi<{ positions: typeof depthChart; playerCount: number; cachedAt: string }>(`${API_BASE}/mlb/depth-chart?teamId=${depthTeamId}`)
      .then(res => {
        if (!ok) return;
        setDepthChart(res.positions || []);
        setDepthPlayerCount(res.playerCount || 0);
        setDepthCachedAt(res.cachedAt || null);
      })
      .catch(() => { if (ok) setDepthChart([]); })
      .finally(() => { if (ok) setDepthLoading(false); });
    return () => { ok = false; };
  }, [depthTeamId]);

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

  // Load digest weeks index + current week digest
  useEffect(() => {
    if (!currentLeagueId) return;
    let ok = true;
    // Fetch weeks list
    fetchJsonApi<{ weeks: { weekKey: string; generatedAt: string | null; label: string }[]; currentWeekKey: string }>(
      `${API_BASE}/mlb/league-digest/weeks?leagueId=${currentLeagueId}`
    ).then(res => {
      if (!ok) return;
      setDigestWeeks(res.weeks);
      setCurrentWeekKey(res.currentWeekKey);
      setSelectedWeekKey(res.currentWeekKey);
    }).catch(() => {});
    // Fetch current week's digest
    setDigestLoading(true);
    fetchJsonApi<DigestResponse>(`${API_BASE}/mlb/league-digest?leagueId=${currentLeagueId}`)
      .then(data => { if (ok) setDigest(data); })
      .catch(() => {})
      .finally(() => { if (ok) setDigestLoading(false); });
    return () => { ok = false; };
  }, [currentLeagueId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch digest when user switches week tab
  const handleWeekSelect = (weekKey: string) => {
    if (!currentLeagueId || weekKey === selectedWeekKey) return;
    setSelectedWeekKey(weekKey);
    setDigest(null);
    setDigestLoading(true);
    fetchJsonApi<DigestResponse>(`${API_BASE}/mlb/league-digest?leagueId=${currentLeagueId}&weekKey=${weekKey}`)
      .then(data => setDigest(data))
      .catch(() => setDigest(null))
      .finally(() => setDigestLoading(false));
  };

  // Auto-scroll to active tab when weeks load
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [digestWeeks, selectedWeekKey]);

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
          Dashboard
        </h1>
        <p className="text-xs text-[var(--lg-text-muted)] mt-0.5">
          {dash ? (
            <>{dash.leagueName} · {dash.season}{dash.myTeam && <> · <span className="text-[var(--lg-accent)] font-semibold">{dash.myTeam.name}</span></>}</>
          ) : (
            <>Welcome, <span className="text-[var(--lg-accent)] font-semibold">{user.name || user.email}</span></>
          )}
        </p>
      </div>

      {/* Section navigation */}
      <nav className="flex gap-2 overflow-x-auto scrollbar-hide pb-1" style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        {[
          { href: '#stats', label: 'Stats' },
          { href: '#digest', label: 'Digest' },
          { href: '#scores', label: 'Scores' },
          { href: '#news', label: 'News' },
          { href: '#youtube', label: 'YouTube' },
          { href: '#depth-charts', label: 'Depth Charts' },
        ].map(link => (
          <a
            key={link.href}
            href={link.href}
            onClick={(e) => { e.preventDefault(); document.querySelector(link.href)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
            className="flex-shrink-0 px-3 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wide text-[var(--lg-text-muted)] bg-[var(--lg-bg-card)] border border-[var(--lg-border-faint)] hover:border-[var(--lg-accent)]/30 hover:text-[var(--lg-text-primary)] transition-colors"
          >
            {link.label}
          </a>
        ))}
      </nav>

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

      {/* ─── Deadline Warnings ─── */}
      <DeadlineWarnings />

      {/* ─── The Daily Diamond (Your Team's Newspaper) ─── */}
      {!rosterStatsLoading && rosterStats.players.length > 0 && (() => {
        // Score and filter to players who actually did something
        const scored = rosterStats.players
          .filter((p: any) => p.gameToday && (p.hitting || p.pitching))
          .map((p: any) => {
            const h = p.hitting || {};
            const pt = p.pitching || {};
            const hitScore = (h.HR || 0) * 4 + (h.RBI || 0) * 2 + (h.R || 0) * 2 + (h.SB || 0) * 3 + (h.H || 0);
            const pitchScore = (pt.W || 0) * 5 + (pt.SV || 0) * 5 + (pt.K || 0) + (parseFloat(pt.IP || "0") >= 5 && (pt.ER || 0) <= 2 ? 5 : 0);
            return { ...p, score: hitScore + pitchScore };
          })
          .filter((p: any) => p.score > 0) // Only players who did something
          .sort((a: any, b: any) => b.score - a.score);

        // Inject IL placements as headline-worthy stories (recent IL moves are big news)
        const recentIL = rosterAlerts
          .filter((a: any) => a.isInjured && a.ilPlacedDate)
          .map((a: any) => {
            const placedDate = new Date(a.ilPlacedDate + "T12:00:00");
            const daysSince = Math.floor((Date.now() - placedDate.getTime()) / 86400000);
            if (daysSince > 1) return null; // Only feature NEW IL placements (today/yesterday)
            const ilMatch = (a.mlbStatus || "").match(/(\d+)/);
            const ilLabel = ilMatch ? `${ilMatch[1]}-Day IL` : "IL";
            return {
              playerName: a.playerName,
              mlbId: a.mlbId,
              mlbTeam: a.mlbTeam,
              position: a.position,
              opponent: ilLabel,
              isPitcher: ["P", "SP", "RP", "CL"].includes(a.position),
              gameToday: true,
              score: daysSince === 0 ? 20 : 12, // Today's IL = top priority
              _isILStory: true,
              _ilInjury: a.ilInjury,
              _ilLabel: ilLabel,
              _daysSince: daysSince,
              thumbnail: null,
              hitting: null,
              pitching: null,
            };
          })
          .filter(Boolean);

        // Merge IL stories into scored — they compete on score
        const allStories = [...scored, ...recentIL].sort((a: any, b: any) => b.score - a.score);

        if (allStories.length === 0) return null;

        // Generate fun, punchy headlines — each player gets a unique one
        const pick = (arr: string[], seed: number) => arr[seed % arr.length];
        const makeHeadline = (p: any, idx: number): string => {
          const h = p.hitting || {};
          const pt = p.pitching || {};
          const last = p.playerName.split(" ").slice(-1)[0];
          const first = p.playerName.split(" ")[0];
          const seed = new Date().getDate() * 7 + idx * 13 + ((p.mlbId || 0) % 11);

          // IL story headlines
          if (p._isILStory) {
            const injury = p._ilInjury || "injury";
            return pick([`BREAKING: ${last} Hits the ${p._ilLabel}`, `${last} Placed on ${p._ilLabel} — ${injury}`, `Down Goes ${last}: ${p._ilLabel} Stint Begins`, `${p._ilLabel} for ${last} — Who Steps Up?`], seed);
          }

          if (p.isPitcher && pt.IP) {
            if (pt.W && pt.K >= 10) return pick([`${last} Just Embarrassed ${pt.K} Hitters`, `${pt.K} K's?! ${last} Chose Violence`, `${last} Went Full Video Game Mode`, `${pt.K} Punchouts. Goodnight, ${p.opponent}.`], seed);
            if (pt.W && pt.K >= 8) return pick([`${last} Made ${p.opponent} Look Silly — ${pt.K} K's`, `${pt.K} Punchouts. ${last} Was Filthy.`, `${last} Put On a Clinic Tonight`, `Sit Down. All of You. — ${last}, Probably`], seed);
            if (pt.W && (pt.ER || 0) === 0) return pick([`${last} Threw a Masterpiece`, `Zero Runs Allowed. ${last} Was That Guy.`, `Unhittable: ${last} Blanks ${p.opponent}`, `${last} Pitched a Shutout Gem`, `${p.opponent} Scored Zero. ${last} Scored a W.`], seed);
            if (pt.W && (pt.ER || 0) <= 1) return pick([`${last} Carving Up ${p.opponent}`, `${last} Dealt. ${p.opponent} Had No Answers.`, `Quality Beatdown by ${last}`, `${last} Was Painting Corners All Night`], seed);
            if (pt.SV) return pick([`${last} Slammed the Door Shut`, `Save Secured. ${last} Is Ice Cold.`, `Lights Out: ${last} Locks It Down`, `${last} Closed It Like a Boss`], seed);
            if (pt.W) return pick([`W for ${last}. That's the Tweet.`, `${last} Gets It Done on the Mound`, `Another Day, Another Dub for ${last}`, `${last} Handed ${p.opponent} an L`], seed);
            if (pt.K >= 7) return pick([`${last} Struck Out ${pt.K} and Didn't Even Flinch`, `${pt.K} Whiffs. ${last} Was Nasty Tonight.`, `${last} Had ${p.opponent} Swinging at Air — ${pt.K} K's`], seed);
            if (pt.K >= 4) return pick([`${last} Racking Up K's — ${pt.K} Punchouts`, `${last} Had the Stuff Tonight`, `${pt.K} Strikeouts for ${last}. Not Bad.`], seed);
            return pick([`${last} Putting in Work — ${pt.IP} IP`, `${last} Grinding Through ${pt.IP} Frames`, `${last} Logged ${pt.IP} Solid Innings`], seed);
          }
          if (h.HR >= 3) return pick([`${last} Just Hit THREE Dingers`, `Three Bombs?! ${last} Is Unreal`, `${last} Went Nuclear — ${h.HR} HR Night`], seed);
          if (h.HR === 2) return pick([`${last} Went Bridge Twice`, `Two Moonshots for ${last}`, `${last} Can't Stop Going Yard`, `${last} Made It Look Easy — 2 Homers`], seed);
          if (h.HR && h.RBI >= 4) return pick([`${last} Woke Up and Chose Destruction`, `${h.RBI} RBI?! ${last} Ate Today.`, `Absolute Damage by ${last}`], seed);
          if (h.HR && h.SB) return pick([`Homer AND a Steal? ${last} Does It All`, `${last} With the Power-Speed Combo`, `Five-Tool Alert: ${last} Homered and Stole a Bag`], seed);
          if (h.HR) return pick([`${last} Took One Deep vs ${p.opponent}`, `${last} Launched One Into Orbit`, `Bomb Alert: ${last} Goes Yard`, `${last} Just Dented a Car in the Parking Lot`, `See Ya! ${last} Crushes One`, `That Ball Had a Family, ${last}`], seed);
          if (h.SB >= 3) return pick([`${last} Just Stole Everything Not Bolted Down`, `${h.SB} Steals?! ${last} Was Running a Track Meet`], seed);
          if (h.SB >= 2) return pick([`${last} Running Wild — ${h.SB} Steals`, `Can't Catch ${last}: ${h.SB} Bags Swiped`, `Speed Kills. ${last} Swiped ${h.SB}.`], seed);
          if (h.RBI >= 4) return pick([`${last} Drove In ${h.RBI}. You're Welcome.`, `${h.RBI} RBI Night for ${last}. Sheeeesh.`, `${last} Was a One-Man Rally — ${h.RBI} RBI`], seed);
          if (h.RBI >= 3) return pick([`${last} Plates ${h.RBI} — Clutch Gene Activated`, `Big Bat Energy: ${last} Drives In ${h.RBI}`], seed);
          if (h.H >= 4) return pick([`${last} Went ${h.H}-for-${h.AB}. That's Disgusting.`, `${last} Couldn't Miss — ${h.H} Hits Tonight`], seed);
          if (h.H >= 3) return pick([`${last} Spraying Hits Everywhere`, `${h.H} Knocks for ${last}. Lineup Spot Justified.`, `${last} Was a Hit Machine — ${h.H}-for-${h.AB}`], seed);
          if (h.R >= 3) return pick([`${last} Scored ${h.R} Times. That's Called Hustling.`, `${h.R} Runs Scored. ${last} Kept Touching Home.`], seed);
          if (h.H >= 2 && h.RBI >= 1) return pick([`Solid Night for ${last}: ${h.H}-for-${h.AB}`, `${last} Quietly Having a Night`, `${last} Collecting Hits and RBIs`], seed);
          if (h.H >= 2) return pick([`Solid Night for ${last}: ${h.H}-for-${h.AB}`, `${last} Staying Hot — ${h.H} Hits`, `${h.H} Knocks for ${last}. Nice and Steady.`], seed);
          if (h.R >= 2) return pick([`${last} Scored ${h.R}. He Keeps Finding Home.`, `${last} Touching Home Plate Like It's His Job`], seed);
          if (h.RBI >= 1 && h.H >= 1) return pick([`${last} Did ${last} Things Tonight`, `Productive Night for ${last}`, `${last} Came Through When It Mattered`], seed);
          if (h.H >= 1) return pick([`${last} With a Knock vs ${p.opponent}`, `${last} Gets on the Board`, `${first} Checks In Tonight`], seed);
          if (h.R >= 1) return pick([`${last} Crossed the Plate`, `${last} Scored One for the Squad`], seed);
          return `${last} Made an Appearance`;
        };

        // Compact stat line
        const statLine = (p: any) => {
          const h = p.hitting || {};
          const pt = p.pitching || {};
          if (p.isPitcher && pt.IP) {
            const parts: string[] = [];
            if (pt.W) parts.push("W");
            if (pt.SV) parts.push("SV");
            parts.push(`${pt.IP} IP`);
            if (pt.K) parts.push(`${pt.K} K`);
            if (pt.ER !== undefined) parts.push(`${pt.ER} ER`);
            return parts.join(" / ");
          }
          const parts: string[] = [];
          if (h.AB) parts.push(`${h.H || 0}-for-${h.AB}`);
          if (h.HR) parts.push(`${h.HR} HR`);
          if (h.RBI) parts.push(`${h.RBI} RBI`);
          if (h.R) parts.push(`${h.R} R`);
          if (h.SB) parts.push(`${h.SB} SB`);
          return parts.join(" / ") || "In lineup";
        };

        const mlbHeadshot = (mlbId: number | null | undefined) =>
          `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${mlbId}/headshot/67/current`;

        const hero = allStories[0];
        const sideStories = allStories.slice(1, 3); // Cap at 2 side stories (3 total with hero)
        const scoredIds = new Set(allStories.map((p: any) => p.mlbId));
        // Filter IL players from on-deck using rosterAlerts
        const ilMlbIds = new Set(rosterAlerts.filter((a: any) => a.isInjured).map((a: any) => a.mlbId));
        const onDeck = rosterStats.players.filter((p: any) => p.gameToday && !scoredIds.has(p.mlbId) && !ilMlbIds.has(p.mlbId));
        // IL and Minors players from rosterAlerts
        const ilPlayers = rosterAlerts.filter((a: any) => a.isInjured);
        const minorsPlayers = rosterAlerts.filter((a: any) => a.isMinors);
        const hasSidebar = true; // always show sidebar: stories, on-deck, pulse, or daily column
        const dateStr = formatLocalDate(new Date(), { weekday: "long", month: "long", day: "numeric", year: "numeric" });

        return (
          <div className="mb-6">
            {/* Newspaper masthead */}
            <div className="flex items-end justify-between border-b-2 border-[var(--lg-text-primary)] pb-1.5 mb-3">
              <div>
                <h2 className="text-lg md:text-xl font-bold tracking-tight text-[var(--lg-text-primary)]" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>
                  The Daily Diamond
                </h2>
                <p className="text-[10px] text-[var(--lg-text-muted)] tracking-wide uppercase">
                  {rosterStats.teamName} Edition
                </p>
              </div>
              <p className="text-[10px] text-[var(--lg-text-muted)] tracking-wide uppercase">
                {dateStr}
              </p>
            </div>

            <div className={`grid grid-cols-1 ${hasSidebar ? "md:grid-cols-3" : ""} gap-0 md:gap-4`}>
              {/* Hero story */}
              <div className={hasSidebar ? "md:col-span-2 pb-4 md:pb-0 md:pr-4 md:border-r border-b md:border-b-0 border-[var(--lg-divide)] flex flex-col" : "flex flex-col"}>
                <div className="relative w-full h-40 sm:h-52 md:flex-1 md:min-h-[200px] rounded-lg overflow-hidden mb-3 bg-[var(--lg-bg-card)]">
                  <img
                    src={hero.thumbnail || mlbHeadshot(hero.mlbId)}
                    alt={hero.playerName}
                    className={hero.thumbnail
                      ? "absolute inset-0 w-full h-full object-cover object-top"
                      : "absolute inset-0 w-full h-full object-contain object-center bg-[var(--lg-bg-card)]"}
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      if (!img.dataset.fallback) {
                        img.dataset.fallback = "1";
                        img.src = mlbHeadshot(hero.mlbId);
                        img.className = "absolute inset-0 w-full h-full object-contain object-center bg-[var(--lg-bg-card)]";
                      }
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <span className={`inline-block text-[9px] font-bold uppercase tracking-widest mb-1 ${hero._isILStory ? 'text-red-400' : 'text-amber-400'}`}>
                      {hero._isILStory ? 'Injury Alert' : 'Top Performer'}
                    </span>
                    <h3 className="text-xl sm:text-2xl font-bold text-white leading-tight" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>
                      {makeHeadline(hero, 0)}
                    </h3>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <img
                    src={mlbHeadshot(hero.mlbId)}
                    alt={hero.playerName}
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0 bg-[var(--lg-bg-card)] border border-[var(--lg-border-faint)]"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--lg-text-primary)]">
                      {hero.playerName}
                      <span className="font-normal text-[var(--lg-text-muted)] ml-1.5 text-xs">{hero.position} · {hero.mlbTeam}</span>
                    </p>
                    <p className="text-xs text-[var(--lg-text-secondary)] mt-0.5">
                      {hero._isILStory
                        ? <span className="font-semibold text-red-400">{hero._ilLabel} — {hero._ilInjury || "Injury"}</span>
                        : <>vs {hero.opponent} — <span className="font-semibold text-[var(--lg-accent)]">{statLine(hero)}</span></>
                      }
                    </p>
                  </div>
                </div>
              </div>

              {/* Sidebar: stories + on deck + daily column */}
              {hasSidebar && (() => {
                const fmtTime = (t: string) => {
                  if (!t) return "";
                  try { return formatLocalTime(t); }
                  catch { return ""; }
                };
                const isFinal = (p: any) => {
                  const s = (p.gameStatus || "").toLowerCase();
                  return s.includes("final") || s.includes("over") || s.includes("game over");
                };
                const isLive = (p: any) => {
                  const s = (p.gameStatus || "").toLowerCase();
                  return s.includes("progress") || s.includes("live");
                };
                // Only show upcoming or live — not final
                const onDeckFiltered = onDeck.filter((p: any) => !isFinal(p));

                // Today's pulse stats
                const allToday = rosterStats.players.filter((p: any) => p.gameToday);
                const liveCount = allToday.filter(isLive).length;
                const doneCount = allToday.filter(isFinal).length;
                const upcomingCount = allToday.length - liveCount - doneCount;

                // Rotating daily column
                const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
                const columns = [
                  { title: "The Commissioner's Corner", text: "The other owners are watching your moves. Act accordingly." },
                  { title: "Scout's Notebook", text: "Stream a pitcher on a favorable matchup day. It's basically free money." },
                  { title: "Fantasy Mailbag", text: "Q: Should I panic about my underperformers? A: It's been one week. Relax." },
                  { title: "The Hot Take", text: "Every category point matters in roto. The teams that sweat the small stuff win it all." },
                  { title: "Waiver Wire Wisdom", text: "The best pickups happen when everyone else is asleep. Set those early-morning alarms." },
                  { title: "Trade Desk", text: "Buy low on cold starters. Sell high on one-week wonders. This is the way." },
                  { title: "The Gut Check", text: "Trust your draft. You picked these guys for a reason. Don't blow it up in April." },
                  { title: "Press Box Notes", text: "Check the depth charts. One injury away from opportunity is closer than you think." },
                  { title: "Dugout Wisdom", text: "The best fantasy managers aren't the smartest — they're the most disciplined." },
                  { title: "The Contrarian", text: "Everyone's chasing the hot hand. The real value is in the guy nobody's talking about." },
                  { title: "Stat Geek Corner", text: "BABIP regresses to the mean. That .380 hitter with a .420 BABIP? He's coming back to earth." },
                  { title: "The Closer's Mentality", text: "Championships aren't won in April. But they can absolutely be lost in April." },
                  { title: "Front Office Memo", text: "Your bench isn't dead weight — it's insurance. The injury gods are undefeated." },
                  { title: "Diamond Cuts", text: "A stolen base is worth more than you think. Speed doesn't slump." },
                  { title: "The Bullpen Report", text: "Saves are volatile. The closer today might be the setup man tomorrow. Stay nimble." },
                  { title: "Scouting the Wire", text: "The waiver wire is a goldmine disguised as a junk drawer. Dig deeper." },
                  { title: "The Owner's Box", text: "Fantasy baseball is a marathon, not a sprint. Pace yourself — and your emotions." },
                  { title: "Overheard in the Clubhouse", text: "That trade you're overthinking? Your gut knew the answer five minutes ago." },
                  { title: "The Sabermetric Take", text: "Don't bench a guy because of one bad week. Sample size is everything." },
                  { title: "Late Night Lineup Card", text: "West Coast games start late but they finish with stats. Don't sleep on the late slate." },
                  { title: "The Rivalry Report", text: "Nothing motivates a trade like seeing your rival pick up the guy you were eyeing." },
                  { title: "Manager's Journal", text: "Write down why you made each move. Future you will thank present you." },
                  { title: "The Platoon Advantage", text: "Lefty-righty splits are real. Check the matchup before you bench someone." },
                  { title: "Prospect Watch", text: "The next big thing is already on someone's minor league roster. Are you paying attention?" },
                  { title: "The Injury Report", text: "Day-to-day means nothing. 10-day IL means something. 60-day IL means drop him." },
                  { title: "Roto Math", text: "In roto, going from 7th to 5th in one category is worth the same as 3rd to 1st. Chase the easy gains." },
                  { title: "Bench Coach Bulletin", text: "Your worst starter is someone else's best waiver pickup. Know when to cut bait." },
                  { title: "The Midnight Trade", text: "The best trades happen when both sides think they won. Find the mutual win." },
                  { title: "Batting Practice", text: "Spring training stats mean nothing. April stats mean almost nothing. May is when it starts to count." },
                  { title: "The Closer", text: "Season-long leagues are won by the owners who never stop grinding. Keep showing up." },
                ];
                const dailyCol = columns[dayOfYear % columns.length];

                return (
                  <div className="pt-4 md:pt-0 flex flex-col justify-between h-full">
                    {/* Headline stories */}
                    {sideStories.length > 0 && (
                      <div className="space-y-0 divide-y divide-[var(--lg-divide)]">
                        {sideStories.map((p: any, i: number) => (
                          <div key={i} className="flex items-start gap-2.5 py-2.5 first:pt-0 group">
                            {p.thumbnail ? (
                              <img
                                src={p.thumbnail}
                                alt={p.playerName}
                                className="w-14 h-9 rounded object-cover flex-shrink-0 bg-[var(--lg-bg-card)] mt-0.5"
                                onError={(e) => {
                                  const img = e.target as HTMLImageElement;
                                  img.src = mlbHeadshot(p.mlbId);
                                  img.className = "w-9 h-9 rounded-full object-cover flex-shrink-0 bg-[var(--lg-bg-card)] border border-[var(--lg-border-faint)] mt-0.5";
                                }}
                              />
                            ) : (
                              <img
                                src={mlbHeadshot(p.mlbId)}
                                alt={p.playerName}
                                className="w-9 h-9 rounded-full object-cover flex-shrink-0 bg-[var(--lg-bg-card)] border border-[var(--lg-border-faint)] mt-0.5"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <h4 className="text-[12px] font-semibold text-[var(--lg-text-primary)] leading-snug group-hover:text-[var(--lg-accent)] transition-colors" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>
                                {makeHeadline(p, i + 1)}
                              </h4>
                              <p className="text-[10px] text-[var(--lg-text-muted)] mt-0.5">
                                {p.playerName} · {p._isILStory
                                  ? <span className="text-red-400 font-medium">{p._ilLabel}</span>
                                  : <span className="text-[var(--lg-accent)] font-medium">{statLine(p)}</span>
                                }
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* On Deck — only live or upcoming, not final */}
                    {onDeckFiltered.length > 0 && (
                      <div className={sideStories.length > 0 ? "mt-3 pt-3 border-t border-[var(--lg-divide)]" : ""}>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--lg-text-muted)] mb-2">On Deck</p>
                        <div className="space-y-1.5">
                          {onDeckFiltered.slice(0, 3).map((p: any, i: number) => {
                            const live = isLive(p);
                            const label = live ? "LIVE" : (fmtTime(p.gameTime) || "Today");
                            return (
                              <div key={i} className="flex items-center gap-2">
                                <img
                                  src={mlbHeadshot(p.mlbId)}
                                  alt={p.playerName}
                                  className="w-6 h-6 rounded-full object-cover flex-shrink-0 bg-[var(--lg-bg-card)] border border-[var(--lg-border-faint)]"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                                <div className="min-w-0 flex-1">
                                  <span className="text-[11px] font-medium text-[var(--lg-text-primary)]">
                                    {p.playerName.split(" ").slice(-1)[0]}
                                  </span>
                                  <span className="text-[10px] text-[var(--lg-text-muted)] ml-1">vs {p.opponent}</span>
                                </div>
                                <span className={`text-[9px] font-bold uppercase ${live ? "text-green-400" : "text-[var(--lg-text-muted)] opacity-60"}`}>
                                  {label}
                                </span>
                              </div>
                            );
                          })}
                          {onDeckFiltered.length > 3 && (
                            <p className="text-[10px] text-[var(--lg-text-muted)] italic">
                              +{onDeckFiltered.length - 3} more upcoming
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* IL Report — shared accordion */}
                    {ilPlayers.length > 0 && (
                      <div className={`${sideStories.length > 0 || onDeckFiltered.length > 0 ? "mt-3 pt-3 border-t border-[var(--lg-divide)]" : ""}`}>
                        <RosterAlertAccordion players={ilPlayers} colorScheme="red" label="IL Report" mlbHeadshot={mlbHeadshot} />
                      </div>
                    )}

                    {/* Minors Report — shared accordion */}
                    {minorsPlayers.length > 0 && (
                      <div className={`${ilPlayers.length > 0 ? "mt-2" : sideStories.length > 0 || onDeckFiltered.length > 0 ? "mt-3 pt-3 border-t border-[var(--lg-divide)]" : ""}`}>
                        <RosterAlertAccordion players={minorsPlayers} colorScheme="amber" label="Minors Report" mlbHeadshot={mlbHeadshot} />
                      </div>
                    )}

                    {/* Today's Pulse + Daily Column — fills remaining space */}
                    <div className="mt-auto pt-3 border-t border-[var(--lg-divide)] space-y-3">
                      {/* Pulse */}
                      <div className="flex items-center gap-3 text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                          <span className="text-[var(--lg-text-muted)]">{liveCount} live</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--lg-text-muted)] opacity-40 inline-block" />
                          <span className="text-[var(--lg-text-muted)]">{doneCount} done</span>
                        </div>
                        {upcomingCount > 0 && (
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--lg-accent)] opacity-60 inline-block" />
                            <span className="text-[var(--lg-text-muted)]">{upcomingCount} upcoming</span>
                          </div>
                        )}
                      </div>

                      {/* Daily Column */}
                      <div className="bg-[var(--lg-tint)] rounded-lg p-2.5 border border-[var(--lg-border-faint)]">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--lg-accent)] mb-1" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>
                          {dailyCol.title}
                        </p>
                        <p className="text-[11px] text-[var(--lg-text-secondary)] leading-relaxed italic">
                          {dailyCol.text}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Bottom rule */}
            <div className="border-b border-[var(--lg-divide)] mt-4" />
          </div>
        );
      })()}

      {/* Real-Time Stats Today */}
      <div id="stats" />
      {!rosterStatsLoading && rosterStats.players.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)]">
              <Users size={12} className="inline -mt-0.5 mr-1 text-[var(--lg-accent)]" />
              Real-Time Stats · {rosterStats.teamName}
            </h2>
            <span className="text-[10px] text-[var(--lg-text-muted)]">
              {(() => {
                const statsDate = new Date(rosterStats.date + "T12:00:00");
                const today = new Date();
                today.setHours(12, 0, 0, 0);
                const isYesterday = statsDate.getTime() < today.getTime() - 12 * 3600 * 1000;
                const label = formatLocalDate(statsDate, { weekday: 'short', month: 'short', day: 'numeric' });
                const timeLabel = formatLocalTime(new Date().toISOString());
                return isYesterday ? `Last Night · ${label}` : `Live · Updated ${timeLabel}`;
              })()}
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
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-[8px] font-bold uppercase text-[var(--lg-text-muted)] border-b border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)]/50">
                        <th className="px-1 py-0.5 text-left w-6">POS</th>
                        <th className="px-1 py-0.5 text-left">HITTER</th>
                        <th className="px-1 py-0.5 text-center w-5 opacity-50">AB</th>
                        <th className="px-1 py-0.5 text-center w-4 opacity-50">H</th>
                        <th className="px-1 py-0.5 text-center w-4 font-black">R</th>
                        <th className="px-1 py-0.5 text-center w-4 font-black">HR</th>
                        <th className="px-1 py-0.5 text-center w-5 font-black">RBI</th>
                        <th className="px-1 py-0.5 text-center w-4 font-black">SB</th>
                        <th className="px-1 py-0.5 text-center w-7 font-black">AVG</th>
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
                            <td className="px-1 py-px"><span className="text-[8px] font-mono font-semibold text-[var(--lg-accent)]">{p.position}</span></td>
                            <td className="px-1 py-px truncate max-w-[110px]">
                              <span className="font-medium text-[var(--lg-text-primary)]">{p.playerName}</span>
                              {!p.gameToday && <span className="ml-1 text-[7px] text-[var(--lg-text-muted)] opacity-50">off</span>}
                              {isLive && <span className="ml-1 text-[7px] text-emerald-400 animate-pulse font-bold">LIVE</span>}
                            </td>
                            <td className={`px-1 py-px text-center tabular-nums opacity-60 ${hasStats ? '' : dim}`}>{h?.AB ?? '—'}</td>
                            <td className={`px-1 py-px text-center tabular-nums opacity-60 ${h?.H > 0 ? 'text-emerald-400' : hasStats ? '' : dim}`}>{h?.H ?? '—'}</td>
                            <td className={`px-1 py-px text-center tabular-nums ${h?.R > 0 ? 'text-blue-400 font-bold' : hasStats ? '' : dim}`}>{h?.R ?? '—'}</td>
                            <td className={`px-1 py-px text-center tabular-nums ${h?.HR > 0 ? 'text-amber-400 font-bold' : hasStats ? '' : dim}`}>{h?.HR ?? '—'}</td>
                            <td className={`px-1 py-px text-center tabular-nums ${h?.RBI > 0 ? 'text-purple-400 font-bold' : hasStats ? '' : dim}`}>{h?.RBI ?? '—'}</td>
                            <td className={`px-1 py-px text-center tabular-nums ${h?.SB > 0 ? 'text-cyan-400 font-bold' : hasStats ? '' : dim}`}>{h?.SB ?? '—'}</td>
                            <td className={`px-1 py-px text-center tabular-nums font-bold ${hasStats && h?.AB > 0 ? '' : dim}`}>{hasStats && h?.AB > 0 ? (h.H / h.AB).toFixed(3).replace('0.', '.') : '—'}</td>
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
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-[8px] font-bold uppercase text-[var(--lg-text-muted)] border-b border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)]/50">
                        <th className="px-1 py-0.5 text-left w-6">POS</th>
                        <th className="px-1 py-0.5 text-left">PITCHER</th>
                        <th className="px-1 py-0.5 text-center w-5 opacity-50">IP</th>
                        <th className="px-1 py-0.5 text-center w-4 opacity-50">H</th>
                        <th className="px-1 py-0.5 text-center w-4 opacity-50">ER</th>
                        <th className="px-1 py-0.5 text-center w-4 font-black">K</th>
                        <th className="px-1 py-0.5 text-center w-4 opacity-50">BB</th>
                        <th className="px-1 py-0.5 text-center w-4 font-black">W</th>
                        <th className="px-1 py-0.5 text-center w-4 font-black">SV</th>
                        <th className="px-1 py-0.5 text-center w-7 font-black">ERA</th>
                        <th className="px-1 py-0.5 text-center w-8 font-black">WHIP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--lg-border-faint)]">
                      {pitchers.map((p: any, idx: number) => {
                        const s = p.pitching;
                        const hasStats = !!s;
                        const isLive = p.gameStatus === "In Progress";
                        const dim = 'text-[var(--lg-text-muted)] opacity-30';
                        const ip = s?.IP ?? 0;
                        const era = hasStats && ip > 0 ? ((s.ER / ip) * 9).toFixed(2) : '—';
                        const whip = hasStats && ip > 0 ? (((s.BB ?? 0) + (s.H ?? 0)) / ip).toFixed(2) : '—';
                        return (
                          <tr key={`p-${idx}`} className={isLive ? 'bg-emerald-500/5' : ''}>
                            <td className="px-1 py-px"><span className="text-[8px] font-mono font-semibold text-[var(--lg-accent)]">P</span></td>
                            <td className="px-1 py-px truncate max-w-[110px]">
                              <span className="font-medium text-[var(--lg-text-primary)]">{p.playerName}</span>
                              {!p.gameToday && <span className="ml-1 text-[7px] text-[var(--lg-text-muted)] opacity-50">off</span>}
                              {isLive && <span className="ml-1 text-[7px] text-emerald-400 animate-pulse font-bold">LIVE</span>}
                            </td>
                            <td className={`px-1 py-px text-center tabular-nums opacity-60 ${hasStats ? '' : dim}`}>{s?.IP ?? '—'}</td>
                            <td className={`px-1 py-px text-center tabular-nums opacity-60 ${hasStats ? '' : dim}`}>{s?.H ?? '—'}</td>
                            <td className={`px-1 py-px text-center tabular-nums opacity-60 ${s?.ER > 0 ? 'text-red-400' : hasStats ? '' : dim}`}>{s?.ER ?? '—'}</td>
                            <td className={`px-1 py-px text-center tabular-nums ${s?.K > 0 ? 'text-emerald-400 font-bold' : hasStats ? '' : dim}`}>{s?.K ?? '—'}</td>
                            <td className={`px-1 py-px text-center tabular-nums opacity-60 ${hasStats ? '' : dim}`}>{s?.BB ?? '—'}</td>
                            <td className={`px-1 py-px text-center tabular-nums ${s?.W > 0 ? 'text-emerald-400 font-bold' : hasStats ? '' : dim}`}>{hasStats ? (s.W ?? 0) : '—'}</td>
                            <td className={`px-1 py-px text-center tabular-nums ${s?.SV > 0 ? 'text-amber-400 font-bold' : hasStats ? '' : dim}`}>{hasStats ? (s.SV ?? 0) : '—'}</td>
                            <td className={`px-1 py-px text-center tabular-nums font-bold ${hasStats && ip > 0 ? '' : dim}`}>{era}</td>
                            <td className={`px-1 py-px text-center tabular-nums font-bold ${hasStats && ip > 0 ? '' : dim}`}>{whip}</td>
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

      {/* Roster Alerts — IL / Minors cards */}
      {rosterAlerts.length > 0 && (() => {
        const ilAlerts = rosterAlerts.filter((p: any) => p.isInjured);
        const minorsAlerts = rosterAlerts.filter((p: any) => p.isMinors);
        const headshotUrl = (mlbId: number | null) =>
          `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${mlbId}/headshot/67/current`;
        return (
          <div className="space-y-3">
            {ilAlerts.length > 0 && (
              <div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-red-400 mb-2">Injured List ({ilAlerts.length})</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                  {ilAlerts.map((p: any, i: number) => {
                    const ilMatch = (p.mlbStatus || "").match(/(\d+)/);
                    const ilLabel = ilMatch ? `${ilMatch[1]}-Day IL` : "IL";
                    return (
                      <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/15">
                        <img
                          src={headshotUrl(p.mlbId)}
                          alt={p.playerName}
                          className="w-7 h-7 rounded-full object-cover flex-shrink-0 bg-[var(--lg-bg-card)] border border-red-500/20 opacity-70"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-semibold text-[var(--lg-text-primary)] truncate">{p.playerName}</div>
                          <div className="text-[9px] text-[var(--lg-text-muted)]">
                            <span className="text-red-400 font-bold">{ilLabel}</span>
                            <span className="mx-1">·</span>{p.position} · {p.mlbTeam}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {minorsAlerts.length > 0 && (
              <div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-amber-400 mb-2">Minors ({minorsAlerts.length})</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                  {minorsAlerts.map((p: any, i: number) => (
                    <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/15">
                      <img
                        src={headshotUrl(p.mlbId)}
                        alt={p.playerName}
                        className="w-7 h-7 rounded-full object-cover flex-shrink-0 bg-[var(--lg-bg-card)] border border-amber-500/20 opacity-70"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold text-[var(--lg-text-primary)] truncate">{p.playerName}</div>
                        <div className="text-[9px] text-[var(--lg-text-muted)]">
                          <span className="text-amber-400 font-bold">Minors</span>
                          <span className="mx-1">·</span>{p.position} · {p.mlbTeam}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Weekly League Digest */}
      <div id="digest" />
      {digestLoading && !digest && digestWeeks.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-4 text-xs text-[var(--lg-text-muted)] animate-pulse">
          <Sparkles size={14} className="text-blue-400" />
          Loading weekly digest...
        </div>
      )}
      {(digest || digestWeeks.length > 0) && (
        <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] overflow-hidden">
          {/* Header: toggle + "full report" cross-link */}
          <div className="flex items-stretch">
            <button
              onClick={() => setDigestExpanded(prev => !prev)}
              className="flex-1 flex items-center justify-between p-4 md:p-5 hover:bg-[var(--lg-bg-card)]/30 transition-colors text-left"
            >
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <Sparkles size={14} className="text-[var(--lg-accent)] flex-shrink-0" />
                <span className="text-xs font-semibold uppercase text-[var(--lg-text-muted)]">Weekly Digest</span>
                <span className="text-[10px] text-[var(--lg-text-muted)] opacity-60">Updated Every Monday</span>
                {digest?.generatedAt && (
                  <span className="text-[10px] text-[var(--lg-text-muted)] opacity-60">
                    · {formatLocalDate(digest.generatedAt)}
                  </span>
                )}
              </div>
              {digestExpanded ? <ChevronUp size={14} className="text-[var(--lg-text-muted)]" /> : <ChevronDown size={14} className="text-[var(--lg-text-muted)]" />}
            </button>
            <Link
              to={`/report${selectedWeekKey && selectedWeekKey !== currentWeekKey ? `/${selectedWeekKey}` : ""}`}
              className="flex items-center gap-1.5 px-3 md:px-4 border-l border-[var(--lg-border-faint)] text-[11px] font-semibold uppercase tracking-wider text-[var(--lg-accent)] hover:bg-[var(--lg-bg-card)]/30 transition-colors"
              title="Open This Week in Baseball — full weekly report"
            >
              Full Report
              <ChevronRight size={14} />
            </Link>
          </div>

          {/* Week pill tabs */}
          {digestExpanded && digestWeeks.length > 1 && (
            <div className="relative px-4 md:px-5 pb-2">
              <div className="overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
                <div className="flex gap-1.5 min-w-max">
                  {digestWeeks.map(w => {
                    const isActive = w.weekKey === selectedWeekKey;
                    const isCurrent = w.weekKey === currentWeekKey;
                    return (
                      <button
                        key={w.weekKey}
                        ref={isActive ? activeTabRef : undefined}
                        onClick={() => handleWeekSelect(w.weekKey)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors ${
                          isActive
                            ? "bg-[var(--lg-accent)] text-white"
                            : "bg-[var(--lg-bg-card)] text-[var(--lg-text-muted)] border border-[var(--lg-border-faint)] hover:border-[var(--lg-accent)]/30 hover:text-[var(--lg-text-primary)]"
                        }`}
                      >
                        {w.label}
                        {isCurrent && !isActive && (
                          <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-[var(--lg-accent)] align-middle" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {digestExpanded && digestLoading && !digest && (
            <div className="px-4 pb-4 md:px-5 md:pb-5">
              <div className="space-y-3 animate-pulse">
                <div className="h-4 bg-[var(--lg-bg-card)] rounded w-3/4" />
                <div className="h-4 bg-[var(--lg-bg-card)] rounded w-1/2" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-16 bg-[var(--lg-bg-card)] rounded-lg" />
                  <div className="h-16 bg-[var(--lg-bg-card)] rounded-lg" />
                </div>
                <div className="h-24 bg-[var(--lg-bg-card)] rounded-lg" />
              </div>
            </div>
          )}

          {digestExpanded && digest && (
            <div className="px-4 pb-4 md:px-5 md:pb-5 space-y-4">

              {/* NEW FORMAT: Week headline + Power Rankings + new sections */}
              {digest.powerRankings ? (<>
                {/* Week in One Sentence */}
                {digest.weekInOneSentence && (
                  <p className="text-sm font-semibold text-[var(--lg-text-primary)] leading-relaxed">{digest.weekInOneSentence}</p>
                )}

                {/* Power Rankings */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--lg-text-muted)] mb-2">Power Rankings</div>
                  <div className="space-y-1">
                    {digest.powerRankings.map((pr: PowerRanking) => (
                      <div key={pr.teamName} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[var(--lg-bg-card)] border border-[var(--lg-border-faint)]">
                        <span className="text-sm font-black tabular-nums w-6 text-center flex-shrink-0 text-[var(--lg-accent)]">
                          {pr.rank}
                        </span>
                        <span className="text-xs flex-shrink-0 mt-0.5">
                          {pr.movement === "up" ? "↑" : pr.movement === "down" ? "↓" : "→"}
                        </span>
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-[var(--lg-text-primary)]">{pr.teamName}</span>
                          <span className="text-[10px] text-[var(--lg-text-muted)] ml-1.5">{pr.commentary}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Hot & Cold */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {digest.hotTeam && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                      <TrendingUp size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                      <div className="text-[11px] min-w-0">
                        <span className="font-bold text-emerald-500">Hot: </span>
                        <span className="font-medium text-[var(--lg-text-primary)]">{digest.hotTeam.name}</span>
                        <p className="text-[var(--lg-text-muted)] mt-0.5">{digest.hotTeam.reason}</p>
                      </div>
                    </div>
                  )}
                  {digest.coldTeam && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/5">
                      <TrendingDown size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="text-[11px] min-w-0">
                        <span className="font-bold text-red-400">Cold: </span>
                        <span className="font-medium text-[var(--lg-text-primary)]">{digest.coldTeam.name}</span>
                        <p className="text-[var(--lg-text-muted)] mt-0.5">{digest.coldTeam.reason}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Stat of the Week */}
                {digest.statOfTheWeek && (
                  <div className="px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/5">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-amber-500 mb-1">Stat of the Week</div>
                    <p className="text-[11px] text-[var(--lg-text-secondary)] leading-relaxed">{digest.statOfTheWeek}</p>
                  </div>
                )}

                {/* Category Movers */}
                {(digest.categoryMovers?.length ?? 0) > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--lg-text-muted)] mb-2">Category Movers</div>
                    <div className="space-y-1">
                      {digest.categoryMovers!.map((cm: CategoryMover, i: number) => (
                        <div key={i} className="flex items-start gap-2 px-3 py-1.5 text-[11px]">
                          <span className={`font-bold flex-shrink-0 ${cm.direction === "up" ? "text-emerald-500" : "text-red-400"}`}>
                            {cm.direction === "up" ? "↑" : "↓"} {cm.category}
                          </span>
                          <span className="text-[var(--lg-text-muted)]">{cm.team} — {cm.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>) : (<>
                {/* OLD FORMAT: Overview + Team Grades (backward compat for existing persisted digests) */}
                <p className="text-sm text-[var(--lg-text-secondary)] leading-relaxed">{digest.overview}</p>
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
                {digest.teamGrades && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--lg-text-muted)] mb-2">Team Grades</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {digest.teamGrades.map((tg: TeamGrade) => (
                        <div key={tg.teamName} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[var(--lg-bg-card)] border border-[var(--lg-border-faint)]">
                          <span className={`text-sm font-black tabular-nums w-7 text-center flex-shrink-0 mt-0.5 ${gradeColor(tg.grade || "")}`}>{tg.grade}</span>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[var(--lg-text-primary)]">{tg.teamName}</div>
                            <div className="text-[10px] text-[var(--lg-text-muted)] leading-relaxed">{tg.trend}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>)}

              {/* Proposed Trade (shared between old and new format) */}
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
                    const isPastWeek = selectedWeekKey !== currentWeekKey;
                    return (
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[var(--lg-accent)]/10">
                        <span className="text-[10px] font-bold uppercase text-[var(--lg-text-muted)]">
                          {isPastWeek ? "Poll results:" : "Would you make this trade?"}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleVote("yes")}
                            disabled={voting || myVote === "yes" || isPastWeek}
                            className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                              myVote === "yes"
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : isPastWeek
                                  ? "bg-[var(--lg-bg-card)] text-[var(--lg-text-muted)] border border-[var(--lg-border-faint)] opacity-60 cursor-default"
                                  : "bg-[var(--lg-bg-card)] text-[var(--lg-text-muted)] border border-[var(--lg-border-faint)] hover:border-emerald-500/30 hover:text-emerald-400"
                            }`}
                          >
                            Yes {(digest.voteResults?.yes ?? 0) > 0 && `(${digest.voteResults!.yes})`}
                          </button>
                          <button
                            onClick={() => handleVote("no")}
                            disabled={voting || myVote === "no" || isPastWeek}
                            className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                              myVote === "no"
                                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                : isPastWeek
                                  ? "bg-[var(--lg-bg-card)] text-[var(--lg-text-muted)] border border-[var(--lg-border-faint)] opacity-60 cursor-default"
                                  : "bg-[var(--lg-bg-card)] text-[var(--lg-text-muted)] border border-[var(--lg-border-faint)] hover:border-red-500/30 hover:text-red-400"
                            }`}
                          >
                            No {(digest.voteResults?.no ?? 0) > 0 && `(${digest.voteResults!.no})`}
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Bold Prediction (new format only) */}
              {digest.boldPrediction && (
                <div className="px-3 py-2 rounded-lg border border-purple-500/20 bg-purple-500/5">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-purple-400 mb-1">Bold Prediction</div>
                  <p className="text-[11px] text-[var(--lg-text-secondary)] leading-relaxed italic">{digest.boldPrediction}</p>
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

      {/* ─── News & Social Feeds (tabbed) ─── */}
      <div id="news" />
      <div>
        {/* Header: title + filter dropdown */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)]">News & Social</h2>
          <select
            value={newsFilter}
            onChange={(e) => setNewsFilter(e.target.value)}
            className="bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded px-2 py-1 text-[10px] font-semibold text-[var(--lg-text-muted)] outline-none cursor-pointer"
          >
            <option value="ALL">All League News</option>
            <option value="MY_ROSTER">My Roster</option>
            {fantasyTeams.map(t => <option key={t} value={t}>{t}</option>)}
            <option value="FREE_AGENTS">Free Agents</option>
          </select>
        </div>

        {/* Tab strip */}
        <div className="flex gap-1 mb-2 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
          {([
            { key: 'rumors' as const, label: 'MLBTradeRumors.com' },
            { key: 'reddit' as const, label: 'Reddit r/baseball' },
            { key: 'mlb' as const, label: 'MLB.com' },
            { key: 'espn' as const, label: 'ESPN' },
            { key: 'yahoo' as const, label: 'Yahoo Sports' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setNewsTab(tab.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors ${
                newsTab === tab.key
                  ? "bg-[var(--lg-accent)] text-white"
                  : "bg-[var(--lg-bg-card)] text-[var(--lg-text-muted)] border border-[var(--lg-border-faint)] hover:border-[var(--lg-accent)]/30 hover:text-[var(--lg-text-primary)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] divide-y divide-[var(--lg-border-faint)] max-h-[480px] overflow-y-auto">

          {/* Trade Rumors tab */}
          {newsTab === 'rumors' && (rumorsLoading ? (
            <div className="space-y-2 p-3">{[1,2,3,4].map(i => <div key={i} className="h-8 rounded bg-[var(--lg-bg-card)] animate-pulse" />)}</div>
          ) : (() => {
            const rumorsWithMatches = rumors.map(r => {
              const matched: { name: string; fantasyTeam: string }[] = [];
              for (const cat of r.categories) {
                const fantasyTeam = leagueRoster.get(cat.toLowerCase());
                if (fantasyTeam) matched.push({ name: cat, fantasyTeam });
              }
              return { ...r, matchedPlayers: matched };
            });
            let filtered = rumorsWithMatches;
            if (newsFilter === 'FREE_AGENTS') {
              filtered = filtered.filter(r => r.categories.some(cat => {
                const isPlayer = !TEAM_NAME_TO_ABBR[cat] && !['Notes', 'Transactions', 'Newsstand', 'Front Office Originals', 'MLBTR Originals', 'MLBTR Polls', 'The Opener', 'Front Office Fantasy'].includes(cat);
                return isPlayer && !leagueRoster.has(cat.toLowerCase());
              }));
            } else if (newsFilter === 'MY_ROSTER') {
              filtered = filtered.filter(r => r.matchedPlayers.length > 0);
            } else if (newsFilter !== 'ALL') {
              filtered = filtered.filter(r => r.matchedPlayers.some(mp => mp.fantasyTeam === newsFilter));
            }
            return filtered.length === 0 ? (
              <div className="text-center py-8 text-xs text-[var(--lg-text-muted)] opacity-50">No trade rumors {newsFilter !== 'ALL' ? `for ${newsFilter}` : 'available'}</div>
            ) : (<>{filtered.map((r, i) => {
              const ago = r.pubDate ? (() => { const ms = Date.now() - new Date(r.pubDate).getTime(); const h = Math.floor(ms / 3_600_000); return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`; })() : "";
              return (
                <a key={i} href={r.link} target="_blank" rel="noopener noreferrer"
                  className={`flex items-start gap-2 px-3 py-2.5 hover:bg-[var(--lg-tint-hover)] transition-colors ${r.matchedPlayers.length > 0 ? 'border-l-2 border-l-[var(--lg-accent)]' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-[var(--lg-text-primary)] leading-relaxed">{r.title}</div>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {r.matchedPlayers.map((mp, mi) => (
                        <span key={`m-${mi}`} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--lg-accent)]/20 text-[var(--lg-accent)] font-semibold border border-[var(--lg-accent)]/30">{mp.name} · {mp.fantasyTeam}</span>
                      ))}
                      {r.categories.filter(cat => !leagueRoster.has(cat.toLowerCase())).slice(0, 3).map((cat, ci) => (
                        <span key={ci} className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 font-medium">{cat}</span>
                      ))}
                    </div>
                  </div>
                  <span className="text-[10px] text-[var(--lg-text-muted)] shrink-0 mt-0.5">{ago}</span>
                </a>
              );
            })}</>);
          })())}

          {/* Reddit tab */}
          {newsTab === 'reddit' && (redditLoading ? (
            <div className="space-y-2 p-3">{[1,2,3,4].map(i => <div key={i} className="h-8 rounded bg-[var(--lg-bg-card)] animate-pulse" />)}</div>
          ) : (() => {
            let filtered = redditPosts;
            if (newsFilter === 'MY_ROSTER') filtered = filtered.filter((p: any) => p.matchedPlayers?.length > 0);
            else if (newsFilter === 'FREE_AGENTS') filtered = filtered.filter((p: any) => !p.matchedPlayers?.length);
            else if (newsFilter !== 'ALL') filtered = filtered.filter((p: any) => p.matchedPlayers?.some((mp: any) => mp.fantasyTeam === newsFilter));
            return filtered.length === 0 ? (
              <div className="text-center py-8 text-xs text-[var(--lg-text-muted)] opacity-50">No posts</div>
            ) : (<>{filtered.map((post: any, i: number) => {
              const ago = post.createdUtc ? (() => { const ms = Date.now() - post.createdUtc * 1000; const h = Math.floor(ms / 3_600_000); return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`; })() : "";
              return (
                <a key={`rd-${i}`} href={post.permalink} target="_blank" rel="noopener noreferrer"
                  className={`flex items-start gap-2 px-3 py-2 hover:bg-[var(--lg-tint-hover)] transition-colors ${post.matchedPlayers?.length > 0 ? 'border-l-2 border-l-[var(--lg-accent)]' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-[var(--lg-text-primary)] leading-relaxed">{post.title}</div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {(post.matchedPlayers || []).map((mp: any, mi: number) => (
                        <span key={`rmp-${mi}`} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--lg-accent)]/20 text-[var(--lg-accent)] font-semibold border border-[var(--lg-accent)]/30">{mp.name} · {mp.fantasyTeam}</span>
                      ))}
                      {post.flair && <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 font-medium">{post.flair}</span>}
                      <span className="text-[9px] text-[var(--lg-text-muted)]">{post.score} pts · {post.numComments} comments</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-[var(--lg-text-muted)] shrink-0 mt-0.5">{ago}</span>
                </a>
              );
            })}</>);
          })())}

          {/* Article-based tabs: MLB.com, ESPN, Yahoo — shared renderer */}
          {(newsTab === 'mlb' || newsTab === 'espn' || newsTab === 'yahoo') && (() => {
            const sourceArticles = newsTab === 'mlb' ? mlbArticles : newsTab === 'espn' ? espnArticles : yahooArticles;
            const loading = newsTab === 'mlb' ? mlbLoading : newsTab === 'espn' ? espnLoading : yahooLoading;
            if (loading) return <div className="space-y-2 p-3">{[1,2,3,4].map(i => <div key={i} className="h-6 rounded bg-[var(--lg-bg-card)] animate-pulse" />)}</div>;
            // Cross-reference with league roster
            const articles = sourceArticles.map((a: any) => {
              const lowerTitle = (a.title || "").toLowerCase();
              const matched: { name: string; fantasyTeam: string }[] = [];
              for (const [key, team] of leagueRoster) {
                if (key.length >= 4 && lowerTitle.includes(key)) matched.push({ name: key, fantasyTeam: team });
              }
              return { ...a, matchedPlayers: matched };
            });
            let filtered = articles;
            if (newsFilter === 'MY_ROSTER') filtered = filtered.filter((a: any) => a.matchedPlayers.length > 0);
            else if (newsFilter === 'FREE_AGENTS') filtered = filtered.filter((a: any) => a.matchedPlayers.length === 0);
            else if (newsFilter !== 'ALL') filtered = filtered.filter((a: any) => a.matchedPlayers.some((mp: any) => mp.fantasyTeam === newsFilter));
            return filtered.length === 0 ? (
              <div className="text-center py-8 text-xs text-[var(--lg-text-muted)] opacity-50">No articles</div>
            ) : (<>{filtered.map((a: any, i: number) => {
              const ago = a.pubDate ? (() => { const ms = Date.now() - new Date(a.pubDate).getTime(); const h = Math.floor(ms / 3_600_000); return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`; })() : "";
              return (
                <a key={`art-${i}`} href={a.link} target="_blank" rel="noopener noreferrer"
                  className={`flex items-start gap-2 px-3 py-2.5 hover:bg-[var(--lg-tint-hover)] transition-colors ${a.matchedPlayers?.length > 0 ? 'border-l-2 border-l-[var(--lg-accent)]' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-[var(--lg-text-primary)] leading-relaxed">{a.title}</div>
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {(a.matchedPlayers || []).slice(0, 3).map((mp: any, mi: number) => (
                        <span key={mi} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--lg-accent)]/20 text-[var(--lg-accent)] font-semibold border border-[var(--lg-accent)]/30">{mp.name} · {mp.fantasyTeam}</span>
                      ))}
                      {a.description && <span className="text-[9px] text-[var(--lg-text-muted)] line-clamp-1">{a.description}</span>}
                    </div>
                  </div>
                  <span className="text-[10px] text-[var(--lg-text-muted)] shrink-0 mt-0.5">{ago}</span>
                </a>
              );
            })}</>);
          })()}

        </div>
        <div className="text-[8px] text-[var(--lg-text-muted)] opacity-50 mt-1 px-1">
          Source: {newsTab === 'rumors' ? 'mlbtraderumors.com' : newsTab === 'reddit' ? 'reddit.com/r/baseball + r/fantasybaseball' : newsTab === 'mlb' ? 'mlb.com/feeds/news/rss.xml' : newsTab === 'espn' ? 'espn.com/espn/rss/mlb/news' : 'sports.yahoo.com/mlb/rss'}
          {' · '}Players highlighted when rostered in your league
        </div>
      </div>{/* end News & Social */}

      {/* ─── YouTube Shorts with pagination ─── */}
      <div id="youtube" />
      {!videosLoading && playerVideos.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)] mb-2">
            <TrendingUp size={12} className="inline -mt-0.5 mr-1 text-red-500" />
            YouTube Shorts
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {playerVideos.slice(ytPage * YT_PER_PAGE, (ytPage + 1) * YT_PER_PAGE).map((v: any, i: number) => (
              <button
                key={`yt-${ytPage}-${i}`}
                onClick={() => setActiveVideo({ videoId: v.videoId, title: v.title })}
                className="rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] overflow-hidden hover:border-[var(--lg-accent)]/30 transition-colors group text-left"
              >
                <div className="relative aspect-video bg-black">
                  <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-red-600/90 flex items-center justify-center group-hover:scale-110 transition-transform">
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
              </button>
            ))}
          </div>
          {/* Pagination */}
          {playerVideos.length > YT_PER_PAGE && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <button
                onClick={() => setYtPage(p => Math.max(0, p - 1))}
                disabled={ytPage === 0}
                className="px-2 py-1 text-[10px] font-semibold rounded border border-[var(--lg-border-subtle)] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={12} />
              </button>
              {Array.from({ length: Math.ceil(playerVideos.length / YT_PER_PAGE) }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setYtPage(i)}
                  className={`w-6 h-6 text-[10px] font-semibold rounded transition-colors ${
                    ytPage === i ? 'bg-[var(--lg-accent)] text-white' : 'text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setYtPage(p => Math.min(Math.ceil(playerVideos.length / YT_PER_PAGE) - 1, p + 1))}
                disabled={ytPage >= Math.ceil(playerVideos.length / YT_PER_PAGE) - 1}
                className="px-2 py-1 text-[10px] font-semibold rounded border border-[var(--lg-border-subtle)] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Scores */}
      <div id="scores" />
      <DateNavigator date={date} onChange={setDate} />
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

      {/* ─── Depth Charts ─── */}
      <div id="depth-charts">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)]">Depth Charts</h2>
          <div className="flex items-center gap-2">
            <select
              value={depthTeamId}
              onChange={(e) => setDepthTeamId(Number(e.target.value))}
              className="bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded px-2 py-1 text-[10px] font-semibold text-[var(--lg-text-muted)] outline-none cursor-pointer"
            >
              <optgroup label="NL West">
                <option value={119}>Los Angeles Dodgers</option>
                <option value={135}>San Diego Padres</option>
                <option value={137}>San Francisco Giants</option>
                <option value={109}>Arizona Diamondbacks</option>
                <option value={115}>Colorado Rockies</option>
              </optgroup>
              <optgroup label="NL East">
                <option value={144}>Atlanta Braves</option>
                <option value={121}>New York Mets</option>
                <option value={143}>Philadelphia Phillies</option>
                <option value={146}>Miami Marlins</option>
                <option value={120}>Washington Nationals</option>
              </optgroup>
              <optgroup label="NL Central">
                <option value={158}>Milwaukee Brewers</option>
                <option value={112}>Chicago Cubs</option>
                <option value={138}>St. Louis Cardinals</option>
                <option value={113}>Cincinnati Reds</option>
                <option value={134}>Pittsburgh Pirates</option>
              </optgroup>
              <optgroup label="AL East">
                <option value={110}>Baltimore Orioles</option>
                <option value={147}>New York Yankees</option>
                <option value={139}>Tampa Bay Rays</option>
                <option value={141}>Toronto Blue Jays</option>
                <option value={111}>Boston Red Sox</option>
              </optgroup>
              <optgroup label="AL Central">
                <option value={114}>Cleveland Guardians</option>
                <option value={118}>Kansas City Royals</option>
                <option value={116}>Detroit Tigers</option>
                <option value={142}>Minnesota Twins</option>
                <option value={145}>Chicago White Sox</option>
              </optgroup>
              <optgroup label="AL West">
                <option value={117}>Houston Astros</option>
                <option value={136}>Seattle Mariners</option>
                <option value={140}>Texas Rangers</option>
                <option value={108}>Los Angeles Angels</option>
                <option value={133}>Athletics</option>
              </optgroup>
            </select>
          </div>
        </div>
        {depthLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 rounded bg-[var(--lg-tint)] animate-pulse" />)}</div>
        ) : depthChart.length === 0 ? (
          <div className="text-center py-8 text-xs text-[var(--lg-text-muted)] opacity-50">Select a team to view depth chart</div>
        ) : (
          <div className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[9px] font-bold uppercase text-[var(--lg-text-muted)] border-b border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)]/50">
                  <th className="px-2 py-1.5 text-left w-14">POS</th>
                  <th className="px-2 py-1.5 text-left">Starter</th>
                  <th className="px-2 py-1.5 text-left">Backup</th>
                  <th className="px-2 py-1.5 text-left hidden sm:table-cell">3rd</th>
                  <th className="px-2 py-1.5 text-left hidden md:table-cell">4th</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--lg-border-faint)]">
                {depthChart.map(pos => {
                  // Show first 4 visible slots, but also ensure all IL players appear
                  const active = pos.players.filter((p: any) => !p.isInjured);
                  const il = pos.players.filter((p: any) => p.isInjured);
                  // Interleave: starter, backup, then IL players fill remaining visible slots
                  const display = [...active.slice(0, 2)]; // starter + backup always active
                  // Fill 3rd and 4th with active depth or IL players
                  const remaining = [...active.slice(2), ...il];
                  display.push(...remaining);
                  const slots = display.slice(0, 4);

                  return (
                  <tr key={pos.position}>
                    <td className="px-2 py-1.5">
                      <span className="text-[10px] font-mono font-bold text-[var(--lg-accent)]">{pos.position}</span>
                    </td>
                    {[0, 1, 2, 3].map(idx => (
                      <td key={idx} className={`px-2 py-1.5 ${idx >= 2 ? (idx >= 3 ? 'hidden md:table-cell' : 'hidden sm:table-cell') : ''}`}>
                        {slots[idx] ? (
                          <span className={slots[idx].isInjured ? 'text-red-400 line-through opacity-70' : 'text-[var(--lg-text-primary)]'}>
                            {slots[idx].name}
                            {slots[idx].isInjured && (
                              <span className="ml-1 text-[8px] font-bold text-red-400 no-underline">{slots[idx].status.replace('Injured ', 'IL-').replace('-Day', '')}</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[var(--lg-text-muted)] opacity-30">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-2 py-1.5 border-t border-[var(--lg-border-faint)] text-[8px] text-[var(--lg-text-muted)] opacity-50 flex justify-between">
              <span>Source: MLB Stats API · {depthPlayerCount} players</span>
              <span>{depthCachedAt && formatLocalDate(depthCachedAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            </div>
          </div>
        )}
      </div>

      {/* YouTube Video Modal */}
      {activeVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setActiveVideo(null)}
        >
          <div
            className="relative w-full max-w-4xl mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setActiveVideo(null)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white text-sm font-medium transition-colors"
            >
              Close
            </button>
            <div className="relative aspect-video rounded-xl overflow-hidden shadow-2xl">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${activeVideo.videoId}?autoplay=1&rel=0`}
                title={activeVideo.title}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <a
              href={`https://www.youtube.com/watch?v=${activeVideo.videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-xs text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] mt-2 underline underline-offset-2"
            >
              Video not playing? Watch on YouTube
            </a>
            <div className="mt-2 text-sm text-white/80 font-medium line-clamp-2">{activeVideo.title}</div>
          </div>
        </div>
      )}
    </div>
  );
}
