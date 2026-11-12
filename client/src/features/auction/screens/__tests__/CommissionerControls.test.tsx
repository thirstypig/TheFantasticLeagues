import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const fetchJsonApi = vi.fn();
vi.mock('../../../../api/base', () => ({ API_BASE: '/api', fetchJsonApi: (...a: unknown[]) => fetchJsonApi(...a) }));
vi.mock('../../../../lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../../../../lib/posthog', () => ({ track: vi.fn() }));
vi.mock('../../../../components/shared/playerCard/PlayerCardProvider', () => ({
  PlayerLink: ({ name }: { name: string }) => <span>{name}</span>,
}));

import LiveAuction, { type LiveAuctionProps } from '../LiveAuction';
import { useAuctionState, type ClientAuctionState, type AuctionTeam } from '../../hooks/useAuctionState';
import type { PlayerSeasonStat } from '../../../../api';

function setPhone(isPhone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: isPhone ? q.includes('max-width: 767px') : q.includes('min-width: 768px'),
    media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
}

const team = (id: number, name: string, budget: number, maxBid: number, spotsLeft: number): AuctionTeam =>
  ({ id, name, code: name.slice(0, 3).toUpperCase(), budget, maxBid, rosterCount: 4 - spotsLeft, spotsLeft, roster: [] });

const sales = [
  { type: 'WIN' as const, teamId: 3, teamName: 'Black Sox', playerName: 'Paul Skenes', amount: 41, timestamp: 9, message: 'w' },
  { type: 'NOMINATION' as const, teamId: 3, teamName: 'Black Sox', amount: 1, timestamp: 8, message: 'n' },
  { type: 'WIN' as const, teamId: 1, teamName: 'Los Doyers', playerName: 'Bryce Harper', amount: 30, timestamp: 7, message: 'w' },
  { type: 'NOMINATION' as const, teamId: 1, teamName: 'Los Doyers', amount: 1, timestamp: 6, message: 'n' },
];

const bidding: ClientAuctionState = {
  leagueId: 20,
  status: 'bidding',
  nomination: {
    playerId: '682829', playerName: 'Elly De La Cruz', playerTeam: 'CIN', positions: 'SS', isPitcher: false,
    nominatorTeamId: 3, currentBid: 34, highBidderTeamId: 2,
    endTime: new Date(Date.now() + 9000).toISOString(), timerDuration: 15, status: 'running',
  },
  teams: [team(1, 'Los Doyers', 69, 61, 4), team(2, 'Skunk Dogs', 88, 80, 3), team(3, 'Black Sox', 31, 26, 2)],
  queue: [3, 1, 2],
  queueIndex: 0,
  paused: false,
  nominationEndTime: null,
  config: { bidTimer: 15, nominationTimer: 30, rosterSize: 4, pitcherCount: 1, batterCount: 3, positionLimits: { C: 1, SS: 1, OF: 1 } },
  log: [
    { type: 'BID', teamId: 2, teamName: 'Skunk Dogs', amount: 34, timestamp: 10, message: 'b' },
    { type: 'NOMINATION', teamId: 3, teamName: 'Black Sox', amount: 1, timestamp: 10, message: 'n' },
    ...sales,
  ],
  lastUpdate: 0,
};

const nominating: ClientAuctionState = {
  ...bidding, status: 'nominating', nomination: null,
  nominationEndTime: new Date(Date.now() + 22_000).toISOString(),
};

const players = [
  { mlb_id: '694973', player_name: 'Paul Skenes', positions: 'SP', is_pitcher: true, mlb_team: 'PIT', dollar_value: 38 },
] as PlayerSeasonStat[];

const prefs = { sound: true, notifications: false, onToggleSound: vi.fn(), onToggleNotifications: vi.fn() };

