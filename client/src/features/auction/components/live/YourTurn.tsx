/**
 * Screen 9 · Your turn to put a player up (Style Bible).
 *
 * Shown while status is 'nominating', in place of the lot card.
 *  - `TurnBox`: the heading box with the turn clock. My turn: `Your turn` /
 *    `Put a player up` / `After you: {A}, {B}.`. I'm next: `You're up next`.
 *    Otherwise `{Team} is choosing`. Paused replaces the clock.
 *  - `PutUpPanel`: my list with `Put up`, `Search all players` and the
 *    editable opening bid. Rendered only on my turn; no `Put up` while paused.
 *
 * Phone pins only the TurnBox (the panel scrolls); desktop renders both in the
 * center column (`YourTurn`). The server stays the authority: its 409/400
 * message ("Time is up", "Turn no longer active", ...) shows inline.
 */
import React, { useId, useMemo, useState } from 'react';
import type { PlayerSeasonStat } from '../../../../api';
import { PlayerLink } from '../../../../components/shared/playerCard/PlayerCardProvider';
import { playerHeadshotUrl } from '../../../../lib/mlbImages';
import type { AuctionTeam, ClientAuctionState } from '../../hooks/useAuctionState';
import { openingBidValidation, type OrderStrip } from '../../lib/auctionSelectors';
import { formatClock, useClock } from '../../lib/clock';
import { formatValue, matchPlayers, playerValue, primaryPos } from './PlayersPanel';

/** True when the auction is choosing and the team on the clock is mine. */
export function isMyTurn(state: Pick<ClientAuctionState, 'status'>, strip: OrderStrip): boolean {
  return state.status === 'nominating' && !!strip.now?.isMe;
}

export interface TurnBoxProps {
  state: ClientAuctionState;
  strip: OrderStrip;
  paused: boolean;
}

export function TurnBox({ state, strip, paused }: TurnBoxProps) {
  // Expired end times read 0:00 (the server keeps them while the timeout settles); no end time, no clock.
  const ms = useClock(paused ? null : state.nominationEndTime ?? null);
  const clock = paused
    ? <span className="la-state yt-paused">Paused</span>
    : ms !== null && <span className="la-clock" role="timer" aria-label="Time left">{formatClock(ms)}</span>;

  if (isMyTurn(state, strip)) {
    const after = [strip.next, strip.rest[0]].filter((e): e is NonNullable<typeof e> => !!e).map(e => e.team.name);
    return (
      <div className="la-oc" data-slot="your-turn">
        <div className="la-top2">
          <div>
            <p className="la-cap">Your turn</p>
            <h2 className="yt-h">Put a player up</h2>
          </div>
          {clock}
        </div>
        {after.length > 0 && <p className="yt-after">After you: {after.join(', ')}.</p>}
      </div>
    );
  }

  const now = strip.now;
  const heading = strip.next?.isMe ? "You're up next" : now ? `${now.team.name} is choosing` : 'Waiting for the next player';
  return (
    <div className="la-oc" data-slot="your-turn">
      <div className="la-wait">
        <h2>{heading}</h2>
        {clock}
      </div>
    </div>
  );
}

export interface PutUpPanelProps {
  myTeam: AuctionTeam | null;
  /** My list (mlbIds, ranked), from useMyList. */
  list: number[];
  /** Players still available (see `availablePlayers`): not rostered, not sold. */
  available: PlayerSeasonStat[];
  paused: boolean;
  variant: 'phone' | 'desktop';
  onPutUp: (player: PlayerSeasonStat, startBid: number) => Promise<void>;
  onRemove: (mlbId: number) => unknown;
}

/** Search results shown at once; narrowing the search shows the rest. */
const MAX_RESULTS = 25;

const errMessage = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Could not put that player up');

const valueText = (p: PlayerSeasonStat) => formatValue(playerValue(p));

