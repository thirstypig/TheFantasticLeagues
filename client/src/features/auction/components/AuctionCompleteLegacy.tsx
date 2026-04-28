import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trophy, Download, Sparkles, Loader2, ArrowLeftRight, Save, Check, Rewind } from 'lucide-react';
import AuctionReplay from './AuctionReplay';
import type { ClientAuctionState, AuctionLogEvent } from '../hooks/useAuctionState';
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";
import { fetchJsonApi, API_BASE } from '../../../api/base';
import { useLeague } from '../../../contexts/LeagueContext';
import { track } from '../../../lib/posthog';
import { POS_ORDER } from '../../../lib/baseballUtils';
import { mapPosition, positionToSlots } from '../../../lib/sportConfig';
import { getPlayerSeasonStats, type PlayerSeasonStat } from '../../../api';
import { getTradeBlock, saveTradeBlock, getLeagueTradeBlocks } from '../../teams/api';
import BidHistoryChart from './BidHistoryChart';
import DraftReport from './DraftReport';
import PlayerExpandedRow from './PlayerExpandedRow';
import PlayerDetailModal from '../../../components/shared/PlayerDetailModal';

interface AuctionCompleteLegacyProps {
  auctionState: ClientAuctionState;
  myTeamId?: number;
  onRefresh?: () => void;
}

interface TeamResult {
  id: number;
  name: string;
  code: string;
  budget: number;
  totalSpent: number;
  keeperSpend: number;
  auctionSpend: number;
  roster: { playerId: string; rosterId?: number; playerName: string; price: number; positions: string; isPitcher: boolean; mlbTeam?: string; isKeeper?: boolean; posList?: string; assignedPosition?: string }[];
}

interface DraftGrade {
  teamId: number;
  teamName: string;
  grade: string;
  summary: string;
}

