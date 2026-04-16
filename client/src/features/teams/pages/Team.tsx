import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { getPlayerSeasonStats, type PlayerSeasonStat, getTeamDetails, getTeams, getTeamAiInsights, TeamInsightsResult } from "../../../api";
import { getTeamAiInsightsHistory, getTeamPeriodRoster, type WeeklyInsightEntry, type PeriodRosterEntry } from "../api";
import PlayerDetailModal from "../../../components/shared/PlayerDetailModal";
import PlayerExpandedRow from "../../auction/components/PlayerExpandedRow";
import { useLeague } from "../../../contexts/LeagueContext";
import { getTradeBlock } from "../api";

import { getOgbaTeamName } from "../../../lib/ogbaTeams";
import WatchlistPanel from "../../watchlist/components/WatchlistPanel";
import TradingBlockPanel from "../../trading-block/components/TradingBlockPanel";
import { isPitcher, normalizePosition, formatAvg, getMlbTeamAbbr, sortByPosition } from "../../../lib/playerDisplay";
import { mapPosition, positionToSlots, POS_SCORE } from "../../../lib/sportConfig";
import { fetchJsonApi, API_BASE, parseIP } from "../../../api/base";
import { TableCard, Table, THead, Tr, Th, Td } from "../../../components/ui/TableCard";
import { Button } from "../../../components/ui/button";
import { Sparkles, Loader2, ArrowLeftRight, ChevronDown, ChevronUp, ChevronRight } from "lucide-react";
import { StatsUpdated } from "../../../components/shared/StatsTables";
import RosterAlertAccordion from "../../../components/shared/RosterAlertAccordion";
import { useRosterStatus } from "../../../hooks/useRosterStatus";

function normCode(v: any): string {
  return String(v ?? "").trim().toUpperCase();
}

function asNum(v: any): number {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function numFromAny(p: any, ...keys: string[]): number {
  for (const k of keys) {
    if (p?.[k] != null && String(p[k]).trim() !== "") return asNum(p[k]);
  }
  return 0;
}

function rowKey(p: any): string {
  return String(p?.row_id ?? p?.id ?? `${p?.mlb_id ?? p?.mlbId ?? ""}-${isPitcher(p) ? "P" : "H"}`);
}

function normalizePosList(raw: any, ofMode: string = "OF"): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  const parts = s
    .split(/[/,| ]+/)
    .map((x) => x.trim())
    .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const n = mapPosition(normalizePosition(part), ofMode);
    if (!n) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }

  return out.join("/");
}

function posEligible(p: any, ofMode: string = "OF"): string {
  const raw = p?.positions ?? p?.pos ?? p?.position ?? p?.positionEligible ?? p?.position_eligible ?? "";
  return normalizePosList(raw, ofMode);
}


