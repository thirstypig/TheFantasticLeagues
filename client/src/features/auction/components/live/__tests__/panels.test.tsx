import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('../../../../../components/shared/playerCard/PlayerCardProvider', () => ({
  PlayerLink: ({ name }: { name: string }) => <span>{name}</span>,
}));

import TeamsPanel from '../TeamsPanel';
import OrderStrip from '../OrderStrip';
import LotBids from '../LotBids';
import PlayersPanel, { availablePlayers } from '../PlayersPanel';
import { orderStrip, lotBids } from '../../../lib/auctionSelectors';
import type { AuctionTeam, ClientAuctionState } from '../../../hooks/useAuctionState';
import type { PlayerSeasonStat } from '../../../../../api';

const config: ClientAuctionState['config'] = {
  bidTimer: 15, nominationTimer: 30, rosterSize: 4, pitcherCount: 1, batterCount: 3,
  positionLimits: { C: 1, SS: 1, OF: 1 },
};
const t = (id: number, name: string, budget: number, maxBid: number, spotsLeft: number, roster: AuctionTeam['roster'] = []): AuctionTeam =>
  ({ id, name, code: name.slice(0, 3).toUpperCase(), budget, maxBid, rosterCount: 4 - spotsLeft, spotsLeft, roster });

const dogs = t(2, 'Skunk Dogs', 88, 80, 3, [{ id: 1, playerId: 1, mlbId: 11, playerName: 'Mookie Betts', posPrimary: 'SS', price: 8 }]);
const doyers = t(1, 'Los Doyers', 69, 61, 4);
const bombers = t(3, 'Bombers', 31, 26, 2, [
  { id: 2, playerId: 2, mlbId: 12, playerName: 'Will Smith', posPrimary: 'C', price: 3 },
  { id: 3, playerId: 3, mlbId: 13, playerName: 'Juan Soto', posPrimary: 'RF', price: 2 },
]);
const sox = t(4, 'Black Sox', 52, 46, 1);
const teams = [bombers, doyers, sox, dogs];

describe('TeamsPanel', () => {
  it('phone rows: name (· you), money/spots/needs line and a max chip; alert when they cannot beat the bid', () => {
    render(<TeamsPanel teams={teams} config={config} myTeamId={1} currentBid={34} variant="phone" />);
    const mine = screen.getByTestId('team-row-1');
    expect(within(mine).getByText('Los Doyers · you')).toBeTruthy();
    expect(within(mine).getByText('$69 left · 4 spots · needs C, SS, OF, P')).toBeTruthy();
    expect(within(mine).getByText('max $61')).toBeTruthy();
    const b = screen.getByTestId('team-row-3');
    expect(within(b).getByText('$31 left · 2 spots · needs SS, P')).toBeTruthy();
    expect(within(b).getByText('max $26').className).toContain('alert');
    expect(within(mine).getByText('max $61').className).not.toContain('alert');
    expect(within(screen.getByTestId('team-row-4')).getByText(/1 spot ·/)).toBeTruthy();
    expect(screen.queryByText('Chip = most that team can bid.')).toBeNull();
  });

  it('sorts by max bid, highest first', () => {
    render(<TeamsPanel teams={teams} config={config} variant="phone" />);
    const names = screen.getAllByTestId(/team-row-/).map(r => r.getAttribute('data-testid'));
    expect(names).toEqual(['team-row-2', 'team-row-1', 'team-row-4', 'team-row-3']);
  });

  it('desktop rows use the short form and show the chip footnote', () => {
    render(<TeamsPanel teams={teams} config={config} myTeamId={1} variant="desktop" />);
    const mine = screen.getByTestId('team-row-1');
    expect(within(mine).getByText('Los Doyers')).toBeTruthy();
    expect(within(mine).getByText('$69 · 4 spots · C, SS, OF, P')).toBeTruthy();
    expect(within(mine).getByText('$61')).toBeTruthy();
    expect(screen.getByText('Chip = most that team can bid.')).toBeTruthy();
  });
});

