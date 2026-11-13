import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const openCard = vi.fn();
vi.mock('../../../../../components/shared/playerCard/PlayerCardProvider', () => ({
  PlayerLink: ({ name, mlbId }: { name: string; mlbId?: number | null }) =>
    mlbId ? <button type="button" onClick={() => openCard(mlbId)}>{name}</button> : <span>{name}</span>,
}));

import TeamBoard from '../TeamBoard';
import type { AuctionTeam, ClientAuctionState } from '../../../hooks/useAuctionState';

const config: ClientAuctionState['config'] = {
  bidTimer: 15,
  nominationTimer: 30,
  rosterSize: 23,
  pitcherCount: 9,
  batterCount: 14,
  positionLimits: { C: 2, '1B': 1, '2B': 1, '3B': 1, SS: 1, MI: 1, CM: 1, OF: 5, DH: 1 },
};

const r = (id: number, playerName: string, posPrimary: string, price: number, mlbId: number | null = 1000 + id) =>
  ({ id, playerId: id, mlbId, playerName, posPrimary, price });

const doyers: AuctionTeam = {
  id: 1, name: 'Los Doyers', code: 'DOY', budget: 69, maxBid: 61, rosterCount: 4, spotsLeft: 19,
  roster: [r(1, 'William Contreras', 'C', 18), r(2, 'Bryce Harper', '1B', 30), r(3, 'Juan Soto', 'RF', 40), r(4, 'Paul Skenes', 'SP', 41, null)],
};
const dogs: AuctionTeam = {
  id: 2, name: 'Skunk Dogs', code: 'SKD', budget: 88, maxBid: 80, rosterCount: 1, spotsLeft: 22,
  roster: [r(5, 'Mookie Betts', 'SS', 38)],
};
const teams = [doyers, dogs];

function setPhone(isPhone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: isPhone && q.includes('max-width: 767px'),
    media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  // @ts-expect-error -- jsdom has no matchMedia by default; restore that
  delete window.matchMedia;
  openCard.mockReset();
});

describe('TeamBoard — desktop grid', () => {
  it('renders teams as columns with the Left · max row first, then each group', () => {
    setPhone(false);
    render(<TeamBoard teams={teams} config={config} mode="live" />);
    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader').map(h => h.textContent);
    expect(headers).toEqual(['Pos', 'Los Doyers', 'Skunk Dogs']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map(row => within(row).getAllByRole('cell')[0].textContent)).toEqual([
      'Left · max', 'C ×2', '1B · 2B · 3B', 'SS · MI · CM', 'OF ×5', 'DH', 'P ×9',
    ]);
    expect(within(rows[0]).getAllByRole('cell').map(c => c.textContent)).toEqual(['Left · max', '$69 · $61', '$88 · $80']);
  });

  it('fills cells with `Name price` joined by ` · ` and marks empties as open / open ×N', () => {
    setPhone(false);
    render(<TeamBoard teams={teams} config={config} mode="live" />);
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    const cRow = rows.find(row => within(row).queryAllByRole('cell')[0]?.textContent === 'C ×2')!;
    const [, doyC, dogC] = within(cRow).getAllByRole('cell');
    expect(doyC.textContent).toBe('Contreras 18 · open');
    expect(dogC.textContent).toBe('open ×2');
    const ofRow = rows.find(row => within(row).queryAllByRole('cell')[0]?.textContent === 'OF ×5')!;
    expect(within(ofRow).getAllByRole('cell')[1].textContent).toBe('Soto 40 · open ×4');
  });

  it('opens the player card from a name with an mlbId; no link without one', () => {
    setPhone(false);
    render(<TeamBoard teams={teams} config={config} mode="live" />);
    fireEvent.click(screen.getByRole('button', { name: 'Harper' }));
    expect(openCard).toHaveBeenCalledWith(1002);
    expect(screen.queryByRole('button', { name: 'Skenes' })).toBeNull();
    expect(screen.getByText('Skenes')).toBeTruthy();
  });

  it('team names are buttons with the footnote only when onTeamClick is given', () => {
    setPhone(false);
    const onTeamClick = vi.fn();
    const { rerender } = render(<TeamBoard teams={teams} config={config} mode="live" />);
    expect(screen.queryByText('Click a team name for its full roster.')).toBeNull();
    rerender(<TeamBoard teams={teams} config={config} mode="live" onTeamClick={onTeamClick} />);
    expect(screen.getByText('Click a team name for its full roster.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Skunk Dogs' }));
    expect(onTeamClick).toHaveBeenCalledWith(dogs);
  });
});

