import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const openCard = vi.fn();
vi.mock('../../../../../components/shared/playerCard/PlayerCardProvider', () => ({
  PlayerLink: ({ name, mlbId }: { name: string; mlbId?: number | null }) =>
    mlbId ? <button type="button" onClick={() => openCard(mlbId)}>{name}</button> : <span>{name}</span>,
}));

import LotHeader from '../LotHeader';
import { formatClock } from '../../../lib/clock';
import type { AuctionTeam, NominationState } from '../../../hooks/useAuctionState';

const team = (id: number, name: string): AuctionTeam => ({ id, name, code: name.slice(0, 3), budget: 50, maxBid: 40, rosterCount: 1, spotsLeft: 5, roster: [] });
const teams = [team(2, 'Skunk Dogs'), team(3, 'Bombers')];
const nom = (over: Partial<NominationState> = {}): NominationState => ({
  playerId: '682829', playerName: 'Elly De La Cruz', playerTeam: 'CIN', positions: 'SS', isPitcher: false,
  nominatorTeamId: 3, currentBid: 34, highBidderTeamId: 2,
  endTime: new Date(Date.now() + 8200).toISOString(), timerDuration: 15, status: 'running', ...over,
});

afterEach(() => { vi.useRealTimers(); });

describe('formatClock', () => {
  it('formats m:ss, rounds up and never goes negative', () => {
    expect(formatClock(8200)).toBe('0:09');
    expect(formatClock(75_000)).toBe('1:15');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-3000)).toBe('0:00');
  });
});

describe('LotHeader', () => {
  it('renders the Style Bible lot copy and opens the player card from the name', () => {
    render(<LotHeader nomination={nom()} teams={teams} />);
    expect(screen.getByText('SS · nominated by Bombers')).toBeTruthy();
    expect(screen.getByText('High bid')).toBeTruthy();
    expect(screen.getByRole('heading').textContent).toBe('$34 · Skunk Dogs');
    expect(screen.getByRole('timer').textContent).toBe('0:09');
    fireEvent.click(screen.getByRole('button', { name: 'Elly De La Cruz' }));
    expect(openCard).toHaveBeenCalledWith(682829);
  });

  it('adds value on desktop', () => {
    render(<LotHeader nomination={nom()} teams={teams} value={36.4} />);
    expect(screen.getByText('SS · nominated by Bombers · value $36')).toBeTruthy();
  });

  it('shows 0:00 (not hidden) once the clock has run out', () => {
    render(<LotHeader nomination={nom({ endTime: new Date(Date.now() - 2000).toISOString() })} teams={teams} />);
    expect(screen.getByRole('timer').textContent).toBe('0:00');
  });

  it('counts down', () => {
    vi.useFakeTimers();
    render(<LotHeader nomination={nom({ endTime: new Date(Date.now() + 9000).toISOString() })} teams={teams} />);
    expect(screen.getByRole('timer').textContent).toBe('0:09');
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.getByRole('timer').textContent).toBe('0:05');
  });

  it('freezes on the paused remaining time', () => {
    render(<LotHeader nomination={nom({ status: 'paused', pausedRemainingMs: 12_000, endTime: new Date(Date.now() - 60_000).toISOString() })} teams={teams} />);
    expect(screen.getByRole('timer').textContent).toBe('0:12');
  });
});
