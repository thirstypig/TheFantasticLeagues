/**
 * Screen 8 · the player up for bid: name, position, who put him up, the high
 * bid and the lot clock. Pinned on phone (the parent makes it sticky).
 */
import React from 'react';
import { PlayerLink } from '../../../../components/shared/playerCard/PlayerCardProvider';
import { playerHeadshotUrl, teamLogoUrl } from '../../../../lib/mlbImages';
import type { AuctionTeam, NominationState } from '../../hooks/useAuctionState';
import { formatClock, useClock } from '../../lib/clock';
import { formatValue } from './PlayersPanel';

export interface LotHeaderProps {
  nomination: NominationState;
  teams: AuctionTeam[];
  /** Desktop shows `value $v`; pass null/undefined to hide it. */
  value?: number | null;
  size?: 'lg' | 'xl';
}

/** "SS,2B" / "SS/2B" -> "SS/2B" */
export function formatPositions(positions: string | null | undefined): string {
  return (positions ?? '').split(/[,/]/).map(s => s.trim()).filter(Boolean).join('/');
}

export default function LotHeader({ nomination, teams, value, size = 'lg' }: LotHeaderProps) {
  const teamName = (id: number) => teams.find(t => t.id === id)?.name ?? 'Unknown';
  const frozen = nomination.status === 'paused' ? (nomination.pausedRemainingMs ?? null) : null;
  const ms = useClock(nomination.endTime, frozen);
  const logo = teamLogoUrl(nomination.playerTeam);
  const mlbId = Number(nomination.playerId) || null;
  const pos = formatPositions(nomination.positions);
  const showValue = typeof value === 'number' && Number.isFinite(value);

  return (
    <>
      <div className="la-pc-head">
        {mlbId && <img className={`la-face ${size}`} src={playerHeadshotUrl(mlbId)} alt="" />}
        <div className="la-t">
          <b className="la-pname"><PlayerLink mlbId={mlbId} name={nomination.playerName} /></b>
          <small>
            {pos ? `${pos} · ` : ''}nominated by {teamName(nomination.nominatorTeamId)}
            {showValue ? ` · value ${formatValue(value)}` : ''}
          </small>
        </div>
        {nomination.playerTeam && (
          <span className="la-mlb">{logo && <img src={logo} alt="" />}{nomination.playerTeam}</span>
        )}
      </div>
      <div className="la-top2">
        <div>
          <p className="la-cap">High bid</p>
          <h2 className="la-price">${nomination.currentBid} · {teamName(nomination.highBidderTeamId)}</h2>
        </div>
        {ms !== null && (
          <span className={`la-clock${ms <= 5000 ? ' low' : ''}`} aria-label="Time left" role="timer">
            {formatClock(ms)}
          </span>
        )}
      </div>
    </>
  );
}