describe('TeamBoard — phone card', () => {
  it('shows chips and one team card, defaulting to my team', () => {
    setPhone(true);
    render(<TeamBoard teams={teams} config={config} mode="live" myTeamId={2} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: 'Skunk Dogs' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('$88 left')).toBeTruthy();
    expect(screen.getByText('Max bid $80 · 22 spots open')).toBeTruthy();
  });

  it('puts my team chip first, the rest in their order', () => {
    setPhone(true);
    render(<TeamBoard teams={teams} config={config} mode="live" myTeamId={teams[teams.length - 1].id} />);
    const chips = screen.getAllByRole('button').filter(b => b.className.includes('tb-chip')).map(b => b.textContent);
    const last = teams[teams.length - 1].name;
    expect(chips).toEqual([last, ...teams.slice(0, -1).map(t => t.name)]);
  });

  it('switches the card when another team chip is tapped', () => {
    setPhone(true);
    render(<TeamBoard teams={teams} config={config} mode="live" />);
    // default: first team
    expect(screen.getByText('$69 left')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Skunk Dogs' }));
    expect(screen.getByText('$88 left')).toBeTruthy();
    expect(screen.queryByText('$69 left')).toBeNull();
    expect(screen.getByRole('button', { name: 'M. Betts' })).toBeTruthy();
  });

  it('lists needs and per-group rows with `N open` / `Full`', () => {
    setPhone(true);
    const full: AuctionTeam = { ...doyers, roster: [r(1, 'William Contreras', 'C', 18), r(9, 'Will Smith', 'C', 22)] };
    render(<TeamBoard teams={[full]} config={config} mode="live" />);
    expect(screen.getByText('Needs')).toBeTruthy();
    expect(screen.getByText('1B, 2B, 3B, SS, MI, CM, OF ×5, DH, P ×9')).toBeTruthy();
    const cRow = screen.getByText('C ×2').closest('[data-group]') as HTMLElement;
    expect(within(cRow).getByText('Full')).toBeTruthy();
    expect(cRow.textContent).toContain('W. Contreras $18 · W. Smith $22');
    const ofRow = screen.getByText('OF ×5').closest('[data-group]') as HTMLElement;
    expect(within(ofRow).getByText('5 open')).toBeTruthy();
  });
});

const staff: AuctionTeam = {
  ...doyers,
  roster: [
    r(20, 'Paul Skenes', 'SP', 41), r(21, 'Zac Gallen', 'SP', 19), r(22, 'Zack Wheeler', 'SP', 30), r(23, 'Edwin Diaz', 'RP', 12),
    r(24, 'Juan Soto', 'RF', 40), r(25, 'Lourdes Gurriel Jr.', 'LF', 9), r(26, 'Brandon Nimmo', 'CF', 15),
  ],
};

describe('TeamBoard — more than 3 filled collapses to 2 + N more', () => {
  it('desktop: `Skenes 41 · Gallen 19 · 2 more · open ×5`; 3 filled all shown', () => {
    setPhone(false);
    render(<TeamBoard teams={[staff]} config={config} mode="live" />);
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    const cell = (label: string) =>
      within(rows.find(row => within(row).queryAllByRole('cell')[0]?.textContent === label)!).getAllByRole('cell')[1];
    expect(cell('P ×9').textContent).toBe('Skenes 41 · Gallen 19 · 2 more · open ×5');
    expect(cell('OF ×5').textContent).toBe('Soto 40 · Gurriel Jr. 9 · Nimmo 15 · open ×2');
    expect(screen.getByRole('button', { name: 'Gallen' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Wheeler' })).toBeNull();
  });

  it('phone: initial + last name, `2 more` expands inline', () => {
    setPhone(true);
    render(<TeamBoard teams={[staff]} config={config} mode="live" />);
    const pRow = screen.getByText('P ×9').closest('[data-group]') as HTMLElement;
    expect(pRow.querySelector('small')!.textContent).toBe('P. Skenes $41 · Z. Gallen $19 · 2 more');
    fireEvent.click(within(pRow).getByRole('button', { name: '2 more' }));
    expect(pRow.querySelector('small')!.textContent).toBe('P. Skenes $41 · Z. Gallen $19 · Z. Wheeler $30 · E. Diaz $12');
    const ofRow = screen.getByText('OF ×5').closest('[data-group]') as HTMLElement;
    expect(ofRow.querySelector('small')!.textContent).toBe('J. Soto $40 · L. Gurriel Jr. $9 · B. Nimmo $15');
  });
});
