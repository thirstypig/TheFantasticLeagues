import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getSeasonStandings, getPeriodCategoryStandings } from "../../../api";
import { toNum, fmtAvg4, fmtWhip, fmt2 } from "../../../api/base";

function fmtCatVal(stat: string, val: unknown): string {
  if (typeof val !== "number") return String(val ?? "");
  if (stat === "AVG") return fmtAvg4(val);
  if (stat === "WHIP") return fmtWhip(val);
  if (stat === "ERA") return fmt2(val);
  return String(val);
}
import { OGBA_TEAM_NAMES } from "../../../lib/ogbaTeams";
import { useTheme } from "../../../contexts/ThemeContext";
import { useLeague } from "../../../contexts/LeagueContext";
import PageHeader from "../../../components/ui/PageHeader";
import { PeriodSummaryTable, CategoryPeriodTable, TeamPeriodSummaryRow, CategoryPeriodRow, StatsUpdated } from "../../../components/shared/StatsTables";
import { Button } from "../../../components/ui/button";
import { ThemedTable, ThemedThead, ThemedTr, ThemedTh, ThemedTd } from "../../../components/ui/ThemedTable";
import { SortableHeader } from "../../../components/ui/SortableHeader";
import { getCurrentSeason, type Season } from "../../seasons/api";
import { getMatchups, getH2HStandings, type MatchupEntry, type StandingEntry } from "../../matchups/api";
import { mapPosition } from "../../../lib/sportConfig";
import { formatLocalDate, formatLocalTime } from "../../../lib/timeUtils";

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
  periodNames?: string[];
  categoryKeys?: string[];
  rows: SeasonStandingsApiRow[];
};

type NormalizedSeasonRow = {
  teamId: number;
  teamName: string;
  owner?: string;
  teamCode?: string;
  periodPoints: number[];
  totalPoints: number;
  periodStats?: Record<string, number[]>; // category key → values per period
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
    periodStats: (row as any).periodStats ?? undefined,
  };
}

// H2H standings row from API
type H2HStandingRow = {
  teamId: number;
  teamName: string;
  teamCode: string;
  points: number;
  rank: number;
  record?: string;
  wins?: number;
  losses?: number;
  ties?: number;
  pct?: number;
  gb?: number;
};

