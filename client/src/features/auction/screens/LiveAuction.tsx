/**
 * Screen 8 · Live bidding (Style Bible), phone and desktop.
 *
 * Phone (< 768px): only the lot header, bid bar and max-bid line are pinned
 * under the shell's top bar (position: sticky; the window is the scroller).
 * The order strip, the Teams | Players | Board tabs and the tab body scroll
 * beneath them.
 * Desktop: three columns. Players | lot + bids on this player | order + teams.
 *
 * Slots for later tasks:
 *  - Screen 9 (YourTurn): while status is 'nominating' the turn box takes the lot card's place;
 *    on my turn the put-up panel follows it (phone: pinned box, panel scrolls below).
 *  - Task 6 (CommissionerBar): renders where `{/* Task 6: CommissionerBar *\/}` sits, above the lot area (on phone, just above the pinned block, not inside it).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PlayerSeasonStat } from '../../../api';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import type { ClientAuctionState, ConnectionStatus, useAuctionState } from '../hooks/useAuctionState';
import { useMyList } from '../hooks/useMyList';
import { lotBids, orderStrip, playersLeft } from '../lib/auctionSelectors';
import LotHeader from '../components/live/LotHeader';
import BidBar from '../components/live/BidBar';
import OrderStrip from '../components/live/OrderStrip';
import TeamsPanel from '../components/live/TeamsPanel';
import PlayersPanel, { availablePlayers, playerValue } from '../components/live/PlayersPanel';
import LotBids from '../components/live/LotBids';
import YourTurn, { PutUpPanel, TurnBox, isMyTurn } from '../components/live/YourTurn';
import TeamBoard from '../components/board/TeamBoard';
import '../components/live/live.css';

export type AuctionActions = ReturnType<typeof useAuctionState>['actions'];

export interface LiveAuctionPrefs {
  sound: boolean;
  notifications: boolean;
  onToggleSound: () => void;
  onToggleNotifications: () => void;
}

export interface LiveAuctionProps {
  state: ClientAuctionState;
  actions: AuctionActions;
  leagueId: number;
  myTeamId?: number | null;
  /** Full player feed (season stats); availability is derived here. */
  players: PlayerSeasonStat[];
  /** Unused here; reserved for Task 6 (CommissionerBar). */
  isCommissioner: boolean;
  connectionStatus?: ConnectionStatus;
  prefs: LiveAuctionPrefs;
}

const PHONE_QUERY = '(max-width: 767px)';
type Tab = 'teams' | 'players' | 'board';

/** Lot number from the log: one NOMINATION per lot; while choosing, the next lot. */
export function lotNumber(state: Pick<ClientAuctionState, 'log' | 'status'>): number {
  const n = state.log.filter(e => e.type === 'NOMINATION').length;
  return state.status === 'nominating' ? n + 1 : Math.max(1, n);
}

