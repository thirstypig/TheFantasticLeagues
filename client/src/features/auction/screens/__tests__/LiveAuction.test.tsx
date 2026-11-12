import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const fetchJsonApi = vi.fn();
vi.mock('../../../../api/base', () => ({ API_BASE: '/api', fetchJsonApi: (...a: unknown[]) => fetchJsonApi(...a) }));
vi.mock('../../../../lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../../../../lib/posthog', () => ({ track: vi.fn() }));
vi.mock('../../../../components/shared/playerCard/PlayerCardProvider', () => ({
  PlayerLink: ({ name }: { name: string }) => <span>{name}</span>,
}));

import LiveAuction, { lotNumber, type LiveAuctionProps } from '../LiveAuction';
import { useAuctionState, type ClientAuctionState, type AuctionTeam } from '../../hooks/useAuctionState';
import type { PlayerSeasonStat } from '../../../../api';

function setPhone(isPhone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: isPhone && q.includes('max-width: 767px'),
    media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
}

const team = (id: number, name: string, budget: number, maxBid: number, spotsLeft: number): AuctionTeam =>
  ({ id, name, code: name.slice(0, 3).toUpperCase(), budget, maxBid, rosterCount: 4 - spotsLeft, spotsLeft, roster: [] });

const baseState: ClientAuctionState = {
  leagueId: 20,
  status: 'bidding',
  nomination: {
    playerId: '682829', playerName: 'Elly De La Cruz', playerTeam: 'CIN', positions: 'SS', isPitcher: false,
    nominatorTeamId: 3, currentBid: 34, highBidderTeamId: 2,
    endTime: new Date(Date.now() + 9000).toISOString(), timerDuration: 15, status: 'running',
  },
  teams: [team(1, 'Los Doyers', 69, 61, 4), team(2, 'Skunk Dogs', 88, 80, 3), team(3, 'Bombers', 31, 26, 2)],
  queue: [3, 1, 2],
  queueIndex: 0,
  paused: false,
  nominationEndTime: null,
  config: { bidTimer: 15, nominationTimer: 30, rosterSize: 4, pitcherCount: 1, batterCount: 3, positionLimits: { C: 1, SS: 1, OF: 1 } },
  log: [
    { type: 'BID', teamId: 2, teamName: 'Skunk Dogs', amount: 34, timestamp: 3, message: 'Skunk Dogs bid $34' },
    { type: 'NOMINATION', teamId: 3, teamName: 'Bombers', amount: 1, timestamp: 2, message: 'n' },
    { type: 'WIN', teamId: 1, teamName: 'Los Doyers', amount: 5, timestamp: 1, message: 'w' },
    { type: 'NOMINATION', teamId: 2, teamName: 'Skunk Dogs', amount: 1, timestamp: 0, message: 'n' },
  ],
  lastUpdate: 0,
};

const players = [
  { mlb_id: '694973', player_name: 'Paul Skenes', positions: 'SP', is_pitcher: true, mlb_team: 'PIT', dollar_value: 38 },
  { mlb_id: '682829', player_name: 'Elly De La Cruz', positions: 'SS', mlb_team: 'CIN', value: 36 },
] as PlayerSeasonStat[];

const prefs = { sound: true, notifications: false, onToggleSound: vi.fn(), onToggleNotifications: vi.fn() };

/** Real useAuctionState so the test sees the exact request each click sends. */
function Harness(props: Partial<LiveAuctionProps>) {
  const { state, actions } = useAuctionState(20);
  if (!state) return null;
  return (
    <MemoryRouter>
      <LiveAuction state={state} actions={actions} leagueId={20} myTeamId={1} players={players} isCommissioner={false} prefs={prefs} {...props} />
    </MemoryRouter>
  );
}

function route(state: ClientAuctionState, proxy: number | null = null) {
  fetchJsonApi.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/auction/state')) return state;
    if (url.startsWith('/api/auction/my-proxy-bid')) return { maxBid: proxy };
    if (url.startsWith('/api/auction/my-list')) return { mlbIds: [] };
    return {};
  });
}

const calls = (path: string) => fetchJsonApi.mock.calls.filter(([u]) => String(u).startsWith(path));

beforeEach(() => { fetchJsonApi.mockReset(); localStorage.clear(); });

const myTurn: ClientAuctionState = {
  ...baseState,
  status: 'nominating',
  nomination: null,
  queueIndex: 1, // Los Doyers (me) on the clock
  nominationEndTime: new Date(Date.now() + 22_000).toISOString(),
  teams: [
    team(1, 'Los Doyers', 69, 61, 4),
    { ...team(2, 'Skunk Dogs', 88, 80, 3), roster: [{ id: 9, playerId: 9, mlbId: 682829, playerName: 'Elly De La Cruz', price: 34 }] },
    team(3, 'Bombers', 31, 26, 2),
  ],
};

function routeTurn(state: ClientAuctionState, list: number[]) {
  fetchJsonApi.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/auction/state')) return state;
    if (url.startsWith('/api/auction/my-list')) return { teamId: 1, mlbIds: list };
    return {};
  });
}

