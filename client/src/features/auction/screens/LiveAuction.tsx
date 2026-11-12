/**
 * Screen 8 · Live bidding (Style Bible), phone and desktop.
 *
 * Phone (< 768px): the lot (player, price, clock, bid buttons, max-bid line),
 * the order strip and the Teams | Players | Board tabs are pinned under the
 * shell's top bar (position: sticky; the window is the scroller); the tab body
 * scrolls beneath them.
 * Desktop: three columns. Players | lot + bids on this player | order + teams.
 *
 * Slots for later tasks:
 *  - Task 5 (YourTurn): replaces <NominatingSlot> (the box shown while status is 'nominating').
 *  - Task 6 (CommissionerBar): renders where `{/* Task 6: CommissionerBar *\/}` sits, above the lot area.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PlayerSeasonStat } from '../../../api';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import type { ClientAuctionState, ConnectionStatus, useAuctionState } from '../hooks/useAuctionState';
import { useMyList } from '../hooks/useMyList';
import { lotBids, orderStrip, playersLeft, type OrderStrip as OrderStripData } from '../lib/auctionSelectors';
import { formatClock, useClock } from '../lib/clock';
import LotHeader from '../components/live/LotHeader';
import BidBar from '../components/live/BidBar';
import OrderStrip from '../components/live/OrderStrip';
import TeamsPanel from '../components/live/TeamsPanel';
import PlayersPanel, { availablePlayers, playerValue } from '../components/live/PlayersPanel';
import LotBids from '../components/live/LotBids';
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

/**
 * Task 5: YourTurn replaces this box. Shown while status is 'nominating':
 * who is choosing, the turn clock, and "You're up next" when I am next.
 */
function NominatingSlot({ state, strip, paused }: { state: ClientAuctionState; strip: OrderStripData; paused: boolean }) {
  const ms = useClock(paused ? null : state.nominationEndTime ?? null);
  const now = strip.now;
  const heading = !now ? 'Waiting for the next player' : now.isMe ? 'Your turn' : `${now.team.name} is choosing`;
  return (
    <div className="la-oc" data-slot="your-turn">
      <div className="la-wait">
        <div>
          {strip.next?.isMe && <p className="la-cap">You're up next</p>}
          <h2>{heading}</h2>
        </div>
        {paused ? <span className="la-state" style={{ padding: '0 12px' }}>Paused</span>
          : ms !== null && <span className="la-clock" role="timer" aria-label="Time left">{formatClock(ms)}</span>}
      </div>
    </div>
  );
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

  const lotArea = hasLot && state.nomination ? (
    <div className="la-oc" data-testid="lot">
      <LotHeader nomination={state.nomination} teams={state.teams} value={isPhone ? null : lotValue} size={isPhone ? 'lg' : 'xl'} />
      <BidBar
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
    <NominatingSlot state={state} strip={strip} paused={paused} />
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
        <div className="la-pin" data-testid="pinned">
          {/* Task 6: CommissionerBar */}
          {lotArea}
          <OrderStrip strip={strip} variant="phone" />
          <div className="la-seg" role="group" aria-label="Auction views">
            {(['teams', 'players', 'board'] as Tab[]).map(t => (
              <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>
                {t === 'teams' ? 'Teams' : t === 'players' ? 'Players' : 'Board'}
              </button>
            ))}
          </div>
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
