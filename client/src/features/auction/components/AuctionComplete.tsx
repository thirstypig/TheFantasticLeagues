/*
 * Post-auction report body (/auction-results/report), on the team board's
 * card-and-row pattern (design review 2026-11-12, suggestion 2).
 *
 * Summary card (headline, lots / spent / teams, Excel + replay), AI draft
 * grades, bid history, the draft report, and results by team: one row per
 * team (name, players, keepers $, auction $ / total, left) that opens to its
 * roster. Player names open the player card. Full team names, no team
 * colors, no icons, four text sizes.
 *
 * Totals come from teams[].roster, not the log: keepers carry over at their
 * salary and never appear as WIN events.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AuctionReplay from './AuctionReplay';
import type { ClientAuctionState } from '../hooks/useAuctionState';
import { fetchJsonApi, API_BASE } from '../../../api/base';
import { useLeague } from '../../../contexts/LeagueContext';
import { track } from '../../../lib/posthog';
import { POS_ORDER } from '../../../lib/baseballUtils';
import { mapPosition } from '../../../lib/sportConfig';
import { getPlayerSeasonStatsMeta, type PlayerSeasonStat } from '../../../api';
import { PlayerLink } from '../../../components/shared/playerCard/PlayerCardProvider';
import BidHistoryChart from './BidHistoryChart';
import DraftReport from './DraftReport';
import './board/teamBoard.css';
import './report.css';

interface AuctionCompleteProps {
  auctionState: ClientAuctionState;
  myTeamId?: number;
}

interface RosterRow {
  playerId: string;
  mlbId?: number | null;
  playerName: string;
  price: number;
  position: string;
  isPitcher: boolean;
  mlbTeam: string;
  isKeeper: boolean;
}

export interface TeamResult {
  id: number;
  name: string;
  budget: number;
  totalSpent: number;
  keeperSpend: number;
  auctionSpend: number;
  roster: RosterRow[];
}

interface DraftGrade {
  teamId: number;
  teamName: string;
  grade: string;
  summary: string;
}

/** "$62", "-$50". */
export const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n)}`;

const PITCHER_POS = new Set(['P', 'SP', 'RP', 'CL', 'TWP']);

/** "4 players · $97 keepers · $0 auction" — the second line of a team row. */
export function teamDetail(t: Pick<TeamResult, 'roster' | 'keeperSpend' | 'auctionSpend'>): string {
  const n = t.roster.length;
  const parts = [`${n} ${n === 1 ? 'player' : 'players'}`];
  if (t.keeperSpend > 0) parts.push(`$${t.keeperSpend} keepers`);
  parts.push(`$${t.auctionSpend} auction`);
  return parts.join(' · ');
}

export function buildTeamResults(state: ClientAuctionState): TeamResult[] {
  const results = (state.teams || []).map(team => {
    const t = team as typeof team & { dbBudget?: number; keeperSpend?: number; auctionSpend?: number };
    const roster: RosterRow[] = (team.roster || []).map(r => {
      const row = r as typeof r & { assignedPosition?: string; posPrimary?: string; source?: string; playerName?: string; mlbTeam?: string };
      const position = (row.assignedPosition || row.posPrimary || '').toUpperCase();
      return {
        playerId: String(r.playerId),
        mlbId: r.mlbId ?? null,
        playerName: row.playerName || `Player #${r.playerId}`,
        price: r.price || 0,
        position,
        isPitcher: PITCHER_POS.has(position),
        mlbTeam: row.mlbTeam || '',
        isKeeper: String(row.source || '').toLowerCase().includes('prior'),
      };
    });
    return {
      id: team.id,
      name: team.name,
      budget: t.dbBudget || state.config?.budgetCap || 400,
      totalSpent: roster.reduce((s, r) => s + r.price, 0),
      keeperSpend: t.keeperSpend ?? 0,
      auctionSpend: t.auctionSpend ?? 0,
      roster,
    };
  });
  return results.sort((a, b) => b.totalSpent - a.totalSpent);
}