function Harness(props: Partial<LiveAuctionProps>) {
  const { state, actions } = useAuctionState(20);
  if (!state) return null;
  return (
    <MemoryRouter initialEntries={['/auction']}>
      <Routes>
        <Route path="/auction" element={
          <LiveAuction state={state} actions={actions} leagueId={20} myTeamId={1} players={players} isCommissioner prefs={prefs} {...props} />
        } />
        <Route path="/auction/assign" element={<p>ASSIGN PAGE</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function route(state: ClientAuctionState, fail?: { path: string; message: string }) {
  fetchJsonApi.mockImplementation(async (url: string) => {
    if (fail && url.startsWith(fail.path)) throw new Error(fail.message);
    if (url.startsWith('/api/auction/state')) return state;
    if (url.startsWith('/api/auction/my-proxy-bid')) return { maxBid: null };
    if (url.startsWith('/api/auction/my-list')) return { mlbIds: [] };
    return {};
  });
}

const calls = (path: string) => fetchJsonApi.mock.calls.filter(([u]) => String(u).startsWith(path));
const expectPost = (path: string) => {
  const c = calls(path);
  expect(c).toHaveLength(1);
  expect(c[0][1].method).toBe('POST');
  expect(JSON.parse(c[0][1].body)).toEqual({ leagueId: 20 });
};

beforeEach(() => { fetchJsonApi.mockReset(); localStorage.clear(); });

describe('Commissioner controls · visibility', () => {
  it('a plain owner sees no commissioner controls (phone and desktop)', async () => {
    for (const phone of [true, false]) {
      setPhone(phone);
      route(bidding);
      const { unmount } = render(<Harness isCommissioner={false} />);
      expect(await screen.findByText(/Auction · Lot/)).toBeTruthy();
      expect(screen.queryByRole('group', { name: 'Commissioner controls' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Undo last sale' })).toBeNull();
      expect(screen.queryByText('Last sales')).toBeNull();
      unmount();
    }
  });

  it('a commissioner sees the bar above the pinned lot on phone (not inside it)', async () => {
    setPhone(true);
    route(bidding);
    render(<Harness />);
    const bar = await screen.findByRole('group', { name: 'Commissioner controls' });
    expect(within(bar).getByRole('button', { name: 'Pause' })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: 'Undo last sale' })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: 'More ›' })).toBeTruthy();
    expect(within(screen.getByTestId('pinned')).queryByRole('group', { name: 'Commissioner controls' })).toBeNull();
  });
});

describe('Commissioner controls · phone', () => {
  beforeEach(() => setPhone(true));

  it('Pause calls /pause; label reads Resume when paused and calls /resume', async () => {
    route(bidding);
    const { unmount } = render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
    await waitFor(() => expectPost('/api/auction/pause'));
    unmount();

    fetchJsonApi.mockReset();
    route({ ...bidding, paused: true });
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Resume' }));
    await waitFor(() => expectPost('/api/auction/resume'));
  });

  it('Undo last sale calls /undo-finish, with no confirm; disabled when nothing has sold', async () => {
    route(bidding);
    const { unmount } = render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Undo last sale' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expectPost('/api/auction/undo-finish'));
    unmount();

    route({ ...bidding, log: bidding.log.filter(e => e.type !== 'WIN') });
    render(<Harness />);
    expect((await screen.findByRole('button', { name: 'Undo last sale' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('More toggles an inline panel (no dialog) with the three rows', async () => {
    route(bidding);
    render(<Harness />);
    const more = await screen.findByRole('button', { name: 'More ›' });
    expect(screen.queryByRole('link', { name: /Give a player to a team/ })).toBeNull();
    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('link', { name: /Give a player to a team/ })).toBeTruthy();
    expect(screen.getByText('For a sale that went wrong')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Skip this team's turn/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /End the auction/ })).toBeTruthy();
    expect(screen.getByText('Asks you to confirm')).toBeTruthy();
    fireEvent.click(more);
    expect(screen.queryByRole('link', { name: /Give a player to a team/ })).toBeNull();
  });

  it('Give a player to a team goes to /auction/assign', async () => {
    route(bidding);
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'More ›' }));
    fireEvent.click(screen.getByRole('link', { name: /Give a player to a team/ }));
    expect(await screen.findByText('ASSIGN PAGE')).toBeTruthy();
  });

  it('Skip is disabled while bidding and calls /skip-turn while nominating', async () => {
    route(bidding);
    const { unmount } = render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'More ›' }));
    expect((screen.getByRole('button', { name: /Skip this team's turn/ }) as HTMLButtonElement).disabled).toBe(true);
    unmount();

    route(nominating);
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'More ›' }));
    const skip = screen.getByRole('button', { name: /Skip this team's turn/ }) as HTMLButtonElement;
    expect(skip.disabled).toBe(false);
    fireEvent.click(skip);
    await waitFor(() => expectPost('/api/auction/skip-turn'));
  });

  it('End the auction asks to confirm; cancel sends nothing; confirm calls /complete', async () => {
    route(bidding);
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'More ›' }));
    fireEvent.click(screen.getByRole('button', { name: /End the auction/ }));
    let dialog = screen.getByRole('dialog');
    expect(calls('/api/auction/complete')).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls('/api/auction/complete')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /End the auction/ }));
    dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'End the auction' }));
    await waitFor(() => expectPost('/api/auction/complete'));
  });

  it('a server error shows inline in the bar', async () => {
    route(bidding, { path: '/api/auction/pause', message: 'Commissioner or admin only' });
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
    const bar = screen.getByRole('group', { name: 'Commissioner controls' });
    expect((await within(bar).findByRole('alert')).textContent).toContain('Commissioner or admin only');
  });
});