export default function Team() {
  const { teamCode } = useParams();
  const code = normCode(teamCode);
  const { leagueId, outfieldMode, seasonStatus, myTeamId } = useLeague();
  // Positions are locked on the Team page during the season for everyone.
  // Commissioners manage position changes from the Commissioner page Roster tab.
  const positionsLocked = seasonStatus === "IN_SEASON" || seasonStatus === "COMPLETED";

  const loc = useLocation();
  const activeTab: "hitters" | "pitchers" = loc.hash === "#pitchers" ? "pitchers" : "hitters";

  const [players, setPlayers] = useState<PlayerSeasonStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbTeamId, setDbTeamId] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PlayerSeasonStat | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Position editing state
  const MATRIX_POSITIONS = ["C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH", "P"];
  const [positionOverrides, setPositionOverrides] = useState<Record<number, string>>({});
  const handlePositionSwap = React.useCallback(async (teamId: number, rosterId: number, newPos: string) => {
    setPositionOverrides(prev => ({ ...prev, [rosterId]: newPos }));
    try {
      await fetchJsonApi(`${API_BASE}/teams/${teamId}/roster/${rosterId}`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedPosition: newPos }),
      });
      setPositionOverrides(prev => { const n = { ...prev }; delete n[rosterId]; return n; });
    } catch {
      setPositionOverrides(prev => { const n = { ...prev }; delete n[rosterId]; return n; });
    }
  }, []);

  // AI Insights state
  const [aiInsights, setAiInsights] = useState<TeamInsightsResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiExpanded, setAiExpanded] = useState(false);

  // Weekly insights history (tab-based)
  const [insightHistory, setInsightHistory] = useState<WeeklyInsightEntry[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);

  // Trade block state
  const [tradeBlockIds, setTradeBlockIds] = useState<Set<number>>(new Set());

  // IL + Minors report via shared hook
  const { ilPlayers, minorsPlayers } = useRosterStatus(leagueId ?? null, dbTeamId ?? undefined);

  // Period roster state (for viewing historical period rosters)
  const [periodRoster, setPeriodRoster] = useState<PeriodRosterEntry[] | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [periodRosterLoading, setPeriodRosterLoading] = useState(false);
  const [availablePeriods, setAvailablePeriods] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    let ok = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // 1. Load teams + CSV stats in parallel (independent calls)
        const [allTeams, csvRows] = await Promise.all([
          getTeams(leagueId),
          getPlayerSeasonStats(),
        ]);
        if (!ok) return;

        const ogbaName = getOgbaTeamName(code);
        const team = allTeams.find((t: any) => normCode(t.code) === code)
          || allTeams.find((t: any) => normCode(t.name) === code)
          || allTeams.find((t: any) => t.name.trim() === ogbaName);

        const foundId = team?.id || 0;

        if (foundId) {
          setDbTeamId(foundId);

          // 3. Load DB roster + trade block in parallel
          const [details, tradeBlockData] = await Promise.all([
            getTeamDetails(foundId),
            getTradeBlock(foundId).catch(() => ({ playerIds: [] as number[] })),
          ]);
          if (!ok) return;
          setTradeBlockIds(new Set(tradeBlockData.playerIds));

          // Extract available periods from team summary
          if ((details.periodSummaries?.length ?? 0) > 0) {
            setAvailablePeriods((details.periodSummaries ?? []).map((ps: any) => ({
              id: ps.periodId,
              name: ps.label || `Period ${ps.periodId}`,
            })));
          }

          // 4. Build player list from DB roster, merge in CSV stats
          const dbRoster: any[] = details.currentRoster || [];
          const merged: PlayerSeasonStat[] = dbRoster.map((r: any) => {
            // teamService returns flat objects (not nested under .player)
            const mlbId = r.mlbId || r.mlb_id || r.player?.mlbId;
            const playerName = r.name || r.player?.name || "";
            const posPrimary = r.posPrimary || r.player?.posPrimary || "";
            const mlbTeam = r.mlbTeam || r.player?.mlbTeam || "";
            const posList = r.posList || r.player?.posList || "";
            const price = r.price ?? 0;

            // Find matching CSV row by mlb_id
            const csvMatch = mlbId
              ? (csvRows ?? []).find((s: any) => Number(s.mlb_id || s.mlbId) === Number(mlbId))
              : null;

            const isKeeper = r.isKeeper ?? false;

            const dbPlayerId = r.playerId ?? r.player?.id ?? 0;

            if (csvMatch) {
              // Use CSV stats, overlay DB fields for consistency
              return {
                ...csvMatch,
                _dbPlayerId: dbPlayerId,
                _rosterId: r.id,
                _posList: posList || posPrimary || "",
                assignedPosition: r.assignedPosition || "",
                ogba_team_code: code,
                ogba_team_name: team?.name ?? "",
                mlb_team_abbr: mlbTeam || csvMatch.mlb_team_abbr || csvMatch.mlb_team || "",
                player_name: csvMatch.player_name || playerName,
                price,
                isKeeper,
              };
            }

            // No CSV match — build row from DB data + period stats if available
            const pitcherPos = ["P", "SP", "RP"];
            // For two-way players (Ohtani), use assignedPosition to determine pitcher status
            const assignedPos = r.assignedPosition || "";
            const effectiveIsPitcher = pitcherPos.includes(assignedPos) || pitcherPos.includes(posPrimary);
            const ps = r.periodStats; // Per-player period stats from teamService
            const rawIP = ps?.IP ?? 0;
            const realIP = parseIP(rawIP); // Convert baseball notation (.1=⅓, .2=⅔) to real decimal
            return {
              _dbPlayerId: dbPlayerId,
              _rosterId: r.id,
              _posList: posList || posPrimary || "",
              assignedPosition: assignedPos,
              mlb_id: String(mlbId || ""),
              player_name: playerName,
              ogba_team_code: code,
              ogba_team_name: team?.name ?? "",
              positions: assignedPos || posList || posPrimary || "UT",
              posPrimary: assignedPos || posPrimary,
              is_pitcher: effectiveIsPitcher,
              R: ps?.R ?? 0, HR: ps?.HR ?? 0, RBI: ps?.RBI ?? 0, SB: ps?.SB ?? 0,
              H: ps?.H ?? 0, AB: ps?.AB ?? 0,
              AVG: (ps?.AB ?? 0) > 0 ? (ps?.H ?? 0) / ps!.AB : 0,
              W: ps?.W ?? 0, SV: ps?.SV ?? 0, K: ps?.K ?? 0,
              IP: realIP, ER: ps?.ER ?? 0, BB_H: ps?.BB_H ?? 0,
              ERA: realIP > 0 ? ((ps?.ER ?? 0) * 9) / realIP : 0,
              WHIP: realIP > 0 ? (ps?.BB_H ?? 0) / realIP : 0,
              mlb_team_abbr: mlbTeam,
              price,
              isKeeper,
            } as unknown as PlayerSeasonStat;
          });

          setPlayers(merged);
        } else {
          // Fallback: filter CSV data by team code (legacy behavior)
          const filtered = (csvRows ?? []).filter(
            (p: any) => normCode(p?.ogba_team_code ?? p?.team ?? p?.ogbaTeamCode) === code
          );
          setPlayers(filtered);
        }

      } catch (err: unknown) {
        if (!ok) return;
        setError(err instanceof Error ? err.message : "Failed to load team roster");
        setPlayers([]);
      } finally {
        if (ok) setLoading(false);
      }
    }

    load();
    return () => {
      ok = false;
    };
  }, [code, leagueId]);

  // Reset AI state when team changes (prevents showing Team A's grade on Team B)
  useEffect(() => {
    setAiInsights(null);
    setAiError(null);
    setInsightHistory([]);
    setHistoryLoaded(false);
    setSelectedWeekKey(null);
    setAiLoading(false);
  }, [dbTeamId]);

  // Fetch AI insights + history in parallel once dbTeamId is available
  useEffect(() => {
    if (!dbTeamId || !leagueId || aiInsights || aiLoading) return;
    let ok = true;
    (async () => {
      setAiLoading(true);
      try {
        // Fire both requests in parallel instead of sequentially
        const [result, historyResult] = await Promise.allSettled([
          getTeamAiInsights(leagueId, dbTeamId),
          getTeamAiInsightsHistory(leagueId, dbTeamId),
        ]);
        if (!ok) return;
        if (result.status === "fulfilled") setAiInsights(result.value);
        if (historyResult.status === "fulfilled" && historyResult.value.weeks.length > 0) {
          setInsightHistory(historyResult.value.weeks);
          setSelectedWeekKey(historyResult.value.weeks[0].weekKey);
        }
        setHistoryLoaded(true);
      } catch {
        // Silently fail — insights are supplementary
      } finally {
        if (ok) setAiLoading(false);
      }
    })();
    return () => { ok = false; };
  }, [dbTeamId, leagueId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load period roster when a period is selected
  useEffect(() => {
    if (!selectedPeriodId || !dbTeamId) {
      setPeriodRoster(null);
      return;
    }
    let ok = true;
    setPeriodRosterLoading(true);
    getTeamPeriodRoster(dbTeamId, selectedPeriodId)
      .then(data => { if (ok) setPeriodRoster(data.roster); })
      .catch(() => { if (ok) setPeriodRoster(null); })
      .finally(() => { if (ok) setPeriodRosterLoading(false); });
    return () => { ok = false; };
  }, [selectedPeriodId, dbTeamId]);

  const teamName = useMemo(() => getOgbaTeamName(code) || code, [code]);

  // Sort hitters by roster slot order (POS_SCORE: C=0, 1B=1, … DH=11), then price desc
  const hitters = useMemo(() => {
    const list = players.filter((p) => !isPitcher(p));
    list.sort((a, b) => {
      const posA = a.assignedPosition || "";
      const posB = b.assignedPosition || "";
      const slotDiff = (POS_SCORE[posA] ?? 99) - (POS_SCORE[posB] ?? 99);
      if (slotDiff !== 0) return slotDiff;
      return (b.price ?? 0) - (a.price ?? 0);
    });
    return list;
  }, [players]);
  // Sort pitchers by position (SP before RP), then price desc
  const pitchers = useMemo(() => {
    const list = players.filter((p) => isPitcher(p));
    list.sort((a, b) => {
      const posA = a.assignedPosition || "";
      const posB = b.assignedPosition || "";
      const posDiff = (POS_SCORE[posA] ?? 99) - (POS_SCORE[posB] ?? 99);
      if (posDiff !== 0) return posDiff;
      return (b.price ?? 0) - (a.price ?? 0);
    });
    return list;
  }, [players]);

  return (
    <div className="flex-1 min-h-screen bg-[var(--lg-bg)] text-[var(--lg-text-primary)]">
      <main className="max-w-7xl mx-auto px-4 py-6 md:px-6 md:py-12">
        <header className="mb-10 text-center relative">
          <h1 className="text-3xl font-semibold uppercase text-[var(--lg-text-heading)] mb-4">{teamName}</h1>
          <div className="text-xs font-medium uppercase text-[var(--lg-text-muted)] opacity-60">
            Roster: {hitters.length} Hitters • {pitchers.length} Pitchers
            {players.some((p: any) => p.isKeeper) && (
              <span className="ml-3 text-amber-500">
                • {players.filter((p: any) => p.isKeeper).length} Keepers
              </span>
            )}
          </div>
          
          <div className="mt-8 flex justify-center gap-6">
             <Link to="/season">
               <Button variant="ghost" size="sm">
                 <span className="opacity-40 ml-[-4px] mr-2">←</span> Teams
               </Button>
             </Link>

             {/* AI Insights auto-generate on load — no manual button needed */}
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* AI Insights Section — auto-generates weekly */}
        {aiLoading && !aiInsights && (
          <div className="mb-6 flex items-center justify-center gap-2 py-6 text-xs text-[var(--lg-text-muted)] animate-pulse">
            <Sparkles size={14} className="text-blue-400" />
            Generating weekly insights...
          </div>
        )}
        {aiError && (
          <div className="mb-4 text-center text-xs text-red-400">{aiError}</div>
        )}
        {aiInsights && (() => {
          // Determine which insight data to display based on selected week tab
          const activeInsight: any = selectedWeekKey && insightHistory.length >= 1
            ? insightHistory.find(w => w.weekKey === selectedWeekKey) || aiInsights
            : aiInsights;
          const activeGrade = activeInsight?.overallGrade || aiInsights.overallGrade;
          const activeWeekKey = activeInsight?.weekKey || (aiInsights as any).weekKey;
          const activeInsightsList = activeInsight?.insights || aiInsights.insights || [];

          return (
          <div className="mb-8 rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] overflow-hidden">
            {/* Header — toggle + full report cross-link */}
            <div className="flex items-stretch">
              <button
                onClick={() => setAiExpanded(prev => !prev)}
                className="flex-1 flex items-center justify-between p-4 md:p-5 hover:bg-[var(--lg-bg-card)]/30 transition-colors text-left"
              >
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <Sparkles size={14} className="text-[var(--lg-accent)] flex-shrink-0" />
                  <span className="text-xs font-semibold uppercase text-[var(--lg-text-muted)]">Weekly Insights</span>
                  <span className="text-[10px] text-[var(--lg-text-muted)] opacity-60">Updated Every Monday</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {activeGrade && (
                    <span className="px-2 py-1 rounded text-xs font-bold uppercase bg-[var(--lg-accent)]/10 text-[var(--lg-accent)] border border-[var(--lg-accent)]/20">
                      {activeGrade}
                    </span>
                  )}
                  {aiExpanded ? <ChevronUp size={14} className="text-[var(--lg-text-muted)]" /> : <ChevronDown size={14} className="text-[var(--lg-text-muted)]" />}
                </div>
              </button>
              <Link
                to={activeWeekKey ? `/report/${activeWeekKey}` : "/report"}
                className="flex items-center gap-1.5 px-3 md:px-4 border-l border-[var(--lg-border-faint)] text-[11px] font-semibold uppercase tracking-wider text-[var(--lg-accent)] hover:bg-[var(--lg-bg-card)]/30 transition-colors"
                title="Open This Week in Baseball — full weekly report"
              >
                Full Report
                <ChevronRight size={14} />
              </Link>
            </div>

            {/* Expandable content */}
            {aiExpanded && (
              <div className="px-4 pb-4 md:px-5 md:pb-5">
                {/* Week tabs — always show when history exists (like league digest) */}
                {insightHistory.length >= 1 && (
                  <div className="mb-4 flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
                    {insightHistory.map((week) => {
                      // Convert ISO week key (e.g., "2026-W14") to "Week of M/D"
                      const weekLabel = (() => {
                        const match = week.weekKey.match(/^(\d{4})-W(\d{1,2})$/);
                        if (!match) return week.weekKey;
                        const [, yearStr, weekStr] = match;
                        const year = parseInt(yearStr);
                        const weekNum = parseInt(weekStr);
                        // ISO week 1 contains Jan 4; Monday of week 1
                        const jan4 = new Date(year, 0, 4);
                        const dayOfWeek = jan4.getDay() || 7; // Mon=1..Sun=7
                        const mondayWeek1 = new Date(jan4);
                        mondayWeek1.setDate(jan4.getDate() - dayOfWeek + 1);
                        const monday = new Date(mondayWeek1);
                        monday.setDate(mondayWeek1.getDate() + (weekNum - 1) * 7);
                        return `Week of ${monday.getMonth() + 1}/${monday.getDate()}`;
                      })();
                      const isActive = week.weekKey === selectedWeekKey;
                      return (
                        <button
                          key={week.weekKey}
                          onClick={(e) => { e.stopPropagation(); setSelectedWeekKey(week.weekKey); }}
                          className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                            isActive
                              ? "bg-[var(--lg-accent)] text-white"
                              : "bg-[var(--lg-bg-card)] text-[var(--lg-text-muted)] border border-[var(--lg-border-faint)] hover:text-[var(--lg-text-primary)] hover:border-[var(--lg-accent)]/30"
                          }`}
                        >
                          {weekLabel}
                          {week.overallGrade && (
                            <span className={`ml-1.5 ${isActive ? "opacity-80" : "opacity-60"}`}>{week.overallGrade}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {activeInsightsList.map((insight: any, idx: number) => (
                    <div key={idx} className="p-3 rounded-xl bg-[var(--lg-bg-card)] border border-[var(--lg-border-faint)]">
                      <div className="flex items-start gap-2 mb-1">
                        {insight.priority && (
                          <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            insight.priority === "high" ? "bg-red-400" :
                            insight.priority === "medium" ? "bg-amber-400" : "bg-[var(--lg-text-muted)]"
                          }`} />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-[var(--lg-accent)]/10 text-[var(--lg-accent)]">
                              {insight.category}
                            </span>
                            <span className="text-xs font-semibold text-[var(--lg-text-primary)] leading-tight">{insight.title}</span>
                          </div>
                          <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed mt-1">{insight.detail}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-center text-[10px] text-[var(--lg-text-muted)] opacity-50">
                  Powered by <strong>Google Gemini</strong> & <strong>Anthropic Claude</strong>
                </div>
              </div>
            )}
          </div>
          );
        })()}

        {/* Period Roster Selector */}
        {availablePeriods.length > 0 && (
          <div className="mb-6 flex items-center gap-3">
            <span className="text-xs font-semibold uppercase text-[var(--lg-text-muted)]">Period Roster</span>
            <select
              className="appearance-none bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-lg px-3 py-1.5 text-xs text-[var(--lg-text-primary)] cursor-pointer"
              value={selectedPeriodId ?? ""}
              onChange={e => setSelectedPeriodId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Current Roster</option>
              {availablePeriods.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {selectedPeriodId && (
              <span className="text-[10px] text-[var(--lg-text-muted)] opacity-60">
                Showing all players on this team during the selected period
              </span>
            )}
          </div>
        )}

        {/* Period Roster View (when a period is selected) */}
        {selectedPeriodId && (
          <div className="mb-8">
            {periodRosterLoading ? (
              <div className="text-center py-8 text-sm text-[var(--lg-text-muted)] animate-pulse">Loading period roster...</div>
            ) : periodRoster && periodRoster.length > 0 ? (
              <TableCard>
                <Table>
                  <THead>
                    <Tr>
                      <Th align="center" w={50}>POS</Th>
                      <Th align="center">PLAYER</Th>
                      <Th align="center" w={60}>TM</Th>
                      <Th align="center" w={60}>$</Th>
                      <Th align="center" w={120}>STATUS</Th>
                      <Th align="center" w={100}>SOURCE</Th>
                    </Tr>
                  </THead>
                  <tbody>
                    {periodRoster.map(r => (
                      <Tr
                        key={r.id}
                        className={`border-t border-[var(--lg-border-faint)] ${!r.isActive ? "opacity-50" : ""}`}
                      >
                        <Td align="center">
                          <span className="text-[10px] font-mono font-semibold text-[var(--lg-accent)]">
                            {r.assignedPosition || mapPosition(r.posPrimary, outfieldMode)}
                          </span>
                        </Td>
                        <Td align="center">
                          <span className="text-xs font-medium text-[var(--lg-text-primary)]">{r.name}</span>
                        </Td>
                        <Td align="center">
                          <span className="text-[10px] text-[var(--lg-text-muted)]">{r.mlbTeam || "—"}</span>
                        </Td>
                        <Td align="center">
                          <span className="text-[10px] text-[var(--lg-text-muted)]">${r.price}</span>
                        </Td>
                        <Td align="center">
                          {r.isActive ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                              {r.source === "TRADE_OUT" ? "Traded" : r.source === "WAIVER_DROP" ? "Waived" : "Dropped"}{" "}
                              {r.releasedAt ? new Date(r.releasedAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }) : ""}
                            </span>
                          )}
                        </Td>
                        <Td align="center">
                          <span className="text-[10px] text-[var(--lg-text-muted)]">{r.source}</span>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableCard>
            ) : (
              <div className="text-center py-8 text-sm text-[var(--lg-text-muted)]">No roster data for this period.</div>
            )}
          </div>
        )}

        <div className="mb-10 flex justify-center">
          <div className="lg-card p-1">
            <Link to="#hitters">
              <Button
                variant={activeTab === "hitters" ? "default" : "ghost"}
                className="px-8"
              >
                Hitters
              </Button>
            </Link>
            <Link to="#pitchers">
              <Button
                variant={activeTab === "pitchers" ? "default" : "ghost"}
                className="px-8"
              >
                Pitchers
              </Button>
            </Link>
          </div>
        </div>

        <StatsUpdated source="synced" className="text-right mb-1" />
        {activeTab === "hitters" ? (
          <section id="hitters">
            <TableCard>
              <Table>
                <THead>
                  <Tr>
                    {/* All columns explicitly sized so table-layout: fixed distributes
                        any extra width proportionally, not dumped into PLAYER. */}
                    <Th align="center" w={50}>POS</Th>
                    <Th align="center" w={240}>PLAYER</Th>
                    <Th align="center" w={60}>TM</Th>
                    <Th align="center" w={70}>AB</Th>
                    <Th align="center" w={60}>R</Th>
                    <Th align="center" w={60}>HR</Th>
                    <Th align="center" w={60}>RBI</Th>
                    <Th align="center" w={60}>SB</Th>
                    <Th align="center" w={80}>AVG</Th>
                  </Tr>
                </THead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-[var(--lg-text-muted)]">
                        Loading roster…
                      </td>
                    </tr>
                  ) : hitters.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm text-[var(--lg-text-muted)]">
                        No hitters found for this roster.
                      </td>
                    </tr>
                  ) : (
                    hitters.map((p: any) => {
                      const key = rowKey(p);
                      const tm = getMlbTeamAbbr(p);
                      const elig = posEligible(p, outfieldMode);
                      const isExpanded = expandedId === key;

                      // Grand Slams (supports multiple common key names)
                      const gs = numFromAny(p, "GS", "gs", "GSL", "gsl", "grandSlams", "grand_slams");

                      return (
                        <React.Fragment key={key}>
                          <Tr
                            className={`border-t border-[var(--lg-border-faint)] cursor-pointer transition-all ${isExpanded ? 'bg-[var(--lg-accent)]/10' : 'hover:bg-[var(--lg-tint)]'}`}
                            onClick={() => setExpandedId(isExpanded ? null : key)}
                            title="Click to expand player details"
                          >
                            <Td align="center">
                              {(() => {
                                const rosterId = (p as any)?._rosterId as number | undefined;
                                // Show the locked roster slot from assignedPosition
                                const assignedPos = positionOverrides[rosterId!] || mapPosition((p as any)?.assignedPosition || (p as any)?.posPrimary || elig.split("/")[0] || "", outfieldMode);

                                if (positionsLocked || !rosterId || !dbTeamId) {
                                  // During season: fixed position label, no dropdown
                                  return <span className="text-[10px] font-mono font-semibold text-[var(--lg-accent)]">{assignedPos || "—"}</span>;
                                }

                                // During draft/setup: allow position changes
                                const rawPosList = (p as any)?._posList || elig || "";
                                const posSlots = (() => {
                                  const slots = new Set<string>();
                                  for (const pos of rawPosList.split(/[,/| ]+/).map((s: string) => s.trim()).filter(Boolean)) {
                                    for (const s of positionToSlots(pos)) slots.add(s);
                                  }
                                  return MATRIX_POSITIONS.filter(s => slots.has(s));
                                })();
                                return posSlots.length > 1 ? (
                                  <select
                                    className="appearance-none bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 cursor-pointer hover:bg-emerald-500/20 transition-all outline-none text-[10px] font-mono"
                                    value={assignedPos}
                                    onChange={(e) => { e.stopPropagation(); handlePositionSwap(dbTeamId, rosterId, e.target.value); }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {posSlots.map(pos => <option key={pos} value={pos} className="text-black">{pos}</option>)}
                                  </select>
                                ) : (
                                  <span className="text-[10px] font-mono font-semibold text-[var(--lg-accent)]">{assignedPos || "—"}</span>
                                );
                              })()}
                            </Td>
                            <Td align="center">
                              <span className="inline-flex items-center gap-1.5">
                                {p?.player_name ?? p?.name ?? p?.playerName ?? ""}
                                {(p as any)?.isKeeper && <span className="text-[10px] font-semibold uppercase text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1 py-px rounded" title="Keeper">K</span>}
                                {tradeBlockIds.has((p as any)?._dbPlayerId) && (
                                  <span className="text-[10px] font-semibold uppercase text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1 py-px rounded" title="On trade block">
                                    <ArrowLeftRight size={10} className="inline -mt-px" /> TB
                                  </span>
                                )}
                              </span>
                            </Td>
                            <Td align="center">
                              {tm || "—"}
                            </Td>
                            <Td align="center">
                              {asNum(p?.AB)}
                            </Td>
                            <Td align="center">
                              {asNum(p?.R)}
                            </Td>
                            <Td align="center">
                              {asNum(p?.HR)}
                            </Td>
                            <Td align="center">
                              {asNum(p?.RBI)}
                            </Td>
                            <Td align="center">
                              {asNum(p?.SB)}
                            </Td>
                            <Td align="center">
                              {formatAvg(p?.AVG)}
                            </Td>
                          </Tr>
                          {isExpanded && (
                            <PlayerExpandedRow
                              player={p}
                              isTaken={true}
                              ownerName={teamName}
                              onViewDetail={setSelected}
                              colSpan={9}
                            />
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                  {/* Totals row */}
                  {hitters.length > 0 && (() => {
                    const totR = hitters.reduce((s, p) => s + asNum(p?.R), 0);
                    const totHR = hitters.reduce((s, p) => s + asNum(p?.HR), 0);
                    const totRBI = hitters.reduce((s, p) => s + asNum(p?.RBI), 0);
                    const totSB = hitters.reduce((s, p) => s + asNum(p?.SB), 0);
                    const totH = hitters.reduce((s, p) => s + asNum(p?.H), 0);
                    const totAB = hitters.reduce((s, p) => s + asNum(p?.AB), 0);
                    const teamAvg = totAB > 0 ? totH / totAB : 0;
                    return (
                      <tr className="border-t-2 border-[var(--lg-accent)]/30 bg-[var(--lg-tint)]">
                        <Td align="center"><span className="text-[10px] font-bold text-[var(--lg-accent)]">TOT</span></Td>
                        <Td align="center"><span className="font-bold text-xs text-[var(--lg-text-heading)]">Team Totals</span></Td>
                        <Td align="center">{""}</Td>
                        <Td align="center"><span className="font-bold">{totAB}</span></Td>
                        <Td align="center"><span className="font-bold">{totR}</span></Td>
                        <Td align="center"><span className="font-bold">{totHR}</span></Td>
                        <Td align="center"><span className="font-bold">{totRBI}</span></Td>
                        <Td align="center"><span className="font-bold">{totSB}</span></Td>
                        <Td align="center"><span className="font-bold">{formatAvg(teamAvg)}</span></Td>
                      </tr>
                    );
                  })()}
                </tbody>
              </Table>
            </TableCard>
          </section>
        ) : (
          <section id="pitchers">
            <TableCard>
              <Table>
                <THead>
                  <Tr>
                    {/* All columns explicitly sized — proportional distribution of extra. */}
                    <Th align="center" w={50}>POS</Th>
                    <Th align="center" w={220}>PLAYER</Th>
                    <Th align="center" w={55}>TM</Th>
                    <Th align="center" w={50}>W</Th>
                    <Th align="center" w={50}>SV</Th>
                    <Th align="center" w={55}>K</Th>
                    <Th align="center" w={55}>IP</Th>
                    <Th align="center" w={55}>ER</Th>
                    <Th align="center" w={65} title="Walks + Hits (WHIP numerator)">BB+H</Th>
                    <Th align="center" w={65}>ERA</Th>
                    <Th align="center" w={70}>WHIP</Th>
                  </Tr>
                </THead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-sm text-[var(--lg-text-muted)]">
                        Loading roster…
                      </td>
                    </tr>
                  ) : pitchers.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-sm text-[var(--lg-text-muted)]">
                        No pitchers found for this roster.
                      </td>
                    </tr>
                  ) : (
                    pitchers.map((p: any) => {
                      const key = rowKey(p);
                      const tm = getMlbTeamAbbr(p);
                      const elig = posEligible(p, outfieldMode) || "P";
                      const isExpanded = expandedId === key;

                      // Shutouts (commonly "SHO"; sometimes "SO" in custom datasets)
                      const so = numFromAny(p, "SHO", "sho", "SO", "so", "shutouts", "shut_outs");

                      return (
                        <React.Fragment key={key}>
                          <Tr
                            className={`border-t border-[var(--lg-border-faint)] cursor-pointer transition-all ${isExpanded ? 'bg-[var(--lg-accent)]/10' : 'hover:bg-[var(--lg-tint)]'}`}
                            onClick={() => setExpandedId(isExpanded ? null : key)}
                            title="Click to expand player details"
                          >
                            <Td align="center">
                              {/* Pitchers always show P — locked during season */}
                              <span className="text-[10px] font-mono font-semibold text-[var(--lg-accent)]">P</span>
                            </Td>
                            <Td align="center">
                              <span className="inline-flex items-center gap-1.5">
                                {p?.player_name ?? p?.name ?? p?.playerName ?? ""}
                                {(p as any)?.isKeeper && <span className="text-[10px] font-semibold uppercase text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1 py-px rounded" title="Keeper">K</span>}
                                {tradeBlockIds.has((p as any)?._dbPlayerId) && (
                                  <span className="text-[10px] font-semibold uppercase text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1 py-px rounded" title="On trade block">
                                    <ArrowLeftRight size={10} className="inline -mt-px" /> TB
                                  </span>
                                )}
                              </span>
                            </Td>
                            <Td align="center">
                              {tm || "—"}
                            </Td>

                            <Td align="center">
                              {asNum(p?.W)}
                            </Td>
                            <Td align="center">
                              {asNum(p?.SV)}
                            </Td>
                            <Td align="center">
                              {asNum(p?.K)}
                            </Td>
                            <Td align="center">
                              {asNum(p?.IP) > 0 ? asNum(p.IP).toFixed(1) : "—"}
                            </Td>
                            <Td align="center">
                              {asNum(p?.ER) || "—"}
                            </Td>
                            <Td align="center">
                              {asNum(p?.BB_H) || "—"}
                            </Td>
                            <Td align="center">
                              {asNum(p?.IP) > 0 ? asNum(p.ERA).toFixed(2) : "—"}
                            </Td>
                            <Td align="center">
                              {asNum(p?.IP) > 0 ? asNum(p.WHIP).toFixed(3) : "—"}
                            </Td>
                          </Tr>
                          {isExpanded && (
                            <PlayerExpandedRow
                              player={p}
                              isTaken={true}
                              ownerName={teamName}
                              onViewDetail={setSelected}
                              colSpan={10}
                            />
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                  {/* Totals row */}
                  {pitchers.length > 0 && (() => {
                    const totW = pitchers.reduce((s, p) => s + asNum(p?.W), 0);
                    const totSV = pitchers.reduce((s, p) => s + asNum(p?.SV), 0);
                    const totK = pitchers.reduce((s, p) => s + asNum(p?.K), 0);
                    const totIP = pitchers.reduce((s, p) => s + asNum(p?.IP), 0);
                    const totER = pitchers.reduce((s, p) => s + asNum(p?.ER), 0);
                    const totBB = pitchers.reduce((s, p) => s + asNum(p?.BB_H), 0);
                    // Compute ERA/WHIP from individual pitcher ERA/WHIP weighted by IP
                    // (more accurate than summing raw ER/BB_H which may not be on every player object)
                    let weightedER = 0, weightedBBH = 0;
                    for (const p of pitchers) {
                      const pip = asNum(p?.IP);
                      if (pip > 0) {
                        weightedER += asNum(p?.ERA) * pip / 9; // reverse: ERA = ER*9/IP → ER = ERA*IP/9
                        weightedBBH += asNum(p?.WHIP) * pip;   // reverse: WHIP = BBH/IP → BBH = WHIP*IP
                      }
                    }
                    const teamERA = totIP > 0 ? (weightedER / totIP) * 9 : 0;
                    const teamWHIP = totIP > 0 ? weightedBBH / totIP : 0;
                    return (
                      <tr className="border-t-2 border-[var(--lg-accent)]/30 bg-[var(--lg-tint)]">
                        <Td align="center"><span className="text-[10px] font-bold text-[var(--lg-accent)]">TOT</span></Td>
                        <Td align="center"><span className="font-bold text-xs text-[var(--lg-text-heading)]">Team Totals</span></Td>
                        <Td align="center">{""}</Td>
                        <Td align="center"><span className="font-bold">{totW}</span></Td>
                        <Td align="center"><span className="font-bold">{totSV}</span></Td>
                        <Td align="center"><span className="font-bold">{totK}</span></Td>
                        <Td align="center"><span className="font-bold">{totIP > 0 ? totIP.toFixed(1) : "—"}</span></Td>
                        <Td align="center"><span className="font-bold">{totER}</span></Td>
                        <Td align="center"><span className="font-bold">{totBB}</span></Td>
                        <Td align="center"><span className="font-bold">{totIP > 0 ? teamERA.toFixed(2) : "—"}</span></Td>
                        <Td align="center"><span className="font-bold">{totIP > 0 ? teamWHIP.toFixed(3) : "—"}</span></Td>
                      </tr>
                    );
                  })()}
                </tbody>
              </Table>
            </TableCard>
          </section>
        )}

        {/* IL Report */}
        {ilPlayers.length > 0 && (
          <div className="mt-10">
            <RosterAlertAccordion
              players={ilPlayers}
              colorScheme="red"
              label="Injured List"
              mlbHeadshot={(mlbId) => `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${mlbId}/headshot/67/current`}
            />
          </div>
        )}

        {/* Minors Report */}
        {minorsPlayers.length > 0 && (
          <div className={ilPlayers.length > 0 ? "mt-4" : "mt-10"}>
            <RosterAlertAccordion
              players={minorsPlayers}
              colorScheme="amber"
              label="Minors Report"
              mlbHeadshot={(mlbId) => `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${mlbId}/headshot/67/current`}
            />
          </div>
        )}

        {/* Watchlist & Trading Block (own team only during IN_SEASON) */}
        {dbTeamId && seasonStatus === "IN_SEASON" && myTeamId === dbTeamId && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
            <div className="lg-card p-4">
              <WatchlistPanel teamId={dbTeamId} />
            </div>
            <div className="lg-card p-4">
              <TradingBlockPanel
                teamId={dbTeamId}
                rosterPlayers={players.filter(p => (p as any)._dbPlayerId > 0).map(p => ({
                  id: (p as any)._dbPlayerId,
                  name: p.mlb_full_name || p.player_name || "",
                  posPrimary: (p.positions || (p.is_pitcher ? "P" : "UT")).toString().split(/[/,]/)[0] || "UT",
                  mlbTeam: (p.mlb_team || p.mlbTeam || null) as string | null,
                }))}
              />
            </div>
          </div>
        )}

        {selected ? <PlayerDetailModal player={selected} onClose={() => setSelected(null)} /> : null}

      </main>
    </div>
  );
}
