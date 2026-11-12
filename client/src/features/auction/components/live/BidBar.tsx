/**
 * Screen 8 · bid buttons (+1, +5, type an amount) and the max-bid line.
 *
 * Client checks use `bidValidation`; the server stays the authority and its
 * error is shown inline (no toast, no modal).
 */
import React, { useState } from 'react';
import type { AuctionTeam, NominationState } from '../../hooks/useAuctionState';
import { bidValidation } from '../../lib/auctionSelectors';

export interface BidBarProps {
  nomination: NominationState | null;
  /** My team from live state; null when I have no team in this league. */
  myTeam: AuctionTeam | null;
  /** True only while the auction status is 'bidding'. */
  bidding: boolean;
  paused: boolean;
  /** Phone label for the type button is `Type`. */
  compact?: boolean;
  /** My max (proxy) bid on this lot, or null. */
  myMaxBid: number | null;
  onBid: (amount: number) => Promise<void>;
  onSetMaxBid: (amount: number) => Promise<void>;
  onClearMaxBid: () => Promise<void>;
}

const errMessage = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export default function BidBar({
  nomination, myTeam, bidding, paused, compact, myMaxBid, onBid, onSetMaxBid, onClearMaxBid,
}: BidBarProps) {
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [editingMax, setEditingMax] = useState(false);
  const [maxDraft, setMaxDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!nomination || !bidding) return null;
  if (!myTeam) return <p className="la-muted" style={{ margin: 0, fontSize: 15 }}>You don't have a team in this league</p>;

  const current = nomination.currentBid;
  const winning = nomination.highBidderTeamId === myTeam.id;
  const plus1 = current + 1;
  const plus5 = current + 5;

  const run = async (fn: () => Promise<void>, fallback: string, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      after?.();
    } catch (e) {
      setError(errMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  };

  const bid = (amount: number | string, after?: () => void) => {
    const v = bidValidation(amount, { nomination }, myTeam);
    if (!v.ok) { setError(v.message); return; }
    void run(() => onBid(Number(amount)), 'Bid failed', after);
  };

  const saveMax = () => {
    const v = bidValidation(maxDraft, { nomination }, myTeam);
    if (!v.ok) { setError(v.message); return; }
    void run(() => onSetMaxBid(Number(maxDraft)), 'Could not set your max bid', () => setEditingMax(false));
  };

  let controls: React.ReactNode;
  if (paused) {
    controls = <div className="la-state">Paused</div>;
  } else if (winning) {
    controls = <div className="la-state">You're winning</div>;
  } else if (typing) {
    controls = (
      <form className="la-type" noValidate onSubmit={e => { e.preventDefault(); bid(typed, () => { setTyping(false); setTyped(''); }); }}>
        <input
          className="la-input"
          type="number"
          inputMode="numeric"
          min={plus1}
          step={1}
          aria-label="Bid amount"
          placeholder={`$${plus1}`}
          value={typed}
          autoFocus
          onChange={e => { setTyped(e.target.value); setError(null); }}
        />
        <button type="submit" className="la-btn primary" disabled={busy}>Bid</button>
        <button type="button" className="la-btn" onClick={() => { setTyping(false); setTyped(''); setError(null); }}>Cancel</button>
      </form>
    );
  } else {
    controls = (
      <div className="la-btns">
        <button type="button" className="la-btn primary" disabled={busy || plus1 > myTeam.maxBid} onClick={() => bid(plus1)}>
          Bid ${plus1}
        </button>
        <button type="button" className="la-btn" disabled={busy || plus5 > myTeam.maxBid} onClick={() => bid(plus5)}>
          ${plus5}
        </button>
        <button type="button" className="la-btn" disabled={busy} onClick={() => { setTyping(true); setError(null); }}>
          {compact ? 'Type' : 'Type an amount'}
        </button>
      </div>
    );
  }

  return (
    <>
      {controls}
      {error && <p className="la-err" role="alert">{error}</p>}
      {editingMax && !paused ? (
        <form className="la-type" noValidate onSubmit={e => { e.preventDefault(); saveMax(); }}>
          <input
            className="la-input"
            type="number"
            inputMode="numeric"
            min={plus1}
            step={1}
            aria-label="Max bid"
            placeholder={`$${plus1}`}
            value={maxDraft}
            autoFocus
            onChange={e => { setMaxDraft(e.target.value); setError(null); }}
          />
          <button type="submit" className="la-btn sm primary" disabled={busy}>Set</button>
          {myMaxBid !== null && (
            <button
              type="button"
              className="la-btn sm"
              disabled={busy}
              onClick={() => void run(onClearMaxBid, 'Could not clear your max bid', () => setEditingMax(false))}
            >
              Clear
            </button>
          )}
          <button type="button" className="la-btn sm" onClick={() => { setEditingMax(false); setError(null); }}>Cancel</button>
        </form>
      ) : null}
      <div className="la-spread">
        {!editingMax && !paused ? (
          <button
            type="button"
            className="la-linkbtn"
            onClick={() => { setMaxDraft(myMaxBid !== null ? String(myMaxBid) : ''); setEditingMax(true); setError(null); }}
          >
            {myMaxBid !== null ? <span className="la-num">Your max bid: ${myMaxBid} (auto)</span> : 'Set a max bid'}
          </button>
        ) : (
          <span className="la-muted la-num">{myMaxBid !== null ? `Your max bid: $${myMaxBid} (auto)` : ''}</span>
        )}
        <span>You can spend up to <b className="la-num">${myTeam.maxBid}</b></span>
      </div>
    </>
  );
}
