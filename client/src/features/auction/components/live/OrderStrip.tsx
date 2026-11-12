/** Screen 8 · who puts players up: now, next, then the rest in turn order. */
import React from 'react';
import type { OrderEntry, OrderStrip as OrderStripData } from '../../lib/auctionSelectors';

export interface OrderStripProps {
  strip: OrderStripData;
  variant: 'phone' | 'desktop';
}

const label = (e: OrderEntry) => (e.isMe ? 'You' : e.team.name);

export default function OrderStrip({ strip, variant }: OrderStripProps) {
  const { now, next, rest } = strip;
  if (!now) return null;

  if (variant === 'phone') {
    const picks: { key: string; text: string; me: boolean }[] = [
      { key: `now-${now.team.id}`, text: `${label(now)} · now`, me: now.isMe },
      ...(next ? [{ key: `next-${next.team.id}`, text: `${label(next)} · next`, me: next.isMe }] : []),
      ...rest.map(e => ({ key: `r-${e.team.id}`, text: label(e), me: e.isMe })),
    ];
    return (
      <div className="la-box">
        <p className="la-cap">Order for putting players up</p>
        <div className="la-picks">
          {picks.map(p => <span key={p.key} className={`la-pick${p.me ? ' on' : ''}`}>{p.text}</span>)}
        </div>
      </div>
    );
  }

  return (
    <div className="la-box">
      <p className="la-cap">Putting players up</p>
      <p className="la-order">
        <b>{label(now)}</b> now
        {next && <> · <b>{label(next)}</b> next</>}
        {rest.map(e => <React.Fragment key={e.team.id}> · {label(e)}</React.Fragment>)}
      </p>
    </div>
  );
}
