/**
 * Adapter: GET /api/auction/results (the auction-day snapshot) -> TeamBoard props.
 *
 * The snapshot's teams lack the live-only fields `spotsLeft` and `maxBid`
 * (server stateRoutes.ts /results). We derive them the same way the live state
 * does (auctionStateManager.refreshTeams + calculateMaxBid), from
 * `config.rosterSize` and the remaining budget. `positionCounts` is not
 * derived: the board infers slots from each player's position.
 */
import type { AuctionRosterEntry, AuctionTeam, ClientAuctionState } from '../hooks/useAuctionState';

export interface AuctionResultsSnapshotTeam {
  id: number;
  name: string;
  code: string;
  /** dbBudget minus everything spent (keepers + auction) */
  budget: number;
  dbBudget?: number;
  keeperSpend?: number;
  auctionSpend?: number;
  rosterCount: number;
  roster: AuctionRosterEntry[];
}

export interface AuctionResultsSnapshot {
  leagueId: number;
  status: ClientAuctionState['status'];
  config: ClientAuctionState['config'];
  teams: AuctionResultsSnapshotTeam[];
  log: ClientAuctionState['log'];
  auctionCutoff?: string;
  computedAt?: string;
}

/** Mirrors server `calculateMaxBid` (auctionStateManager.ts). */
function maxBidFor(budget: number, spots: number): number {
  if (spots <= 0) return 0;
  if (spots === 1) return budget;
  return Math.max(0, budget - (spots - 1));
}

export function snapshotToBoard(snapshot: AuctionResultsSnapshot): {
  teams: AuctionTeam[];
  config: ClientAuctionState['config'];
} {
  const rosterSize = snapshot.config.rosterSize ?? 0;
  const teams = snapshot.teams.map((t): AuctionTeam => {
    const spotsLeft = Math.max(0, rosterSize - t.rosterCount);
    return {
      id: t.id,
      name: t.name,
      code: t.code,
      budget: t.budget,
      dbBudget: t.dbBudget,
      keeperSpend: t.keeperSpend,
      auctionSpend: t.auctionSpend,
      rosterCount: t.rosterCount,
      spotsLeft,
      maxBid: maxBidFor(t.budget, spotsLeft),
      roster: t.roster,
    };
  });
  return { teams, config: snapshot.config };
}
