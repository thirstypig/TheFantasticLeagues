import { describe, it, expect } from 'vitest';
import { snapshotToBoard, type AuctionResultsSnapshot } from '../resultsBoard';

// Shape copied from server/src/features/auction/routes/stateRoutes.ts GET /results:
// teams carry id/name/code/budget (= dbBudget - total spent)/dbBudget/keeperSpend/
// auctionSpend/rosterCount/roster — and NO maxBid, spotsLeft or positionCounts.
const snapshot: AuctionResultsSnapshot = {
  leagueId: 20,
  status: 'completed',
  config: {
    bidTimer: 15,
    nominationTimer: 30,
    budgetCap: 400,
    rosterSize: 23,
    pitcherCount: 9,
    batterCount: 14,
    positionLimits: { C: 2, '1B': 1, '2B': 1, '3B': 1, SS: 1, MI: 1, CM: 1, OF: 5, DH: 1 },
  },
  teams: [
    {
      id: 1,
      name: 'Los Doyers',
      code: 'DOY',
      budget: 69,
      dbBudget: 400,
      keeperSpend: 120,
      auctionSpend: 211,
      rosterCount: 2,
      roster: [
        { id: 11, playerId: 101, mlbId: 547180, playerName: 'Bryce Harper', posPrimary: '1B', posList: '1B', mlbTeam: 'PHI', price: 30, assignedPosition: '1B', source: 'auction_2026' },
        { id: 12, playerId: 102, mlbId: 694973, playerName: 'Paul Skenes', posPrimary: 'SP', posList: 'SP', mlbTeam: 'PIT', price: 41, assignedPosition: 'SP', source: 'prior_season' },
      ],
    },
    {
      id: 2,
      name: 'Full Team',
      code: 'FUL',
      budget: 3,
      dbBudget: 400,
      keeperSpend: 0,
      auctionSpend: 397,
      rosterCount: 23,
      roster: [],
    },
  ],
  log: [],
  auctionCutoff: '2026-04-02T00:00:00.000Z',
  computedAt: '2026-11-11T00:00:00.000Z',
};

describe('snapshotToBoard', () => {
  it('passes config through and keeps team identity, budget and roster', () => {
    const { teams, config } = snapshotToBoard(snapshot);
    expect(config).toBe(snapshot.config);
    expect(teams.map(t => [t.id, t.name, t.code, t.budget])).toEqual([[1, 'Los Doyers', 'DOY', 69], [2, 'Full Team', 'FUL', 3]]);
    expect(teams[0].roster[0]).toMatchObject({ mlbId: 547180, playerName: 'Bryce Harper', posPrimary: '1B', price: 30 });
  });

  it('computes spotsLeft from config.rosterSize and maxBid with the server formula', () => {
    const [doyers, full] = snapshotToBoard(snapshot).teams;
    expect(doyers.spotsLeft).toBe(21);
    expect(doyers.maxBid).toBe(69 - 20); // budget - (spots - 1)
    expect(full.spotsLeft).toBe(0);
    expect(full.maxBid).toBe(0);
  });

  it('never goes negative and uses the whole budget for one spot', () => {
    const one = snapshotToBoard({ ...snapshot, teams: [{ ...snapshot.teams[0], rosterCount: 22, budget: 7 }] }).teams[0];
    expect(one.spotsLeft).toBe(1);
    expect(one.maxBid).toBe(7);
    const broke = snapshotToBoard({ ...snapshot, teams: [{ ...snapshot.teams[0], rosterCount: 5, budget: 3 }] }).teams[0];
    expect(broke.maxBid).toBe(0);
  });
});
