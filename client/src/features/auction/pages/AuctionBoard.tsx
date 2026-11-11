/*
 * /auction/board — Screen 11 team board, live during the auction
 * (desktop route; on phones the live auction's Board tab renders the same TeamBoard).
 */
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLeague } from '../../../contexts/LeagueContext';
import { useAuctionState } from '../hooks/useAuctionState';
import { playersLeft } from '../lib/auctionSelectors';
import TeamBoard from '../components/board/TeamBoard';
import '../components/board/teamBoard.css';

export default function AuctionBoard() {
  const { leagueId, myTeamId } = useLeague();
  const navigate = useNavigate();
  const { state, error } = useAuctionState(leagueId);

  return (
    <div className="aurora-theme tb-page">
      <div className="tb-head">
        <div>
          <h1 className="tb-title">Auction · team board</h1>
          {state && (
            <p className="tb-sub">Live · {playersLeft(state)} players left to buy · updates as players are sold</p>
          )}
        </div>
        <Link to="/auction" className="tb-link">‹ Back to the auction</Link>
      </div>

      {!state && !error && <p className="tb-sub">Loading…</p>}
      {!state && error && <p className="tb-sub">Couldn't load the auction. {error}</p>}
      {state && (
        <TeamBoard
          teams={state.teams}
          config={state.config}
          myTeamId={myTeamId}
          mode="live"
          onTeamClick={t => navigate(`/teams/${t.code}`)}
        />
      )}
    </div>
  );
}