describe('lotNumber', () => {
  it('counts nominations; while choosing it is the next lot', () => {
    expect(lotNumber(baseState)).toBe(2);
    expect(lotNumber({ ...baseState, status: 'nominating' })).toBe(3);
    expect(lotNumber({ log: [], status: 'nominating' })).toBe(1);
  });
});

describe('LiveAuction · phone', () => {
  beforeEach(() => setPhone(true));

  it('pins only the lot, bid buttons and max-bid line; strip and tabs scroll; tabs switch the body', async () => {
    route(baseState);
    render(<Harness />);
    expect(await screen.findByText('Auction · Lot 2')).toBeTruthy();
    const pinned = screen.getByTestId('pinned');
    expect(within(pinned).getByText('Elly De La Cruz')).toBeTruthy();
    expect(within(pinned).getByRole('button', { name: 'Bid $35' })).toBeTruthy();
    expect(within(pinned).getByRole('button', { name: 'Type' })).toBeTruthy();
    expect(within(pinned).getByText(/You can spend up to/)).toBeTruthy();
    expect(within(pinned).getByRole('button', { name: 'Set a max bid' })).toBeTruthy();
    // order strip and tabs are on the page but NOT pinned
    expect(screen.getByText('Order for putting players up')).toBeTruthy();
    expect(within(pinned).queryByText('Order for putting players up')).toBeNull();
    expect(screen.getByRole('group', { name: 'Auction views' })).toBeTruthy();
    expect(within(pinned).queryByRole('group', { name: 'Auction views' })).toBeNull();
    expect(within(pinned).queryByRole('button', { name: 'Teams' })).toBeNull();
    // phone shows no value on the lot
    expect(within(pinned).getByText('SS · nominated by Bombers')).toBeTruthy();

    const body = screen.getByTestId('tab-body');
    expect(screen.getByRole('button', { name: 'Teams' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(body).getByText('Los Doyers · you')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Players' }));
    expect(screen.getByRole('button', { name: 'Players' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(body).getByText('Paul Skenes')).toBeTruthy();
    // the player up for bid is not owned yet, so it still lists; owned ones never do (panel tests)
    expect(within(body).queryByText('Los Doyers · you')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    expect(within(body).queryByText('Paul Skenes')).toBeNull();
    expect(body.querySelector('.tb')).toBeTruthy();
  });

  it('Bid $35 posts /api/auction/bid with my team, the amount and the league', async () => {
    route(baseState);
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bid $35' }));
    await waitFor(() => expect(calls('/api/auction/bid')).toHaveLength(1));
    const [url, init] = calls('/api/auction/bid')[0];
    expect(url).toBe('/api/auction/bid');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ bidderTeamId: 1, amount: 35, leagueId: 20 });
  });

  it("shows the server's message inline when a bid is rejected", async () => {
    route(baseState);
    render(<Harness />);
    await screen.findByRole('button', { name: 'Bid $35' });
    fetchJsonApi.mockImplementationOnce(async () => { throw new Error('Not enough budget'); });
    fireEvent.click(screen.getByRole('button', { name: 'Bid $35' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Not enough budget');
  });

  it('max bid: fetched per lot, set via POST /proxy-bid, cleared via DELETE /proxy-bid', async () => {
    route(baseState, 40);
    render(<Harness />);
    const line = await screen.findByRole('button', { name: 'Your max bid: $40 (auto)' });
    expect(calls('/api/auction/my-proxy-bid')[0][0]).toBe('/api/auction/my-proxy-bid?leagueId=20&teamId=1');

    fireEvent.click(line);
    fireEvent.change(screen.getByLabelText('Max bid'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    await waitFor(() => expect(calls('/api/auction/proxy-bid')).toHaveLength(1));
    const [url, init] = calls('/api/auction/proxy-bid')[0];
    expect(url).toBe('/api/auction/proxy-bid');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ bidderTeamId: 1, maxBid: 45, leagueId: 20 });
    expect(await screen.findByRole('button', { name: 'Your max bid: $45 (auto)' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Your max bid: $45 (auto)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(calls('/api/auction/proxy-bid?')).toHaveLength(1));
    const [delUrl, delInit] = calls('/api/auction/proxy-bid?')[0];
    expect(delUrl).toBe('/api/auction/proxy-bid?leagueId=20&teamId=1');
    expect(delInit.method).toBe('DELETE');
    expect(await screen.findByRole('button', { name: 'Set a max bid' })).toBeTruthy();
  });

  it('a bid error on one lot is gone once the next lot starts', async () => {
    route(baseState);
    const actions = {
      bid: vi.fn().mockRejectedValue(new Error('Not enough budget')),
      getMyProxyBid: vi.fn().mockResolvedValue(null),
    } as unknown as LiveAuctionProps['actions'];
    const view = (state: ClientAuctionState) => (
      <MemoryRouter>
        <LiveAuction state={state} actions={actions} leagueId={20} myTeamId={1} players={players} isCommissioner={false} prefs={prefs} />
      </MemoryRouter>
    );
    const { rerender } = render(view(baseState));
    fireEvent.click(screen.getByRole('button', { name: 'Bid $35' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Not enough budget');
    rerender(view({
      ...baseState,
      nomination: { ...baseState.nomination!, playerId: '694973', playerName: 'Paul Skenes', currentBid: 1, highBidderTeamId: 3 },
    }));
    expect(screen.getByText('Paul Skenes')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Bid $2' })).toBeTruthy();
  });

  it("while someone else chooses and I'm next: the You're up next box with the turn clock", async () => {
    route({ ...baseState, status: 'nominating', nomination: null, nominationEndTime: new Date(Date.now() + 22_000).toISOString() });
    render(<Harness />);
    expect(await screen.findByText("You're up next")).toBeTruthy();
    expect(screen.getByRole('timer').textContent).toBe('0:22');
    expect(screen.queryByRole('button', { name: /^Bid \$/ })).toBeNull();
    expect(screen.queryAllByRole('button', { name: /^Put up/ })).toHaveLength(0);
  });

  it('my turn: Your list hides the rostered/sold player; Put up posts /api/auction/nominate with the opening bid', async () => {
    routeTurn(myTurn, [682829, 694973]);
    render(<Harness />);
    expect(await screen.findByText('Put a player up')).toBeTruthy();
    const list = await screen.findByTestId('my-list');
    await waitFor(() => expect(within(list).getAllByTestId('list-row')).toHaveLength(1));
    expect(within(list).queryByText('Elly De La Cruz')).toBeNull();
    expect(within(list).getByText('Paul Skenes')).toBeTruthy();
    // the server list is not rewritten to drop the rostered player
    expect(calls('/api/auction/my-list').filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);

    fireEvent.change(screen.getByLabelText('Opening bid'), { target: { value: '3' } });
    fireEvent.click(within(list).getByRole('button', { name: 'Put up Paul Skenes' }));
    await waitFor(() => expect(calls('/api/auction/nominate')).toHaveLength(1));
    const [url, init] = calls('/api/auction/nominate')[0];
    expect(url).toBe('/api/auction/nominate');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      nominatorTeamId: 1, playerId: '694973', playerName: 'Paul Skenes', startBid: 3,
      positions: 'SP', team: 'PIT', isPitcher: true, leagueId: 20,
    });
  });

  it("my turn: the server's 409 message shows inline", async () => {
    routeTurn(myTurn, [694973]);
    render(<Harness />);
    const btn = await screen.findByRole('button', { name: 'Put up Paul Skenes' });
    fetchJsonApi.mockImplementationOnce(async () => { throw new Error('Time is up'); });
    fireEvent.click(btn);
    expect((await screen.findByRole('alert')).textContent).toBe('Time is up');
  });

  it('my turn while paused: Paused, no Put up', async () => {
    routeTurn({ ...myTurn, paused: true }, [694973]);
    render(<Harness />);
    expect(await screen.findByText('Paused')).toBeTruthy();
    await screen.findByTestId('my-list');
    expect(screen.queryAllByRole('button', { name: /^Put up/ })).toHaveLength(0);
  });

  it('paused: Paused replaces the bid buttons', async () => {
    route({ ...baseState, paused: true, nomination: { ...baseState.nomination!, status: 'paused', pausedRemainingMs: 7000 } });
    render(<Harness />);
    expect(await screen.findByText('Paused')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bid $35' })).toBeNull();
    expect(screen.getByRole('timer').textContent).toBe('0:07');
  });
});

describe('LiveAuction · desktop', () => {
  beforeEach(() => setPhone(false));

  it('three columns per the Bible: players, lot with value and bids, order + teams', async () => {
    route(baseState);
    render(<Harness />);
    expect(await screen.findByText('Auction · Lot 2')).toBeTruthy();
    expect(screen.getByText('9 players left to buy')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Team board ›' }).getAttribute('href')).toBe('/auction/board');
    expect(screen.getByText('SS · nominated by Bombers · value $36')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Type an amount' })).toBeTruthy();
    expect(screen.getByText('Bids on this player')).toBeTruthy();
    expect(screen.getByText('Skunk Dogs $34')).toBeTruthy();
    expect(screen.getByText('Putting players up')).toBeTruthy();
    expect(screen.getByText('Chip = most that team can bid.')).toBeTruthy();
    expect(screen.getByText('Paul Skenes')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Teams' })).toBeNull();
  });

  it('my turn on desktop: the YourTurn box replaces the lot card; players and teams panels stay', async () => {
    routeTurn(myTurn, [694973]);
    render(<Harness />);
    expect(await screen.findByText('Put a player up')).toBeTruthy();
    expect(screen.queryByTestId('lot')).toBeNull();
    expect(screen.getByText('Putting players up')).toBeTruthy();
    expect(screen.getByLabelText('Search players')).toBeTruthy(); // left players panel
    expect(screen.getByLabelText('Search all players')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Value' })).toBeTruthy();
  });

  it('sound and notification toggles call the prefs handlers', async () => {
    route(baseState);
    render(<Harness />);
    const sound = await screen.findByRole('button', { name: 'Sound' });
    expect(sound.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Notifications' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(sound);
    expect(prefs.onToggleSound).toHaveBeenCalled();
  });
});