const SeasonPage: React.FC = () => {
  const navigate = useNavigate();
  useTheme();
  const { leagueId, outfieldMode, scoringFormat: ctxScoringFormat } = useLeague();

  const isH2H = ctxScoringFormat === "H2H_CATEGORIES" || ctxScoringFormat === "H2H_POINTS";
  const [viewMode, setViewMode] = useState<'season' | 'period' | 'matchups'>(isH2H ? 'matchups' : 'season');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentSeasonData, setCurrentSeasonData] = useState<Season | null>(null);

  // Season Matrix State
  const [periodIds, setPeriodIds] = useState<number[]>([]);
  const [periodNames, setPeriodNames] = useState<string[]>([]);
  const [rows, setRows] = useState<NormalizedSeasonRow[]>([]);

  // Period Detail State
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodSummaryRows, setPeriodSummaryRows] = useState<TeamPeriodSummaryRow[]>([]);
  const [periodCategoryRows, setPeriodCategoryRows] = useState<Record<string, CategoryPeriodRow[]>>({});
  const [categoryGroups, setCategoryGroups] = useState<Record<string, string>>({}); // key → "H" or "P"
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({}); // key → display label

  // Last updated timestamps
  const [seasonUpdatedAt, setSeasonUpdatedAt] = useState<Date | null>(null);
  const [periodUpdatedAt, setPeriodUpdatedAt] = useState<Date | null>(null);

  // Category keys from season API
  const [categoryKeys, setCategoryKeys] = useState<string[]>([]);

  // Period view mode: points (roto) vs stats (raw values)
  const [periodViewMode, setPeriodViewMode] = useState<'points' | 'stats'>('stats');

  // H2H state
  const [h2hStandings, setH2hStandings] = useState<H2HStandingRow[]>([]);
  const [h2hMatchups, setH2hMatchups] = useState<MatchupEntry[]>([]);
  const [h2hWeek, setH2hWeek] = useState(1);
  const [h2hLoading, setH2hLoading] = useState(false);
  const [apiScoringFormat, setApiScoringFormat] = useState<string>("ROTO");

  // Season matrix sort state
  const [matrixSortKey, setMatrixSortKey] = useState<string>("total");
  const [matrixSortDesc, setMatrixSortDesc] = useState(true);

  const handleMatrixSort = useCallback((key: string) => {
    if (key === matrixSortKey) { setMatrixSortDesc(d => !d); }
    else { setMatrixSortKey(key); setMatrixSortDesc(key !== "team"); }
  }, [matrixSortKey]);

  // (Roster expansion removed — users navigate to team page instead)

  // Sort logic for season matrix (always points)
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      let va: number | string;
      let vb: number | string;
      if (matrixSortKey === "team") {
        va = a.teamName.toLowerCase();
        vb = b.teamName.toLowerCase();
      } else if (matrixSortKey.startsWith("p_")) {
        const idx = Number(matrixSortKey.slice(2));
        va = a.periodPoints[idx] ?? 0;
        vb = b.periodPoints[idx] ?? 0;
      } else {
        va = a.totalPoints;
        vb = b.totalPoints;
      }
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return matrixSortDesc ? -cmp : cmp;
    });
  }, [rows, matrixSortKey, matrixSortDesc]);

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
        setPeriodNames(data.periodNames || []);

        const normalized = (data.rows || []).map(r => normalizeSeasonRow(r as any, data.periodIds));
        setRows(normalized);
        if (data.categoryKeys) setCategoryKeys(data.categoryKeys);
        setSeasonUpdatedAt(new Date());

        // Capture scoring format and H2H standings from API
        if ((data as any).scoringFormat) setApiScoringFormat((data as any).scoringFormat);
        if ((data as any).h2hStandings) setH2hStandings((data as any).h2hStandings);

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

  // Load H2H matchups when matchups tab selected
  useEffect(() => {
    if (viewMode !== 'matchups' || !isH2H) return;
    setH2hLoading(true);
    Promise.all([
      getMatchups(leagueId, h2hWeek).catch(() => ({ matchups: [] as MatchupEntry[] })),
      getH2HStandings(leagueId).catch(() => ({ standings: [] as StandingEntry[] })),
    ]).then(([m, s]) => {
      setH2hMatchups(m.matchups);
      // Map StandingEntry to H2HStandingRow format
      setH2hStandings(s.standings.map((st: StandingEntry) => ({
        teamId: st.teamId,
        teamName: st.teamName,
        teamCode: "",
        points: st.points,
        rank: st.rank,
        record: `${st.wins}-${st.losses}-${st.ties}`,
        wins: st.wins,
        losses: st.losses,
        ties: st.ties,
        pct: st.pct,
        gb: st.gb,
      })));
    }).finally(() => setH2hLoading(false));
  }, [viewMode, leagueId, h2hWeek, isH2H]);

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

        const groupMap: Record<string, string> = {};
        const labelMap: Record<string, string> = {};
        const totalDelta: Record<number, number> = resp.totalDelta || {};

        (resp.categories || []).forEach((cat: any) => {
          const catKey = cat.key || cat.id;
          // Map server `value` → client `periodStat`, include pointsDelta
          catMap[catKey] = (cat.rows || []).map((row: any) => ({
            ...row,
            periodStat: toNum(row.value),
            seasonStat: row.seasonValue != null ? toNum(row.seasonValue) : undefined,
            pointsDelta: toNum(row.pointsDelta),
          }));
          if (cat.group) groupMap[catKey] = cat.group;
          if (cat.label) labelMap[catKey] = cat.label;

          (cat.rows || []).forEach((row: any) => {
            const code = row.teamCode;
            if (!teamSummaryMap.has(code)) {
              teamSummaryMap.set(code, {
                teamId: code,
                teamName: row.teamName || OGBA_TEAM_NAMES[code] || code,
                gamesPlayed: 0,
                totalPoints: 0,
                totalPointsDelta: toNum(totalDelta[row.teamId]),
                categories: []
              });
            }
            const team = teamSummaryMap.get(code)!;
            team.totalPoints += toNum(row.points);
            team.categories.push({
              categoryId: catKey,
              points: toNum(row.points),
              statValue: toNum(row.value),
            });
          });
        });

        setPeriodCategoryRows(catMap);
        setCategoryGroups(groupMap);
        setCategoryLabels(labelMap);
        setPeriodSummaryRows(Array.from(teamSummaryMap.values()).sort((a, b) => b.totalPoints - a.totalPoints));
        setPeriodUpdatedAt(new Date());
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
              {viewMode === 'season' ? "Season Standings" : `${periodNames[periodIds.indexOf(selectedPeriodId!)] ?? `Period ${selectedPeriodId}`} Standings`}
              {currentSeasonData && (
                <span className="inline-block rounded-full bg-[var(--lg-accent)]/10 px-3 py-0.5 text-xs font-semibold text-[var(--lg-accent)]">
                  {currentSeasonData.status.replace("_", " ")}
                </span>
              )}
            </span>
          }
          subtitle={isH2H
            ? "Head-to-head matchup standings and weekly results."
            : "Roto points distribution for the full season or specific periods. Higher totals indicate stronger performance across categories."
          }
          rightElement={
             <div className="lg-card p-1">
                {isH2H && (
                  <Button
                      onClick={() => setViewMode('matchups')}
                      variant={viewMode === 'matchups' ? 'default' : 'ghost'}
                      size="sm"
                      className="px-6"
                  >
                      Matchups
                  </Button>
                )}
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

        {viewMode === 'matchups' && isH2H ? (
          <div className="mt-8 space-y-8">
            {/* H2H Season Standings */}
            <div>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-2xl font-semibold text-[var(--lg-text-heading)]">Standings</h2>
                <StatsUpdated source="synced" />
              </div>
              {h2hStandings.length === 0 ? (
                <div className="text-center py-12 text-[var(--lg-text-muted)] italic">No standings yet. Matchups need to be scored first.</div>
              ) : (
                <div className="rounded-xl border border-[var(--lg-border-subtle)] overflow-hidden">
                  <ThemedTable>
                    <ThemedThead>
                      <ThemedTr>
                        <ThemedTh className="w-10">#</ThemedTh>
                        <ThemedTh>Team</ThemedTh>
                        <ThemedTh align="center">W</ThemedTh>
                        <ThemedTh align="center">L</ThemedTh>
                        <ThemedTh align="center">T</ThemedTh>
                        <ThemedTh align="center">PCT</ThemedTh>
                        <ThemedTh align="center">GB</ThemedTh>
                        {ctxScoringFormat === "H2H_POINTS" && <ThemedTh align="center">PTS</ThemedTh>}
                      </ThemedTr>
                    </ThemedThead>
                    <tbody className="divide-y divide-[var(--lg-divide)]">
                      {h2hStandings.map((s, i) => (
                        <ThemedTr key={s.teamId}>
                          <ThemedTd className="tabular-nums text-[var(--lg-text-muted)]">{s.rank}</ThemedTd>
                          <ThemedTd className="font-semibold text-[var(--lg-text-primary)]">
                            {s.teamName}
                            {i < 4 && <span className="ml-2 text-[9px] font-bold uppercase text-emerald-500 bg-emerald-500/10 px-1 py-0.5 rounded">Playoff</span>}
                          </ThemedTd>
                          <ThemedTd align="center" className="tabular-nums font-semibold">{s.wins ?? 0}</ThemedTd>
                          <ThemedTd align="center" className="tabular-nums">{s.losses ?? 0}</ThemedTd>
                          <ThemedTd align="center" className="tabular-nums text-[var(--lg-text-muted)]">{s.ties ?? 0}</ThemedTd>
                          <ThemedTd align="center" className="tabular-nums font-semibold">{(s.pct ?? 0).toFixed(3)}</ThemedTd>
                          <ThemedTd align="center" className="tabular-nums text-[var(--lg-text-muted)]">{s.gb === 0 ? "\u2014" : s.gb}</ThemedTd>
                          {ctxScoringFormat === "H2H_POINTS" && <ThemedTd align="center" className="tabular-nums">{s.points}</ThemedTd>}
                        </ThemedTr>
                      ))}
                    </tbody>
                  </ThemedTable>
                </div>
              )}
            </div>

            {/* Weekly Matchups */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold text-[var(--lg-text-heading)]">Week {h2hWeek} Matchups</h2>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setH2hWeek(w => Math.max(1, w - 1))} disabled={h2hWeek <= 1}>Prev</Button>
                  <span className="text-sm font-semibold text-[var(--lg-text-primary)] tabular-nums min-w-[60px] text-center">Week {h2hWeek}</span>
                  <Button variant="ghost" size="sm" onClick={() => setH2hWeek(w => w + 1)}>Next</Button>
                </div>
              </div>

              {h2hLoading ? (
                <div className="text-center py-12"><span className="text-[var(--lg-text-muted)] italic animate-pulse">Loading matchups...</span></div>
              ) : h2hMatchups.length === 0 ? (
                <div className="text-center py-12 text-[var(--lg-text-muted)] italic">No matchups for this week.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {h2hMatchups.map(m => (
                    <div key={m.id} className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] overflow-hidden">
                      <div className="flex items-center justify-between p-4">
                        <div className="text-center flex-1">
                          <div className="text-sm font-semibold text-[var(--lg-text-primary)]">{m.teamA.name}</div>
                          {m.result && (
                            <div className="text-xl font-bold mt-1 tabular-nums text-[var(--lg-text-heading)]">
                              {m.result.teamA.totalPoints > 0 ? m.result.teamA.totalPoints : `${m.result.teamA.catWins}-${m.result.teamA.catLosses}-${m.result.teamA.catTies}`}
                            </div>
                          )}
                        </div>
                        <div className="text-xs font-bold uppercase text-[var(--lg-text-muted)] px-3">VS</div>
                        <div className="text-center flex-1">
                          <div className="text-sm font-semibold text-[var(--lg-text-primary)]">{m.teamB.name}</div>
                          {m.result && (
                            <div className="text-xl font-bold mt-1 tabular-nums text-[var(--lg-text-heading)]">
                              {m.result.teamB.totalPoints > 0 ? m.result.teamB.totalPoints : `${m.result.teamB.catWins}-${m.result.teamB.catLosses}-${m.result.teamB.catTies}`}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Category breakdown for H2H Categories */}
                      {m.result?.categories && m.result.categories.length > 0 && (
                        <div className="border-t border-[var(--lg-border-faint)] px-4 py-2">
                          <div className="grid grid-cols-5 gap-1 text-[10px]">
                            {m.result.categories.map(cat => (
                              <div key={cat.stat} className="text-center">
                                <div className="text-[var(--lg-text-muted)] font-bold">{cat.stat}</div>
                                <div className={`font-semibold ${cat.winner === "A" ? "text-emerald-400" : cat.winner === "B" ? "text-red-400" : "text-[var(--lg-text-muted)]"}`}>
                                  {fmtCatVal(cat.stat, cat.teamAVal)}
                                </div>
                                <div className={`font-semibold ${cat.winner === "B" ? "text-emerald-400" : cat.winner === "A" ? "text-red-400" : "text-[var(--lg-text-muted)]"}`}>
                                  {fmtCatVal(cat.stat, cat.teamBVal)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {!m.result && (
                        <div className="border-t border-[var(--lg-border-faint)] p-3 text-center text-xs text-[var(--lg-text-muted)]">Not scored yet</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : viewMode === 'season' ? (
          <div className="mt-8">
            <div className="mb-6 flex items-center justify-between px-2">
               <div>
                  <h2 className="text-2xl font-semibold text-[var(--lg-text-heading)]">Point Matrix</h2>
                  <div className="mt-1 text-sm font-medium text-[var(--lg-text-secondary)]">
                    Cumulative roto points across all periods.
                    {seasonUpdatedAt && (
                      <span className="ml-2 text-[10px] text-[var(--lg-text-muted)] opacity-60">
                        Updated {formatLocalDate(seasonUpdatedAt)} at {formatLocalTime(seasonUpdatedAt)}
                      </span>
                    )}
                  </div>
               </div>
            </div>

            <ThemedTable aria-label="Season standings matrix">
                <ThemedThead>
                  <tr>
                    {/* Explicit widths on every column — table-layout: fixed distributes
                        extra container width proportionally instead of piling it into Team. */}
                    <ThemedTh align="center" className="w-12">#</ThemedTh>
                    <SortableHeader sortKey="team" activeSortKey={matrixSortKey} sortDesc={matrixSortDesc} onSort={handleMatrixSort} frozen className="w-[180px]">Team</SortableHeader>

                    {periodIds.map((pid, idx) => (
                      <SortableHeader key={pid} sortKey={`p_${idx}`} activeSortKey={matrixSortKey} sortDesc={matrixSortDesc} onSort={handleMatrixSort} align="center" className="w-[70px]">
                        {periodNames[idx] ? periodNames[idx].replace("Period ", "P") : `P${idx + 1}`}
                      </SortableHeader>
                    ))}

                    <SortableHeader sortKey="total" activeSortKey={matrixSortKey} sortDesc={matrixSortDesc} onSort={handleMatrixSort} align="center" className="w-[90px]">
                      TOTAL
                    </SortableHeader>
                    <ThemedTh align="right" className="pr-8 w-[100px]"> </ThemedTh>
                  </tr>
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
                      <ThemedTr key={row.teamId} className="group hover:bg-[var(--lg-tint)]">
                          <ThemedTd align="center">{idx + 1}</ThemedTd>
                          <ThemedTd frozen>
                            {row.teamCode ? (
                              <span
                                className="text-[11px] font-semibold text-[var(--lg-text-primary)] hover:text-[var(--lg-accent)] transition-colors cursor-pointer"
                                onClick={() => navigate(`/teams/${encodeURIComponent(row.teamCode!)}`)}
                              >
                                {row.teamName}
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold text-[var(--lg-text-primary)]">{row.teamName}</span>
                            )}
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
            <div className="flex flex-col items-center gap-2 lg-card p-4">
              <div className="flex items-center gap-4 justify-center">
                <span className="text-xs font-medium uppercase text-[var(--lg-text-muted)]">Select Period</span>
                <div className="flex gap-2">
                  {periodIds.map((pid, idx) => (
                    <Button
                      key={pid}
                      onClick={() => setSelectedPeriodId(pid)}
                      variant={selectedPeriodId === pid ? "default" : "secondary"}
                      size="sm"
                      className="min-w-[40px] h-10 px-2"
                    >
                      {idx + 1}
                    </Button>
                  ))}
                </div>
              </div>
              {periodUpdatedAt && (
                <span className="text-[10px] text-[var(--lg-text-muted)] opacity-60">
                  Updated {formatLocalDate(periodUpdatedAt)} at {formatLocalTime(periodUpdatedAt)}
                </span>
              )}
            </div>

            {/* Points / Stats toggle for period view */}
            <div className="flex justify-center mt-4 mb-2">
              <div className="lg-card p-1 flex gap-1">
                <Button onClick={() => setPeriodViewMode("stats")} variant={periodViewMode === "stats" ? "default" : "ghost"} size="sm" className="px-5">Stats</Button>
                <Button onClick={() => setPeriodViewMode("points")} variant={periodViewMode === "points" ? "default" : "ghost"} size="sm" className="px-5">Points</Button>
              </div>
            </div>

            {periodLoading ? (
               <div className="text-center py-20">
                  <div className="text-[var(--lg-text-muted)] text-lg font-medium italic animate-pulse">Loading stats...</div>
               </div>
            ) : (
              <div className="space-y-6 md:space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <PeriodSummaryTable
                    periodId={periodNames[periodIds.indexOf(selectedPeriodId!)]?.replace("Period ", "P") ?? `P${periodIds.indexOf(selectedPeriodId!) + 1}`}
                    rows={periodSummaryRows}
                    categories={Object.keys(periodCategoryRows)}
                    viewMode={periodViewMode}
                />
                {/* Hitters (left) + Pitchers (right) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-12">
                  {/* Hitters column */}
                  <div className="space-y-6">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--lg-text-muted)] border-b border-[var(--lg-border-subtle)] pb-1">Hitting Categories</div>
                    {Object.keys(periodCategoryRows)
                      .filter(catKey => categoryGroups[catKey] === "H" || ["R", "HR", "RBI", "SB", "AVG"].includes(catKey))
                      .map(catKey => (
                        <CategoryPeriodTable
                          key={catKey}
                          periodId={periodNames[periodIds.indexOf(selectedPeriodId!)]?.replace("Period ", "P") ?? `P${periodIds.indexOf(selectedPeriodId!) + 1}`}
                          categoryId={catKey}
                          categoryLabel={categoryLabels[catKey]}
                          rows={periodCategoryRows[catKey]}
                          viewMode={periodViewMode}
                        />
                      ))}
                  </div>
                  {/* Pitchers column */}
                  <div className="space-y-6">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--lg-text-muted)] border-b border-[var(--lg-border-subtle)] pb-1">Pitching Categories</div>
                    {Object.keys(periodCategoryRows)
                      .filter(catKey => categoryGroups[catKey] === "P" || ["W", "SV", "ERA", "WHIP", "K"].includes(catKey))
                      .map(catKey => (
                        <CategoryPeriodTable
                          key={catKey}
                          periodId={periodNames[periodIds.indexOf(selectedPeriodId!)]?.replace("Period ", "P") ?? `P${periodIds.indexOf(selectedPeriodId!) + 1}`}
                          categoryId={catKey}
                          categoryLabel={categoryLabels[catKey]}
                          rows={periodCategoryRows[catKey]}
                          viewMode={periodViewMode}
                        />
                      ))}
                  </div>
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
