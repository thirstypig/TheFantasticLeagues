
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { fetchJsonApi, API_BASE, yyyyMmDd, addDays } from "../api/base";
import { ChevronLeft, ChevronRight, Gavel, Trophy, Users, Calendar } from "lucide-react";
import { joinLeague } from "../features/leagues/api";
import { useToast } from "../contexts/ToastContext";
import { useLeague } from "../contexts/LeagueContext";
import { useSeasonGating } from "../hooks/useSeasonGating";

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
        isLive ? 'text-emerald-400' : 'text-[var(--lg-text-muted)] opacity-50'
      }`}>
        {isLive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />}
        {statusText}
      </div>
      {/* Away */}
      <div className="flex justify-between items-center mb-0.5">
        <span className={`text-xs font-bold ${!isPreview && game.away.score > game.home.score ? 'text-[var(--lg-text-heading)]' : 'text-[var(--lg-text-secondary)]'}`}>
          {game.away.abbr}
        </span>
        {!isPreview && <span className="text-xs font-bold tabular-nums text-[var(--lg-text-primary)]">{game.away.score}</span>}
      </div>
      {/* Home */}
      <div className="flex justify-between items-center">
        <span className={`text-xs font-bold ${!isPreview && game.home.score > game.away.score ? 'text-[var(--lg-text-heading)]' : 'text-[var(--lg-text-secondary)]'}`}>
          {game.home.abbr}
        </span>
        {!isPreview && <span className="text-xs font-bold tabular-nums text-[var(--lg-text-primary)]">{game.home.score}</span>}
      </div>
      {/* Records */}
      <div className="text-[9px] text-[var(--lg-text-muted)] opacity-40 mt-1 flex justify-between">
        <span>{game.away.wins}-{game.away.losses}</span>
        <span>{game.home.wins}-{game.home.losses}</span>
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
  const [transactions, setTransactions] = useState<MlbTransaction[]>([]);
  const [loadingScores, setLoadingScores] = useState(true);
  const [loadingTx, setLoadingTx] = useState(true);
  const [txFilter, setTxFilter] = useState<'ALL' | 'NL' | 'AL'>('ALL');

  // Invite code
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [hasTeam, setHasTeam] = useState<boolean | null>(null);

  // Check if user has a team + build dashboard
  useEffect(() => {
    if (!user || !currentLeagueId) { setHasTeam(null); setDash(null); return; }
    fetchJsonApi<{ league: { name: string; season: number; teams: Array<{ id: number; name: string; budget: number; ownerUserId?: number | null; ownerships?: Array<{ userId: number }> }> } }>(`${API_BASE}/leagues/${currentLeagueId}`)
      .then(res => {
        const uid = Number(user.id);
        const league = res.league;
        const teams = league?.teams || [];
        const mine = teams.find(t =>
          t.ownerUserId === uid || (t.ownerships || []).some(o => o.userId === uid)
        );
        setHasTeam(!!mine);
        setDash({
          leagueName: league?.name || '',
          season: league?.season || new Date().getFullYear(),
          teamCount: teams.length,
          myTeam: mine ? { name: mine.name, id: mine.id, budget: mine.budget, rosterCount: 0 } : null,
        });
      })
      .catch(() => { setHasTeam(null); setDash(null); });
  }, [user, currentLeagueId]);

  // Fetch scores
  useEffect(() => {
    setLoadingScores(true);
    fetchJsonApi<{ games: GameScore[] }>(`${API_BASE}/mlb/scores?date=${date}`)
      .then(res => setGames(res.games || []))
      .catch(() => setGames([]))
      .finally(() => setLoadingScores(false));
  }, [date]);

  // Fetch transactions
  useEffect(() => {
    setLoadingTx(true);
    fetchJsonApi<{ transactions: MlbTransaction[] }>(`${API_BASE}/mlb/transactions?date=${date}&filter=${txFilter}`)
      .then(res => setTransactions(res.transactions || []))
      .catch(() => setTransactions([]))
      .finally(() => setLoadingTx(false));
  }, [date, txFilter]);

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

      {/* Invite code banner (only if no team) */}
      {hasTeam === false && (
        <div className="rounded-xl border border-[var(--lg-accent)]/20 bg-[var(--lg-accent)]/5 p-4 flex flex-col sm:flex-row items-center gap-3">
          <div className="flex-1 text-sm text-[var(--lg-text-primary)]">
            <strong>Join a League</strong> — enter your invite code to get started
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
              placeholder="ABC123"
              maxLength={10}
              className="w-24 px-3 py-1.5 text-sm font-mono text-center rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-secondary)] text-[var(--lg-text-primary)] outline-none focus:ring-1 focus:ring-[var(--lg-accent)]"
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
      )}

      {/* Dashboard cards */}
      {dash && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {/* My Team */}
          {dash.myTeam && (
            <Link to={`/teams/${dash.myTeam.name}`} className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-3 hover:border-[var(--lg-accent)]/30 transition-colors">
              <div className="flex items-center gap-2 mb-1.5">
                <Users size={14} className="text-[var(--lg-accent)]" />
                <span className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">My Team</span>
              </div>
              <div className="text-sm font-semibold text-[var(--lg-text-heading)] truncate">{dash.myTeam.name}</div>
              <div className="text-[10px] text-[var(--lg-text-muted)] mt-0.5">Budget: ${dash.myTeam.budget}</div>
            </Link>
          )}

          {/* League */}
          <Link to="/season" className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-3 hover:border-[var(--lg-accent)]/30 transition-colors">
            <div className="flex items-center gap-2 mb-1.5">
              <Trophy size={14} className="text-amber-400" />
              <span className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">League</span>
            </div>
            <div className="text-sm font-semibold text-[var(--lg-text-heading)]">{dash.leagueName}</div>
            <div className="text-[10px] text-[var(--lg-text-muted)] mt-0.5">{dash.season} · {dash.teamCount} teams</div>
          </Link>

          {/* Season Phase */}
          <Link to="/season" className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-3 hover:border-[var(--lg-accent)]/30 transition-colors">
            <div className="flex items-center gap-2 mb-1.5">
              <Calendar size={14} className="text-emerald-400" />
              <span className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">Phase</span>
            </div>
            <div className="text-sm font-semibold text-[var(--lg-text-heading)]">{gating.phaseGuidance?.split('—')[0]?.trim() || 'Setup'}</div>
            <div className="text-[10px] text-[var(--lg-text-muted)] mt-0.5">{gating.canAuction ? 'Auction open' : gating.canTrade ? 'Trades open' : 'Pre-season'}</div>
          </Link>

          {/* Quick Action */}
          {gating.canAuction ? (
            <Link to="/auction" className="rounded-xl border border-[var(--lg-accent)]/30 bg-[var(--lg-accent)]/5 p-3 hover:bg-[var(--lg-accent)]/10 transition-colors">
              <div className="flex items-center gap-2 mb-1.5">
                <Gavel size={14} className="text-[var(--lg-accent)]" />
                <span className="text-[10px] font-semibold uppercase text-[var(--lg-accent)]">Auction</span>
              </div>
              <div className="text-sm font-semibold text-[var(--lg-accent)]">Draft Room</div>
              <div className="text-[10px] text-[var(--lg-text-muted)] mt-0.5">Live auction open</div>
            </Link>
          ) : (
            <Link to="/activity" className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-3 hover:border-[var(--lg-accent)]/30 transition-colors">
              <div className="flex items-center gap-2 mb-1.5">
                <Gavel size={14} className="text-purple-400" />
                <span className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">Activity</span>
              </div>
              <div className="text-sm font-semibold text-[var(--lg-text-heading)]">Transactions</div>
              <div className="text-[10px] text-[var(--lg-text-muted)] mt-0.5">Trades & waivers</div>
            </Link>
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

      {/* Transactions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)]">Transactions</h2>
          <div className="flex bg-[var(--lg-tint)] rounded-md p-0.5 border border-[var(--lg-border-subtle)]">
            {(['ALL', 'NL', 'AL'] as const).map(f => (
              <button
                key={f}
                onClick={() => setTxFilter(f)}
                className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded transition-all ${
                  txFilter === f ? 'bg-[var(--lg-tint-hover)] text-[var(--lg-text-primary)]' : 'text-[var(--lg-text-muted)]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        {loadingTx ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-8 rounded bg-[var(--lg-tint)] animate-pulse" />)}
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-8 text-xs text-[var(--lg-text-muted)] opacity-50">No transactions for this date</div>
        ) : (
          <div className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] px-3 max-h-[400px] overflow-y-auto">
            {transactions.map(tx => <TransactionRow key={tx.id} tx={tx} />)}
          </div>
        )}
      </div>
    </div>
  );
}