export default function AuctionCompleteLegacy({ auctionState, myTeamId, onRefresh }: AuctionCompleteLegacyProps) {
  const [expandedTeamId, setExpandedTeamId] = useState<number | null>(null);
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSeasonStat | null>(null);
  const [rosterSort, setRosterSort] = useState<string>("position");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const toggleSort = (col: string) => {
    if (rosterSort === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setRosterSort(col); setSortDir(col === "price" || col === "R" || col === "HR" || col === "RBI" || col === "SB" || col === "W" || col === "SV" || col === "K" ? "desc" : "asc"); }
  };
  const SortTh = ({ col, children, className }: { col: string; children: React.ReactNode; className?: string }) => (
    <ThemedTh className={`cursor-pointer hover:text-[var(--lg-accent)] ${className || ''}`} onClick={() => toggleSort(col)}>
      {children} {rosterSort === col && (sortDir === "asc" ? "↑" : "↓")}
    </ThemedTh>
  );
  const [draftGrades, setDraftGrades] = useState<DraftGrade[] | null>(null);
  const [gradesLoading, setGradesLoading] = useState(false);
  const [gradesError, setGradesError] = useState<string | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const { leagueId, outfieldMode } = useLeague();

  // Optimistic position overrides — keyed by rosterId, value is the new position.
  // This allows the UI to immediately reflect user selections while the server round-trips.
  const [positionOverrides, setPositionOverrides] = useState<Record<number, string>>({});

  // Position swap handler — optimistically update UI, PATCH roster, then refresh state
  const handlePositionSwap = useCallback(async (teamId: number, rosterId: number, newPos: string) => {
    // Optimistic update — immediately reflect in UI
    setPositionOverrides(prev => ({ ...prev, [rosterId]: newPos }));
    try {
      await fetchJsonApi(`${API_BASE}/teams/${teamId}/roster/${rosterId}`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedPosition: newPos }),
      });
      // Refresh auction state so server state is in sync
      if (leagueId) {
        await fetchJsonApi(`${API_BASE}/auction/refresh-teams`, {
          method: 'POST',
          body: JSON.stringify({ leagueId }),
        });
      }
      // Re-fetch state — once complete, server data matches our optimistic update
      await onRefresh?.();
      // Clear override now that server state is authoritative
      setPositionOverrides(prev => {
        const next = { ...prev };
        delete next[rosterId];
        return next;
      });
    } catch (err) {
      // Revert optimistic update on failure
      setPositionOverrides(prev => {
        const next = { ...prev };
        delete next[rosterId];
        return next;
      });
      console.error("Failed to update position", err);
    }
  }, [leagueId, onRefresh]);

  // Position dropdown slots for a given position string
  const MATRIX_POSITIONS = ["C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH", "P"];

  // Player stats from CSV (for stat columns)
  const [playerStats, setPlayerStats] = useState<PlayerSeasonStat[]>([]);
  useEffect(() => {
    getPlayerSeasonStats(leagueId).then(setPlayerStats).catch(() => {});
  }, [leagueId]);

  // Build stats lookup by player name (case-insensitive)
  // Two-way players (Ohtani) appear twice: once as hitter, once as pitcher.
  // Key format: "name" for single-position players, "name::H" / "name::P" for two-way.
  const statsLookup = useMemo(() => {
    const map = new Map<string, PlayerSeasonStat>();
    // Detect two-way players: same name appears as both pitcher and hitter
    const nameCount = new Map<string, number>();
    for (const s of playerStats) {
      const name = (s.player_name || (s as any).name || '').toLowerCase();
      if (name) nameCount.set(name, (nameCount.get(name) || 0) + 1);
    }
    for (const s of playerStats) {
      const name = (s.player_name || (s as any).name || '').toLowerCase();
      if (!name) continue;
      if ((nameCount.get(name) || 0) > 1) {
        // Two-way player: key by name + role
        const role = s.is_pitcher ? "P" : "H";
        map.set(`${name}::${role}`, s);
      } else {
        map.set(name, s);
      }
    }
    return map;
  }, [playerStats]);

  // Stats lookup helper: for two-way players, use role-based key
  const getPlayerStats = useCallback((name: string, isPitcher: boolean) => {
    const key = name.toLowerCase();
    // Try role-specific key first (two-way player)
    const roleKey = `${key}::${isPitcher ? "P" : "H"}`;
    return statsLookup.get(roleKey) || statsLookup.get(key);
  }, [statsLookup]);

  // Trade block state
  const [tradeBlockSelections, setTradeBlockSelections] = useState<Set<string>>(new Set());
  const [tradeBlockSaving, setTradeBlockSaving] = useState(false);
  const [tradeBlockSaved, setTradeBlockSaved] = useState(false);
  const [tradeBlockError, setTradeBlockError] = useState<string | null>(null);
  // All teams' trade block data: teamId -> Set of playerIds (as strings)
  const [leagueTradeBlocks, setLeagueTradeBlocks] = useState<Record<number, Set<string>>>({});

  // Load league-wide trade blocks on mount
  useEffect(() => {
    if (!leagueId) return;
    getLeagueTradeBlocks(leagueId)
      .then(({ tradeBlocks }) => {
        const parsed: Record<number, Set<string>> = {};
        for (const [teamIdStr, playerIds] of Object.entries(tradeBlocks)) {
          parsed[Number(teamIdStr)] = new Set(playerIds.map(String));
        }
        setLeagueTradeBlocks(parsed);
        // Pre-populate my team's selections
        if (myTeamId && parsed[myTeamId]) {
          setTradeBlockSelections(new Set(parsed[myTeamId]));
        }
      })
      .catch(() => { /* non-critical */ });
  }, [leagueId, myTeamId]);

  const toggleTradeBlock = useCallback((playerId: string) => {
    setTradeBlockSaved(false);
    setTradeBlockSelections(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  }, []);

  const handleSaveTradeBlock = useCallback(async () => {
    if (!myTeamId) return;
    setTradeBlockSaving(true);
    setTradeBlockError(null);
    try {
      const playerIds = Array.from(tradeBlockSelections).map(Number).filter(Number.isFinite);
      const result = await saveTradeBlock(myTeamId, playerIds);
      setTradeBlockSaved(true);
      track("trade_block_saved", { teamId: myTeamId, count: result.playerIds.length });
      // Update league-wide data for my team
      setLeagueTradeBlocks(prev => ({
        ...prev,
        [myTeamId]: new Set(result.playerIds.map(String)),
      }));
      setTimeout(() => setTradeBlockSaved(false), 3000);
    } catch (e: unknown) {
      setTradeBlockError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setTradeBlockSaving(false);
    }
  }, [myTeamId, tradeBlockSelections]);

  const { teamResults, totalLots, totalSpent } = useMemo(() => {
    const wins = (auctionState.log || []).filter((e: AuctionLogEvent) => e.type === 'WIN');
    const totalLots = wins.length;
    const totalSpent = wins.reduce((sum, e) => sum + (e.amount || 0), 0);

    // Build team results directly from auction state roster (authoritative source)
    // The roster comes from refreshTeams() which queries the live DB
    const teamResults: TeamResult[] = (auctionState.teams || []).map(team => {
      const teamDbBudget = (team as any).dbBudget || auctionState.config?.budgetCap || 400;
      const PITCHER_POS = new Set(['P', 'SP', 'RP', 'CL', 'TWP']);

      const roster = (team.roster || []).map(r => {
        // Prefer assignedPosition (actual roster slot) over posPrimary
        // Critical for two-way players (Ohtani) who have posPrimary=DH but assignedPosition=P
        const assignedPos = ((r as any).assignedPosition || '').toUpperCase();
        const primaryPos = ((r as any).posPrimary || '').toUpperCase();
        const effectivePos = assignedPos || primaryPos;
        const src = String((r as any).source || '').toLowerCase();

        return {
          playerId: String(r.playerId),
          rosterId: r.id,
          playerName: (r as any).playerName || `Player #${r.playerId}`,
          price: r.price || 0,
          positions: effectivePos,
          posList: ((r as any).posList || primaryPos),
          isPitcher: PITCHER_POS.has(effectivePos),
          mlbTeam: (r as any).mlbTeam || '',
          isKeeper: src.includes('prior'),
        };
      });

      const spent = roster.reduce((s, r) => s + r.price, 0);

      return {
        id: team.id,
        name: team.name,
        code: team.code,
        budget: teamDbBudget,
        totalSpent: spent,
        keeperSpend: (team as any).keeperSpend ?? 0,
        auctionSpend: (team as any).auctionSpend ?? 0,
        roster,
      };
    });

    teamResults.sort((a, b) => b.totalSpent - a.totalSpent);
    return { teamResults, totalLots, totalSpent };
  }, [auctionState]);

  const handleExportExcel = async () => {
    const xlsx = await import('xlsx');
    const wb = xlsx.utils.book_new();

    // Summary sheet
    const summaryData = teamResults.map(t => ({
      Team: t.name,
      'Players': t.roster.length,
      'Total Spent': t.totalSpent,
      'Budget Remaining': t.budget - t.totalSpent,
      'Avg Cost': t.roster.length > 0 ? Math.round(t.totalSpent / t.roster.length) : 0,
    }));
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(summaryData), 'Summary');

    // All picks sheet (chronological from log)
    const wins = (auctionState.log || []).filter(e => e.type === 'WIN').reverse();
    const picksData = wins.map((w, i) => ({
      Pick: i + 1,
      Player: w.playerName || '',
      Team: w.teamName || '',
      Price: w.amount || 0,
    }));
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(picksData), 'All Picks');

    // Per-team sheets
    for (const team of teamResults) {
      if (team.roster.length === 0) continue;
      const teamData = team.roster
        .sort((a, b) => b.price - a.price)
        .map((p, i) => ({
          '#': i + 1,
          Player: p.playerName,
          Price: p.price,
          Position: p.positions || '',
        }));
      const sheetName = team.name.slice(0, 31); // Excel 31-char limit
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(teamData), sheetName);
    }

    xlsx.writeFile(wb, `Auction_Results_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="px-4 py-6 md:px-6 md:py-10 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3">
          <Trophy className="w-8 h-8 text-[var(--lg-accent)]" />
          <h1 className="text-2xl md:text-3xl font-semibold text-[var(--lg-text-heading)]">
            Auction Complete
          </h1>
        </div>
        <p className="text-sm text-[var(--lg-text-secondary)]">
          The auction draft has concluded. All rosters are filled.
        </p>
        <div className="flex items-center justify-center gap-2 mt-2">
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] text-[var(--lg-text-secondary)] hover:bg-[var(--lg-tint-hover)] transition-colors"
          >
            <Download size={14} />
            Export to Excel
          </button>
          {(auctionState.log || []).length > 0 && (
            <button
              onClick={() => setShowReplay((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                showReplay
                  ? 'border-[var(--lg-accent)]/30 bg-[var(--lg-accent)]/10 text-[var(--lg-accent)]'
                  : 'border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] text-[var(--lg-text-secondary)] hover:bg-[var(--lg-tint-hover)]'
              }`}
            >
              <Rewind size={14} />
              {showReplay ? 'Hide Replay' : 'Replay Draft'}
            </button>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-4 text-center">
          <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-1">Total Lots</div>
          <div className="text-2xl font-bold text-[var(--lg-text-heading)] tabular-nums">{totalLots}</div>
        </div>
        <div className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-4 text-center">
          <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-1">Total Spent</div>
          <div className="text-2xl font-bold text-[var(--lg-accent)] tabular-nums">${totalSpent}</div>
        </div>
        <div className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-4 text-center col-span-2 md:col-span-1">
          <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-1">Teams</div>
          <div className="text-2xl font-bold text-[var(--lg-text-heading)] tabular-nums">{teamResults.length}</div>
        </div>
      </div>

      {/* Auction Replay */}
      {showReplay && (
        <AuctionReplay
          log={auctionState.log || []}
          teams={(auctionState.teams || []).map((t) => ({ id: t.id, name: t.name, code: t.code }))}
          onClose={() => setShowReplay(false)}
        />
      )}

      {/* AI Draft Grades */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-pink-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--lg-text-muted)]">AI Draft Grades</h2>
          </div>
          {!draftGrades && (
            <button
              onClick={async () => {
                if (!leagueId) return;
                setGradesLoading(true);
                setGradesError(null);
                try {
                  const data = await fetchJsonApi<{ grades: DraftGrade[] }>(`${API_BASE}/auction/draft-grades?leagueId=${leagueId}`);
                  setDraftGrades(data.grades);
                  track("auction_draft_grades_generated");
                } catch (e: unknown) {
                  setGradesError(e instanceof Error ? e.message : 'Failed to generate grades');
                } finally {
                  setGradesLoading(false);
                }
              }}
              disabled={gradesLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-pink-500/10 text-pink-400 border border-pink-500/20 hover:bg-pink-500/20 transition-colors disabled:opacity-50"
            >
              {gradesLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {gradesLoading ? 'Grading...' : 'Generate Grades'}
            </button>
          )}
        </div>

        {gradesError && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {gradesError}
          </div>
        )}

        {draftGrades && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {draftGrades.map((g) => {
              const isMe = g.teamId === myTeamId;
              const gradeColor =
                g.grade.startsWith('A') ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5' :
                g.grade.startsWith('B') ? 'text-blue-400 border-blue-500/30 bg-blue-500/5' :
                g.grade.startsWith('C') ? 'text-amber-400 border-amber-500/30 bg-amber-500/5' :
                'text-red-400 border-red-500/30 bg-red-500/5';

              return (
                <div
                  key={g.teamId}
                  className={`rounded-lg border p-4 ${gradeColor} ${isMe ? 'ring-1 ring-[var(--lg-accent)]' : ''}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-[var(--lg-text-primary)]">
                      {g.teamName}
                      {isMe && <span className="ml-1.5 text-xs text-[var(--lg-accent)]">(You)</span>}
                    </span>
                    <span className="text-2xl font-bold tabular-nums">{g.grade}</span>
                  </div>
                  <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed">{g.summary}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bid History Visualization */}
      {(auctionState.log || []).length > 0 && (
        <BidHistoryChart
          log={auctionState.log || []}
          teams={(auctionState.teams || []).map(t => ({ id: t.id, name: t.name, code: t.code }))}
        />
      )}

      {/* Draft Report — post-auction analytics */}
      {leagueId && <DraftReport leagueId={leagueId} myTeamId={myTeamId} />}

      {/* Team Results */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--lg-text-muted)]">Draft Results by Team</h2>
        <div className="rounded-xl border border-[var(--lg-border-subtle)] overflow-hidden divide-y divide-[var(--lg-divide)]">
          {teamResults.map((team) => {
            const isExpanded = expandedTeamId === team.id;
            const isMe = team.id === myTeamId;

            return (
              <div key={team.id} className={isMe ? 'bg-[var(--lg-tint)]' : ''}>
                <div
                  className="px-4 md:px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-[var(--lg-tint)] transition-all"
                  onClick={() => setExpandedTeamId(isExpanded ? null : team.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className={`font-semibold ${isMe ? 'text-[var(--lg-accent)]' : 'text-[var(--lg-text-primary)]'}`}>
                        {team.name}
                        {isMe && <span className="ml-2 text-xs font-medium text-[var(--lg-accent)]">(You)</span>}
                      </span>
                      <span className="text-xs font-medium text-[var(--lg-text-muted)]">
                        {team.roster.length} players acquired
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 md:gap-6 text-right">
                    {team.keeperSpend > 0 && (
                      <div className="flex flex-col">
                        <span className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">Keepers</span>
                        <span className="font-semibold text-amber-400 tabular-nums">${team.keeperSpend}</span>
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">{team.keeperSpend > 0 ? 'Auction' : 'Spent'}</span>
                      <span className="font-semibold text-[var(--lg-accent)] tabular-nums">${team.auctionSpend}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">Total</span>
                      <span className="font-semibold text-[var(--lg-text-primary)] tabular-nums">${team.totalSpent}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">Left</span>
                      <span className={`font-semibold tabular-nums ${(team.budget - team.totalSpent) < 0 ? 'text-red-400' : 'text-[var(--lg-text-primary)]'}`}>${team.budget - team.totalSpent}</span>
                    </div>
                    <div className={`text-[var(--lg-text-muted)] transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </div>
                  </div>
                </div>

                {isExpanded && team.roster.length > 0 && (() => {
                  // Generic sort function for any column
                  const sortRoster = (list: typeof team.roster) => {
                    return [...list].sort((a, b) => {
                      const statsA = getPlayerStats(a.playerName || '', a.isPitcher);
                      const statsB = getPlayerStats(b.playerName || '', b.isPitcher);
                      let cmp = 0;
                      if (rosterSort === 'name') cmp = (a.playerName || '').localeCompare(b.playerName || '');
                      else if (rosterSort === 'position') {
                        const pA = (a.rosterId && positionOverrides[a.rosterId]) || mapPosition((a.positions || '').split(',')[0]?.trim() || '', outfieldMode);
                        const pB = (b.rosterId && positionOverrides[b.rosterId]) || mapPosition((b.positions || '').split(',')[0]?.trim() || '', outfieldMode);
                        cmp = (POS_ORDER.indexOf(pA) === -1 ? 99 : POS_ORDER.indexOf(pA)) - (POS_ORDER.indexOf(pB) === -1 ? 99 : POS_ORDER.indexOf(pB));
                      }
                      else if (rosterSort === 'mlb') cmp = (a.mlbTeam || '').localeCompare(b.mlbTeam || '');
                      else if (rosterSort === 'price') cmp = a.price - b.price;
                      else { const va = Number((statsA as any)?.[rosterSort] ?? 0); const vb = Number((statsB as any)?.[rosterSort] ?? 0); cmp = va - vb; }
                      return sortDir === 'desc' ? -cmp : cmp;
                    });
                  };
                  const hitters = sortRoster(team.roster.filter(p => !p.isPitcher));
                  const pitchers = sortRoster(team.roster.filter(p => p.isPitcher));

                  const fmtAvg = (v: any) => { const n = Number(v); return n > 0 && n < 1 ? n.toFixed(3).replace(/^0/, '') : n > 0 ? n.toFixed(3) : '—'; };
                  const fmtRate = (v: any) => { const n = Number(v); return n > 0 ? n.toFixed(2) : '—'; };
                  const num = (v: any) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

                  return (
                  <div className="border-t border-[var(--lg-border-faint)] animate-in fade-in slide-in-from-top-2 duration-300">
                    {/* HITTERS */}
                    <div className="px-3 pt-3 pb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--lg-text-muted)]">Hitters ({hitters.length})</span>
                    </div>
                    <ThemedTable>
                      <ThemedThead>
                        <ThemedTr>
                          <SortTh col="name">Player</SortTh>
                          <SortTh col="position" className="w-10">Pos</SortTh>
                          <SortTh col="mlb" className="w-10">MLB</SortTh>
                          <SortTh col="price" className="w-12">$</SortTh>
                          <SortTh col="R" className="w-10">R</SortTh>
                          <SortTh col="HR" className="w-10">HR</SortTh>
                          <SortTh col="RBI" className="w-10">RBI</SortTh>
                          <SortTh col="SB" className="w-10">SB</SortTh>
                          <SortTh col="AVG" className="w-12">AVG</SortTh>
                        </ThemedTr>
                      </ThemedThead>
                      <tbody className="divide-y divide-[var(--lg-divide)]">
                        {hitters.map(player => {
                          const stats = getPlayerStats(player.playerName || '', false);
                          const posSlots = (() => {
                            const raw = player.posList || player.positions || '';
                            const slots = new Set<string>();
                            for (const p of raw.split(',').map(s => s.trim()).filter(Boolean)) {
                              for (const s of positionToSlots(p)) slots.add(s);
                            }
                            // Only add DH if the player's actual position includes DH
                            return MATRIX_POSITIONS.filter(s => slots.has(s));
                          })();
                          const rowKey = `${team.id}-${player.playerId}-H`;
                          const isRowExpanded = expandedPlayerId === rowKey;
                          const playerObj = stats || ({ mlb_id: player.playerId, player_name: player.playerName, positions: player.positions, is_pitcher: false } as unknown as PlayerSeasonStat);
                          return (
                            <React.Fragment key={rowKey}>
                            <ThemedTr
                              className={`cursor-pointer ${isRowExpanded ? 'bg-[var(--lg-tint)]' : 'hover:bg-[var(--lg-tint)]/50'}`}
                              onClick={() => setExpandedPlayerId(isRowExpanded ? null : rowKey)}
                            >
                              <ThemedTd className="py-1.5">
                                <span className="font-semibold text-[var(--lg-text-primary)] text-xs inline-flex items-center gap-1">
                                  {player.playerName}
                                  {player.isKeeper && <span className="text-[8px] font-bold uppercase text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1 rounded">K</span>}
                                </span>
                              </ThemedTd>
                              <ThemedTd className="py-1.5">
                                <span className="text-[10px] font-mono font-semibold text-[var(--lg-accent)]">
                                  {player.assignedPosition || mapPosition(player.positions?.split(",")[0]?.trim() || "", outfieldMode) || "—"}
                                </span>
                              </ThemedTd>
                              <ThemedTd className="py-1.5 text-[10px] text-[var(--lg-text-muted)]">{player.mlbTeam || "—"}</ThemedTd>
                              <ThemedTd align="right" className={`py-1.5 text-xs font-semibold tabular-nums ${player.isKeeper ? 'text-amber-500' : 'text-[var(--lg-accent)]'}`}>${player.price}</ThemedTd>
                              <ThemedTd align="center" className="py-1.5 text-[10px] tabular-nums">{num(stats?.R) || '—'}</ThemedTd>
                              <ThemedTd align="center" className="py-1.5 text-[10px] tabular-nums">{num(stats?.HR) || '—'}</ThemedTd>
                              <ThemedTd align="center" className="py-1.5 text-[10px] tabular-nums">{num(stats?.RBI) || '—'}</ThemedTd>
                              <ThemedTd align="center" className="py-1.5 text-[10px] tabular-nums">{num(stats?.SB) || '—'}</ThemedTd>
                              <ThemedTd align="center" className="py-1.5 text-[10px] tabular-nums">{fmtAvg(stats?.AVG)}</ThemedTd>
                            </ThemedTr>
                            {isRowExpanded && (
                              <PlayerExpandedRow
                                player={playerObj}
                                isTaken={true}
                                ownerName={team.name}
                                colSpan={9}
                                onViewDetail={(p) => setSelectedPlayer(p)}
                              />
                            )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </ThemedTable>

                    {/* PITCHERS */}
                    <div className="px-3 pt-3 pb-1 border-t border-[var(--lg-border-faint)]">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--lg-text-muted)]">Pitchers ({pitchers.length})</span>
                    </div>
                    <ThemedTable>
                      <ThemedThead>
                        <ThemedTr>
                          <SortTh col="name">Player</SortTh>
                          <SortTh col="position" className="w-10">Pos</SortTh>
                          <SortTh col="mlb" className="w-10">MLB</SortTh>
                          <SortTh col="price" className="w-12">$</SortTh>
                          <SortTh col="W" className="w-10">W</SortTh>
                          <SortTh col="SV" className="w-10">SV</SortTh>
                          <SortTh col="K" className="w-10">K</SortTh>
                          <SortTh col="ERA" className="w-12">ERA</SortTh>
                          <SortTh col="WHIP" className="w-12">WHIP</SortTh>
                        </ThemedTr>
                      </ThemedThead>
                      <tbody className="divide-y divide-[var(--lg-divide)]">
                        {pitchers.map(player => {
                          const stats = getPlayerStats(player.playerName || '', true);
                          const rowKey = `${team.id}-${player.playerId}-P`;
                          const isRowExpanded = expandedPlayerId === rowKey;
                          const playerObj = stats || ({ mlb_id: player.playerId, player_name: player.playerName, positions: 'P', is_pitcher: true } as unknown as PlayerSeasonStat);
                          return (
                            <React.Fragment key={rowKey}>
                            <ThemedTr
                              className={`cursor-pointer ${isRowExpanded ? 'bg-[var(--lg-tint)]' : 'hover:bg-[var(--lg-tint)]/50'}`}
                              onClick={() => setExpandedPlayerId(isRowExpanded ? null : rowKey)}
                            >
                              <ThemedTd className="py-1.5">
                                <span className="font-semibold text-[var(--lg-text-primary)] text-xs inline-flex items-center gap-1">
                                  {player.playerName}
                                  {player.isKeeper && <span className="text-[8px] font-bold uppercase text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1 rounded">K</span>}
                                </span>
                              </ThemedTd>
                              <ThemedTd className="py-1.5 text-[10px] text-[var(--lg-text-muted)] font-mono">{mapPosition(player.positions?.split(",")[0]?.trim() || "P", outfieldMode)}</ThemedTd>
                              <ThemedTd className="py-1.5 text-[10px] text-[var(--lg-text-muted)]">{player.mlbTeam || "—"}</ThemedTd>
                              <ThemedTd align="right" className={`py-1.5 text-xs font-semibold tabular-nums ${player.isKeeper ? 'text-amber-500' : 'text-[var(--lg-accent)]'}`}>${player.price}</ThemedTd>
                              <ThemedTd align="center" className="py-1.5 text-[10px] tabular-nums">{num(stats?.W) || '—'}</ThemedTd>
                              <ThemedTd align="center" className="py-1.5 text-[10px] tabular-nums">{num(stats?.SV) || '—'}</ThemedTd>
                              <ThemedTd align="center" className="py-1.5 text-[10px] tabular-nums">{num(stats?.K) || '—'}</ThemedTd>
                              <ThemedTd align="center" className="py-1.5 text-[10px] tabular-nums">{fmtRate(stats?.ERA)}</ThemedTd>
                              <ThemedTd align="center" className="py-1.5 text-[10px] tabular-nums">{fmtRate(stats?.WHIP)}</ThemedTd>
                            </ThemedTr>
                            {isRowExpanded && (
                              <PlayerExpandedRow
                                player={playerObj}
                                isTaken={true}
                                ownerName={team.name}
                                colSpan={9}
                                onViewDetail={(p) => setSelectedPlayer(p)}
                              />
                            )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </ThemedTable>

                    {/* Save Trade Block button for own team */}
                    {isMe && (
                      <div className="px-4 md:px-6 py-3 flex items-center justify-between border-t border-[var(--lg-border-faint)] bg-[var(--lg-tint)]/50">
                        <span className="text-xs text-[var(--lg-text-muted)]">
                          {tradeBlockSelections.size > 0
                            ? `${tradeBlockSelections.size} player${tradeBlockSelections.size !== 1 ? 's' : ''} on trade block`
                            : 'Click the trade icons to flag players as available'}
                        </span>
                        <div className="flex items-center gap-2">
                          {tradeBlockError && (
                            <span className="text-xs text-red-400">{tradeBlockError}</span>
                          )}
                          <button
                            onClick={handleSaveTradeBlock}
                            disabled={tradeBlockSaving}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 ${
                              tradeBlockSaved
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20'
                            }`}
                          >
                            {tradeBlockSaving ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : tradeBlockSaved ? (
                              <Check size={12} />
                            ) : (
                              <Save size={12} />
                            )}
                            {tradeBlockSaving ? 'Saving...' : tradeBlockSaved ? 'Saved' : 'Save Trade Block'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>
      {selectedPlayer && <PlayerDetailModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />}
    </div>
  );
}
