import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const fetchJsonApi = vi.fn();
vi.mock('../../../api/base', () => ({ API_BASE: '/api', fetchJsonApi: (...a: unknown[]) => fetchJsonApi(...a) }));
vi.mock('../../../contexts/LeagueContext', () => ({ useLeague: () => ({ leagueId: 20, myTeamId: 1 }) }));
vi.mock('../../../components/shared/playerCard/PlayerCardProvider', () => ({
  PlayerLink: ({ name }: { name: string }) => <span>{name}</span>,
}));
const auctionState = vi.fn();
vi.mock('../hooks/useAuctionState', () => ({ useAuctionState: (id: number) => auctionState(id) }));

import AuctionResults from '../pages/AuctionResults';
import AuctionBoard from '../pages/AuctionBoard';

const config = { bidTimer: 15, nominationTimer: 30, rosterSize: 3, pitcherCount: 1, batterCount: 2, positionLimits: { C: 1, OF: 1 } };
const snapshot = {
  leagueId: 20,
  status: 'completed',
  config,
  teams: [{
    id: 1, name: 'Los Doyers', code: 'DOY', budget: 9, dbBudget: 400, keeperSpend: 0, auctionSpend: 391, rosterCount: 1,
    roster: [{ id: 1, playerId: 1, mlbId: 5, playerName: 'Juan Soto', posPrimary: 'RF', posList: 'RF', mlbTeam: 'NYM', price: 40, assignedPosition: 'RF', source: 'auction_2026' }],
  }],
  log: [],
  auctionCutoff: '2026-04-02T00:00:00.000Z',
  computedAt: '2026-11-11T00:00:00.000Z',
};

beforeEach(() => { fetchJsonApi.mockReset(); auctionState.mockReset(); });

describe('/auction-results', () => {
  it('loads the snapshot, renders the board and links to grades and charts', async () => {
    fetchJsonApi.mockResolvedValue(snapshot);
    render(
      <MemoryRouter initialEntries={['/auction-results']}>
        <Routes>
          <Route path="/auction-results" element={<AuctionResults />} />
          <Route path="/auction-results/report" element={<p>REPORT PAGE</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(fetchJsonApi).toHaveBeenCalledWith('/api/auction/results?leagueId=20');
    expect(await screen.findByText('$9 · $8')).toBeTruthy(); // Left · max: 2 spots open -> 9 - 1
    expect(screen.getByText('Juan Soto')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Grades and charts ›' });
    expect(link.getAttribute('href')).toBe('/auction-results/report');
    fireEvent.click(link);
    expect(await screen.findByText('REPORT PAGE')).toBeTruthy();
  });

  it('shows no link before an auction has run', async () => {
    fetchJsonApi.mockResolvedValue({ ...snapshot, status: 'not_started' });
    render(<MemoryRouter><AuctionResults /></MemoryRouter>);
    expect(await screen.findByText(/No auction yet/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Grades and charts ›' })).toBeNull();
  });
});

describe('/auction/board', () => {
  it('renders the live board with the Screen 11 header and a link back to the auction', () => {
    auctionState.mockReturnValue({
      state: { status: 'bidding', config, teams: [{ id: 1, name: 'Los Doyers', code: 'DOY', budget: 9, maxBid: 8, rosterCount: 1, spotsLeft: 2, roster: [] }] },
      error: null,
    });
    render(<MemoryRouter><AuctionBoard /></MemoryRouter>);
    expect(auctionState).toHaveBeenCalledWith(20);
    expect(screen.getByText('Auction · team board')).toBeTruthy();
    expect(screen.getByText('Live · 2 players left to buy · updates as players are sold')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Back to the auction/ }).getAttribute('href')).toBe('/auction');
    expect(screen.getByText('Click a team name for its full roster.')).toBeTruthy();
  });
});
