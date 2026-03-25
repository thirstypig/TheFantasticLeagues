import React, { useEffect, useState, useCallback, useMemo } from "react";
import { TrendingUp, TrendingDown, Loader2, Sparkles, ChevronDown, ChevronUp, BarChart3, Target, Users } from "lucide-react";
import { fetchJsonApi, API_BASE, fmtRate } from "../../../api/base";
import { getPlayerSeasonStats, type PlayerSeasonStat } from "../../../api";
import { useLeague } from "../../../contexts/LeagueContext";
import PageHeader from "../../../components/ui/PageHeader";
import { ThemedTable, ThemedThead, ThemedTbody, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";
import { SortableHeader } from "../../../components/ui/SortableHeader";
import { isPitcher as isPitcherPos, mapPosition } from "../../../lib/sportConfig";
import PlayerExpandedRow from "../../auction/components/PlayerExpandedRow";
import PlayerDetailModal from "../../../components/shared/PlayerDetailModal";

/* ── Types ───────────────────────────────────────────────────────── */

interface BargainOverpay {
  playerName: string;
  position: string;
  price: number;
  projectedValue: number;
  surplus: number;
}

interface KeeperEntry {
  playerName: string;
  position: string;
  price: number;
  projectedValue: number | null;
  surplus: number | null;
}

interface RosterEntry {
  playerName: string;
  position: string;
  mlbTeam?: string;
  price: number;
  isKeeper: boolean;
  projectedValue: number | null;
  surplus: number | null;
  // Enriched stats (joined from PlayerSeasonStat)
  stat?: PlayerSeasonStat;
}

interface DraftReportTeam {
  teamId: number;
  teamName: string;
  grade: string;
  keeperAssessment: string;
  analysis: string;
  projectedStats: string;
  categoryStrengths: string;
  categoryWeaknesses: string;
  auctionSpend: number;
  keeperSpend: number;
  keeperCount: number;
  avgHitterPrice: number;
  avgPitcherPrice: number;
  totalSurplus: number;
  auctionSurplus: number;
  hitterSpend: number;
  pitcherSpend: number;
  top3Pct: number;
  favMlbTeam: { team: string; count: number } | null;
  bestBargain: BargainOverpay | null;
  worstOverpay: BargainOverpay | null;
  keepers: KeeperEntry[];
  roster: RosterEntry[];
}

interface DraftReport {
  leagueSummary: { avgHitterPrice: number; avgPitcherPrice: number };
  surplusRanking: { teamId: number; teamName: string; surplus: number }[];
  teams: DraftReportTeam[];
  generatedAt: string;
}

import { gradeColor } from "../../../lib/sportConfig";

/* ── Helpers ─────────────────────────────────────────────────────── */

function surplusColor(surplus: number | null): string {
  if (surplus === null) return "";
  if (surplus > 0) return "text-emerald-500";
  if (surplus < -5) return "text-red-400";
  return "text-[var(--lg-text-muted)]";
}

function StatPill({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[var(--lg-tint)] border border-[var(--lg-border-faint)] rounded-lg px-3 py-2 text-center min-w-0">
      <div className="text-[10px] uppercase tracking-wide font-bold text-[var(--lg-text-muted)] opacity-60">{label}</div>
      <div className="text-sm font-bold text-[var(--lg-text-primary)] tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-[var(--lg-text-muted)] truncate">{sub}</div>}
    </div>
  );
}

/* ── Team Card ───────────────────────────────────────────────────── */

type RosterSortKey = "name" | "pos" | "price" | "value" | "surplus" | "R" | "HR" | "RBI" | "SB" | "AVG" | "W" | "SV" | "K" | "ERA" | "WHIP";

