export type AuctionStatus = "not_started" | "nominating" | "bidding" | "paused" | "completed";

export interface AuctionTeam {
  id: number;
  name: string;
  code: string;
  budget: number;       // Remaining budget
  dbBudget?: number;    // Raw DB budget (includes pre-draft trade adjustments)
  keeperSpend?: number;  // Total spent on keepers (source=prior_season)
  auctionSpend?: number; // Total spent at auction
  maxBid: number;       // Calculated max bid
  rosterCount: number;  // Players on roster
  spotsLeft: number;
  pitcherCount: number;
  hitterCount: number;
  positionCounts: Record<string, number>; // e.g. { C: 2, OF: 3, ... }
  roster: { id: number; playerId: number; mlbId: number | null; playerName: string | null; price: number; assignedPosition?: string | null; source?: string | null }[];
}

export interface NominationState {
  playerId: string;       // mlbId
  playerName: string;
  playerTeam: string;     // MLB Team
  positions: string;
  isPitcher: boolean;

  nominatorTeamId: number;

  currentBid: number;
  highBidderTeamId: number;

  endTime: string;        // ISO string for when timer expires
  timerDuration: number;
  status: 'running' | 'paused' | 'ended';
  pausedRemainingMs?: number; // If paused, how much time was left
  lotId?: number; // DB AuctionLot ID for bid tracking

  // Proxy/max bids (eBay-style) — keyed by teamId, value is max amount willing to pay.
  // PRIVATE: stripped before broadcasting to clients (each client only sees their own).
  proxyBids?: Record<number, number>;
}

export interface AuctionLogEvent {
  type: 'NOMINATION' | 'BID' | 'WIN' | 'PAUSE' | 'RESUME' | 'UNDO' | 'SKIP' | 'ASSIGN' | 'END';
  teamId?: number;
  teamName?: string;
  playerId?: string;
  playerName?: string;
  amount?: number;
  timestamp: number;
  message: string;
  /** Why a turn was skipped (SKIP only). */
  reason?: 'commissioner' | 'timeout';
  /** WIN / UNDO: the Roster row the sale created (absent on WINs logged before Task 6 fix round 1). */
  rosterId?: number;
  /** WIN: a lot won by bidding, or a commissioner force-assign (absent on older WINs). */
  saleKind?: 'lot' | 'assign';
  /** WIN: set once /undo-finish has reversed this sale. */
  undone?: boolean;
}

export interface AuctionState {
  leagueId: number;
  status: AuctionStatus;

  // The active item being auctioned
  nomination: NominationState | null;

  // Teams State (Authoritative)
  teams: AuctionTeam[];

  // Nomination Order
  queue: number[]; // Array of Team IDs
  queueIndex: number;

  /** ISO time the current team's turn clock runs out; null when no turn clock is running. */
  nominationEndTime: string | null;
  /** True between /pause and /resume, in both the nominating and bidding phases. */
  paused: boolean;

  config: {
    sport: string;
    bidTimer: number;
    nominationTimer: number;
    budgetCap: number;
    rosterSize: number;
    pitcherCount: number;
    batterCount: number;
    positionLimits: Record<string, number> | null;
  };

  log: AuctionLogEvent[];

  /**
   * Each team's private "my list" of players to put up (mlbIds, in order),
   * keyed by teamId. Used to auto-nominate when a team's turn clock runs out.
   * PRIVATE: never broadcast or returned in state payloads — see
   * `sanitizeStateForBroadcast`. Absent on states persisted before step F.
   */
  nominationLists?: Record<number, number[]>;

  lastUpdate: number;
}
