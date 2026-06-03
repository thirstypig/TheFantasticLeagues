// Draft Report Card API client.
//
// Pure typed wrapper around GET /api/ai/leagues/:leagueId/draft-report-card.
// Wire-shape types mirror server/src/features/ai/services/draftReportCardService.ts
// — keep in sync if either side moves.
import { fetchJsonApi, API_BASE, ApiError } from "../../api/base";

export type Checkpoint = "one_third" | "two_thirds" | "end";

export interface PlayerPick {
  playerId: number;
  mlbId: number | null;
  name: string;
  team: string;
  posPrimary: string;
  isPitcher: boolean;
  auctionPrice: number;
  compositeZ: number;
  priceZ: number;
  surplus: number;
  stats: Record<string, number>;
}

export interface TeamReport {
  teamId: number;
  teamName: string;
  teamCode: string;
  values: PlayerPick[];
  busts: PlayerPick[];
}

export interface DraftReportCard {
  leagueId: number;
  checkpoint: Checkpoint;
  checkpointLabel: string;
  periodRange: {
    firstPeriodId: number;
    lastPeriodId: number;
    firstStart: string;
    lastEnd: string;
  };
  isPreview: boolean;
  teams: TeamReport[];
  computedAt: string;
}

export interface CheckpointLocked {
  error: string;
  unlocksAt: string;
}

export async function getDraftReportCard(
  leagueId: number,
  checkpoint: Checkpoint,
): Promise<DraftReportCard | CheckpointLocked> {
  try {
    return await fetchJsonApi<DraftReportCard>(
      `${API_BASE}/ai/leagues/${leagueId}/draft-report-card?checkpoint=${checkpoint}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      const body = (err.body ?? {}) as { unlocksAt?: string; error?: string };
      return {
        error: body.error ?? "Checkpoint not yet available",
        unlocksAt: body.unlocksAt ?? "",
      };
    }
    throw err;
  }
}

export function isLocked(
  result: DraftReportCard | CheckpointLocked,
): result is CheckpointLocked {
  return "error" in result;
}