describe('OrderStrip', () => {
  const state = { queue: [3, 1, 4, 2], queueIndex: 0, teams };

  it('phone: caption and chips read Team · now, You · next, then the rest', () => {
    render(<OrderStrip strip={orderStrip(state, 1)} variant="phone" />);
    expect(screen.getByText('Order for putting players up')).toBeTruthy();
    expect(screen.getByText('Bombers · now')).toBeTruthy();
    expect(screen.getByText('You · next').className).toContain('on');
    expect(screen.getByText('Black Sox')).toBeTruthy();
    expect(screen.getByText('Skunk Dogs')).toBeTruthy();
  });

  it('desktop: one line under Putting players up', () => {
    const { container } = render(<OrderStrip strip={orderStrip(state, 1)} variant="desktop" />);
    expect(screen.getByText('Putting players up')).toBeTruthy();
    expect(container.querySelector('.la-order')?.textContent).toBe('Bombers now · You next · Black Sox · Skunk Dogs');
  });

  it('when it is my turn the first chip reads You · now', () => {
    render(<OrderStrip strip={orderStrip({ ...state, queueIndex: 1 }, 1)} variant="phone" />);
    expect(screen.getByText('You · now')).toBeTruthy();
    expect(screen.getByText('Black Sox · next')).toBeTruthy();
  });
});

describe('LotBids', () => {
  it('lists bids after the latest nomination, newest first, with (auto)', () => {
    const log = [
      { type: 'BID' as const, teamName: 'Skunk Dogs', amount: 34, timestamp: 3, message: 'Skunk Dogs bid $34' },
      { type: 'BID' as const, teamName: 'Los Doyers', amount: 33, timestamp: 2, message: 'Los Doyers auto-bid $33' },
      { type: 'NOMINATION' as const, teamName: 'Bombers', amount: 1, timestamp: 1, message: 'nominated' },
      { type: 'BID' as const, teamName: 'Old', amount: 5, timestamp: 0, message: 'Old bid $5' },
    ];
    render(<LotBids bids={lotBids({ log })} />);
    expect(screen.getByText('Bids on this player')).toBeTruthy();
    expect(screen.getAllByText(/\$\d+/).map(e => e.textContent)).toEqual(['Skunk Dogs $34', 'Los Doyers $33 (auto)']);
  });
});

describe('PlayersPanel', () => {
  const p = (mlb_id: string, player_name: string, extra: Partial<PlayerSeasonStat> = {}) =>
    ({ mlb_id, player_name, positions: 'OF', mlb_team: 'PHI', ...extra }) as PlayerSeasonStat;
  const feed = [
    p('1', 'Low Guy', { value: 2 }),
    p('2', 'Paul Skenes', { dollar_value: 38, positions: 'SP', is_pitcher: true, mlb_team: 'PIT' }),
    p('11', 'Mookie Betts', { value: 30 }), // won in this auction
    p('3', 'Kept Player', { value: 25, ogba_team_code: 'DOY' }), // already rostered
    p('4', 'Bryce Harper', { value: 29, positions: '1B' }),
  ];

  it('lists only available players, by value, with search', () => {
    const list = availablePlayers(feed, teams);
    expect(list.map(x => x.player_name)).toEqual(['Paul Skenes', 'Bryce Harper', 'Low Guy']);
    render(<PlayersPanel players={list} myList={null} />);
    expect(screen.getByText('SP · PIT · $38')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search players'), { target: { value: 'harp' } });
    expect(screen.queryByText('Paul Skenes')).toBeNull();
    expect(screen.getByText('Bryce Harper')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /list/i })).toBeNull();
  });

  it('+ List toggles the player on my list', () => {
    const myList = { has: (id: number) => id === 4, add: vi.fn(), remove: vi.fn() };
    render(<PlayersPanel players={availablePlayers(feed, teams)} myList={myList} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Paul Skenes to your list' }));
    expect(myList.add).toHaveBeenCalledWith(2);
    const on = screen.getByRole('button', { name: 'Remove Bryce Harper from your list' });
    expect(on.textContent).toBe('On list');
    fireEvent.click(on);
    expect(myList.remove).toHaveBeenCalledWith(4);
  });
});
