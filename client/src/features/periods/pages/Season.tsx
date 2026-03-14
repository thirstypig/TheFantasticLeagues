import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getSeasonStandings, getPeriodCategoryStandings } from "../../../api";
import { toNum } from "../../../api/base";
import { OGBA_TEAM_NAMES } from "../../../lib/ogbaTeams";
import { useTheme } from "../../../contexts/ThemeContext";
import { useLeague } from "../../../contexts/LeagueContext";
import PageHeader from "../../../components/ui/PageHeader";
import { PeriodSummaryTable, CategoryPeriodTable, TeamPeriodSummaryRow, CategoryPeriodRow } from "../../../components/StatsTables";
import { Button } from "../../../components/ui/button";
import { ThemedTable, ThemedThead, ThemedTr, ThemedTh, ThemedTd } from "../../../components/ui/ThemedTable";
import { getCurrentSeason, type Season } from "../../seasons/api";
import { getTeamDetails } from "../../teams/api";
import { POS_ORDER } from "../../../lib/baseballUtils";
import { mapPosition } from "../../../lib/sportConfig";

type SeasonStandingsApiRow = {
  teamId: number;
  teamName: string;
  owner?: string;

  totalPoints?: number;
  periodPoints?: number[];

  [key: string]: any;
};

type SeasonStandingsApiResponse = {
  periodIds: number[];
  rows: SeasonStandingsApiRow[];
};

type NormalizedSeasonRow = {
  teamId: number;
  teamName: string;
  owner?: string;
  teamCode?: string;
  periodPoints: number[];
  totalPoints: number;
};


function sumNums(arr: unknown[]): number {
  return (arr ?? []).reduce((sum: number, v: unknown) => sum + toNum(v), 0);
}

