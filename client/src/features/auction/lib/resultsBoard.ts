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

/**
 * "Ended Nov 12 · 2 sold · $567 spent" for a finished auction; null while it
 * is still running. Sold = sales not undone (keepers never went up); spent =
 * every roster price, keepers included (same numbers as the report's summary).
 */
export function resultsSubtitle(snapshot: AuctionResultsSnapshot): string | null {
  if (snapshot.status !== 'completed') return null;
  const log = snapshot.log ?? [];
  const sold = log.filter(e => e.type === 'WIN' && !e.undone).length;
  const spent = snapshot.teams.reduce((sum, t) => sum + t.roster.reduce((s, r) => s + (Number(r.price) || 0), 0), 0);
  const ends = log.filter(e => e.type === 'END').map(e => e.timestamp).filter(ts => Number.isFinite(ts) && ts > 0);
  const parts = [`${sold} sold`, `$${spent.toLocaleString('en-US')} spent`];
  if (ends.length) {
    const d = new Date(Math.max(...ends));
    parts.unshift(`Ended ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`);
  }
  return parts.join(' · ');
}
