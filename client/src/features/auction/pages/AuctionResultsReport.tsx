/*
 * /auction-results/report — the post-auction report: summary, results by
 * team, AI grades, bid history and the draft report. Reached from the team
 * board (/auction-results, `Grades and charts ›`). Same page chrome as the
 * board (teamBoard.css); the body lives in AuctionComplete.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMe, getLeague } from '../../../api';
import { useLeague, findMyTeam } from '../../../contexts/LeagueContext';
import { fetchJsonApi, API_BASE } from '../../../api/base';
import type { ClientAuctionState } from '../hooks/useAuctionState';
import AuctionComplete from '../components/AuctionComplete';
import '../components/board/teamBoard.css';

type ResultsState = ClientAuctionState & { computedAt?: string };

/** "Updated Nov 12, 8:56 AM" in the viewer's time zone; null when unknown. */
export function updatedText(computedAt: string | null | undefined): string | null {
  if (!computedAt) return null;
  const d = new Date(computedAt);
  if (Number.isNaN(d.getTime())) return null;
  return `Updated ${d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

export default function AuctionResultsReport() {
  const { leagueId } = useLeague();
  const [auctionState, setAuctionState] = useState<ResultsState | null>(null);
  const [myTeamId, setMyTeamId] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [state, meRes] = await Promise.all([
          fetchJsonApi<ResultsState>(`${API_BASE}/auction/results?leagueId=${leagueId}`),
          getMe(),
        ]);
        if (!mounted) return;
        setAuctionState(state);
        const myUserId = meRes.user?.id;
        if (myUserId) {
          const detail = await getLeague(leagueId);
          if (!mounted) return;
          const myTeam = findMyTeam(detail.league.teams, myUserId);
          if (myTeam) setMyTeamId(myTeam.id);
        }
      } catch (e: unknown) {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load auction results');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [leagueId]);

  const ready = !loading && !error && auctionState && auctionState.status !== 'not_started';
  const updated = ready ? updatedText(auctionState.computedAt) : null;

  return (
    <div className="aurora-theme tb-page">
      <div className="tb-head">
        <div>
          <h1 className="tb-title">Auction · report</h1>
          {updated && <p className="tb-sub">{updated}</p>}
        </div>
        <Link to="/auction-results" className="tb-link">‹ Team board</Link>
      </div>

      {loading && <p className="tb-sub">Loading…</p>}
      {!loading && error && <p className="tb-sub">Couldn't load results. {error}</p>}
      {!loading && !error && !ready && (
        <p className="tb-sub">No auction yet. Once it wraps, results will appear here.</p>
      )}
      {ready && <AuctionComplete auctionState={auctionState} myTeamId={myTeamId} />}
    </div>
  );
}
