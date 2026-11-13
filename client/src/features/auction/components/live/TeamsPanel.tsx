/**
 * Screen 8 · every team's money while bidding: budget, spots, needs and a chip
 * with the most that team can bid. Phone rows are money and needs only (two
 * lines per team); desktop rows are
 * the Bible's short form with a footnote explaining the chip.
 */
import React from 'react';
import type { AuctionTeam, ClientAuctionState } from '../../hooks/useAuctionState';
import { teamNeeds } from '../../lib/auctionSelectors';

export interface TeamsPanelProps {
  teams: AuctionTeam[];
  config: ClientAuctionState['config'];
  myTeamId?: number | null;
  /** Current high bid; a team that can't beat it gets an alert-colored chip. */
  currentBid?: number | null;
  variant: 'phone' | 'desktop';
}

const spots = (n: number) => `${n} ${n === 1 ? 'spot' : 'spots'}`;

/**
 * Phone line, two lines per row at 390px: "$345 · H 12 · P 7". Spots are left
 * out because the needs add up to them; a team with nothing open reads "Full".
 */
export function phoneTeamLine(budget: number, needs: string, spotsLeft: number): string {
  const short = needs ? needs.split(', ').map(n => n.replace(' ×', ' ')).join(' · ') : (spotsLeft > 0 ? spots(spotsLeft) : 'Full');
  return `$${budget} · ${short}`;
}

export default function TeamsPanel({ teams, config, myTeamId, currentBid, variant }: TeamsPanelProps) {
  const sorted = [...teams].sort((a, b) => b.maxBid - a.maxBid || b.budget - a.budget);
  const phone = variant === 'phone';

  return (
    <>
      <div className="la-list">
        {sorted.map(t => {
          const needs = teamNeeds(t, config);
          const me = t.id === myTeamId;
          const outbid = typeof currentBid === 'number' && t.maxBid <= currentBid;
          const line = phone
            ? phoneTeamLine(t.budget, needs, t.spotsLeft)
            : `$${t.budget} · ${spots(t.spotsLeft)}${needs ? ` · ${needs}` : ''}`;
          return (
            <div className="la-row" key={t.id} data-testid={`team-row-${t.id}`}>
              <div className="la-t">
                <b>{t.name}{phone && me ? ' · you' : ''}</b>
                <small className="la-num">{line}</small>
              </div>
              <span className={`la-chip${outbid ? ' alert' : ''}`}>{phone ? `max $${t.maxBid}` : `$${t.maxBid}`}</span>
            </div>
          );
        })}
      </div>
      {!phone && <p className="la-foot">Chip = most that team can bid.</p>}
    </>
  );
}
