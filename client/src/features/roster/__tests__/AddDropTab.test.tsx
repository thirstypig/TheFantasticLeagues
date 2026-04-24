import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import AddDropTab from '../components/AddDropTab';
import type { PlayerSeasonStat } from '../../../api';

// Keep the test hermetic — the component reaches out to the league context,
// a watchlist API, and a player-period-stats API. None of those are under
// test here; mock them to steady state so the render is driven only by the
// `players` prop.
vi.mock('../../../contexts/LeagueContext', () => ({
  useLeague: () => ({ leagueId: 20, myTeamId: 147, outfieldMode: 'of', seasonStatus: 'IN_SEASON', leagues: [], leagueRules: {} }),
}));

vi.mock('../../watchlist/hooks/useMyWatchlist', () => ({
  useMyWatchlist: () => ({ watchedIds: new Set(), pendingIds: new Set(), toggle: vi.fn(), canWatch: false }),
}));

vi.mock('../../../api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../api');
  return {
    ...actual,
    getPlayerPeriodStats: vi.fn().mockResolvedValue([]),
    fmtRate: (v: number) => String(v ?? 0),
  };
});

function makePlayer(i: number, overrides: Partial<PlayerSeasonStat> = {}): PlayerSeasonStat {
  // Zero-padded so lexical sort (AddDropTab sorts by getLastName ASC by
  // default) matches numeric order — "Player 01" < "Player 02" < ...
  // Otherwise "Player 10" sorts before "Player 2" and the first 15 rows are
  // not [1..15]. That would pass the cap-count assertions but break the
  // "Player 16 is absent" assertion.
  const pad = String(i).padStart(2, '0');
  return {
    row_id: `row-${pad}`,
    id: i,
    mlb_id: String(1000 + i),
    player_name: `Player ${pad}`,
    mlb_full_name: `Player ${pad}`,
    positions: '2B',
    mlb_team: 'LAD',
    is_pitcher: false,
    R: 0, HR: 0, RBI: 0, SB: 0, AVG: 0,
    ogba_team_code: undefined,
    team: undefined,
    ...overrides,
  } as unknown as PlayerSeasonStat;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AddDropTab row cap', () => {
  it('renders only the first 15 players when the filtered list is large', () => {
    // 30 free agents — twice the cap so the slice is unambiguous.
    const players = Array.from({ length: 30 }, (_, i) => makePlayer(i + 1));

    render(
      <AddDropTab
        players={players}
        onClaim={vi.fn()}
        onDrop={vi.fn()}
      />
    );

    // Each row renders its player name exactly once — count those to count rows.
    // Players 01..15 show; 16..30 are sliced off.
    for (let i = 1; i <= 15; i++) {
      const pad = String(i).padStart(2, '0');
      expect(screen.getAllByText(`Player ${pad}`).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText('Player 16')).toBeNull();
    expect(screen.queryByText('Player 30')).toBeNull();
  });

  it('renders the "Showing 15 of N" footer when the list exceeds the cap', () => {
    const players = Array.from({ length: 30 }, (_, i) => makePlayer(i + 1));

    render(
      <AddDropTab
        players={players}
        onClaim={vi.fn()}
      />
    );

    const footer = screen.getByTestId('add-drop-row-cap-footer');
    expect(footer.textContent).toMatch(/Showing\s*15\s*of\s*30\s*players/);
  });

  it('does not render the cap footer when the list fits under the cap', () => {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(i + 1));

    render(
      <AddDropTab
        players={players}
        onClaim={vi.fn()}
      />
    );

    expect(screen.queryByTestId('add-drop-row-cap-footer')).toBeNull();
    // All 10 still render
    for (let i = 1; i <= 10; i++) {
      const pad = String(i).padStart(2, '0');
      expect(screen.getAllByText(`Player ${pad}`).length).toBeGreaterThan(0);
    }
  });
});
