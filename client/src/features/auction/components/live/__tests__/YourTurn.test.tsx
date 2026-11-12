import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('../../../../../components/shared/playerCard/PlayerCardProvider', () => ({
  PlayerLink: ({ name }: { name: string }) => <span>{name}</span>,
}));

import YourTurn, { TurnBox, PutUpPanel } from '../YourTurn';
import { orderStrip, openingBidValidation } from '../../../lib/auctionSelectors';
import type { AuctionTeam, ClientAuctionState } from '../../../hooks/useAuctionState';
import type { PlayerSeasonStat } from '../../../../../api';

const t = (id: number, name: string, maxBid: number, spotsLeft = 3): AuctionTeam =>
  ({ id, name, code: name.slice(0, 3).toUpperCase(), budget: maxBid + 5, maxBid, rosterCount: 4 - spotsLeft, spotsLeft, roster: [] });

const doyers = t(1, 'Los Doyers', 61);
const sox = t(4, 'Black Sox', 46);
const dogs = t(2, 'Skunk Dogs', 80);
const bombers = t(3, 'Bombers', 26);

const state = (over: Partial<ClientAuctionState> = {}): ClientAuctionState => ({
  leagueId: 20,
  status: 'nominating',
  nomination: null,
  teams: [doyers, sox, dogs, bombers],
  queue: [1, 4, 2, 3],
  queueIndex: 0,
  paused: false,
  nominationEndTime: new Date(Date.now() + 22_000).toISOString(),
  config: { bidTimer: 15, nominationTimer: 30, rosterSize: 4, pitcherCount: 1, batterCount: 3, positionLimits: null },
  log: [],
  lastUpdate: 0,
  ...over,
});

const skenes = { mlb_id: '694973', player_name: 'Paul Skenes', positions: 'SP', is_pitcher: true, mlb_team: 'PIT', dollar_value: 38 } as PlayerSeasonStat;
const harper = { mlb_id: '547180', player_name: 'Bryce Harper', positions: '1B', mlb_team: 'PHI', value: 29 } as PlayerSeasonStat;
const alonso = { mlb_id: '624413', player_name: 'Pete Alonso', positions: '1B', mlb_team: 'NYM', value: 26 } as PlayerSeasonStat;

function box(s: ClientAuctionState, myTeamId: number | null = 1) {
  const strip = orderStrip(s, myTeamId);
  return render(<TurnBox state={s} strip={strip} paused={!!s.paused} />);
}

afterEach(() => vi.useRealTimers());