function normName(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

function normalizeSeasonRow(row: SeasonStandingsApiRow, periodIds: number[]): NormalizedSeasonRow {
  let periodPoints: number[] = [];

  if (Array.isArray(row.periodPoints) && row.periodPoints.length) {
    periodPoints = periodIds.map((_pid, idx) => toNum(row.periodPoints![idx]));
  } else {
    periodPoints = periodIds.map((pid) => toNum(row[`P${pid}`]));
  }

  const totalPoints = sumNums(periodPoints);
  const teamCode = (row as any).teamCode ?? undefined;

  return {
    teamId: row.teamId,
    teamName: row.teamName,
    owner: row.owner,
    teamCode,
    periodPoints,
    totalPoints,
  };
}

const SeasonPage: React.FC = () => {
  const navigate = useNavigate();
  useTheme();
  const { leagueId, outfieldMode } = useLeague();

  const [viewMode, setViewMode] = useState<'season' | 'period'>('season');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentSeasonData, setCurrentSeasonData] = useState<Season | null>(null);

  // Season Matrix State
  const [periodIds, setPeriodIds] = useState<number[]>([]);
  const [rows, setRows] = useState<NormalizedSeasonRow[]>([]);

  // Period Detail State
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodSummaryRows, setPeriodSummaryRows] = useState<TeamPeriodSummaryRow[]>([]);
  const [periodCategoryRows, setPeriodCategoryRows] = useState<Record<string, CategoryPeriodRow[]>>({});

  // Expandable team roster state
  const [expandedTeamId, setExpandedTeamId] = useState<number | null>(null);
  const [teamRosters, setTeamRosters] = useState<Record<number, Array<{ id: number; name: string; posPrimary: string; price: number }>>>({});
  const [rosterLoading, setRosterLoading] = useState(false);

  const toggleTeamExpand = useCallback(async (teamId: number) => {
    if (expandedTeamId === teamId) {
      setExpandedTeamId(null);
      return;
    }
    setExpandedTeamId(teamId);
    if (!teamRosters[teamId]) {
      setRosterLoading(true);
      try {
        const detail = await getTeamDetails(teamId);
        const sorted = [...(detail.currentRoster || [])].sort((a, b) => {
          const ia = POS_ORDER.indexOf(a.posPrimary);
          const ib = POS_ORDER.indexOf(b.posPrimary);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });
        setTeamRosters(prev => ({ ...prev, [teamId]: sorted }));
      } catch {
        setTeamRosters(prev => ({ ...prev, [teamId]: [] }));
      } finally {
        setRosterLoading(false);
      }
    }
  }, [expandedTeamId, teamRosters]);

  // Sort logic for matrix
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => b.totalPoints - a.totalPoints);
  }, [rows]);

  // Initial Load: Season Standings
  useEffect(() => {
    async function loadSeason() {
      try {
        setLoading(true);
        setError(null);
        // Load current season metadata
        getCurrentSeason(leagueId).then(s => setCurrentSeasonData(s)).catch(() => {});
        const data = await getSeasonStandings(leagueId);
        setPeriodIds(data.periodIds || []);

        const normalized = (data.rows || []).map(r => normalizeSeasonRow(r as any, data.periodIds));
        setRows(normalized);

        if (data.periodIds?.length > 0) {
          setSelectedPeriodId(data.periodIds[data.periodIds.length - 1]);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load season standings");
      } finally {
        setLoading(false);
      }
    }
    loadSeason();
  }, [leagueId]);

  // Load Period Details
  useEffect(() => {
    if (viewMode !== 'period' || !selectedPeriodId) return;

    async function loadPeriod() {
      try {
        setPeriodLoading(true);
        const resp = await getPeriodCategoryStandings(selectedPeriodId!, leagueId);
        
        // Transform for Category tables
        const catMap: Record<string, CategoryPeriodRow[]> = {};
        
        // Use a map to build summary rows by team
        const teamSummaryMap = new Map<string, TeamPeriodSummaryRow>();

        (resp.categories || []).forEach((cat: any) => {
          const catKey = cat.key || cat.id;
          catMap[catKey] = cat.rows || [];

          (cat.rows || []).forEach((row: any) => {
            const code = row.teamCode;
            if (!teamSummaryMap.has(code)) {
              teamSummaryMap.set(code, {
                teamId: code,
                teamName: row.teamName || OGBA_TEAM_NAMES[code] || code,
                gamesPlayed: 0,
                totalPoints: 0,
                totalPointsDelta: 0,
                categories: []
              });
            }
            const team = teamSummaryMap.get(code)!;
            team.totalPoints += toNum(row.points);
            team.categories.push({
              categoryId: catKey,
              points: toNum(row.points)
            });
          });
        });

        setPeriodCategoryRows(catMap);
        setPeriodSummaryRows(Array.from(teamSummaryMap.values()).sort((a, b) => b.totalPoints - a.totalPoints));
      } catch (err: unknown) {
        console.error("Failed to load period standings", err);
      } finally {
        setPeriodLoading(false);
      }
    }
    loadPeriod();
  }, [viewMode, selectedPeriodId, leagueId]);


  return (
    <div className="flex-1 min-h-screen">
      <main className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10">
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              {viewMode === 'season' ? "Season Standings" : `Period ${selectedPeriodId} Standings`}
              {currentSeasonData && (
                <span className="inline-block rounded-full bg-[var(--lg-accent)]/10 px-3 py-0.5 text-xs font-semibold text-[var(--lg-accent)]">
                  {currentSeasonData.status.replace("_", " ")}
                </span>
              )}
            </span>
          }
          subtitle="Roto points distribution for the full season or specific periods. Higher totals indicate stronger performance across categories."
          rightElement={
             <div className="lg-card p-1">
                <Button
                    onClick={() => setViewMode('season')}
                    variant={viewMode === 'season' ? 'default' : 'ghost'}
                    size="sm"
                    className="px-6"
                >
                    Season
                </Button>
                <Button
                    onClick={() => setViewMode('period')}
                    variant={viewMode === 'period' ? 'default' : 'ghost'}
                    size="sm"
                    className="px-6"
                >
                    Period
                </Button>
              </div>
          }
        />

        {currentSeasonData?.status === "COMPLETED" && (
          <div className="mb-6">
            <Button onClick={() => navigate("/payouts")} variant="default" className="px-6">
              View Payouts →
            </Button>
          </div>
        )}

        {error && (
          <div className="mb-8 rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-sm font-medium text-red-300 flex items-center gap-3">
             <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
            Error: {error}
          </div>
        )}

        {viewMode === 'season' ? (
          <div className="mt-8">
            <div className="mb-6 flex items-center justify-between px-2">
               <div>
                  <h2 className="text-2xl font-semibold text-[var(--lg-text-heading)]">Point Matrix</h2>
                  <div className="mt-1 text-sm font-medium text-[var(--lg-text-muted)] opacity-60">Cumulative results across all completed periods.</div>
               </div>
            </div>

            <ThemedTable>
                <ThemedThead>
                  <ThemedTr>
                    <ThemedTh align="center" className="w-16">#</ThemedTh>
                    <ThemedTh>Team</ThemedTh>
                    
                    {periodIds.map((pid) => (
                      <ThemedTh key={pid} align="center" className="min-w-[80px]">
                        P{pid}
                      </ThemedTh>
                    ))}

                    <ThemedTh align="center" className="min-w-[120px]">
                      TOTAL
                    </ThemedTh>
                    <ThemedTh align="right" className="pr-8">Link</ThemedTh>
                  </ThemedTr>
                </ThemedThead>

                <tbody className="divide-y divide-[var(--lg-divide)]">
                  {loading ? (
                    <ThemedTr>
                      <ThemedTd colSpan={periodIds.length + 4} align="center" className="py-20">
                        <span className="text-[var(--lg-text-muted)] italic animate-pulse">Loading season data...</span>
                      </ThemedTd>
                    </ThemedTr>
                  ) : rows.length === 0 ? (
                    <ThemedTr>
                      <ThemedTd colSpan={periodIds.length + 4} align="center" className="py-20">
                        <span className="text-[var(--lg-text-muted)] italic">No season records available.</span>
                      </ThemedTd>
                    </ThemedTr>
                  ) : (
                    sortedRows.map((row, idx) => (
                      <React.Fragment key={row.teamId}>
                        <ThemedTr
                          className="group cursor-pointer hover:bg-[var(--lg-tint)]"
                          onClick={() => toggleTeamExpand(row.teamId)}
                        >
                          <ThemedTd align="center">{idx + 1}</ThemedTd>
                          <ThemedTd>
                            <div className="flex items-center gap-2">
                              <svg className={`w-3 h-3 text-[var(--lg-text-muted)] transition-transform ${expandedTeamId === row.teamId ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              <span className="text-sm font-semibold text-[var(--lg-text-primary)]">{row.teamName}</span>
                            </div>
                          </ThemedTd>

                          {periodIds.map((_pid, pIdx) => (
                            <ThemedTd key={pIdx} align="center">
                              {Number(row.periodPoints[pIdx] || 0).toFixed(1).replace(/\.0$/, "")}
                            </ThemedTd>
                          ))}

                          <ThemedTd align="center">
                            <span className="text-sm font-semibold text-[var(--lg-accent)]">{row.totalPoints.toFixed(1).replace(/\.0$/, "")}</span>
                          </ThemedTd>
                          <ThemedTd align="right" className="pr-8">
                             {row.teamCode ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => { e.stopPropagation(); navigate(`/teams/${encodeURIComponent(row.teamCode!)}`); }}
                                  className="opacity-0 group-hover:opacity-100"
                                >
                                  View →
                                </Button>
                             ) : null}
                          </ThemedTd>
                        </ThemedTr>
                        {expandedTeamId === row.teamId && (
                          <tr>
                            <ThemedTd colSpan={periodIds.length + 4} className="p-0">
                              <div className="bg-[var(--lg-bg-secondary)]/30 px-8 py-4">
                                {rosterLoading && !teamRosters[row.teamId] ? (
                                  <div className="text-xs text-[var(--lg-text-muted)] italic animate-pulse py-2">Loading roster...</div>
                                ) : (teamRosters[row.teamId]?.length ?? 0) === 0 ? (
                                  <div className="text-xs text-[var(--lg-text-muted)] italic py-2">No roster data available.</div>
                                ) : (
                                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-1">
                                    {teamRosters[row.teamId].map(p => (
                                      <div key={p.id} className="flex items-center gap-2 text-xs py-0.5">
                                        <span className="font-mono text-[var(--lg-text-muted)] w-5 text-center shrink-0">{mapPosition(p.posPrimary, outfieldMode)}</span>
                                        <span className="text-[var(--lg-text-primary)] truncate">{p.name}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </ThemedTd>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
            </ThemedTable>
          </div>
        ) : (
          <div className="space-y-6 md:space-y-12">
            <div className="flex items-center gap-4 lg-card p-4 justify-center">
               <span className="text-xs font-medium uppercase text-[var(--lg-text-muted)]">Select Period</span>
               <div className="flex gap-2">
                 {periodIds.map(pid => (
                   <Button
                    key={pid}
                    onClick={() => setSelectedPeriodId(pid)}
                    variant={selectedPeriodId === pid ? "default" : "secondary"}
                    size="sm"
                    className="w-10 h-10 p-0"
                   >
                     {pid}
                   </Button>
                 ))}
               </div>
            </div>

            {periodLoading ? (
               <div className="text-center py-20">
                  <div className="text-[var(--lg-text-muted)] text-lg font-medium italic animate-pulse">Loading stats...</div>
               </div>
            ) : (
              <div className="space-y-6 md:space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <PeriodSummaryTable
                    periodId={`P${selectedPeriodId}`}
                    rows={periodSummaryRows}
                    categories={Object.keys(periodCategoryRows)}
                />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-12">
                   {Object.keys(periodCategoryRows).map(catKey => (
                      <CategoryPeriodTable
                          key={catKey}
                          periodId={`P${selectedPeriodId}`}
                          categoryId={catKey}
                          rows={periodCategoryRows[catKey]}
                      />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default SeasonPage;
