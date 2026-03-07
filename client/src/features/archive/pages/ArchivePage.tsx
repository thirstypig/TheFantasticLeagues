// client/src/pages/ArchivePage.tsx
import React, { useEffect, useState } from 'react';
import { getArchiveSeasons, getArchivePeriods, getArchivePeriodStats, getArchiveDraftResults, updateArchiveTeamName, fmtRate } from '../../../api';
import { fetchJsonApi } from '../../../api/base';
import { OGBA_TEAM_NAMES } from '../../../lib/ogbaTeams';
import { useAuth } from '../../../auth/AuthProvider';
import EditPlayerNameModal from '../../players/components/EditPlayerNameModal';
import EditTeamNameModal from '../../teams/components/EditTeamNameModal';

import ArchiveAdminPanel from '../../admin/components/ArchiveAdminPanel';
import { Button } from "../../../components/ui/button";
import AIInsightsModal from '../../../components/AIInsightsModal';
import PageHeader from '../../../components/ui/PageHeader';
import {
  SeasonTable, TeamSeasonRow, PeriodMeta,
  PeriodSummaryTable, TeamPeriodSummaryRow,
  CategoryPeriodTable, CategoryPeriodRow
} from '../../../components/StatsTables';
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from '../../../components/ui/ThemedTable';

interface PlayerStat {
  id: number;
  playerName: string;
  displayName?: string;
  fullName?: string;
  mlbId?: string;
  teamCode: string;
  isPitcher: boolean;
  position?: string;
  mlbTeam?: string;
  R?: number;
  HR?: number;
  RBI?: number;
  SB?: number;
  AVG?: number;
  GS?: number; // Grand Slams
  W?: number;
  SV?: number;
  K?: number;
  ERA?: number;
  WHIP?: number;
  SO?: number; // Shut Outs
}

interface DraftPlayer {
  playerName: string;
  fullName: string;
  teamCode: string;
  position: string;
  mlbTeam: string | null;
  draftDollars: number;
  isPitcher: boolean;
  isKeeper: boolean;
  id?: number; // DB ID for edits
}

interface DraftTrade {
  fromTeamName: string;
  fromTeamCode: string;
  toTeamName: string;
  toTeamCode: string;
  amount: number;
  note: string;
}

type TabType = 'stats' | 'standings' | 'period-results' | 'draft';

// Keepers for 2024 and 2025
const KEEPER_MAP: Record<number, Record<string, string[]>> = {
  2024: {
    'DKD': ['F. Tatis Jr.', 'M. Harris II', 'J.Chisholm Jr.', 'E. De La Cruz'],
    'DLC': ['R. Acuna Jr.', 'C. Carroll', 'S. Ohtani', 'Z. Wheeler'],
    'DDD': ['C. Walker', 'F. Lindor', 'F. Alverez', 'E. Perez'],
    'SDS': ['M. Olson', 'T. Turner', 'S. Strider', 'S. Ohtani'],
    'RSR': ['F. Freeman', 'O. Cruz', 'K. Schwarber', 'F. Peralta'],
    'DD2': ['N. Jones', 'O. Albies', 'A. Riley', 'Z. Gallen'],
    'LDL': ['M. Betts', 'M. Muncy', 'W. Smith', 'B. Miller'],
    'TST': ['B. Harper', 'P. Alonso', 'M. Machado', 'M. Fried']
  },
  2025: {
    'DKD': ['E. De La Cruz', 'F. Tatis Jr.', 'D. Crews'],
    'DLC': ['C. Carroll', 'R. Acuna Jr.', 'S. Ohtani', 'P. Skenes'],
    'DDD': ['F. Lindor', 'J. Chourio', 'J. Wood', 'CJ. Abrams'],
    'SDS': ['M. Olson', 'T. Turner', 'C. Sale', 'S. Ohtani'],
    'RSR': ['F. Freeman', 'O. Cruz', 'Wilm. Contreras', 'Y. Yamamoto'],
    'DD2': ['A. Riley', 'J. Merrill', 'S. Suzuki', 'M. Vientos'],
    'LDL': ['M. Betts', 'M. Muncy', 'T. Hernandez', 'W. Smith'],
    'TST': ['P. Alonso', 'M. Machado', 'B. Harper', 'B. Snell']
  }
};