describe('Commissioner controls · desktop', () => {
  beforeEach(() => setPhone(false));

  it('one bar with every control; Skip turn only while nominating', async () => {
    route(bidding);
    render(<Harness />);
    const bar = await screen.findByRole('group', { name: 'Commissioner controls' });
    expect(within(bar).getByText('Commissioner')).toBeTruthy();
    for (const name of ['Pause', 'Undo last sale', 'Skip turn', 'End auction']) {
      expect(within(bar).getByRole('button', { name })).toBeTruthy();
    }
    expect(within(bar).getByRole('link', { name: 'Give a player to a team' }).getAttribute('href')).toBe('/auction/assign');
    expect((within(bar).getByRole('button', { name: 'Skip turn' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'More ›' })).toBeNull();
  });

  it('End auction confirms before /complete', async () => {
    route(nominating);
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'End auction' }));
    expect(calls('/api/auction/complete')).toHaveLength(0);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'End the auction' }));
    await waitFor(() => expectPost('/api/auction/complete'));
  });

  it('Last sales lists sales newest first, Undo only on the newest row', async () => {
    route(bidding);
    render(<Harness />);
    const list = await screen.findByTestId('last-sales');
    const rows = within(list).getAllByTestId('last-sale');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Paul Skenes')).toBeTruthy();
    expect(within(rows[0]).getByText('Black Sox · $41')).toBeTruthy();
    expect(within(rows[1]).getByText('Bryce Harper')).toBeTruthy();
    expect(within(rows[1]).getByText('Los Doyers · $30')).toBeTruthy();
    expect(within(rows[0]).getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(within(rows[1]).queryByRole('button', { name: 'Undo' })).toBeNull();
    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expectPost('/api/auction/undo-finish'));
  });

  it('Last sales shows at most five', async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      type: 'WIN' as const, teamId: 1, teamName: 'Los Doyers', playerName: `Player ${i}`, amount: i + 1, timestamp: 100 - i, message: 'w',
    }));
    route({ ...nominating, log: many });
    render(<Harness />);
    const list = await screen.findByTestId('last-sales');
    expect(within(list).getAllByTestId('last-sale')).toHaveLength(5);
    expect(within(list).getByText('Player 0')).toBeTruthy();
  });
});