export function PutUpPanel({ myTeam, list, available, paused, variant, onPutUp, onRemove }: PutUpPanelProps) {
  const [openingBid, setOpeningBid] = useState('1');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bidId = useId();
  const canPutUp = !paused && !!myTeam;
  const desktop = variant === 'desktop';

  // List entries resolved against available players; rostered or sold ones drop out (the server list is untouched).
  const listPlayers = useMemo(() => {
    const byId = new Map(available.map(p => [Number(p.mlb_id), p]));
    return list.map(id => byId.get(id)).filter((p): p is PlayerSeasonStat => !!p);
  }, [available, list]);

  const matches = useMemo(() => matchPlayers(available, query), [available, query]);
  const showResults = desktop || query.trim() !== '';
  const results = matches.slice(0, MAX_RESULTS);

  const putUp = async (p: PlayerSeasonStat) => {
    const v = openingBidValidation(openingBid, myTeam);
    if (!v.ok) { setError(v.message); return; }
    setBusy(true);
    setError(null);
    try {
      await onPutUp(p, Number(openingBid));
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const putUpButton = (p: PlayerSeasonStat, primary = false) => canPutUp && (
    <button
      type="button"
      className={`la-btn sm${primary ? ' primary' : ''}`}
      aria-label={`Put up ${p.player_name ?? 'player'}`}
      disabled={busy}
      onClick={() => void putUp(p)}
    >
      Put up
    </button>
  );

  const myList = (
    <div className="la-col yt-sec">
      <p className="la-cap">Your list</p>
      <div className="la-list" data-testid="my-list">
        {listPlayers.map((p, i) => {
          const id = Number(p.mlb_id);
          const v = valueText(p);
          return (
            <div className="la-row" key={p.mlb_id} data-testid="list-row">
              <div className="la-l">
                {!desktop && <img className="la-face" src={playerHeadshotUrl(id)} alt="" loading="lazy" />}
                <div className="la-t">
                  <b><span className="la-num">{i + 1}.</span> <PlayerLink mlbId={id} name={p.player_name ?? 'Unknown'} /></b>
                  <small className="la-num">{[primaryPos(p), v && `value ${v}`].filter(Boolean).join(' · ')}</small>
                </div>
              </div>
              <div className="la-row-r">
                {putUpButton(p, i === 0)}
                <button
                  type="button"
                  className="yt-x"
                  aria-label={`Remove ${p.player_name} from your list`}
                  onClick={() => void onRemove(id)}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
        {listPlayers.length === 0 && (
          <div className="la-row"><div className="la-t"><small>Your list is empty. Add players with + List.</small></div></div>
        )}
      </div>
    </div>
  );

  const searchField = (
    <input
      className="la-field"
      type="search"
      placeholder="Search all players"
      aria-label="Search all players"
      value={query}
      onChange={e => setQuery(e.target.value)}
    />
  );

  const noMatch = results.length === 0 && <p className="la-foot">No players match.</p>;
  const moreHint = matches.length > MAX_RESULTS && <p className="la-foot">Search to see more.</p>;

  const searchResults = showResults && (desktop ? (
    <div className="la-list yt-tablewrap" data-testid="search-results">
      <table className="yt-table">
        <thead>
          <tr><th scope="col">Player</th><th scope="col">Team</th><th scope="col">Pos</th><th scope="col">Value</th><th scope="col"><span className="yt-sr">Put up</span></th></tr>
        </thead>
        <tbody>
          {results.map(p => (
            <tr key={p.mlb_id}>
              <td><PlayerLink mlbId={Number(p.mlb_id)} name={p.player_name ?? 'Unknown'} /></td>
              <td>{p.mlb_team_abbr || p.mlb_team || ''}</td>
              <td>{primaryPos(p)}</td>
              <td className="la-num">{valueText(p)}</td>
              <td className="yt-act">{putUpButton(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="la-list" data-testid="search-results">
      {results.map(p => (
        <div className="la-row" key={p.mlb_id}>
          <div className="la-t">
            <b><PlayerLink mlbId={Number(p.mlb_id)} name={p.player_name ?? 'Unknown'} /></b>
            <small className="la-num">{[primaryPos(p), p.mlb_team_abbr || p.mlb_team, valueText(p) && `value ${valueText(p)}`].filter(Boolean).join(' · ')}</small>
          </div>
          <div className="la-row-r">{putUpButton(p)}</div>
        </div>
      ))}
    </div>
  ));

  const invalid = error !== null && !openingBidValidation(openingBid, myTeam).ok;
  const opening = (
    <div className="la-list">
      <div className="la-row">
        <div className="la-t"><b><label htmlFor={bidId}>Opening bid</label></b></div>
        <div className="la-row-r yt-bid">
          <span aria-hidden="true">$</span>
          <input
            id={bidId}
            className="la-input"
            type="text"
            inputMode="numeric"
            value={openingBid}
            aria-invalid={invalid || undefined}
            onChange={e => { setOpeningBid(e.target.value); setError(null); }}
          />
        </div>
      </div>
    </div>
  );

  const alert = error && <p className="la-err" role="alert">{error}</p>;

  if (desktop) {
    return (
      <div className="yt-panel">
        {alert}
        <div className="yt-grid">
          <div className="la-col">
            {searchField}
            {searchResults}
            {noMatch}
            {moreHint}
          </div>
          <div className="la-col">
            {myList}
            {opening}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="yt-panel la-col">
      {alert}
      {myList}
      {searchField}
      {searchResults}
      {showResults && noMatch}
      {showResults && moreHint}
      {opening}
    </div>
  );
}

export type YourTurnProps = TurnBoxProps & Omit<PutUpPanelProps, 'paused'>;

/** Desktop: the box and, on my turn, the put-up panel, stacked in the center column. */
export default function YourTurn(props: YourTurnProps) {
  const { state, strip, paused } = props;
  return (
    <>
      <TurnBox state={state} strip={strip} paused={paused} />
      {isMyTurn(state, strip) && <PutUpPanel {...props} paused={paused} />}
    </>
  );
}