export default function ArchivePage() {
  const { user, isAdmin } = useAuth();
  
  const [seasons, setSeasons] = useState<any[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [periods, setPeriods] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [stats, setStats] = useState<PlayerStat[]>([]);
  const [periodResults, setPeriodResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [standingsLoading, setStandingsLoading] = useState(false);
  
  // Matrix / Detail State
  const [seasonRows, setSeasonRows] = useState<TeamSeasonRow[]>([]);
  const [periodSummaryRows, setPeriodSummaryRows] = useState<TeamPeriodSummaryRow[]>([]);
  const [categoryRows, setCategoryRows] = useState<Record<string, CategoryPeriodRow[]>>({});
  const [periodMeta, setPeriodMeta] = useState<PeriodMeta[]>([]);

  const [periodResultsLoading, setPeriodResultsLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string | number, direction: 'asc' | 'desc' }>({ key: 'final', direction: 'desc' });

  const handleSort = (key: string | number) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
    }));
  };
  const [error, setError] = useState<string | null>(null);
  const [editingStat, setEditingStat] = useState<PlayerStat| null>(null);
  const [editingTeam, setEditingTeam] = useState<{ teamCode: string; name: string } | null>(null);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TabType | 'admin'>('standings');
  const [draftPlayers, setDraftPlayers] = useState<DraftPlayer[]>([]);
  const [draftTrades, setDraftTrades] = useState<DraftTrade[]>([]);
  const [draftLoading, setDraftLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [aiModalTeam, setAiModalTeam] = useState<{ code: string; name: string } | null>(null);

  const canEdit = isAdmin;

  const handleRecalculate = async () => {
    if (!selectedYear || recalculating) return;
    
    // Determine context based on active tab
    const tab = activeTab === 'draft' ? 'draft' : (activeTab === 'stats' ? 'stats' : null);
    const period = activeTab === 'stats' ? selectedPeriod : null;
    
    const contextMsg = tab === 'draft' 
      ? 'Opening Day' 
      : period 
        ? `Period ${period} start date`
        : 'all periods';
    
    if (!confirm(`Recalculate MLB team data using ${contextMsg}?`)) return;
    
    try {
      setRecalculating(true);
      const result = await fetchJsonApi<any>(`/api/archive/${selectedYear}/recalculate`, {
        method: 'POST',
        body: JSON.stringify({ tab, periodNumber: period }),
      });
      if (result.success) {
        alert(`Recalculation complete! Updated ${result.updated} player records for ${result.tab === 'draft' ? 'Auction Draft' : result.periodNumber ? `Period ${result.periodNumber}` : 'all periods'}.`);
        window.location.reload();
      } else {
        alert(`Recalculation failed: ${result.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setRecalculating(false);
    }
  };


  // Load available seasons
  useEffect(() => {
    async function loadSeasons() {
      try {
        setLoading(true);
        const data = await getArchiveSeasons();
        setSeasons(data.seasons || []);
        if (data.seasons?.length > 0) {
          // Check if there is a 2024 season
          const has2024 = data.seasons.some((s: any) => s.year === 2024);
          const selected = has2024 ? 2024 : data.seasons[0];
          setSelectedYear(typeof selected === 'number' ? selected : (selected as any).year);
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load archive');
      } finally {
        setLoading(false);
      }
    }
    loadSeasons();
  }, []);

  // Load periods when year changes
  useEffect(() => {
    if (!selectedYear) return;
    async function loadPeriods() {
      try {
        setLoading(true);
        setError(null);
        const data = await getArchivePeriods(selectedYear!);
        setPeriods(data.periods || []);
        
        // Transform periods to PeriodMeta for SeasonTable
        const meta: PeriodMeta[] = (data.periods || []).map((p: any) => ({
             periodId: String(p.periodNumber),
             label: `P${p.periodNumber}`,
             meetingDate: p.startDate ? new Date(p.startDate).toLocaleDateString() : 'Draft'
        }));
        setPeriodMeta(meta);

        // Default to Full Season (0) instead of P1
        setSelectedPeriod(0);
      } catch (err: any) {
        setError(err?.message || 'Failed to load periods');
        setPeriods([]);
      } finally {
        setLoading(false);
      }
    }
    loadPeriods();
  }, [selectedYear]);

  // Load stats when period changes
  useEffect(() => {
    if (!selectedYear || !selectedPeriod) return;
    async function loadStats() {
      try {
        setLoading(true);
        setError(null);
        const data = await getArchivePeriodStats(selectedYear!, selectedPeriod!);
        setStats(data.stats || []);
        
        // Expand all teams by default
        const teams = new Set<string>(data.stats?.map((s: PlayerStat) => s.teamCode) || []);
        setExpandedTeams(teams);
      } catch (err: any) {
        setError(err?.message || 'Failed to load stats');
        setStats([]);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, [selectedYear, selectedPeriod]);

  // Load draft results when year is selected
  useEffect(() => {
    if (!selectedYear) {
      setDraftPlayers([]);
      setDraftTrades([]);
      return;
    }
    async function loadDraft() {
      try {
        setDraftLoading(true);
        const data = await getArchiveDraftResults(selectedYear!);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setDraftPlayers((data.players || []).map((p: any) => ({ ...p, isKeeper: p.isKeeper ?? false })));
        setDraftTrades(data.trades || []);
      } catch {
        setDraftPlayers([]);
        setDraftTrades([]);
      } finally {
        setDraftLoading(false);
      }
    }
    loadDraft();
  }, [selectedYear]);

  // Load standings (Matrix or Detail)
  useEffect(() => {
    if (!selectedYear) {
      setSeasonRows([]);
      setPeriodSummaryRows([]);
      return;
    }
    async function loadStandings() {
      try {
        setStandingsLoading(true);
        const year = selectedYear!;
        
        // If specific Period selected: Load Detail
        if (selectedPeriod && selectedPeriod > 0) {
            const url = `/api/archive/${year}/period/${selectedPeriod}/standings`;
            const res = await fetch(url);
            const data = await res.json();
            const rawStandings = data.standings || [];

            // Transform to PeriodSummaryRow
            // Raw: { teamCode, teamName, totalScore, R, R_score, ... }
            const summary: TeamPeriodSummaryRow[] = rawStandings.map((s: any) => ({
                teamId: s.teamCode,
                teamName: OGBA_TEAM_NAMES[s.teamCode] || s.teamCode,
                gamesPlayed: s.gamesPlayed || 0, // API might not return gamesPlayed yet
                totalPoints: s.totalScore,
                totalPointsDelta: 0,
                categories: ['R','HR','RBI','SB','AVG','W','SV','K','ERA','WHIP'].map(cat => ({
                    categoryId: cat,
                    points: s[`${cat}_score`] || 0
                }))
            }));
            setPeriodSummaryRows(summary);

            // Transform to Category Rows
            const cats = ['R','HR','RBI','SB','AVG','W','SV','K','ERA','WHIP'];
            const catMap: Record<string, CategoryPeriodRow[]> = {};
            
            cats.forEach(cat => {
                catMap[cat] = rawStandings.map((s: any) => ({
                    teamId: s.teamCode,
                    teamName: OGBA_TEAM_NAMES[s.teamCode] || s.teamCode,
                    periodStat: s[cat] || (s.stats ? s.stats[cat] : 0), // Handle both flat and nested stats
                    points: s[`${cat}_score`] || 0,
                    pointsDelta: 0
                }));
            });
            setCategoryRows(catMap);

        } else {
            // Full Season Matrix
            // Need P1..Pn scores
            if (periods.length === 0) return;

            // Fetch ALL periods
            // TODO: Optimize backend to return matrix
            const promises = periods.map(p =>
                fetchJsonApi<any>(`/api/archive/${year}/period/${p.periodNumber}/standings`)
            );
            
            const results = await Promise.all(promises);
            // results[i] = { standings: [...] } for period i+1

            const teamMap: Record<string, TeamSeasonRow> = {};
            
            // Initialize teams
            // Use 1st period result to get teams? Or periods might vary? Teams usually constant.
            if (results[0]?.standings) {
                results[0].standings.forEach((s: any) => {
                    teamMap[s.teamCode] = {
                        teamId: s.teamCode,
                        teamName: OGBA_TEAM_NAMES[s.teamCode] || s.teamCode,
                        periodPoints: {},
                        seasonTotalPoints: 0
                    };
                });
            }

            // Fill Data
            results.forEach((res, idx) => {
                const pid = periods[idx].periodNumber;
                (res.standings || []).forEach((s: any) => {
                    if (!teamMap[s.teamCode]) {
                         teamMap[s.teamCode] = {
                            teamId: s.teamCode,
                            teamName: OGBA_TEAM_NAMES[s.teamCode] || s.teamCode,
                            periodPoints: {},
                            seasonTotalPoints: 0
                        };
                    }
                    teamMap[s.teamCode].periodPoints[String(pid)] = s.totalScore;
                });
            });

            // Compute Totals
            Object.values(teamMap).forEach(row => {
                row.seasonTotalPoints = Object.values(row.periodPoints).reduce((sum, v) => sum + v, 0);
            });

            setSeasonRows(Object.values(teamMap));
        }

      } catch (err) {
        console.error(err);
      } finally {
        setStandingsLoading(false);
      }
    }
    loadStandings();
  }, [selectedYear, selectedPeriod, periods]);

  // Load period results trend
  useEffect(() => {
    if (!selectedYear) {
      setPeriodResults([]);
      return;
    }
    async function loadPeriodResults() {
      try {
        setPeriodResultsLoading(true);
        const year = selectedYear!;
        const data = await fetchJsonApi<any>(`/api/archive/${year}/period-results`);
        setPeriodResults(data.results || []);
      } catch (err) {
        console.error(err);
        setPeriodResults([]);
      } finally {
        setPeriodResultsLoading(false);
      }
    }
    loadPeriodResults();
  }, [selectedYear]);

  // Position order for hitters: 1B, 2B, SS, 3B, OF, C, CM, MI, DH, UT
  const HITTER_POS_ORDER: Record<string, number> = {
    '1B': 1, '2B': 2, 'SS': 3, '3B': 4,
    'LF': 5, 'CF': 6, 'RF': 7, 'OF': 8,
    'C': 9, 'CM': 10, 'MI': 11, 'DH': 12, 'UT': 13
  };

  const sortHitters = (a: PlayerStat, b: PlayerStat) => {
    const orderA = HITTER_POS_ORDER[a.position || 'UT'] ?? 99;
    const orderB = HITTER_POS_ORDER[b.position || 'UT'] ?? 99;
    return orderA - orderB;
  };

  // Pitchers: SP first (no saves), then relievers (with saves) at bottom
  const sortPitchers = (a: PlayerStat, b: PlayerStat) => {
    const aHasSaves = (a.SV ?? 0) > 0;
    const bHasSaves = (b.SV ?? 0) > 0;
    if (aHasSaves !== bHasSaves) return aHasSaves ? 1 : -1;
    return (a.fullName || a.playerName).localeCompare(b.fullName || b.playerName);
  };

  // Group stats by team
  const teamGroups = stats.reduce((acc: Record<string, PlayerStat[]>, stat) => {
    if (!acc[stat.teamCode]) acc[stat.teamCode] = [];
    acc[stat.teamCode].push(stat);
    return acc;
  }, {});

  const teamCodes = Object.keys(teamGroups).sort();

  const toggleTeam = (code: string) => {
    setExpandedTeams(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleSaveTeamName = async (newName: string) => {
    if (!selectedYear || !editingTeam) return;

    try {
      await updateArchiveTeamName(selectedYear, editingTeam.teamCode, newName);
      window.location.reload();
    } catch (err: any) {
      alert(`Error updating team name: ${err.message}`);
    }
  };

  const handleSavePlayer = (updatedStat: any) => {
    setStats(prev => prev.map(s => s.id === updatedStat.id ? updatedStat : s));
  };

  return (
    <div className="flex-1 min-h-screen bg-[var(--lg-glass-bg)] text-[var(--lg-text-primary)]">
      <main className="max-w-7xl mx-auto px-6 py-12">
        <PageHeader 
          title="Historical Archive" 
          subtitle="League History: Season stats and draft records."
        />

        {error && (
          <div className="mb-8 rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-sm font-medium text-red-300 flex items-center gap-3">
             <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
            Error: {error}
          </div>
        )}

        {/* TOP SELECTORS */}
        <div className="mb-12 flex flex-wrap gap-6 items-center">
            <div className="flex items-center gap-3 liquid-glass p-1.5 rounded-2xl border border-[var(--lg-border-subtle)] pr-6 bg-[var(--lg-tint)]">
              <div className="bg-[var(--lg-tint)] px-4 py-2 rounded-xl text-xs font-medium uppercase text-[var(--lg-text-muted)]">Season</div>
              <select
                value={selectedYear || ''}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-transparent text-sm text-[var(--lg-text-primary)] outline-none font-bold cursor-pointer hover:text-[var(--lg-accent)] transition-colors"
              >
                <option value="" className="bg-[#0c0c0c] border-none">Select Year...</option>
                {seasons.map((s) => {
                  const year = typeof s === 'number' ? s : s.year;
                  return (
                    <option key={year} value={year} className="bg-[#0c0c0c] border-none">{year}</option>
                  );
                })}
              </select>
            </div>

            <div className="flex items-center gap-3 liquid-glass p-1.5 rounded-2xl border border-[var(--lg-border-subtle)] pr-6 bg-[var(--lg-tint)]">
              <div className="bg-[var(--lg-tint)] px-4 py-2 rounded-xl text-xs font-medium uppercase text-[var(--lg-text-muted)]">View</div>
              <select
                value={selectedPeriod || ''}
                onChange={(e) => setSelectedPeriod(Number(e.target.value))}
                disabled={!selectedYear}
                className="bg-transparent text-sm text-[var(--lg-text-primary)] outline-none font-bold cursor-pointer hover:text-[var(--lg-accent)] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <option value="0" className="bg-[#0c0c0c] border-none">Full Season</option>
                {periods.map((p) => {
                  const formatDate = (dateStr: string | null) => {
                    if (!dateStr) return '';
                    const d = new Date(dateStr);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  };
                  const startLabel = p.periodNumber === 1 ? 'Start' : formatDate(p.startDate);
                  const endLabel = formatDate(p.endDate);
                  const dateRange = startLabel && endLabel ? ` [${startLabel} → ${endLabel}]` : '';
                  return (
                    <option key={p.id} value={p.periodNumber} className="bg-[#0c0c0c] border-none">
                      Period {p.periodNumber}{dateRange}
                    </option>
                  );
                })}
              </select>
            </div>

            {canEdit && (
              <Button
                onClick={handleRecalculate}
                disabled={recalculating || !selectedYear}
                variant="amber"
                size="sm"
              >
                {recalculating ? 'Processing...' : '⟳ Sync Data'}
              </Button>
            )}
        </div>

        {/* NAVIGATION TABS */}
        {selectedYear && (
          <div className="mb-12 flex gap-1 lg-card p-1 w-fit">
            <Button
              onClick={() => setActiveTab('standings')}
              variant={activeTab === 'standings' ? 'default' : 'ghost'}
              className="px-8"
            >
              Standings
            </Button>
            <Button
              onClick={() => setActiveTab('stats')}
              variant={activeTab === 'stats' ? 'default' : 'ghost'}
              className="px-8"
            >
              Player Stats
            </Button>
            <Button
              onClick={() => setActiveTab('draft')}
              variant={activeTab === 'draft' ? 'default' : 'ghost'}
              className="px-8"
            >
              Draft Results
            </Button>
            {canEdit && (
              <Button
                onClick={() => setActiveTab('admin')}
                variant={activeTab === 'admin' ? 'amber' : 'ghost'}
                className={`px-8 ${activeTab !== 'admin' ? 'text-amber-500/60 hover:text-amber-500' : ''}`}
              >
                Admin
              </Button>
            )}
          </div>
        )}


        {/* Draft Results Tab */}
        {activeTab === 'draft' && selectedYear && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              {/* Pre-Draft Trades */}
              <div className="lg:col-span-2">
                {draftTrades.length > 0 ? (
                  <div className="rounded-3xl liquid-glass border border-[var(--lg-border-subtle)] shadow-xl overflow-hidden">
                    <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-4 flex items-center gap-3">
                       <span className="text-amber-500">📝</span>
                       <h3 className="text-sm font-medium uppercase text-amber-500">Pre-Draft Trades</h3>
                    </div>
                    <div className="p-6">
                      <ThemedTable bare>
                        <tbody className="divide-y divide-[var(--lg-divide)]">
                          {draftTrades.map((trade, i) => (
                            <ThemedTr key={i} className="group border-none">
                                <ThemedTd className="py-2.5">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-[var(--lg-tint)] px-3 py-1 rounded-xl text-xs font-bold tabular-nums text-[var(--lg-accent)] border border-[var(--lg-border-faint)]">${trade.amount}</div>
                                        <div className="font-semibold">{trade.fromTeamName} <span className="text-[var(--lg-text-muted)] opacity-30">→</span> {trade.toTeamName}</div>
                                    </div>
                                </ThemedTd>
                                <ThemedTd align="right" className="py-2.5">
                                    {trade.note && <div className="text-[var(--lg-text-muted)] text-xs font-medium uppercase opacity-40 group-hover:opacity-100 transition-opacity">"{trade.note}"</div>}
                                </ThemedTd>
                            </ThemedTr>
                          ))}
                        </tbody>
                      </ThemedTable>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-[var(--lg-border-subtle)] p-12 text-center text-[var(--lg-text-muted)] italic text-sm opacity-40">
                    No pre-draft trades for this season.
                  </div>
                )}
              </div>

              {/* Keeper Legend */}
              <div className="rounded-3xl liquid-glass border border-[var(--lg-border-subtle)] p-6 shadow-xl">
                <div className="text-xs font-medium uppercase text-[var(--lg-text-muted)] mb-4">Legend</div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                     <span className="text-xs font-bold text-[var(--lg-text-secondary)]">Keeper</span>
                     <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20 text-xs font-bold uppercase tracking-tight">Keeper</span>
                  </div>
                  <div className="flex items-center justify-between">
                     <span className="text-xs font-bold text-[var(--lg-text-secondary)]">Hitter</span>
                     <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                  </div>
                  <div className="flex items-center justify-between">
                     <span className="text-xs font-bold text-[var(--lg-text-secondary)]">Pitcher</span>
                     <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                  </div>
                </div>
              </div>
            </div>

            {/* Draft Results by Team */}
            {draftLoading ? (
              <div className="text-center py-20 text-[var(--lg-text-muted)] italic animate-pulse">Loading draft data...</div>
            ) : draftPlayers.length === 0 ? (
              <div className="text-center py-20 text-[var(--lg-text-muted)] italic opacity-40">No player records found for {selectedYear}.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.keys(OGBA_TEAM_NAMES).sort().map(teamCode => {
                  const teamPlayers = draftPlayers.filter(p => p.teamCode === teamCode);
                  if (teamPlayers.length === 0) return null;
                  
                  // Sort by position order: 1B, 2B, SS, 3B, OF, C, CM, MI, DH
                  const DRAFT_POS_ORDER: Record<string, number> = {
                    '1B': 1, '2B': 2, 'SS': 3, '3B': 4, 'OF': 5,
                    'LF': 5, 'CF': 5, 'RF': 5, 'C': 6, 'CM': 7, 'MI': 8, 'DH': 9
                  };

                  const hitters = teamPlayers.filter(p => !p.isPitcher).sort((a, b) => {
                    const posA = DRAFT_POS_ORDER[a.position] ?? 99;
                    const posB = DRAFT_POS_ORDER[b.position] ?? 99;
                    if (posA !== posB) return posA - posB;
                    return b.draftDollars - a.draftDollars;
                  });
                  const pitchers = teamPlayers.filter(p => p.isPitcher).sort((a, b) => b.draftDollars - a.draftDollars);
                  const totalSpent = teamPlayers.reduce((sum, p) => sum + p.draftDollars, 0);
                  const isExpanded = expandedTeams.has(teamCode);

                  // Keepers from database field or fallback to hardcoded map
                  const yearKeepers = KEEPER_MAP[selectedYear!]?.[teamCode] || [];

                  return (
                    <div key={teamCode} className="rounded-3xl liquid-glass border border-[var(--lg-border-subtle)] shadow-xl overflow-hidden self-start">
                      {/* Collapsible Header */}
                      <button
                        onClick={() => {
                          const newExpanded = new Set(expandedTeams);
                          if (isExpanded) newExpanded.delete(teamCode);
                          else newExpanded.add(teamCode);
                          setExpandedTeams(newExpanded);
                        }}
                        className="w-full px-8 py-6 flex items-center justify-between bg-[var(--lg-tint)] border-b border-[var(--lg-border-subtle)] hover:bg-[var(--lg-tint-hover)] transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold transition-transform ${isExpanded ? 'rotate-180 bg-[var(--lg-tint-hover)]' : 'bg-[var(--lg-tint)] opacity-40'}`}>
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </div>
                          <div>
                            <div className="font-semibold text-lg text-[var(--lg-text-heading)]">{OGBA_TEAM_NAMES[teamCode] || teamCode}</div>
                            <div className="text-xs font-medium uppercase text-[var(--lg-text-muted)] opacity-60">{teamPlayers.length} Players</div>
                          </div>
                        </div>
                        <div className="text-xl font-bold text-emerald-400 tabular-nums">${totalSpent}</div>
                      </button>
                      
                      {/* Collapsible Content - Compact Tables */}
                      {isExpanded && (
                        <div className="w-full">
                          {/* Hitters */}
                          {hitters.length > 0 && (
                            <div className="border-b border-[var(--lg-border-faint)]">
                              <div className="px-8 py-3 bg-blue-500/5 text-xs font-medium uppercase text-blue-400">Batting Roster</div>
                              <ThemedTable bare>
                                <ThemedThead>
                                  <ThemedTr>
                                    <ThemedTh className="px-8">Player</ThemedTh>
                                    <ThemedTh align="center" className="w-12">Pos</ThemedTh>
                                    <ThemedTh align="center" className="w-12">MLB</ThemedTh>
                                    <ThemedTh align="right" className="px-8 w-20">$</ThemedTh>
                                  </ThemedTr>
                                </ThemedThead>
                                <tbody className="divide-y divide-[var(--lg-divide)]">
                                  {hitters.map((p, i) => {
                                    const isKeeper = p.isKeeper || yearKeepers.some((k: string) => 
                                      p.playerName === k || p.fullName === k || p.fullName.includes(k)
                                    );
                                    return (
                                      <ThemedTr key={i} className={isKeeper ? 'bg-amber-500/5' : ''}>
                                        <ThemedTd className="px-8">
                                          <div className="flex items-center gap-3">
                                            <span className="text-blue-400">{p.fullName}</span>
                                            {isKeeper && (
                                              <span className="px-1.5 py-0.5 rounded-lg bg-amber-500 text-white text-[8px] font-bold uppercase shadow-lg shadow-amber-500/20">K</span>
                                            )}
                                          </div>
                                        </ThemedTd>
                                        <ThemedTd align="center">{p.mlbTeam || 'FA'}</ThemedTd>
                                        <ThemedTd align="right" className="px-8"><span className="text-emerald-400">${p.draftDollars}</span></ThemedTd>
                                      </ThemedTr>
                                    );
                                  })}
                                </tbody>
                              </ThemedTable>
                            </div>
                          )}

                          {/* Pitchers */}
                          {pitchers.length > 0 && (
                            <div>
                              <div className="px-8 py-3 bg-purple-500/5 text-xs font-medium uppercase text-purple-400">Pitching Roster</div>
                              <ThemedTable bare>
                                <ThemedThead>
                                  <ThemedTr>
                                    <ThemedTh className="px-8">Player</ThemedTh>
                                    <ThemedTh align="center" className="w-12">Pos</ThemedTh>
                                    <ThemedTh align="center" className="w-12">MLB</ThemedTh>
                                    <ThemedTh align="right" className="px-8 w-20">$</ThemedTh>
                                  </ThemedTr>
                                </ThemedThead>
                                <tbody className="divide-y divide-[var(--lg-divide)]">
                                  {pitchers.map((p, i) => {
                                    const isKeeper = p.isKeeper || yearKeepers.some((k: string) =>
                                      p.playerName === k || p.fullName === k || p.fullName.includes(k)
                                    );
                                    return (
                                      <ThemedTr key={i} className={isKeeper ? 'bg-amber-500/5' : ''}>
                                        <ThemedTd className="px-8">
                                          <div className="flex items-center gap-3">
                                            <span className="text-purple-400">{p.fullName}</span>
                                            {isKeeper && (
                                              <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[8px] font-bold uppercase">K</span>
                                            )}
                                          </div>
                                        </ThemedTd>
                                        <ThemedTd align="center">{p.mlbTeam || 'FA'}</ThemedTd>
                                        <ThemedTd align="right" className="px-8"><span className="text-emerald-400">${p.draftDollars}</span></ThemedTd>
                                      </ThemedTr>
                                    );
                                  })}
                                </tbody>
                              </ThemedTable>
                            </div>
                          )}

                          {/* No footer needed, layout looks cleaner without it or inside the list */}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Standings Tab Content */}
        {activeTab === 'standings' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {standingsLoading ? (
              <div className="text-center py-20 text-[var(--lg-text-muted)] italic animate-pulse">Loading standings...</div>
            ) : selectedPeriod && selectedPeriod > 0 ? (
                // Period Detail View
                <div className="space-y-12">
                    <PeriodSummaryTable 
                        periodId={String(selectedPeriod)} 
                        rows={periodSummaryRows} 
                        categories={['R','HR','RBI','SB','AVG','W','SV','K','ERA','WHIP']} 
                    />
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                        {Object.entries(categoryRows).map(([catId, rows]) => (
                            <CategoryPeriodTable 
                                key={catId} 
                                periodId={String(selectedPeriod)} 
                                categoryId={catId} 
                                rows={rows} 
                            />
                        ))}
                    </div>
                </div>
            ) : (
                // Season Matrix View
                <div className="rounded-3xl liquid-glass border border-[var(--lg-border-subtle)] shadow-2xl overflow-hidden">
                  <SeasonTable 
                      periods={periodMeta} 
                      rows={seasonRows} 
                  />
                </div>
            )}
          </div>
        )}


        {/* Period Trends Tab (Cumulative Results) */}
        {activeTab === 'period-results' && selectedYear && (
          <div className="rounded-3xl liquid-glass border border-[var(--lg-border-subtle)] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-[var(--lg-tint)] border-b border-[var(--lg-border-subtle)] px-8 py-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[var(--lg-text-heading)]">Standings Evolution</h2>
                <div className="mt-1 text-sm font-medium text-[var(--lg-text-muted)]">Cumulative points across all periods.</div>
              </div>
              <div className="text-xs font-medium uppercase text-[var(--lg-text-muted)] opacity-40">Click to sort</div>
            </div>

            <div className="overflow-x-auto">
              {periodResultsLoading ? (
                <div className="text-center py-20 text-[var(--lg-text-muted)] italic animate-pulse">Loading points...</div>
              ) : periodResults.length === 0 ? (
                <div className="text-center py-20 text-[var(--lg-text-muted)] italic opacity-40">No data available.</div>
              ) : (
                <ThemedTable bare>
                  <ThemedThead>
                    <ThemedTr>
                      <ThemedTh className="px-8">Team</ThemedTh>
                      {periodResults.map(p => (
                        <ThemedTh
                          key={p.periodNumber}
                          onClick={() => handleSort(p.periodNumber)}
                          align="center"
                          className="px-4"
                        >
                          <div className="flex items-center justify-center gap-2">
                            P{p.periodNumber}
                            {sortConfig.key === p.periodNumber && (
                              <span className="text-[var(--lg-accent)]">{sortConfig.direction === 'desc' ? '▼' : '▲'}</span>
                            )}
                          </div>
                        </ThemedTh>
                      ))}
                      <ThemedTh
                        onClick={() => handleSort('final')}
                        align="center"
                        className="px-8"
                      >
                        <div className="flex items-center justify-center gap-1">
                          RESULT
                          {sortConfig.key === 'final' && (
                            <span>{sortConfig.direction === 'desc' ? '▼' : '▲'}</span>
                          )}
                        </div>
                      </ThemedTh>
                    </ThemedTr>
                  </ThemedThead>
                  <tbody className="divide-y divide-[var(--lg-divide)]">
                    {Object.keys(OGBA_TEAM_NAMES)
                      .sort((a, b) => {
                        const getScore = (teamCode: string, key: string | number) => {
                          if (key === 'final') {
                            const lastPeriod = periodResults[periodResults.length - 1];
                            return lastPeriod?.standings?.find((s: any) => s.teamCode === teamCode)?.totalScore || 0;
                          }
                          const period = periodResults.find(p => p.periodNumber === key);
                          return period?.standings?.find((s: any) => s.teamCode === teamCode)?.totalScore || 0;
                        };
                        const scoreA = getScore(a, sortConfig.key);
                        const scoreB = getScore(b, sortConfig.key);
                        return sortConfig.direction === 'desc' ? scoreB - scoreA : scoreA - scoreB;
                      })
                      .map((teamCode) => {
                        const finalScore = periodResults[periodResults.length - 1]?.standings
                          ?.find((s: any) => s.teamCode === teamCode)?.totalScore || 0;

                        return (
                          <ThemedTr key={teamCode} className="group border-none">
                            <ThemedTd className="px-8">
                              {OGBA_TEAM_NAMES[teamCode] || teamCode}
                            </ThemedTd>
                            {periodResults.map(p => {
                              const standing = p.standings?.find((s: any) => s.teamCode === teamCode);
                              const maxScore = Math.max(...p.standings.map((s: any) => s.totalScore));
                              const isWinner = standing && standing.totalScore === maxScore;
                              return (
                                <ThemedTd key={p.periodNumber} align="center" className={`px-4 ${isWinner ? 'bg-amber-500/5' : ''}`}>
                                  {isWinner ? <span className="font-bold text-amber-400">{standing ? standing.totalScore.toFixed(1) : '-'}</span> : (standing ? standing.totalScore.toFixed(1) : '-')}
                                </ThemedTd>
                              );
                            })}
                            <ThemedTd align="center" className="px-8">
                              <span className="font-bold text-[var(--lg-accent)]">{finalScore.toFixed(1)}</span>
                            </ThemedTd>
                          </ThemedTr>
                        );
                      })}
                  </tbody>
                </ThemedTable>
              )}
            </div>
            <div className="px-8 py-4 bg-[var(--lg-tint)] border-t border-[var(--lg-border-subtle)] text-xs font-medium uppercase text-[var(--lg-text-muted)] opacity-60">
              * Values represent cumulative point totals through each period.
            </div>
          </div>
        )}


        {/* Stats Tab Content */}
        {activeTab === 'stats' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {loading ? (
              <div className="text-center py-20 text-[var(--lg-text-muted)] italic animate-pulse">Loading...</div>
            ) : stats.length === 0 && selectedYear && selectedPeriod ? (
              <div className="text-center py-20 text-[var(--lg-text-muted)] italic opacity-40">No records found.</div>
            ) : (
              <div className="space-y-8">
                <div className="flex items-center gap-4 bg-[var(--lg-tint)] p-4 rounded-3xl border border-[var(--lg-border-subtle)] shadow-lg justify-center w-fit mx-auto mb-12">
                   <div className="bg-[var(--lg-tint)] px-3 py-1.5 rounded-xl text-xs font-medium uppercase text-[var(--lg-text-muted)]">Summary</div>
                   <div className="text-sm font-bold text-[var(--lg-text-primary)]">{stats.length} Players • {teamCodes.length} Teams</div>
                </div>

                {teamCodes.map((teamCode) => {
                  const teamPlayers = teamGroups[teamCode];
                  const hitters = teamPlayers.filter(p => !p.isPitcher).sort(sortHitters);
                  const pitchers = teamPlayers.filter(p => p.isPitcher).sort(sortPitchers);
                  const isExpanded = expandedTeams.has(teamCode);
                  const missingIds = teamPlayers.filter(p => !p.mlbId).length;

                  return (
                    <div key={teamCode} className="rounded-3xl liquid-glass border border-[var(--lg-border-subtle)] shadow-xl overflow-hidden self-start">
                      <button
                        onClick={() => toggleTeam(teamCode)}
                        className="w-full px-8 py-6 flex items-center justify-between bg-[var(--lg-tint)] border-b border-[var(--lg-border-subtle)] hover:bg-[var(--lg-tint-hover)] transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold transition-transform ${isExpanded ? 'rotate-180 bg-[var(--lg-tint-hover)]' : 'bg-[var(--lg-tint)] opacity-40'}`}>
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </div>
                          <div>
                            <div className="font-semibold text-lg text-[var(--lg-text-heading)]">{OGBA_TEAM_NAMES[teamCode] || teamCode}</div>
                            <div className="text-xs font-medium uppercase text-[var(--lg-text-muted)] opacity-60">
                               {hitters.length}H / {pitchers.length}P
                               {missingIds > 0 && <span className="ml-2 text-amber-500">⚠️ {missingIds} UNLINKED</span>}
                            </div>
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="p-8 space-y-12 animate-in slide-in-from-top-4 duration-300">
                          {hitters.length > 0 && (
                            <div className="rounded-2xl border border-[var(--lg-border-faint)] overflow-hidden">
                              <div className="px-6 py-3 bg-blue-500/5 text-xs font-medium uppercase text-blue-400 border-b border-[var(--lg-border-faint)]">Batting Stats</div>
                              <div className="overflow-x-auto">
                                <ThemedTable bare>
                                  <ThemedThead>
                                    <ThemedTr>
                                      <ThemedTh className="px-6">Player</ThemedTh>
                                      <ThemedTh align="center">Pos</ThemedTh>
                                      <ThemedTh align="center">MLB</ThemedTh>
                                      <ThemedTh align="right">R</ThemedTh>
                                      <ThemedTh align="right">HR</ThemedTh>
                                      <ThemedTh align="right">RBI</ThemedTh>
                                      <ThemedTh align="right">SB</ThemedTh>
                                      <ThemedTh align="right">AVG</ThemedTh>
                                      <ThemedTh align="right" className="px-6">GS</ThemedTh>
                                    </ThemedTr>
                                  </ThemedThead>
                                  <tbody className="divide-y divide-[var(--lg-divide)]">
                                    {hitters.map((p) => (
                                      <ThemedTr key={p.id} onClick={() => setEditingStat(p)} className="cursor-pointer group">
                                        <ThemedTd className="px-6">
                                          <div className="flex items-center gap-2">
                                            <span className="group-hover:text-[var(--lg-accent)] transition-colors">{p.displayName || p.fullName || p.playerName}</span>
                                            {!p.mlbId && <span className="text-amber-500 text-[8px]" title="Missing MLB ID">⚠️</span>}
                                          </div>
                                        </ThemedTd>
                                        <ThemedTd align="center">{p.position || '—'}</ThemedTd>
                                        <ThemedTd align="center">{p.mlbTeam || '—'}</ThemedTd>
                                        <ThemedTd align="right">{p.R ?? '0'}</ThemedTd>
                                        <ThemedTd align="right">{p.HR ?? '0'}</ThemedTd>
                                        <ThemedTd align="right">{p.RBI ?? '0'}</ThemedTd>
                                        <ThemedTd align="right">{p.SB ?? '0'}</ThemedTd>
                                        <ThemedTd align="right">{p.AVG !== undefined ? fmtRate(p.AVG) : '.000'}</ThemedTd>
                                        <ThemedTd align="right" className="px-6"><span className="text-sky-400">{p.GS ?? '0'}</span></ThemedTd>
                                      </ThemedTr>
                                    ))}
                                  </tbody>
                                </ThemedTable>
                              </div>
                            </div>
                          )}

                          {pitchers.length > 0 && (
                            <div className="rounded-2xl border border-[var(--lg-border-faint)] overflow-hidden">
                              <div className="px-6 py-3 bg-purple-500/5 text-xs font-medium uppercase text-purple-400 border-b border-[var(--lg-border-faint)]">Pitching Stats</div>
                              <div className="overflow-x-auto">
                                <ThemedTable bare>
                                  <ThemedThead>
                                    <ThemedTr>
                                      <ThemedTh className="px-6">Player</ThemedTh>
                                      <ThemedTh align="center">Pos</ThemedTh>
                                      <ThemedTh align="center">MLB</ThemedTh>
                                      <ThemedTh align="right">W</ThemedTh>
                                      <ThemedTh align="right">SV</ThemedTh>
                                      <ThemedTh align="right">K</ThemedTh>
                                      <ThemedTh align="right">ERA</ThemedTh>
                                      <ThemedTh align="right">WHIP</ThemedTh>
                                      <ThemedTh align="right" className="px-6">SO</ThemedTh>
                                    </ThemedTr>
                                  </ThemedThead>
                                  <tbody className="divide-y divide-[var(--lg-divide)]">
                                    {pitchers.map((p) => (
                                      <ThemedTr key={p.id} onClick={() => setEditingStat(p)} className="cursor-pointer group">
                                        <ThemedTd className="px-6">
                                          <div className="flex items-center gap-2">
                                            <span className="group-hover:text-[var(--lg-accent)] transition-colors">{p.displayName || p.fullName || p.playerName}</span>
                                            {!p.mlbId && <span className="text-amber-500 text-[8px]" title="Missing MLB ID">⚠️</span>}
                                          </div>
                                        </ThemedTd>
                                        <ThemedTd align="center">{p.position || 'P'}</ThemedTd>
                                        <ThemedTd align="center">{p.mlbTeam || '—'}</ThemedTd>
                                        <ThemedTd align="right">{p.W ?? '0'}</ThemedTd>
                                        <ThemedTd align="right">{p.SV ?? '0'}</ThemedTd>
                                        <ThemedTd align="right">{p.K ?? '0'}</ThemedTd>
                                        <ThemedTd align="right">{p.ERA?.toFixed(2) ?? '0.00'}</ThemedTd>
                                        <ThemedTd align="right">{p.WHIP?.toFixed(2) ?? '0.00'}</ThemedTd>
                                        <ThemedTd align="right" className="px-6"><span className="text-purple-400">{p.SO ?? '0'}</span></ThemedTd>
                                      </ThemedTr>
                                    ))}
                                  </tbody>
                                </ThemedTable>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Admin Tab Content */}
        {activeTab === 'admin' && canEdit && selectedYear && (
          <div className="animate-in fade-in zoom-in-95 duration-500">
             <ArchiveAdminPanel year={selectedYear} />
          </div>
        )}

        {/* Edit Modal */}
        {editingStat && (
          <EditPlayerNameModal
            onClose={() => setEditingStat(null)}
            onSave={handleSavePlayer}
            stat={editingStat}
          />
        )}

        {editingTeam && (
          <EditTeamNameModal
            isOpen={!!editingTeam}
            onClose={() => setEditingTeam(null)}
            onSave={handleSaveTeamName}
            currentName={editingTeam.name}
            teamCode={editingTeam.teamCode}
          />
        )}

        {/* AI Insights Modal */}
        {aiModalTeam && selectedYear && (
          <AIInsightsModal
            isOpen={!!aiModalTeam}
            onClose={() => setAiModalTeam(null)}
            year={selectedYear}
            teamCode={aiModalTeam.code}
            teamName={aiModalTeam.name}
          />
        )}
      </main>
    </div>
  );
}
