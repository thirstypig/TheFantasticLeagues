export type AuctionStatus = "not_started" | "nominating" | "bidding" | "paused" | "completed";

export interface AuctionTeam {
  id: number;
  name: string;
  code: string;
  budget: number;       // Remaining budget
  maxBid: number;       // Calculated max bid
  rosterCount: number;  // Players on roster
  spotsLeft: number;
  pitcherCount: number;
  hitterCount: number;
  positionCounts: Record<string, number>; // e.g. { C: 2, OF: 3, ... }
  roster: { playerId: number; price: number; assignedPosition?: string | null }[];
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
  type: 'NOMINATION' | 'BID' | 'WIN' | 'PAUSE' | 'RESUME' | 'UNDO';
  teamId?: number;
  teamName?: string;
  playerId?: string;
  playerName?: string;
  amount?: number;
  timestamp: number;
  message: string;
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

  config: {
    bidTimer: number;
    nominationTimer: number;
    budgetCap: number;
    rosterSize: number;
    pitcherCount: number;
    batterCount: number;
    positionLimits: Record<string, number> | null;
  };

  log: AuctionLogEvent[];

  lastUpdate: number;
}
