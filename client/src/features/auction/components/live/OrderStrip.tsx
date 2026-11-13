/**
 * Screen 8 · who puts players up: now, next, then the rest in turn order.
 *
 * Phone: `now` and `next` chips plus a `+N` chip that shows the rest inline,
 * so no chip is ever cut off mid-name. Desktop: a short numbered list with
 * now, next and you marked.
 */
import React, { useState } from 'react';
import type { OrderEntry, OrderStrip as OrderStripData } from '../../lib/auctionSelectors';

export interface OrderStripProps {
  strip: OrderStripData;
  variant: 'phone' | 'desktop';
}

const label = (e: OrderEntry) => (e.isMe ? 'You' : e.team.name);

export default function OrderStrip({ strip, variant }: OrderStripProps) {
  const [showAll, setShowAll] = useState(false);
  const { now, next, rest } = strip;
  if (!now) return null;

  if (variant === 'phone') {
    const picks: { key: string; text: string; me: boolean }[] = [
      { key: `now-${now.team.id}`, text: `${label(now)} · now`, me: now.isMe },
      ...(next ? [{ key: `next-${next.team.id}`, text: `${label(next)} · next`, me: next.isMe }] : []),
      ...(showAll ? rest.map(e => ({ key: `r-${e.team.id}`, text: label(e), me: e.isMe })) : []),
    ];
    return (
      <div className="la-box">
        <p className="la-cap">Order for putting players up</p>
        <div className="la-picks">
          {picks.map(p => <span key={p.key} className={`la-pick${p.me ? ' on' : ''}`}>{p.text}</span>)}
          {rest.length > 0 && !showAll && (
            <button
              type="button"
              className="la-pick la-pick-more"
              aria-expanded={false}
              aria-label={`Show the other ${rest.length} ${rest.length === 1 ? 'team' : 'teams'}`}
              onClick={() => setShowAll(true)}
            >
              +{rest.length}
            </button>
          )}
        </div>
      </div>
    );
  }

  const rows: { entry: OrderEntry; tag: 'now' | 'next' | null }[] = [
    { entry: now, tag: 'now' },
    ...(next ? [{ entry: next, tag: 'next' as const }] : []),
    ...rest.map(entry => ({ entry, tag: null })),
  ];
  return (
    <div className="la-box">
      <p className="la-cap">Putting players up</p>
      <ol className="la-olist">
        {rows.map(({ entry, tag }, i) => (
          <li key={entry.team.id} className={`${tag ? 'hi' : ''}${entry.isMe ? ' me' : ''}`.trim() || undefined}>
            <span className="la-olist-n la-num">{i + 1}</span>
            <span className="la-olist-t">{label(entry)}</span>
            {tag && <small>{tag}</small>}
          </li>
        ))}
      </ol>
    </div>
  );
}