function TeamCard({ team, leagueAvgH, leagueAvgP, outfieldMode, onSelectPlayer }: { team: DraftReportTeam; leagueAvgH: number; leagueAvgP: number; outfieldMode?: string; onSelectPlayer?: (p: PlayerSeasonStat) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [viewGroup, setViewGroup] = useState<"hitters" | "pitchers">("hitters");
  const [sortKey, setSortKey] = useState<RosterSortKey>("price");
  const [sortDesc, setSortDesc] = useState(true);

  const handleSort = (key: RosterSortKey) => {
    if (key === sortKey) { setSortDesc(!sortDesc); }
    else { setSortKey(key); setSortDesc(key !== "name" && key !== "pos"); }
  };

  const filteredRoster = useMemo(() => {
    const isHitters = viewGroup === "hitters";
    const filtered = team.roster.filter(r => {
      const pitcher = isPitcherPos(r.position);
      return isHitters ? !pitcher : pitcher;
    });

    const getVal = (r: RosterEntry): number | string => {
      const s = r.stat;
      switch (sortKey) {
        case "name": return r.playerName.toLowerCase();
        case "pos": return r.position;
        case "price": return r.price;
        case "value": return r.projectedValue ?? -999;
        case "surplus": return r.surplus ?? -999;
        case "R": return s?.R ?? -1;
        case "HR": return s?.HR ?? -1;
        case "RBI": return s?.RBI ?? -1;
        case "SB": return s?.SB ?? -1;
        case "AVG": return typeof s?.AVG === "number" ? s.AVG : -1;
        case "W": return s?.W ?? -1;
        case "SV": return s?.SV ?? -1;
        case "K": return s?.K ?? -1;
        case "ERA": return typeof s?.ERA === "number" ? s.ERA : 999;
        case "WHIP": return typeof s?.WHIP === "number" ? s.WHIP : 999;
        default: return 0;
      }
    };

    return [...filtered].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sortDesc ? -cmp : cmp;
    });
  }, [team.roster, viewGroup, sortKey, sortDesc]);

  return (
    <div className="rounded-xl border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] overflow-hidden">
      {/* Header */}
      <div className="p-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className={`text-3xl font-black tabular-nums ${gradeColor(team.grade)}`}>{team.grade}</span>
            <div>
              <h3 className="text-base font-bold text-[var(--lg-text-primary)]">{team.teamName}</h3>
              <div className="text-[11px] text-[var(--lg-text-muted)] tabular-nums mt-0.5 flex items-center gap-2 flex-wrap">
                <span>Auction: ${team.auctionSpend} · {team.keeperCount} keepers: ${team.keeperSpend} · Surplus: <span className={surplusColor(team.auctionSurplus)}>{team.auctionSurplus >= 0 ? "+" : ""}${team.auctionSurplus}</span></span>
                {team.favMlbTeam && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[var(--lg-tint)] border border-[var(--lg-border-faint)] text-[10px] font-bold">
                    {team.favMlbTeam.team} ×{team.favMlbTeam.count}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <StatPill label="Avg Hitter $" value={`$${team.avgHitterPrice}`} sub={`league: $${leagueAvgH}`} />
          <StatPill label="Avg Pitcher $" value={`$${team.avgPitcherPrice}`} sub={`league: $${leagueAvgP}`} />
          <StatPill label="Hit/Pitch Split" value={`$${team.hitterSpend}/$${team.pitcherSpend}`} />
          <StatPill label="Top 3 Concentration" value={`${team.top3Pct}%`} sub="of auction budget" />
        </div>

        {/* Keepers */}
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Users size={13} className="text-[var(--lg-accent)]" />
            <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--lg-text-muted)]">Keepers</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {team.keepers.map(k => (
              <span key={k.playerName} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--lg-tint)] border border-[var(--lg-border-faint)] text-[11px]">
                <span className="font-medium text-[var(--lg-text-primary)]">{k.playerName}</span>
                <span className="text-[var(--lg-text-muted)]">{k.position}</span>
                <span className="tabular-nums text-[var(--lg-text-secondary)]">${k.price}</span>
                {k.surplus !== null && (
                  <span className={`tabular-nums font-medium ${surplusColor(k.surplus)}`}>
                    ({k.surplus >= 0 ? "+" : ""}{k.surplus})
                  </span>
                )}
              </span>
            ))}
          </div>
          <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed mt-2 italic">{team.keeperAssessment}</p>
        </div>

        {/* Bargain + Overpay */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          {team.bestBargain && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
              <TrendingUp size={14} className="text-emerald-500 flex-shrink-0" />
              <div className="text-[11px] min-w-0">
                <span className="font-bold text-emerald-500">Best Bargain: </span>
                <span className="font-medium text-[var(--lg-text-primary)]">{team.bestBargain.playerName}</span>
                <span className="text-[var(--lg-text-muted)]"> ({team.bestBargain.position})</span>
                <span className="tabular-nums text-[var(--lg-text-secondary)]"> — paid ${team.bestBargain.price}, worth ${team.bestBargain.projectedValue}</span>
                <span className="tabular-nums font-bold text-emerald-500"> (+${team.bestBargain.surplus})</span>
              </div>
            </div>
          )}
          {team.worstOverpay && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/5">
              <TrendingDown size={14} className="text-red-400 flex-shrink-0" />
              <div className="text-[11px] min-w-0">
                <span className="font-bold text-red-400">Worst Overpay: </span>
                <span className="font-medium text-[var(--lg-text-primary)]">{team.worstOverpay.playerName}</span>
                <span className="text-[var(--lg-text-muted)]"> ({team.worstOverpay.position})</span>
                <span className="tabular-nums text-[var(--lg-text-secondary)]"> — paid ${team.worstOverpay.price}, worth ${team.worstOverpay.projectedValue}</span>
                <span className="tabular-nums font-bold text-red-400"> (${team.worstOverpay.surplus})</span>
              </div>
            </div>
          )}
        </div>

        {/* AI Analysis */}
        <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed mb-3">{team.analysis}</p>

        {/* Category Strengths & Weaknesses */}
        {(team.categoryStrengths || team.categoryWeaknesses) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
            {team.categoryStrengths && (
              <div className="px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-500 mb-1">Projected Strengths</div>
                <div className="text-[11px] text-[var(--lg-text-secondary)] leading-relaxed">{team.categoryStrengths}</div>
              </div>
            )}
            {team.categoryWeaknesses && (
              <div className="px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/20">
                <div className="text-[10px] font-bold uppercase tracking-wide text-red-400 mb-1">Projected Weaknesses</div>
                <div className="text-[11px] text-[var(--lg-text-secondary)] leading-relaxed">{team.categoryWeaknesses}</div>
              </div>
            )}
          </div>
        )}

        {/* Projected Stats */}
        <div className="text-[11px] text-[var(--lg-text-muted)] bg-[var(--lg-tint)] rounded-md px-3 py-2 font-mono leading-relaxed">
          {team.projectedStats}
        </div>
      </div>

      {/* Expandable roster */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium text-[var(--lg-accent)] border-t border-[var(--lg-border-faint)] hover:bg-[var(--lg-tint)] transition-colors"
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {expanded ? "Hide Roster" : "Show Full Roster"}
      </button>

      {expanded && (
        <div className="px-5 pb-4 overflow-x-auto">
          {/* H / P toggle */}
          <div className="flex items-center gap-1 mb-2">
            {(["hitters", "pitchers"] as const).map(g => (
              <button
                key={g}
                onClick={() => setViewGroup(g)}
                className={`px-3 py-1 rounded-md text-[11px] font-bold uppercase transition-colors ${
                  viewGroup === g
                    ? "bg-[var(--lg-accent)] text-white"
                    : "bg-[var(--lg-tint)] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]"
                }`}
              >
                {g === "hitters" ? "H" : "P"}
              </button>
            ))}
            <span className="text-[10px] text-[var(--lg-text-muted)] ml-1">{filteredRoster.length} players</span>
          </div>

          <ThemedTable>
            <ThemedThead>
              <tr>
                <SortableHeader sortKey="name" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} className="px-2">Player</SortableHeader>
                <SortableHeader sortKey="pos" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} align="center" className="px-1 w-10">Pos</SortableHeader>
                {viewGroup === "hitters" ? (
                  <>
                    <SortableHeader sortKey="R" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} align="center" className="px-1 w-8" title="Runs">R</SortableHeader>
                    <SortableHeader sortKey="HR" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} align="center" className="px-1 w-8" title="Home Runs">HR</SortableHeader>
                    <SortableHeader sortKey="RBI" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} align="center" className="px-1 w-8" title="RBI">RBI</SortableHeader>
                    <SortableHeader sortKey="SB" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} align="center" className="px-1 w-8" title="Stolen Bases">SB</SortableHeader>
                    <SortableHeader sortKey="AVG" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} align="center" className="px-1 w-10" title="Batting Average">AVG</SortableHeader>
                  </>
                ) : (
                  <>
                    <SortableHeader sortKey="W" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} align="center" className="px-1 w-8" title="Wins">W</SortableHeader>
                    <SortableHeader sortKey="SV" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} align="center" className="px-1 w-8" title="Saves">SV</SortableHeader>
                    <SortableHeader sortKey="K" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} align="center" className="px-1 w-8" title="Strikeouts">K</SortableHeader>
                    <SortableHeader sortKey="ERA" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} align="center" className="px-1 w-10" title="ERA (lower is better)">ERA</SortableHeader>
                    <SortableHeader sortKey="WHIP" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} align="center" className="px-1 w-10" title="WHIP (lower is better)">WHIP</SortableHeader>
                  </>
                )}
                <SortableHeader sortKey="price" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} align="right" className="px-1 w-12" title="Price Paid">Paid</SortableHeader>
                <SortableHeader sortKey="value" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} align="right" className="px-1 w-12" title="Projected Value">Val</SortableHeader>
                <SortableHeader sortKey="surplus" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} align="right" className="px-1 w-12" title="Value Surplus">+/−</SortableHeader>
              </tr>
            </ThemedThead>
            <ThemedTbody>
              {filteredRoster.map(r => {
                const s = r.stat;
                const pos = mapPosition(r.position, outfieldMode);
                const rowKey = `${team.teamId}-${r.playerName}`;
                const isRowExpanded = expandedPlayerId === rowKey;
                const isPitch = isPitcherPos(r.position);
                const playerObj: PlayerSeasonStat = s ?? { mlb_id: '', player_name: r.playerName, positions: r.position, is_pitcher: isPitch } as PlayerSeasonStat;
                return (
                  <React.Fragment key={rowKey}>
                  <ThemedTr
                    className={`cursor-pointer ${isRowExpanded ? 'bg-[var(--lg-tint)]' : 'hover:bg-[var(--lg-tint)]/50'}`}
                    onClick={() => setExpandedPlayerId(isRowExpanded ? null : rowKey)}
                  >
                    <ThemedTd className="px-2">
                      <span className="font-medium text-[var(--lg-text-primary)]">{r.playerName}</span>
                      {r.isKeeper && <span className="ml-1.5 px-1 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">K</span>}
                    </ThemedTd>
                    <ThemedTd align="center" className="text-[var(--lg-accent)] text-xs font-medium px-1">{pos}</ThemedTd>
                    {viewGroup === "hitters" ? (
                      <>
                        <ThemedTd align="center" className="text-xs text-[var(--lg-text-secondary)] px-1">{s?.R ?? "—"}</ThemedTd>
                        <ThemedTd align="center" className="text-xs text-[var(--lg-text-secondary)] px-1">{s?.HR ?? "—"}</ThemedTd>
                        <ThemedTd align="center" className="text-xs text-[var(--lg-text-secondary)] px-1">{s?.RBI ?? "—"}</ThemedTd>
                        <ThemedTd align="center" className="text-xs text-[var(--lg-text-secondary)] px-1">{s?.SB ?? "—"}</ThemedTd>
                        <ThemedTd align="center" className="text-xs text-[var(--lg-text-secondary)] px-1">{typeof s?.AVG === "number" ? fmtRate(s.AVG) : "—"}</ThemedTd>
                      </>
                    ) : (
                      <>
                        <ThemedTd align="center" className="text-xs text-[var(--lg-text-secondary)] px-1">{s?.W ?? "—"}</ThemedTd>
                        <ThemedTd align="center" className="text-xs text-[var(--lg-text-secondary)] px-1">{s?.SV ?? "—"}</ThemedTd>
                        <ThemedTd align="center" className="text-xs text-[var(--lg-text-secondary)] px-1">{s?.K ?? "—"}</ThemedTd>
                        <ThemedTd align="center" className="text-xs text-[var(--lg-text-secondary)] px-1">{s?.ERA ? Number(s.ERA).toFixed(2) : "—"}</ThemedTd>
                        <ThemedTd align="center" className="text-xs text-[var(--lg-text-secondary)] px-1">{s?.WHIP ? Number(s.WHIP).toFixed(2) : "—"}</ThemedTd>
                      </>
                    )}
                    <ThemedTd align="right" className="tabular-nums px-1">${r.price}</ThemedTd>
                    <ThemedTd align="right" className="tabular-nums text-[var(--lg-text-muted)] px-1">{r.projectedValue !== null ? `$${r.projectedValue}` : "—"}</ThemedTd>
                    <ThemedTd align="right" className={`tabular-nums font-medium px-1 ${surplusColor(r.surplus)}`}>
                      {r.surplus !== null ? `${r.surplus >= 0 ? "+" : ""}${r.surplus}` : "—"}
                    </ThemedTd>
                  </ThemedTr>
                  {isRowExpanded && (
                    <PlayerExpandedRow
                      player={playerObj}
                      isTaken={true}
                      ownerName={team.teamName}
                      colSpan={10}
                      onViewDetail={onSelectPlayer}
                    />
                  )}
                  </React.Fragment>
                );
              })}
            </ThemedTbody>
          </ThemedTable>
        </div>
      )}
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────── */

