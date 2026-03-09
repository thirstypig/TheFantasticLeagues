import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { getSeasonStandings, getPeriodCategoryStandings } from "../../../lib/api";
import { OGBA_TEAM_NAMES } from "../../../lib/ogbaTeams";
import { useTheme } from "../../../contexts/ThemeContext";
import { useLeague } from "../../../contexts/LeagueContext";
import PageHeader from "../../../components/ui/PageHeader";
import { PeriodSummaryTable, CategoryPeriodTable, TeamPeriodSummaryRow, CategoryPeriodRow } from "../../../components/StatsTables";
import { Button } from "../../../components/ui/button";
import { ThemedTable, ThemedThead, ThemedTr, ThemedTh, ThemedTd } from "../../../components/ui/ThemedTable";

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


function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sumNums(arr: unknown[]): number {
  return (arr ?? []).reduce((sum: number, v: unknown) => sum + toNum(v), 0);
}

function normName(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

/** displayName -> teamCode */
const DISPLAY_TO_CODE: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [code, name] of Object.entries(OGBA_TEAM_NAMES)) {
    out[normName(name)] = code;
  }
  return out;
})();

function normalizeSeasonRow(row: SeasonStandingsApiRow, periodIds: number[]): NormalizedSeasonRow {
  let periodPoints: number[] = [];

  if (Array.isArray(row.periodPoints) && row.periodPoints.length) {
    periodPoints = periodIds.map((_pid, idx) => toNum(row.periodPoints![idx]));
  } else {
    periodPoints = periodIds.map((pid) => toNum(row[`P${pid}`]));
  }

  const totalPoints = sumNums(periodPoints);
  const teamCode = (row as any).teamCode ?? DISPLAY_TO_CODE[normName(row.teamName)] ?? undefined;

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
  const { leagueId } = useLeague();

  const [viewMode, setViewMode] = useState<'season' | 'period'>('season');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Season Matrix State
  const [periodIds, setPeriodIds] = useState<number[]>([]);
  const [rows, setRows] = useState<NormalizedSeasonRow[]>([]);

  // Period Detail State
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodSummaryRows, setPeriodSummaryRows] = useState<TeamPeriodSummaryRow[]>([]);
  const [periodCategoryRows, setPeriodCategoryRows] = useState<Record<string, CategoryPeriodRow[]>>({});

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
        const data = await getSeasonStandings(leagueId);
        setPeriodIds(data.periodIds || []);

        const normalized = (data.rows || []).map(r => normalizeSeasonRow(r as any, data.periodIds));
        setRows(normalized);

        if (data.periodIds?.length > 0) {
          setSelectedPeriodId(data.periodIds[data.periodIds.length - 1]);
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load season standings");
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
      } catch (err: any) {
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
          title={viewMode === 'season' ? "Season Standings" : `Period ${selectedPeriodId} Standings`}
          subtitle="Roto points distribution for the full season or specific periods. Higher totals indicate stronger performance across categories."
          rightElement={
            <>
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
              <Link 
                to="/players" 
                className="ml-2 flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-all text-xs font-medium uppercase shadow-lg shadow-blue-500/5 group"
              >
                <span>Final Rosters</span>
                <span className="group-hover:translate-x-0.5 transition-transform">→</span>
              </Link>
            </>
          }
        />

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
                      <ThemedTr key={row.teamId} className="group">
                        <ThemedTd align="center">{idx + 1}</ThemedTd>
                        <ThemedTd>
                          <div className="text-sm font-semibold text-[var(--lg-text-primary)]">{row.teamName}</div>
                          <div className="text-xs font-medium uppercase text-[var(--lg-text-muted)] mt-1 opacity-60">{row.teamCode || '-'}</div>
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
                                onClick={() => navigate(`/teams/${encodeURIComponent(row.teamCode!)}`)}
                                className="opacity-0 group-hover:opacity-100"
                              >
                                View →
                              </Button>
                           ) : null}
                        </ThemedTd>
                      </ThemedTr>
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