describe('TurnBox · who sees what', () => {
  it('my turn: Your turn, Put a player up, the clock, After you: {A}, {B}.', () => {
    box(state());
    expect(screen.getByText('Your turn')).toBeTruthy();
    expect(screen.getByText('Put a player up')).toBeTruthy();
    expect(screen.getByRole('timer').textContent).toBe('0:22');
    expect(screen.getByText('After you: Black Sox, Skunk Dogs.')).toBeTruthy();
  });

  it("I'm next: a one-line You're up next box with the turn clock", () => {
    box(state({ queueIndex: 3 })); // Bombers on the clock, Los Doyers next
    expect(screen.getByText("You're up next")).toBeTruthy();
    expect(screen.queryByText('Your turn')).toBeNull();
    expect(screen.queryByText('Put a player up')).toBeNull();
    expect(screen.getByRole('timer').textContent).toBe('0:22');
  });

  it('someone else: {Team} is choosing, with the turn clock', () => {
    box(state({ queueIndex: 1 })); // Black Sox on the clock, Skunk Dogs next
    expect(screen.getByText('Black Sox is choosing')).toBeTruthy();
    expect(screen.queryByText("You're up next")).toBeNull();
    expect(screen.getByRole('timer').textContent).toBe('0:22');
  });

  it('a commissioner without a team up sees {Team} is choosing (no on-behalf controls)', () => {
    box(state({ queueIndex: 1 }), null);
    expect(screen.getByText('Black Sox is choosing')).toBeTruthy();
  });

  it('paused: Paused instead of the clock', () => {
    box(state({ paused: true }));
    expect(screen.getByText('Your turn')).toBeTruthy();
    expect(screen.getByText('Paused')).toBeTruthy();
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('no end time (e.g. after a server restart): no clock, not a fake one', () => {
    box(state({ nominationEndTime: null }));
    expect(screen.getByText('Your turn')).toBeTruthy();
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('expired end time still shows 0:00 while the server settles the timeout', () => {
    box(state({ nominationEndTime: new Date(Date.now() - 3000).toISOString() }));
    expect(screen.getByRole('timer').textContent).toBe('0:00');
  });

  it('After you lists only one team when only one other team has spots', () => {
    box(state({ teams: [doyers, t(4, 'Black Sox', 46, 0), dogs, t(3, 'Bombers', 26, 0)] }));
    expect(screen.getByText('After you: Skunk Dogs.')).toBeTruthy();
  });
});

describe('PutUpPanel', () => {
  const panel = (over: Partial<React.ComponentProps<typeof PutUpPanel>> = {}) => {
    const onPutUp = vi.fn().mockResolvedValue(undefined);
    const onRemove = vi.fn();
    render(
      <PutUpPanel
        myTeam={doyers}
        list={[694973, 547180]}
        available={[skenes, harper, alonso]}
        paused={false}
        variant="phone"
        onPutUp={onPutUp}
        onRemove={onRemove}
        {...over}
      />,
    );
    return { onPutUp, onRemove };
  };

  it('Your list: rank, name, POS · value $v and Put up, in list order', () => {
    panel();
    const list = screen.getByTestId('my-list');
    const rows = within(list).getAllByTestId('list-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('1.')).toBeTruthy();
    expect(within(rows[0]).getByText('Paul Skenes')).toBeTruthy();
    expect(within(rows[0]).getByText('SP · value $38')).toBeTruthy();
    expect(within(rows[0]).getByRole('button', { name: 'Put up Paul Skenes' })).toBeTruthy();
    expect(within(rows[1]).getByText('2.')).toBeTruthy();
    expect(within(rows[1]).getByText('1B · value $29')).toBeTruthy();
  });

  it('drops list entries that are not available (rostered or sold) and renumbers', () => {
    panel({ list: [111, 547180], available: [skenes, harper] });
    const rows = within(screen.getByTestId('my-list')).getAllByTestId('list-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('1.')).toBeTruthy();
    expect(within(rows[0]).getByText('Bryce Harper')).toBeTruthy();
  });

  it('× removes a player from the list', () => {
    const { onRemove } = panel();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Paul Skenes from your list' }));
    expect(onRemove).toHaveBeenCalledWith(694973);
  });

  it('Put up sends the player with the opening bid (default $1)', async () => {
    const { onPutUp } = panel();
    fireEvent.click(screen.getByRole('button', { name: 'Put up Paul Skenes' }));
    await waitFor(() => expect(onPutUp).toHaveBeenCalledWith(skenes, 1));
  });

  it('opening bid is editable and used by Put up', async () => {
    const { onPutUp } = panel();
    fireEvent.change(screen.getByLabelText('Opening bid'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Put up Bryce Harper' }));
    await waitFor(() => expect(onPutUp).toHaveBeenCalledWith(harper, 5));
  });

  it.each([
    ['2.5', 'Enter a whole number'],
    ['', 'Enter a whole number'],
    ['0', 'Opening bid must be at least $1'],
    ['62', 'Your max bid is $61'],
  ])('rejects opening bid %j inline: %s', (value, message) => {
    const { onPutUp } = panel();
    fireEvent.change(screen.getByLabelText('Opening bid'), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Put up Paul Skenes' }));
    expect(screen.getByRole('alert').textContent).toBe(message);
    expect(onPutUp).not.toHaveBeenCalled();
  });

  it("shows the server's message inline when putting up fails", async () => {
    panel({ onPutUp: vi.fn().mockRejectedValue(new Error('Time is up')) });
    fireEvent.click(screen.getByRole('button', { name: 'Put up Paul Skenes' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Time is up');
  });

  it('paused: no Put up buttons anywhere', () => {
    panel({ paused: true });
    fireEvent.change(screen.getByLabelText('Search all players'), { target: { value: 'p' } });
    expect(screen.queryAllByRole('button', { name: /^Put up/ })).toHaveLength(0);
  });

  it('search all players filters available players by name, with Put up', async () => {
    const { onPutUp } = panel({ list: [] });
    expect(screen.queryByTestId('search-results')).toBeNull(); // phone: nothing until you type
    fireEvent.change(screen.getByLabelText('Search all players'), { target: { value: 'alon' } });
    const results = screen.getByTestId('search-results');
    expect(within(results).getByText('Pete Alonso')).toBeTruthy();
    expect(within(results).queryByText('Paul Skenes')).toBeNull();
    fireEvent.click(within(results).getByRole('button', { name: 'Put up Pete Alonso' }));
    await waitFor(() => expect(onPutUp).toHaveBeenCalledWith(alonso, 1));
  });

  it('search shows at most 25 results with a hint to narrow it', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      ({ mlb_id: String(1000 + i), player_name: `Player ${i}`, positions: 'OF', mlb_team: 'NYM', value: 30 - i }) as PlayerSeasonStat);
    panel({ list: [], available: many });
    fireEvent.change(screen.getByLabelText('Search all players'), { target: { value: 'player' } });
    expect(within(screen.getByTestId('search-results')).getAllByRole('button', { name: /^Put up/ })).toHaveLength(25);
    expect(screen.getByText('Search to see more.')).toBeTruthy();
  });

  it('desktop: search shows the table (Player / Team / Pos / Value) before typing', () => {
    panel({ list: [], variant: 'desktop' });
    const results = screen.getByTestId('search-results');
    for (const h of ['Player', 'Team', 'Pos', 'Value']) expect(within(results).getByRole('columnheader', { name: h })).toBeTruthy();
    const row = within(results).getByText('Bryce Harper').closest('tr')!;
    expect(within(row).getByText('PHI')).toBeTruthy();
    expect(within(row).getByText('1B')).toBeTruthy();
    expect(within(row).getByText('$29')).toBeTruthy();
  });
});

describe('YourTurn (box + panel together)', () => {
  const props = (s: ClientAuctionState, myTeamId: number | null = 1) => ({
    state: s,
    strip: orderStrip(s, myTeamId),
    paused: !!s.paused,
    myTeam: s.teams.find(x => x.id === myTeamId) ?? null,
    list: [694973],
    available: [skenes],
    variant: 'desktop' as const,
    onPutUp: vi.fn(),
    onRemove: vi.fn(),
  });

  it('my turn shows Put up; another team\'s turn or my next turn shows none', () => {
    const { rerender } = render(<YourTurn {...props(state())} />);
    expect(screen.getAllByRole('button', { name: 'Put up Paul Skenes' }).length).toBeGreaterThan(0);
    rerender(<YourTurn {...props(state({ queueIndex: 3 }))} />);
    expect(screen.getByText("You're up next")).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /^Put up/ })).toHaveLength(0);
    rerender(<YourTurn {...props(state({ queueIndex: 1 }))} />);
    expect(screen.queryAllByRole('button', { name: /^Put up/ })).toHaveLength(0);
    expect(screen.queryByText('Your list')).toBeNull();
  });
});

describe('openingBidValidation', () => {
  it('whole number from 1 to my max bid', () => {
    expect(openingBidValidation('1', { maxBid: 10 })).toEqual({ ok: true });
    expect(openingBidValidation(10, { maxBid: 10 })).toEqual({ ok: true });
    expect(openingBidValidation('11', { maxBid: 10 })).toEqual({ ok: false, message: 'Your max bid is $10' });
    expect(openingBidValidation('1.5', { maxBid: 10 })).toEqual({ ok: false, message: 'Enter a whole number' });
    expect(openingBidValidation('0', { maxBid: 10 })).toEqual({ ok: false, message: 'Opening bid must be at least $1' });
    expect(openingBidValidation('3', null)).toEqual({ ok: false, message: "You don't have a team in this league" });
  });
});

describe('Design review polish (2026-11-12)', () => {
  it("someone else, I'm later: You're up after {the team before me}.", () => {
    box(state({ queueIndex: 1 })); // Black Sox now, Skunk Dogs next, then Bombers, then me
    expect(screen.getByText('Black Sox is choosing')).toBeTruthy();
    expect(screen.getByText("You're up after Bombers.")).toBeTruthy();
  });

  it("I'm next: the box still says who is choosing", () => {
    box(state({ queueIndex: 3 }));
    expect(screen.getByText("You're up next")).toBeTruthy();
    expect(screen.getByText('Bombers is choosing.')).toBeTruthy();
  });

  it('no team of mine: no up-after line', () => {
    box(state({ queueIndex: 1 }), null);
    expect(screen.queryByText(/You're up after/)).toBeNull();
  });

  const render8 = (variant: 'phone' | 'desktop', list: number[] = []) => {
    const onPutUp = vi.fn().mockResolvedValue(undefined);
    render(<PutUpPanel myTeam={doyers} list={list} available={[skenes, harper, alonso]} paused={false} variant={variant} onPutUp={onPutUp} onRemove={vi.fn()} />);
    return onPutUp;
  };

  it('phone, empty list: best available players with Put up, and copy that says so', async () => {
    const onPutUp = render8('phone');
    expect(screen.getByText('Your list is empty. Put up one of these, or search.')).toBeTruthy();
    const sug = screen.getByTestId('suggestions');
    expect(within(sug).getAllByRole('button', { name: /^Put up/ })).toHaveLength(3);
    fireEvent.click(within(sug).getByRole('button', { name: 'Put up Paul Skenes' }));
    await waitFor(() => expect(onPutUp).toHaveBeenCalledWith(skenes, 1));
  });

  it('phone: suggestions go away once there is a list or a search', () => {
    render8('phone', [547180]);
    expect(screen.queryByTestId('suggestions')).toBeNull();
  });

  it('phone: typing a search replaces the suggestions with results', () => {
    render8('phone');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search all players' }), { target: { value: 'alon' } });
    expect(screen.queryByTestId('suggestions')).toBeNull();
    expect(within(screen.getByTestId('search-results')).getByText('Pete Alonso')).toBeTruthy();
  });

  it('desktop, empty list: keeps the + List copy and shows no suggestions (the table is already there)', () => {
    render8('desktop');
    expect(screen.getByText('Your list is empty. Add players with + List.')).toBeTruthy();
    expect(screen.queryByTestId('suggestions')).toBeNull();
  });
});
