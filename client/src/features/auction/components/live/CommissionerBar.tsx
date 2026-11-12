/**
 * Screen 10 · Commissioner controls (Style Bible). Rendered by LiveAuction
 * only for a commissioner or site admin.
 *
 * Phone: `Pause`/`Resume`, `Undo last sale`, `More ›`. More opens an inline
 * panel under the bar (not a sheet) with Give a player / Skip turn / End.
 * Desktop: one bar with every control; `LastSales` sits beside the lot.
 *
 * Undo is deliberate but has no confirm (a sale can be redone by putting the
 * player up again). Ending the auction is irreversible, so it goes through
 * the app's one allowed overlay, ConfirmSheet.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmSheet } from '../../../../components/shared/ConfirmSheet';
import { PlayerLink } from '../../../../components/shared/playerCard/PlayerCardProvider';
import type { ClientAuctionState, useAuctionState } from '../../hooks/useAuctionState';
import { lastSales, type LastSale } from '../../lib/auctionSelectors';

type Actions = Pick<ReturnType<typeof useAuctionState>['actions'], 'pause' | 'resume' | 'undoLastSale' | 'skipTurn' | 'endAuction'>;

/** The server undoes a sale only between lots or after the auction (not while a lot is up). */
export function canUndoSale(state: ClientAuctionState): boolean {
  return lastSales(state, 1).length > 0 && (state.status === 'nominating' || state.status === 'completed');
}

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Runs one control at a time and keeps its error for an inline alert. */
function useControl() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e, fallback));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

export interface CommissionerBarProps {
  state: ClientAuctionState;
  actions: Actions;
  variant: 'phone' | 'desktop';
}

export default function CommissionerBar({ state, actions, variant }: CommissionerBarProps) {
  const { busy, error, run } = useControl();
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const paused = !!state.paused || state.status === 'paused';
  const running = state.status === 'nominating' || state.status === 'bidding' || state.status === 'paused';
  const canUndo = canUndoSale(state);
  const canSkip = state.status === 'nominating';
  const panelId = 'cb-more';

  const togglePause = () => run(paused ? actions.resume : actions.pause, paused ? 'Could not resume' : 'Could not pause');
  // Name the sale on screen so a stale view can't undo a different one.
  const undo = () => run(() => actions.undoLastSale(lastSales(state, 1)[0]?.rosterId), 'Could not undo the last sale');
  const skip = () => run(actions.skipTurn, "Could not skip this team's turn");
  const end = async () => {
    await run(actions.endAuction, 'Could not end the auction');
    setConfirmEnd(false);
  };

  const pauseBtn = (
    <button type="button" className="la-btn sm" disabled={busy || !running} onClick={togglePause}>
      {paused ? 'Resume' : 'Pause'}
    </button>
  );
  const undoBtn = (
    <button type="button" className="la-btn sm" disabled={busy || !canUndo} onClick={undo}>Undo last sale</button>
  );
  const alert = error ? <p className="la-err cb-err" role="alert">{error}</p> : null;

  const confirm = (
    <ConfirmSheet
      open={confirmEnd}
      title="End the auction?"
      body="Bidding stops for good. A player up for bid now goes unsold, and no more players can be bought. This can't be undone."
      confirmLabel="End the auction"
      busy={busy}
      onConfirm={() => void end()}
      onCancel={() => setConfirmEnd(false)}
    />
  );

  if (variant === 'desktop') {
    return (
      <div className="cb-wrap">
        <div className="cb-bar wide" role="group" aria-label="Commissioner controls">
          <b className="cb-label">Commissioner</b>
          {pauseBtn}
          {undoBtn}
          <Link to="/auction/assign" className="la-btn sm cb-linkbtn">Give a player to a team</Link>
          <button type="button" className="la-btn sm" disabled={busy || !canSkip} onClick={skip}>Skip turn</button>
          <button type="button" className="la-btn sm" disabled={busy} onClick={() => setConfirmEnd(true)}>End auction</button>
          {alert}
        </div>
        {confirm}
      </div>
    );
  }

  return (
    <div className="cb-wrap">
      <div className="cb-bar" role="group" aria-label="Commissioner controls">
        {pauseBtn}
        {undoBtn}
        <button
          type="button"
          className="la-btn sm"
          aria-expanded={moreOpen}
          aria-controls={panelId}
          onClick={() => setMoreOpen(o => !o)}
        >
          More ›
        </button>
        {alert}
      </div>
      {moreOpen && (
        <div id={panelId} className="cb-more">
          <p className="la-cap">More</p>
          <div className="la-list">
            <Link to="/auction/assign" className="la-row cb-row">
              <span className="la-t"><b>Give a player to a team</b><small>For a sale that went wrong</small></span>
              <span className="cb-chev" aria-hidden="true">›</span>
            </Link>
            <button type="button" className="la-row cb-row" disabled={busy || !canSkip} onClick={skip}>
              <span className="la-t"><b>Skip this team's turn</b></span>
              <span className="cb-chev" aria-hidden="true">›</span>
            </button>
            <button type="button" className="la-row cb-row" disabled={busy} onClick={() => setConfirmEnd(true)}>
              <span className="la-t"><b>End the auction</b><small>Asks you to confirm</small></span>
              <span className="cb-chev" aria-hidden="true">›</span>
            </button>
          </div>
        </div>
      )}
      {confirm}
    </div>
  );
}

/**
 * mlbId for a sold player: the WIN entry's playerId. Legacy WINs (logged
 * before playerId was added) fall back to a name match on the buying team's roster.
 */
function soldMlbId(state: ClientAuctionState, sale: LastSale): number | null {
  const fromSale = Number(sale.playerId);
  if (sale.playerId && Number.isFinite(fromSale) && fromSale > 0) return fromSale;
  if (!sale.playerName) return null;
  const t = state.teams.find(x => x.id === sale.teamId);
  const r = t?.roster.find(x => x.playerName === sale.playerName);
  return r?.mlbId ?? null;
}

export interface LastSalesProps {
  state: ClientAuctionState;
  actions: Pick<Actions, 'undoLastSale'>;
}

/** Desktop · the five newest sales; `Undo` on the newest row only (same call as Undo last sale). */
export function LastSales({ state, actions }: LastSalesProps) {
  const { busy, error, run } = useControl();
  const sales = lastSales(state, 5);
  const canUndo = canUndoSale(state);
  return (
    <div className="la-col cb-sales" data-testid="last-sales">
      <p className="la-cap">Last sales</p>
      <div className="la-list">
        {sales.map((s, i) => (
          <div className="la-row" key={`${s.timestamp}-${i}`} data-testid="last-sale">
            <div className="la-t">
              <b><PlayerLink mlbId={soldMlbId(state, s)} name={s.playerName ?? 'Unknown'} /></b>
              <small className="la-num">{`${s.teamName ?? 'Unknown team'} · $${s.amount ?? 0}`}</small>
            </div>
            {i === 0 && (
              <button type="button" className="la-btn sm" disabled={busy || !canUndo} onClick={() => run(() => actions.undoLastSale(s.rosterId), 'Could not undo the last sale')}>
                Undo
              </button>
            )}
          </div>
        ))}
        {sales.length === 0 && (
          <div className="la-row"><div className="la-t"><small>No players sold yet.</small></div></div>
        )}
      </div>
      {error && <p className="la-err" role="alert">{error}</p>}
    </div>
  );
}
