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
const pageData = vi.fn();
vi.mock('../../hooks/useAuctionPageData', () => ({ useAuctionPageData: () => pageData() }));

import AssignPlayer from '../AssignPlayer';
import type { ClientAuctionState, AuctionTeam } from '../../hooks/useAuctionState';
import type { PlayerSeasonStat } from '../../../../api';

const team = (id: number, name: string, budget: number, maxBid: number, spotsLeft: number, roster: AuctionTeam['roster'] = []): AuctionTeam =>
  ({ id, name, code: name.slice(0, 3).toUpperCase(), budget, maxBid, rosterCount: 4 - spotsLeft, spotsLeft, roster });

const state: ClientAuctionState = {
  leagueId: 20,
  status: 'bidding',
  nomination: {
    playerId: '682829', playerName: 'Elly De La Cruz', playerTeam: 'CIN', positions: 'SS', isPitcher: false,
    nominatorTeamId: 3, currentBid: 34, highBidderTeamId: 2,
    endTime: new Date(Date.now() + 9000).toISOString(), timerDuration: 15, status: 'running',
  },
  teams: [
    team(1, 'Los Doyers', 69, 61, 4),
    team(2, 'Skunk Dogs', 88, 80, 3, [{ id: 9, playerId: 9, mlbId: 547180, playerName: 'Bryce Harper', price: 30 }]),
    team(3, 'Black Sox', 0, 0, 0),
  ],
  queue: [3, 1, 2],
  queueIndex: 0,
  paused: false,
  nominationEndTime: null,
  config: { bidTimer: 15, nominationTimer: 30, rosterSize: 4 },
  log: [],
  lastUpdate: 0,
};

const players = [
  { mlb_id: '694973', player_name: 'Paul Skenes', positions: 'SP', is_pitcher: true, mlb_team: 'PIT', dollar_value: 38 },
  { mlb_id: '547180', player_name: 'Bryce Harper', positions: '1B', mlb_team: 'PHI', dollar_value: 30 },
  { mlb_id: '682829', player_name: 'Elly De La Cruz', positions: 'SS', mlb_team: 'CIN', value: 36 },
  { mlb_id: '665742', player_name: 'Juan Soto', positions: 'RF', mlb_team: 'NYM', dollar_value: 40 },
] as PlayerSeasonStat[];

function route(fail?: string) {
  fetchJsonApi.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/auction/state')) return state;
    if (fail && url.startsWith('/api/auction/force-assign')) throw new Error(fail);
    return {};
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/auction/assign']}>
      <Routes>
        <Route path="/auction/assign" element={<AssignPlayer />} />
        <Route path="/auction" element={<p>AUCTION PAGE</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const calls = (path: string) => fetchJsonApi.mock.calls.filter(([u]) => String(u).startsWith(path));

beforeEach(() => {
  fetchJsonApi.mockReset();
  pageData.mockReturnValue({ leagueId: 20, players, myTeamId: 1, isCommissioner: true, loading: false });
});

describe('AssignPlayer (/auction/assign)', () => {
  it('non-commissioners see "Commissioner only" and a link back', async () => {
    pageData.mockReturnValue({ leagueId: 20, players, myTeamId: 1, isCommissioner: false, loading: false });
    route();
    renderPage();
    expect(await screen.findByText('Commissioner only')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Give player/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Back to the auction/ }).getAttribute('href')).toBe('/auction');
  });

  it('search lists only available players (not rostered, not the player up for bid)', async () => {
    route();
    renderPage();
    const search = await screen.findByRole('searchbox', { name: 'Search players' });
    const results = screen.getByTestId('assign-results');
    expect(within(results).getByText('Juan Soto')).toBeTruthy();
    expect(within(results).getByText('Paul Skenes')).toBeTruthy();
    expect(within(results).queryByText('Bryce Harper')).toBeNull();
    expect(within(results).queryByText('Elly De La Cruz')).toBeNull();
    fireEvent.change(search, { target: { value: 'sot' } });
    expect(within(results).getByText('Juan Soto')).toBeTruthy();
    expect(within(results).queryByText('Paul Skenes')).toBeNull();
  });

  it('teams show money and spots; a full team cannot be picked', async () => {
    route();
    renderPage();
    const teams = await screen.findByRole('group', { name: 'Team' });
    expect(within(teams).getByText('$69 left · 4 spots')).toBeTruthy();
    expect(within(teams).getByText('$88 left · 3 spots')).toBeTruthy();
    expect((within(teams).getByRole('button', { name: /Black Sox/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('validates inline: player, team, whole number, at least $1, at most the team max bid', async () => {
    route();
    renderPage();
    const submit = await screen.findByRole('button', { name: 'Give player to team' });
    fireEvent.click(submit);
    expect(screen.getByRole('alert').textContent).toBe('Pick a player');

    fireEvent.click(screen.getByRole('button', { name: /Juan Soto/ }));
    fireEvent.click(submit);
    expect(screen.getByRole('alert').textContent).toBe('Pick a team');

    fireEvent.click(within(screen.getByRole('group', { name: 'Team' })).getByRole('button', { name: /Los Doyers/ }));
    const price = screen.getByRole('textbox', { name: 'Price' });
    for (const [v, msg] of [['2.5', 'Enter a whole number'], ['abc', 'Enter a whole number'], ['0', 'Price must be at least $1'], ['62', 'Los Doyers can spend up to $61']]) {
      fireEvent.change(price, { target: { value: v } });
      fireEvent.click(submit);
      expect(screen.getByRole('alert').textContent).toBe(msg);
    }
    expect(calls('/api/auction/force-assign')).toHaveLength(0);
  });

  it('submits /force-assign with the schema body, then goes back to /auction', async () => {
    route();
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Juan Soto/ }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Team' })).getByRole('button', { name: /Skunk Dogs/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Price' }), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Give player to team' }));
    expect(await screen.findByText('AUCTION PAGE')).toBeTruthy();
    const c = calls('/api/auction/force-assign');
    expect(c).toHaveLength(1);
    expect(c[0][1].method).toBe('POST');
    expect(JSON.parse(c[0][1].body)).toEqual({
      leagueId: 20, teamId: 2, playerId: '665742', playerName: 'Juan Soto', price: 12,
      positions: 'RF', team: 'NYM', isPitcher: false,
    });
  });

  it('shows the server error inline and stays on the page', async () => {
    route('Player already on a roster');
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Paul Skenes/ }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Team' })).getByRole('button', { name: /Los Doyers/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Price' }), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Give player to team' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Player already on a roster'));
    expect(screen.queryByText('AUCTION PAGE')).toBeNull();
  });
});