export default function AuctionComplete({ auctionState, myTeamId }: AuctionCompleteProps) {
  const { leagueId, outfieldMode } = useLeague();
  const [expandedTeamId, setExpandedTeamId] = useState<number | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const [draftGrades, setDraftGrades] = useState<DraftGrade[] | null>(null);
  const [gradesLoading, setGradesLoading] = useState(false);
  const [gradesError, setGradesError] = useState<string | null>(null);

  // Season stats only resolve a player's MLB id when the roster row lacks one,
  // so the name can still open the player card.
  const [playerStats, setPlayerStats] = useState<PlayerSeasonStat[]>([]);
  useEffect(() => {
    getPlayerSeasonStatsMeta(leagueId).then(meta => setPlayerStats(meta.stats)).catch(() => {});
  }, [leagueId]);
  const mlbIdByName = useMemo(() => {
    const map = new Map<string, number>();
    const seen = new Map<string, number>();
    for (const s of playerStats) {
      const name = (s.player_name || '').toLowerCase();
      if (name) seen.set(name, (seen.get(name) || 0) + 1);
    }
    for (const s of playerStats) {
      const name = (s.player_name || '').toLowerCase();
      const id = Number(s.mlb_id);
      if (!name || !Number.isFinite(id) || id <= 0) continue;
      // Two players share a name: key by role so a hitter never opens a pitcher.
      map.set((seen.get(name) || 0) > 1 ? `${name}::${s.is_pitcher ? 'P' : 'H'}` : name, id);
    }
    return map;
  }, [playerStats]);
  const resolveMlbId = useCallback((p: RosterRow): number | null => {
    if (p.mlbId) return p.mlbId;
    const name = p.playerName.toLowerCase();
    return mlbIdByName.get(`${name}::${p.isPitcher ? 'P' : 'H'}`) ?? mlbIdByName.get(name) ?? null;
  }, [mlbIdByName]);

  const teamResults = useMemo(() => buildTeamResults(auctionState), [auctionState]);
  const log = auctionState.log || [];
  // Lots = auction sales the commissioner didn't undo, not roster rows (keepers never went up).
  const totalLots = log.filter(e => e.type === 'WIN' && !e.undone).length;
  const rosterSize = auctionState.config?.rosterSize;
  const spotsLeftOpen = rosterSize
    ? teamResults.reduce((sum, t) => sum + Math.max(0, rosterSize - t.roster.length), 0)
    : (auctionState.teams || []).reduce((sum, t) => sum + Math.max(0, t.spotsLeft ?? 0), 0);
  const totalSpent = teamResults.reduce((sum, t) => sum + t.totalSpent, 0);
  const totalKeeperSpend = teamResults.reduce((sum, t) => sum + t.keeperSpend, 0);

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
    const wins = log.filter(e => e.type === 'WIN' && !e.undone).reverse();
    const picksData = wins.map((w, i) => ({ Pick: i + 1, Player: w.playerName || '', Team: w.teamName || '', Price: w.amount || 0 }));
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(picksData), 'All Picks');
    for (const team of teamResults) {
      if (team.roster.length === 0) continue;
      const teamData = [...team.roster]
        .sort((a, b) => b.price - a.price)
        .map((p, i) => ({ '#': i + 1, Player: p.playerName, Price: p.price, Position: p.position }));
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(teamData), team.name.slice(0, 31));
    }
    xlsx.writeFile(wb, `Auction_Results_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const generateGrades = async () => {
    if (!leagueId) return;
    setGradesLoading(true);
    setGradesError(null);
    try {
      const data = await fetchJsonApi<{ grades: DraftGrade[] }>(`${API_BASE}/auction/draft-grades?leagueId=${leagueId}`);
      setDraftGrades(data.grades);
      track('auction_draft_grades_generated');
    } catch (e: unknown) {
      setGradesError(e instanceof Error ? e.message : 'Failed to generate grades');
    } finally {
      setGradesLoading(false);
    }
  };

  const posOf = (p: RosterRow) => mapPosition(p.position.split(',')[0]?.trim() || (p.isPitcher ? 'P' : ''), outfieldMode) || '—';
  const posRank = (p: RosterRow) => { const i = POS_ORDER.indexOf(posOf(p)); return i === -1 ? 99 : i; };
  const byPosThenPrice = (a: RosterRow, b: RosterRow) => posRank(a) - posRank(b) || b.price - a.price;

  const playerRow = (p: RosterRow) => (
    <div className="ar-player" key={`${p.playerId}-${p.isPitcher ? 'P' : 'H'}`}>
      <div className="ar-row-t">
        <b><PlayerLink mlbId={resolveMlbId(p)} name={p.playerName} /></b>
        <small>{[posOf(p), p.mlbTeam, p.isKeeper && 'keeper'].filter(Boolean).join(' · ')}</small>
      </div>
      <span className="ar-row-r">${p.price}</span>
    </div>
  );

  return (
    <div className="ar">
      <section className="ar-card" aria-label="Summary">
        <h2 className="ar-headline">
          {spotsLeftOpen === 0
            ? 'All rosters filled.'
            : `Auction ended · ${spotsLeftOpen} ${spotsLeftOpen === 1 ? 'spot' : 'spots'} left open`}
        </h2>
        <div className="ar-stats">
          <div className="ar-stat" data-testid="stat-lots"><b>{totalLots}</b><small>lots sold</small></div>
          <div className="ar-stat" data-testid="stat-spent">
            <b>${totalSpent}</b>
            <small>{totalKeeperSpend > 0 ? `spent, $${totalKeeperSpend} on keepers` : 'spent'}</small>
          </div>
          <div className="ar-stat" data-testid="stat-teams"><b>{teamResults.length}</b><small>teams</small></div>
        </div>
        <div className="ar-btns">
          <button type="button" className="ar-btn" onClick={handleExportExcel}>Export to Excel</button>
          {log.length > 0 && (
            <button type="button" className="ar-btn" aria-pressed={showReplay} onClick={() => setShowReplay(v => !v)}>
              {showReplay ? 'Hide replay' : 'Replay the auction'}
            </button>
          )}
        </div>
      </section>

      {showReplay && (
        <section className="ar-card" aria-label="Replay">
          <AuctionReplay
            log={log}
            teams={(auctionState.teams || []).map(t => ({ id: t.id, name: t.name, code: t.code }))}
            onClose={() => setShowReplay(false)}
          />
        </section>
      )}

      <section className="ar-card" aria-labelledby="ar-results">
        <div className="ar-card-h" style={{ marginBottom: 4 }}>
          <h2 id="ar-results" className="tb-cap">Results by team</h2>
        </div>
        <div className="ar-list">
          {teamResults.map(team => {
            const open = expandedTeamId === team.id;
            const isMe = team.id === myTeamId;
            const left = team.budget - team.totalSpent;
            const hitters = team.roster.filter(p => !p.isPitcher).sort(byPosThenPrice);
            const pitchers = team.roster.filter(p => p.isPitcher).sort(byPosThenPrice);
            return (
              <div key={team.id} data-testid="team-result">
                <button
                  type="button"
                  className={`ar-row${isMe ? ' me' : ''}`}
                  aria-expanded={open}
                  onClick={() => setExpandedTeamId(open ? null : team.id)}
                >
                  <span className="ar-row-t">
                    <b>{team.name}{isMe && <span className="ar-you">You</span>}</b>
                    <small className="ar-num">{teamDetail(team)}</small>
                  </span>
                  <span className="ar-row-r">
                    <b>${team.totalSpent}</b>
                    <small className={left < 0 ? 'over' : undefined}>{money(left)} left</small>
                  </span>
                  <span className="ar-chev" aria-hidden>{open ? '▴' : '▾'}</span>
                </button>
                {open && (
                  <div className="ar-roster">
                    {team.roster.length === 0 && <p className="tb-sub" style={{ padding: '8px 16px' }}>No players.</p>}
                    {hitters.length > 0 && <p className="tb-cap">Hitters · {hitters.length}</p>}
                    {hitters.map(playerRow)}
                    {pitchers.length > 0 && <p className="tb-cap">Pitchers · {pitchers.length}</p>}
                    {pitchers.map(playerRow)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="ar-card" aria-labelledby="ar-grades">
        <div className="ar-card-h">
          <h2 id="ar-grades" className="tb-cap">Draft grades</h2>
          {!draftGrades && (
            <button type="button" className="ar-btn" onClick={generateGrades} disabled={gradesLoading}>
              {gradesLoading ? 'Grading…' : 'Generate grades'}
            </button>
          )}
        </div>
        {gradesError && <p className="ar-error" role="alert">{gradesError}</p>}
        {!draftGrades && !gradesError && !gradesLoading && (
          <p className="tb-sub">AI grades each team's auction from its roster and projected values.</p>
        )}
        {draftGrades && (
          <div className="ar-list">
            {draftGrades.map(g => (
              <div key={g.teamId} className={`ar-row${g.teamId === myTeamId ? ' me' : ''}`}>
                <span className="ar-row-t">
                  <b>{g.teamName}{g.teamId === myTeamId && <span className="ar-you">You</span>}</b>
                  <small>{g.summary}</small>
                </span>
                <span className="ar-grade" aria-label={`Grade ${g.grade}`}>{g.grade}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* BidHistoryChart renders nothing without NOMINATION events (e.g. a CSV-imported log). */}
      {log.some(e => e.type === 'NOMINATION') && (
        <section className="ar-card" aria-label="Bid history">
          <BidHistoryChart log={log} />
        </section>
      )}

      {leagueId && (
        <section className="ar-card" aria-label="Draft report">
          <DraftReport leagueId={leagueId} myTeamId={myTeamId} />
        </section>
      )}
    </div>
  );
}
