/**
 * C6 (UX step F final fix wave): a projected value below $1 (including
 * negative projections) renders as `$0`, never `$-12`.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('../../../../../components/shared/playerCard/PlayerCardProvider', () => ({
  PlayerLink: ({ name }: { name: string }) => <span>{name}</span>,
}));

import PlayersPanel, { formatValue } from '../PlayersPanel';
import LotHeader from '../LotHeader';
import { PutUpPanel } from '../YourTurn';
import type { AuctionTeam, NominationState } from '../../../hooks/useAuctionState';
import type { PlayerSeasonStat } from '../../../../../api';

const p = (mlb_id: string, player_name: string, extra: Partial<PlayerSeasonStat> = {}) =>
  ({ mlb_id, player_name, positions: 'SP', mlb_team: 'PIT', ...extra }) as PlayerSeasonStat;
const crow = p('700', 'Coleman Crow', { dollar_value: -12 });
const tiny = p('701', 'Tiny Value', { dollar_value: 0.6 });
const real = p('702', 'Real Value', { dollar_value: 12.4 });

const me: AuctionTeam = { id: 1, name: 'Los Doyers', code: 'LDY', budget: 69, maxBid: 61, rosterCount: 1, spotsLeft: 4, roster: [] };

describe('formatValue', () => {
  it('below $1 shows $0; otherwise whole dollars; null shows nothing', () => {
    expect(formatValue(-12)).toBe('$0');
    expect(formatValue(0.6)).toBe('$0');
    expect(formatValue(0)).toBe('$0');
    expect(formatValue(1)).toBe('$1');
    expect(formatValue(12.4)).toBe('$12');
    expect(formatValue(null)).toBe('');
  });
});

describe('value display', () => {
  it('PlayersPanel', () => {
    render(<PlayersPanel players={[real, tiny, crow]} myList={null} />);
    expect(screen.getAllByText('SP · PIT · $0')).toHaveLength(2);
    expect(screen.getByText('SP · PIT · $12')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\$-/);
  });

  it('YourTurn list', () => {
    render(
      <PutUpPanel myTeam={me} list={[700]} available={[crow, real]} paused={false} variant="desktop" onPutUp={vi.fn()} onRemove={vi.fn()} />,
    );
    const list = screen.getByTestId('my-list');
    expect(within(list).getByText('SP · value $0')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\$-/);
  });

  it('LotHeader (desktop value)', () => {
    const nom: NominationState = {
      playerId: '700', playerName: 'Coleman Crow', playerTeam: 'PIT', positions: 'SP', isPitcher: true,
      nominatorTeamId: 1, currentBid: 3, highBidderTeamId: 1,
      endTime: new Date(Date.now() + 8000).toISOString(), timerDuration: 15, status: 'running',
    };
    render(<LotHeader nomination={nom} teams={[me]} value={-12} />);
    expect(screen.getByText('SP · nominated by Los Doyers · value $0')).toBeTruthy();
  });
});