export default function DraftReportPage() {
  const { leagueId, outfieldMode } = useLeague();
  const [report, setReport] = useState<DraftReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerStats, setPlayerStats] = useState<PlayerSeasonStat[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSeasonStat | null>(null);
  const loadingMessages = [
    "Analyzing 8 teams across 184 roster spots...",
    "Cross-referencing projected values with auction prices...",
    "Computing surplus and value efficiency...",
    "Grading draft strategies...",
    "Projecting stat contributions...",
  ];
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => setMsgIdx(i => (i + 1) % loadingMessages.length), 3000);
    return () => clearInterval(interval);
  }, [loading]);

  const generate = useCallback(async (force = false) => {
    if (!leagueId) return;
    setLoading(true);
    setError(null);
    try {
      const url = `${API_BASE}/auction/draft-report?leagueId=${leagueId}${force ? "&force=true" : ""}`;
      const data = await fetchJsonApi<DraftReport>(url);
      setReport(data);
    } catch (err) {
      setError((err as Error)?.message || "Failed to generate draft report");
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  // Auto-load on mount (persisted reports return instantly)
  useEffect(() => { generate(); }, [generate]);

  // Fetch player stats for enrichment
  useEffect(() => {
    if (!leagueId) return;
    getPlayerSeasonStats(leagueId).then(setPlayerStats).catch(() => {});
  }, [leagueId]);

  // Enrich report roster entries with stats
  const enrichedReport = useMemo(() => {
    if (!report) return null;
    if (playerStats.length === 0) return report;
    // Build lookup by normalized player name, with two-way player support
    const normalize = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const nameCount = new Map<string, number>();
    for (const ps of playerStats) {
      const name = normalize(ps.mlb_full_name || ps.player_name || "");
      if (name) nameCount.set(name, (nameCount.get(name) || 0) + 1);
    }
    const statMap = new Map<string, PlayerSeasonStat>();
    for (const ps of playerStats) {
      const name = normalize(ps.mlb_full_name || ps.player_name || "");
      if (!name) continue;
      if ((nameCount.get(name) || 0) > 1) {
        // Two-way player: key by name + role
        const role = ps.is_pitcher ? "P" : "H";
        statMap.set(`${name}::${role}`, ps);
      } else {
        statMap.set(name, ps);
      }
    }
    return {
      ...report,
      teams: report.teams.map(t => ({
        ...t,
        roster: t.roster.map(r => {
          const key = normalize(r.playerName);
          const isPitch = isPitcherPos(r.position);
          // Try role-specific key first (two-way player), then plain name
          const stat = statMap.get(`${key}::${isPitch ? "P" : "H"}`) || statMap.get(key);
          return { ...r, stat };
        }),
      })),
    };
  }, [report, playerStats]);

  const gradeOrder: Record<string, number> = { "A+": 1, "A": 2, "A-": 3, "B+": 4, "B": 5, "B-": 6, "C+": 7, "C": 8, "C-": 9, "D": 10, "F": 11 };

  const sortedTeams = enrichedReport?.teams ? [...enrichedReport.teams].sort((a, b) => {
    return (gradeOrder[a.grade] ?? 12) - (gradeOrder[b.grade] ?? 12);
  }) : [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <div className="flex items-start justify-between gap-4 mb-8">
        <PageHeader
          title="Draft Report"
          subtitle="AI-powered analysis of the 2026 auction draft — grades, strategy, values, and projections for every team."
        />
        {report && !loading && (
          <button
            onClick={() => { generate(true); }}
            className="flex-shrink-0 mt-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--lg-bg-card)] text-[var(--lg-text-muted)] border border-[var(--lg-border-faint)] hover:text-[var(--lg-text-primary)] hover:border-[var(--lg-accent)]/30 transition-colors"
            title="Regenerate report with fresh data and AI analysis"
          >
            Regenerate
          </button>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 size={32} className="animate-spin text-[var(--lg-accent)]" />
          <div className="flex items-center gap-2 text-sm text-[var(--lg-text-muted)] animate-pulse">
            <Sparkles size={14} className="text-blue-400" />
            {loadingMessages[msgIdx]}
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
          {error}
          <button onClick={() => generate()} className="ml-3 underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* Report */}
      {report && !loading && (
        <>
          {/* League summary bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatPill label="Avg Hitter Price" value={`$${report.leagueSummary.avgHitterPrice}`} sub="league-wide auction" />
            <StatPill label="Avg Pitcher Price" value={`$${report.leagueSummary.avgPitcherPrice}`} sub="league-wide auction" />
            <StatPill label="Most Efficient" value={report.surplusRanking[0]?.teamName ?? "—"} sub={`surplus: ${report.surplusRanking[0]?.surplus >= 0 ? "+" : ""}$${report.surplusRanking[0]?.surplus ?? 0}`} />
            <StatPill label="Least Efficient" value={report.surplusRanking[report.surplusRanking.length - 1]?.teamName ?? "—"} sub={`surplus: $${report.surplusRanking[report.surplusRanking.length - 1]?.surplus ?? 0}`} />
          </div>

          {/* Value Efficiency Ranking */}
          <div className="rounded-xl border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Target size={15} className="text-[var(--lg-accent)]" />
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--lg-text-muted)]">Value Efficiency Ranking</h3>
              <span className="text-[10px] text-[var(--lg-text-muted)] opacity-60 ml-1">(auction surplus = projected value − price paid)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {report.surplusRanking.map((t, i) => (
                <div key={t.teamId} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--lg-tint)] border border-[var(--lg-border-faint)]">
                  <span className="text-xs font-bold text-[var(--lg-text-muted)] opacity-50 w-4">{i + 1}.</span>
                  <span className="text-xs font-medium text-[var(--lg-text-primary)]">{t.teamName}</span>
                  <span className={`text-xs tabular-nums font-bold ${surplusColor(t.surplus)}`}>
                    {t.surplus >= 0 ? "+" : ""}${t.surplus}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Section header */}
          <h2 className="text-sm font-bold text-[var(--lg-text-primary)] mb-4">Team Reports</h2>

          {/* Team cards */}
          <div className="space-y-4 mb-10">
            {sortedTeams.map(team => (
              <TeamCard key={team.teamId} team={team} leagueAvgH={report.leagueSummary.avgHitterPrice} leagueAvgP={report.leagueSummary.avgPitcherPrice} outfieldMode={outfieldMode} onSelectPlayer={setSelectedPlayer} />
            ))}
          </div>

          {/* Methodology blurb */}
          <div className="rounded-xl border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-5">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 size={15} className="text-[var(--lg-accent)]" />
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--lg-text-muted)]">About This Report</h3>
            </div>
            <div className="text-xs text-[var(--lg-text-secondary)] leading-relaxed space-y-2">
              <p>
                <strong className="text-[var(--lg-text-primary)]">How grades work:</strong> Each team is graded on their <em>auction draft performance only</em> — keepers are evaluated separately. Grades are heavily influenced by <strong>value efficiency</strong> (surplus), which measures the difference between what a team paid for each player versus their projected auction value. A team that consistently pays less than projected value earns a higher grade; one that overpays significantly earns a lower grade.
              </p>
              <p>
                <strong className="text-[var(--lg-text-primary)]">Surplus explained:</strong> Surplus = projected dollar value − price paid. A player projected at $28 who was drafted for $50 has a surplus of −$22 (overpay). A player projected at $16 drafted for $2 has a surplus of +$14 (bargain). Total team surplus is the sum across all players — it's the most objective measure of draft efficiency.
              </p>
              <p>
                <strong className="text-[var(--lg-text-primary)]">What grades don't capture:</strong> Surplus measures value efficiency, but fantasy baseball is also about upside, positional scarcity, and roster construction. A team might have negative surplus because they invested in high-upside prospects not yet reflected in projections, or paid a premium for elite closers in a saves-scarce league. The AI analysis accounts for these factors alongside the raw numbers.
              </p>
              <p>
                <strong className="text-[var(--lg-text-primary)]">Projected stats:</strong> Team stat projections are AI-estimated based on each player's realistic 2026 outlook assuming health. These are directional estimates, not precise forecasts — actual results will vary based on playing time, injuries, and breakout/decline trajectories.
              </p>
              <div className="flex items-center gap-3 pt-2 border-t border-[var(--lg-border-faint)] mt-2">
                <span className="text-[10px] text-[var(--lg-text-muted)]">
                  Generated {report.generatedAt ? new Date(report.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—"}
                </span>
                <span className="text-[10px] text-[var(--lg-text-muted)] opacity-40">·</span>
                <span className="text-[10px] text-[var(--lg-text-muted)]">
                  Powered by <strong className="text-[var(--lg-text-secondary)]">Google Gemini</strong> & <strong className="text-[var(--lg-text-secondary)]">Anthropic Claude</strong>
                </span>
                <span className="text-[10px] text-[var(--lg-text-muted)] opacity-40">·</span>
                <span className="text-[10px] text-[var(--lg-text-muted)]">Projected values from OGBA auction values engine</span>
              </div>
            </div>
          </div>
        </>
      )}

      {selectedPlayer && <PlayerDetailModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />}
    </div>
  );
}