/** My max (proxy) bid on the current lot: fetched per lot, dropped once the price passes it. */
function useMyMaxBid(actions: AuctionActions, myTeamId: number | null | undefined, state: ClientAuctionState) {
  const [maxBid, setMaxBid] = useState<number | null>(null);
  const lot = state.nomination?.playerId;
  useEffect(() => {
    if (!myTeamId || !lot) { setMaxBid(null); return; }
    let live = true;
    actions.getMyProxyBid(myTeamId).then(v => { if (live) setMaxBid(v); }).catch(() => { if (live) setMaxBid(null); });
    return () => { live = false; };
  }, [myTeamId, lot]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = state.nomination?.currentBid;
  useEffect(() => {
    if (maxBid !== null && typeof current === 'number' && current >= maxBid) setMaxBid(null);
  }, [current, maxBid]);

  const set = useCallback(async (amount: number) => {
    if (!myTeamId) return;
    await actions.setProxyBid({ bidderTeamId: myTeamId, maxBid: amount });
    setMaxBid(amount);
  }, [actions, myTeamId]);
  const clear = useCallback(async () => {
    if (!myTeamId) return;
    await actions.cancelProxyBid(myTeamId);
    setMaxBid(null);
  }, [actions, myTeamId]);
  return { maxBid, set, clear };
}

function HeaderToggles({ prefs }: { prefs: LiveAuctionPrefs }) {
  return (
    <>
      <button type="button" className="la-toggle" aria-pressed={prefs.sound} onClick={prefs.onToggleSound}>Sound</button>
      <button type="button" className="la-toggle" aria-pressed={prefs.notifications} onClick={prefs.onToggleNotifications}>Notifications</button>
    </>
  );
}

export default function LiveAuction({ state, actions, leagueId, myTeamId, players, connectionStatus, prefs }: LiveAuctionProps) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [tab, setTab] = useState<Tab>('teams');
  const myList = useMyList(leagueId, myTeamId ?? null);
  const maxBid = useMyMaxBid(actions, myTeamId, state);

  const myTeam = state.teams.find(t => t.id === myTeamId) ?? null;
  const paused = !!state.paused || state.status === 'paused';
  const hasLot = !!state.nomination && (state.status === 'bidding' || state.status === 'paused');
  const strip = orderStrip(state, myTeamId);
  const bids = useMemo(() => lotBids(state), [state]);
  const available = useMemo(() => availablePlayers(players, state.teams), [players, state.teams]);
  const lotValue = useMemo(() => {
    const id = state.nomination?.playerId;
    const p = id ? players.find(x => x.mlb_id === id) : undefined;
    return p ? playerValue(p) : null;
  }, [players, state.nomination?.playerId]);

  const onBid = useCallback(async (amount: number) => {
    if (!myTeamId) return;
    await actions.bid({ bidderTeamId: myTeamId, amount });
  }, [actions, myTeamId]);

  const listControls = myTeamId ? { has: myList.has, add: myList.add, remove: myList.remove } : null;

  const myTurn = isMyTurn(state, strip);
  const onPutUp = useCallback(async (p: PlayerSeasonStat, startBid: number) => {
    if (!myTeamId) return;
    await actions.nominate({
      nominatorTeamId: myTeamId,
      playerId: p.mlb_id || '',
      playerName: p.player_name || 'Unknown',
      startBid,
      positions: p.positions || (p.is_pitcher ? 'P' : 'UT'),
      team: p.mlb_team || 'FA',
      isPitcher: Boolean(p.is_pitcher),
    });
  }, [actions, myTeamId]);
  const putUpProps = {
    myTeam, list: myList.list, available, paused, onPutUp, onRemove: myList.remove,
  };

  const lotArea = hasLot && state.nomination ? (
    <div className="la-oc" data-testid="lot">
      <LotHeader nomination={state.nomination} teams={state.teams} value={isPhone ? null : lotValue} size={isPhone ? 'lg' : 'xl'} />
      <BidBar
        key={state.nomination.playerId /* new lot: reset error, typing and max-bid editor */}
        nomination={state.nomination}
        myTeam={myTeam}
        bidding={hasLot}
        paused={paused}
        compact={isPhone}
        myMaxBid={maxBid.maxBid}
        onBid={onBid}
        onSetMaxBid={maxBid.set}
        onClearMaxBid={maxBid.clear}
      />
    </div>
  ) : state.status === 'nominating' ? (
    isPhone
      ? <TurnBox state={state} strip={strip} paused={paused} />
      : <YourTurn state={state} strip={strip} {...putUpProps} variant="desktop" />
  ) : null;

  const reconnecting = connectionStatus === 'reconnecting'
    ? <p className="la-sub" role="status">Reconnecting…</p> : null;

  if (isPhone) {
    return (
      <div className="la-page phone">
        <div className="la-head">
          <h1 className="la-title">Auction · Lot {lotNumber(state)}</h1>
          <div className="la-head-r"><HeaderToggles prefs={prefs} /></div>
        </div>
        {reconnecting}
        {/* Task 6: CommissionerBar */}
        {/* Pinned: only the lot header, bid bar and max-bid line (controller ruling). */}
        <div className="la-pin" data-testid="pinned">
          {lotArea}
        </div>
        {myTurn && <PutUpPanel {...putUpProps} variant="phone" />}
        <OrderStrip strip={strip} variant="phone" />
        <div className="la-seg" role="group" aria-label="Auction views">
          {(['teams', 'players', 'board'] as Tab[]).map(t => (
            <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t === 'teams' ? 'Teams' : t === 'players' ? 'Players' : 'Board'}
            </button>
          ))}
        </div>
        <div className="la-col" data-testid="tab-body">
          {tab === 'teams' && (
            <TeamsPanel teams={state.teams} config={state.config} myTeamId={myTeamId} currentBid={hasLot ? state.nomination?.currentBid : null} variant="phone" />
          )}
          {tab === 'players' && <PlayersPanel players={available} myList={listControls} />}
          {tab === 'board' && <TeamBoard teams={state.teams} config={state.config} myTeamId={myTeamId} mode="live" />}
        </div>
      </div>
    );
  }

  return (
    <div className="la-page">
      <div className="la-head">
        <div>
          <h1 className="la-title">Auction · Lot {lotNumber(state)}</h1>
          <p className="la-sub la-num">{playersLeft(state)} players left to buy</p>
        </div>
        <div className="la-head-r">
          <HeaderToggles prefs={prefs} />
          <Link to="/auction/board" className="la-link">Team board ›</Link>
        </div>
      </div>
      {reconnecting}
      {/* Task 6: CommissionerBar */}
      <div className="la-cols3">
        <div className="la-col la-players">
          <p className="la-cap">Players</p>
          <PlayersPanel players={available} myList={listControls} />
        </div>
        <div className="la-col la-center">
          {lotArea}
          {hasLot && <LotBids bids={bids} />}
        </div>
        <div className="la-col la-right">
          <OrderStrip strip={strip} variant="desktop" />
          <p className="la-cap">Teams</p>
          <TeamsPanel teams={state.teams} config={state.config} myTeamId={myTeamId} currentBid={hasLot ? state.nomination?.currentBid : null} variant="desktop" />
        </div>
      </div>
    </div>
  );
}
