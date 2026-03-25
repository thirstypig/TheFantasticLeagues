// server/src/features/draft/types.ts

export type DraftStatus = "waiting" | "active" | "paused" | "completed";
export type DraftOrderType = "SNAKE" | "LINEAR";

export interface DraftConfig {
  totalRounds: number;
  secondsPerPick: number;
  orderType: DraftOrderType;
  teamOrder: number[]; // team IDs in first-round order
}

export interface DraftPickEntry {
  pickNum: number;      // 1-based overall pick number
  round: number;
  teamId: number;
  playerId: number | null;
  playerName: string | null;
  position: string | null;
  isAutoPick: boolean;
  timestamp: number;
}

export interface DraftState {
  leagueId: number;
  status: DraftStatus;
  config: DraftConfig;
  pickOrder: number[];        // full expanded pick order (team IDs for each slot)
  currentPickIndex: number;   // index into pickOrder
  picks: DraftPickEntry[];
  draftedPlayerIds: Set<number> | number[]; // serialized as array
  timerExpiresAt: number | null;  // epoch ms (server clock)
  autoPickTeams: Set<number> | number[]; // teams with auto-pick enabled
}

/** Generate the full pick order array for a snake or linear draft. */
export function generatePickOrder(teamOrder: number[], totalRounds: number, orderType: DraftOrderType): number[] {
  const order: number[] = [];
  for (let round = 0; round < totalRounds; round++) {
    if (orderType === "SNAKE" && round % 2 === 1) {
      // Reverse for even rounds (0-indexed, so round 1, 3, 5...)
      order.push(...[...teamOrder].reverse());
    } else {
      order.push(...teamOrder);
    }
  }
  return order;
}

/** Compute round number from overall pick index (0-based). */
export function pickRound(pickIndex: number, teamsCount: number): number {
  return Math.floor(pickIndex / teamsCount) + 1;
}

/** Compute pick-within-round from overall pick index (0-based). */
export function pickInRound(pickIndex: number, teamsCount: number): number {
  return (pickIndex % teamsCount) + 1;
}
