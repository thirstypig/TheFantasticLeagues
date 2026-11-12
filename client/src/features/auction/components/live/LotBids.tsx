/** Screen 8 · bids on the player up now, newest first; `(auto)` marks max-bid (proxy) bids. */
import React from 'react';
import type { LotBid } from '../../lib/auctionSelectors';

export default function LotBids({ bids }: { bids: LotBid[] }) {
  if (bids.length === 0) return null;
  return (
    <>
      <p className="la-cap">Bids on this player</p>
      <div className="la-list">
        {bids.map((b, i) => (
          <div className="la-row" key={`${b.timestamp}-${i}`}>
            <div className="la-t">
              <b className="la-num">{b.teamName ?? 'Unknown'} ${b.amount}{b.auto ? ' (auto)' : ''}</b>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
