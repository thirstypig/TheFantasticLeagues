/*
 * /auction-results — Screen 11 team board built from the auction-day snapshot
 * (GET /auction/results), titled `Auction results · Ended …` once the auction
 * is over, with `Grades and charts ›` to the full report
 * (/auction-results/report → AuctionResultsReport, the previous page, unchanged).
 * No team links here: /teams/:code shows the current roster, which would
 * contradict the auction-day snapshot.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLeague } from '../../../contexts/LeagueContext';
import { fetchJsonApi, API_BASE } from '../../../api/base';
import TeamBoard from '../components/board/TeamBoard';
import { snapshotToBoard, resultsSubtitle, type AuctionResultsSnapshot } from '../lib/resultsBoard';
import '../components/board/teamBoard.css';

export default function AuctionResults() {
  const { leagueId, myTeamId } = useLeague();
  const [snapshot, setSnapshot] = useState<AuctionResultsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    let mounted = true;
    setLoading(true);
    setError(null);
    fetchJsonApi<AuctionResultsSnapshot>(`${API_BASE}/auction/results?leagueId=${leagueId}`)
      .then(s => { if (mounted) setSnapshot(s); })
      .catch((e: unknown) => { if (mounted) setError(e instanceof Error ? e.message : 'Failed to load auction results'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [leagueId]);

  const board = snapshot && snapshot.status !== 'not_started' ? snapshotToBoard(snapshot) : null;
  // A finished auction says so: "Auction results · Ended Nov 12 · 2 sold · $567 spent".
  const subtitle = board && snapshot ? resultsSubtitle(snapshot) : null;

  return (
    <div className="aurora-theme tb-page">
      <div className="tb-head">
        <div>
          <h1 className="tb-title">{subtitle ? 'Auction results' : 'Auction · team board'}</h1>
          {subtitle && <p className="tb-sub tb-num">{subtitle}</p>}
        </div>
        {board && <Link to="/auction-results/report" className="tb-link">Grades and charts ›</Link>}
      </div>

      {loading && <p className="tb-sub">Loading…</p>}
      {!loading && error && <p className="tb-sub">Couldn't load results. {error}</p>}
      {!loading && !error && !board && (
        <p className="tb-sub">No auction yet. Once it wraps, results will appear here.</p>
      )}
      {!loading && !error && board && (
        <TeamBoard
          teams={board.teams}
          config={board.config}
          myTeamId={myTeamId}
          mode="results"
        />
      )}
    </div>
  );
}
