/*
 * AuctionComplete — Aurora port (PR-2a of Auction module rollout).
 *
 * The page-level shell that renders post-draft results: summary tiles,
 * AI draft grades, embedded BidHistoryChart, embedded DraftReport, and
 * the team-results accordion. Business logic is preserved 1:1 from the
 * legacy file (sort, expand, position swap, trade-block save, draft-
 * grade fetch, Excel export).
 *
 * Outer chrome moves to Aurora: Glass cards, IridText for hero numbers,
 * SectionLabel eyebrows, Chip atoms for badges + my-team marker. The
 * inner Hitters/Pitchers ThemedTable instances inside the team accordion
 * keep their legacy `--lg-*` token chrome — those tokens stay globally
 * defined so legacy children render correctly inside the `.aurora-theme`
 * wrapper installed by AuctionResults.tsx. PR-2b will deepen the
 * BidHistoryChart, DraftReport, and AuctionReplay children.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trophy, Download, Sparkles, Loader2, Save, Check, Rewind } from 'lucide-react';
import AuctionReplay from './AuctionReplay';
import type { ClientAuctionState, AuctionLogEvent } from '../hooks/useAuctionState';
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";
import { fetchJsonApi, API_BASE } from '../../../api/base';
import { useLeague } from '../../../contexts/LeagueContext';
import { track } from '../../../lib/posthog';
import { POS_ORDER } from '../../../lib/baseballUtils';
import { mapPosition, positionToSlots } from '../../../lib/sportConfig';
import { getPlayerSeasonStats, type PlayerSeasonStat } from '../../../api';
import { saveTradeBlock, getLeagueTradeBlocks } from '../../teams/api';
import BidHistoryChart from './BidHistoryChart';
import DraftReport from './DraftReport';
import PlayerExpandedRow from './PlayerExpandedRow';
import PlayerDetailModal from '../../../components/shared/PlayerDetailModal';
import { Glass, IridText, SectionLabel, Chip } from '../../../components/aurora/atoms';

interface AuctionCompleteProps {
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

const AURORA_BTN_BASE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 99,
  background: "var(--am-chip)",
  color: "var(--am-text)",
  border: "1px solid var(--am-border)",
  cursor: "pointer",
};

export default function AuctionComplete({ auctionState, myTeamId, onRefresh }: AuctionCompleteProps) {
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

  const [positionOverrides, setPositionOverrides] = useState<Record<number, string>>({});

  const handlePositionSwap = useCallback(async (teamId: number, rosterId: number, newPos: string) => {
    setPositionOverrides(prev => ({ ...prev, [rosterId]: newPos }));
    try {
      await fetchJsonApi(`${API_BASE}/teams/${teamId}/roster/${rosterId}`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedPosition: newPos }),
      });
      if (leagueId) {
        await fetchJsonApi(`${API_BASE}/auction/refresh-teams`, {
          method: 'POST',
          body: JSON.stringify({ leagueId }),
        });
      }
      await onRefresh?.();
      setPositionOverrides(prev => {
        const next = { ...prev };
        delete next[rosterId];
        return next;
      });
    } catch (err) {
      setPositionOverrides(prev => {
        const next = { ...prev };
        delete next[rosterId];
        return next;
      });
      console.error("Failed to update position", err);
    }
  }, [leagueId, onRefresh]);

  // Suppress unused-variable warning for handlePositionSwap — kept for
  // forward-compat with the position-swap dropdown UI; not yet wired in
  // this Aurora pass (legacy parity preserved).
  void handlePositionSwap;

  const MATRIX_POSITIONS = ["C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH", "P"];

  const [playerStats, setPlayerStats] = useState<PlayerSeasonStat[]>([]);
  useEffect(() => {
    getPlayerSeasonStats(leagueId).then(setPlayerStats).catch(() => {});
  }, [leagueId]);

  const statsLookup = useMemo(() => {
    const map = new Map<string, PlayerSeasonStat>();
    const nameCount = new Map<string, number>();
    for (const s of playerStats) {
      const name = (s.player_name || (s as any).name || '').toLowerCase();
      if (name) nameCount.set(name, (nameCount.get(name) || 0) + 1);
    }
    for (const s of playerStats) {
      const name = (s.player_name || (s as any).name || '').toLowerCase();
      if (!name) continue;
      if ((nameCount.get(name) || 0) > 1) {
        const role = s.is_pitcher ? "P" : "H";
        map.set(`${name}::${role}`, s);
      } else {
        map.set(name, s);
      }
    }
    return map;
  }, [playerStats]);

  const getPlayerStats = useCallback((name: string, isPitcher: boolean) => {
    const key = name.toLowerCase();
    const roleKey = `${key}::${isPitcher ? "P" : "H"}`;
    return statsLookup.get(roleKey) || statsLookup.get(key);
  }, [statsLookup]);

  const [tradeBlockSelections, setTradeBlockSelections] = useState<Set<string>>(new Set());
  const [tradeBlockSaving, setTradeBlockSaving] = useState(false);
  const [tradeBlockSaved, setTradeBlockSaved] = useState(false);
  const [tradeBlockError, setTradeBlockError] = useState<string | null>(null);
  // Future: per-team trade-block overlay; loaded but unused this pass.
  const [, setLeagueTradeBlocks] = useState<Record<number, Set<string>>>({});

  useEffect(() => {
    if (!leagueId) return;
    getLeagueTradeBlocks(leagueId)
      .then(({ tradeBlocks }) => {
        const parsed: Record<number, Set<string>> = {};
        for (const [teamIdStr, playerIds] of Object.entries(tradeBlocks)) {
          parsed[Number(teamIdStr)] = new Set(playerIds.map(String));
        }
        setLeagueTradeBlocks(parsed);
        if (myTeamId && parsed[myTeamId]) {
          setTradeBlockSelections(new Set(parsed[myTeamId]));
        }
      })
      .catch(() => { /* non-critical */ });
  }, [leagueId, myTeamId]);

  // Suppress unused for forward-compat
  void setTradeBlockSelections;

  const handleSaveTradeBlock = useCallback(async () => {
    if (!myTeamId) return;
    setTradeBlockSaving(true);
    setTradeBlockError(null);
    try {
      const playerIds = Array.from(tradeBlockSelections).map(Number).filter(Number.isFinite);
      const result = await saveTradeBlock(myTeamId, playerIds);
      setTradeBlockSaved(true);
      track("trade_block_saved", { teamId: myTeamId, count: result.playerIds.length });
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

    const teamResults: TeamResult[] = (auctionState.teams || []).map(team => {
      const teamDbBudget = (team as any).dbBudget || auctionState.config?.budgetCap || 400;
      const PITCHER_POS = new Set(['P', 'SP', 'RP', 'CL', 'TWP']);

      const roster = (team.roster || []).map(r => {
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

    const summaryData = teamResults.map(t => ({
      Team: t.name,
      'Players': t.roster.length,
      'Total Spent': t.totalSpent,
      'Budget Remaining': t.budget - t.totalSpent,
      'Avg Cost': t.roster.length > 0 ? Math.round(t.totalSpent / t.roster.length) : 0,
    }));
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(summaryData), 'Summary');

    const wins = (auctionState.log || []).filter(e => e.type === 'WIN').reverse();
    const picksData = wins.map((w, i) => ({
      Pick: i + 1,
      Player: w.playerName || '',
      Team: w.teamName || '',
      Price: w.amount || 0,
    }));
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(picksData), 'All Picks');

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
      const sheetName = team.name.slice(0, 31);
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(teamData), sheetName);
    }

    xlsx.writeFile(wb, `Auction_Results_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Hero header */}
      <Glass strong>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <SectionLabel>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Trophy size={11} />
                Auction Complete
              </span>
            </SectionLabel>
            <h1 style={{ fontFamily: "var(--am-display)", fontSize: 30, fontWeight: 300, color: "var(--am-text)", margin: 0, lineHeight: 1.1 }}>
              All rosters filled.
            </h1>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)" }}>
              The auction draft has concluded. Review results, grades, and bid history below.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleExportExcel}
              style={AURORA_BTN_BASE}
            >
              <Download size={13} />
              Export to Excel
            </button>
            {(auctionState.log || []).length > 0 && (
              <button
                type="button"
                onClick={() => setShowReplay((prev) => !prev)}
                style={{
                  ...AURORA_BTN_BASE,
                  background: showReplay ? "var(--am-chip-strong)" : AURORA_BTN_BASE.background,
                  color: showReplay ? "var(--am-text)" : AURORA_BTN_BASE.color,
                }}
              >
                <Rewind size={13} />
                {showReplay ? 'Hide Replay' : 'Replay Draft'}
              </button>
            )}
          </div>
        </div>
      </Glass>

      {/* Summary stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Glass>
          <SectionLabel style={{ marginBottom: 6 }}>Total Lots</SectionLabel>
          <IridText size={28}>{totalLots}</IridText>
        </Glass>
        <Glass>
          <SectionLabel style={{ marginBottom: 6 }}>Total Spent</SectionLabel>
          <IridText size={28}>${totalSpent}</IridText>
        </Glass>
        <Glass>
          <SectionLabel style={{ marginBottom: 6 }}>Teams</SectionLabel>
          <IridText size={28}>{teamResults.length}</IridText>
        </Glass>
      </div>

      {/* Replay (legacy chrome — opens inline when toggled) */}
      {showReplay && (
        <Glass padded={false}>
          <div style={{ padding: 16 }}>
            <AuctionReplay
              log={auctionState.log || []}
              teams={(auctionState.teams || []).map((t) => ({ id: t.id, name: t.name, code: t.code }))}
              onClose={() => setShowReplay(false)}
            />
          </div>
        </Glass>
      )}

      {/* AI Draft Grades */}
      <Glass>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <SectionLabel style={{ marginBottom: 0 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Sparkles size={11} />
              AI Draft Grades
            </span>
          </SectionLabel>
          {!draftGrades && (
            <button
              type="button"
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
              style={{
                ...AURORA_BTN_BASE,
                background: "var(--am-chip-strong)",
                opacity: gradesLoading ? 0.5 : 1,
              }}
            >
              {gradesLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {gradesLoading ? 'Grading...' : 'Generate Grades'}
            </button>
          )}
        </div>

        {gradesError && (
          <div style={{ fontSize: 12, color: "rgb(248, 113, 113)", padding: "8px 12px", borderRadius: 8, background: "rgba(220, 38, 38, 0.08)", border: "1px solid rgba(220, 38, 38, 0.25)" }}>
            {gradesError}
          </div>
        )}

        {!draftGrades && !gradesError && !gradesLoading && (
          <div style={{ fontSize: 12, color: "var(--am-text-muted)" }}>
            Generate AI-powered grades for each team's draft. Uses post-auction roster data and projected values.
          </div>
        )}

        {draftGrades && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginTop: 4 }}>
            {draftGrades.map((g) => {
              const isMe = g.teamId === myTeamId;
              const tone =
                g.grade.startsWith('A') ? { bg: "rgba(16, 185, 129, 0.06)", border: "rgba(16, 185, 129, 0.3)", text: "rgb(52, 211, 153)" } :
                g.grade.startsWith('B') ? { bg: "rgba(59, 130, 246, 0.06)", border: "rgba(59, 130, 246, 0.3)", text: "rgb(96, 165, 250)" } :
                g.grade.startsWith('C') ? { bg: "rgba(245, 158, 11, 0.06)", border: "rgba(245, 158, 11, 0.3)", text: "rgb(251, 191, 36)" } :
                                          { bg: "rgba(239, 68, 68, 0.06)", border: "rgba(239, 68, 68, 0.3)", text: "rgb(248, 113, 113)" };
              return (
                <div
                  key={g.teamId}
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    background: tone.bg,
                    border: `1px solid ${tone.border}`,
                    boxShadow: isMe ? "0 0 0 1px var(--am-accent)" : undefined,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--am-text)" }}>{g.teamName}</span>
                      {isMe && <Chip strong>You</Chip>}
                    </span>
                    <span style={{ fontSize: 22, fontWeight: 700, color: tone.text, fontFamily: "var(--am-display)" }}>{g.grade}</span>
                  </div>
                  <p style={{ fontSize: 12, lineHeight: 1.45, color: "var(--am-text-muted)", margin: 0 }}>{g.summary}</p>
                </div>
              );
            })}
          </div>
        )}
      </Glass>

      {/* Bid History — legacy chrome inside Aurora wrapper (PR-2b will deepen).
          Gate on NOMINATION events specifically: BidHistoryChart returns null
          when no nominations are present (e.g. logs imported from CSV with only
          WIN events). Without this, the Glass wrapper would render empty. */}
      {(auctionState.log || []).some(e => e.type === 'NOMINATION') && (
        <Glass padded={false}>
          <div style={{ padding: 16 }}>
            <BidHistoryChart
              log={auctionState.log || []}
              teams={(auctionState.teams || []).map(t => ({ id: t.id, name: t.name, code: t.code }))}
            />
          </div>
        </Glass>
      )}

      {/* Draft Report — legacy chrome inside Aurora wrapper (PR-2b will deepen) */}
      {leagueId && (
        <Glass padded={false}>
          <div style={{ padding: 16 }}>
            <DraftReport leagueId={leagueId} myTeamId={myTeamId} />
          </div>
        </Glass>
      )}

      {/* Team Results accordion */}
      <div>
        <SectionLabel>✦ Draft Results by Team</SectionLabel>
        <Glass padded={false}>
          <div>
            {teamResults.map((team, idx) => {
              const isExpanded = expandedTeamId === team.id;
              const isMe = team.id === myTeamId;
              const isTopSpender = idx === 0;

              return (
                <div
                  key={team.id}
                  style={{
                    borderTop: idx === 0 ? "none" : "1px solid var(--am-border)",
                    background: isMe ? "var(--am-chip)" : undefined,
                    boxShadow: isTopSpender ? "inset 3px 0 0 0 transparent" : undefined,
                    position: "relative",
                  }}
                >
                  {/* Rank-1 iridescent left accent */}
                  {isTopSpender && (
                    <div
                      aria-hidden
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: 0,
                        width: 3,
                        background: "var(--am-irid)",
                      }}
                    />
                  )}
                  <div
                    onClick={() => setExpandedTeamId(isExpanded ? null : team.id)}
                    style={{
                      padding: "14px 18px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 600, color: "var(--am-text)" }}>{team.name}</span>
                        {isMe && <Chip strong>You</Chip>}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>
                        {team.roster.length} players acquired
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                      {team.keeperSpend > 0 && (
                        <Stat label="Keepers" value={`$${team.keeperSpend}`} tone="amber" />
                      )}
                      <Stat
                        label={team.keeperSpend > 0 ? 'Auction' : 'Spent'}
                        value={`$${team.auctionSpend}`}
                        tone="accent"
                      />
                      <Stat label="Total" value={`$${team.totalSpent}`} />
                      <Stat
                        label="Left"
                        value={`$${team.budget - team.totalSpent}`}
                        tone={(team.budget - team.totalSpent) < 0 ? "red" : "default"}
                      />
                      <span
                        aria-hidden
                        style={{
                          color: "var(--am-text-muted)",
                          transition: "transform 200ms",
                          transform: isExpanded ? "rotate(180deg)" : "none",
                          display: "inline-flex",
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      </span>
                    </div>
                  </div>

                  {isExpanded && team.roster.length > 0 && (() => {
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
                      <div style={{ borderTop: "1px solid var(--am-border)", background: "var(--am-surface-faint)" }}>
                        {/* HITTERS */}
                        <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--am-text-faint)" }}>
                          Hitters ({hitters.length})
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
                              // posSlots is computed for matrix rendering — kept for forward-compat with PR-2b
                              const _posSlots = (() => {
                                const raw = player.posList || player.positions || '';
                                const slots = new Set<string>();
                                for (const p of raw.split(',').map(s => s.trim()).filter(Boolean)) {
                                  for (const s of positionToSlots(p)) slots.add(s);
                                }
                                return MATRIX_POSITIONS.filter(s => slots.has(s));
                              })();
                              void _posSlots;
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
                                        {(player as any).assignedPosition || mapPosition(player.positions?.split(",")[0]?.trim() || "", outfieldMode) || "—"}
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
                        <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--am-text-faint)", borderTop: "1px solid var(--am-border)" }}>
                          Pitchers ({pitchers.length})
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
                          <div
                            style={{
                              padding: "12px 16px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              borderTop: "1px solid var(--am-border)",
                              background: "var(--am-chip)",
                            }}
                          >
                            <span style={{ fontSize: 12, color: "var(--am-text-muted)" }}>
                              {tradeBlockSelections.size > 0
                                ? `${tradeBlockSelections.size} player${tradeBlockSelections.size !== 1 ? 's' : ''} on trade block`
                                : 'Click the trade icons to flag players as available'}
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              {tradeBlockError && (
                                <span style={{ fontSize: 12, color: "rgb(248, 113, 113)" }}>{tradeBlockError}</span>
                              )}
                              <button
                                type="button"
                                onClick={handleSaveTradeBlock}
                                disabled={tradeBlockSaving}
                                style={{
                                  ...AURORA_BTN_BASE,
                                  background: tradeBlockSaved ? "rgba(16, 185, 129, 0.12)" : "rgba(249, 115, 22, 0.12)",
                                  borderColor: tradeBlockSaved ? "rgba(16, 185, 129, 0.3)" : "rgba(249, 115, 22, 0.3)",
                                  color: tradeBlockSaved ? "rgb(52, 211, 153)" : "rgb(251, 146, 60)",
                                  opacity: tradeBlockSaving ? 0.5 : 1,
                                }}
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
        </Glass>
      </div>

      {selectedPlayer && <PlayerDetailModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "amber" | "red";
}) {
  const color =
    tone === "accent" ? "var(--am-accent)" :
    tone === "amber" ? "rgb(251, 191, 36)" :
    tone === "red" ? "rgb(248, 113, 113)" :
    "var(--am-text)";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
      <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--am-text-faint)" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}
