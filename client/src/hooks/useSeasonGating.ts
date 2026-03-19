import { useMemo } from "react";
import { useLeague } from "../contexts/LeagueContext";
import type { SeasonStatus } from "../features/seasons/api";

export interface SeasonGating {
  /** Current season status, null if no season exists */
  seasonStatus: SeasonStatus | null;
  /** Can run the auction draft (DRAFT only) */
  canAuction: boolean;
  /** Can view auction results (IN_SEASON or COMPLETED) */
  canViewAuctionResults: boolean;
  /** Can propose/process trades (IN_SEASON only) */
  canTrade: boolean;
  /** Can submit/process waivers (IN_SEASON only) */
  canWaiver: boolean;
  /** Can edit league rules (SETUP only) */
  canEditRules: boolean;
  /** Can modify rosters via add/drop (IN_SEASON only) */
  canEditRosters: boolean;
  /** Can do keeper prep (SETUP with prior COMPLETED season) */
  canKeepers: boolean;
  /** Season is COMPLETED — most features read-only */
  isReadOnly: boolean;
  /** Human-readable guidance for current phase */
  phaseGuidance: string;
}

const PHASE_GUIDANCE: Record<SeasonStatus, string> = {
  SETUP: "Configure rules, teams, and periods. Advance to Draft when ready.",
  DRAFT: "Run the auction draft. Advance to In Season when complete.",
  IN_SEASON: "Season is active. Manage trades, waivers, and standings.",
  COMPLETED: "Season is complete. Start keeper prep or create next season.",
};

export function useSeasonGating(): SeasonGating {
  const { seasonStatus } = useLeague();

  return useMemo(() => {
    const s = seasonStatus;
    return {
      seasonStatus: s,
      canAuction: s === "DRAFT",
      canViewAuctionResults: s === "IN_SEASON" || s === "COMPLETED",
      canTrade: s === "IN_SEASON",
      canWaiver: s === "IN_SEASON",
      canEditRules: s === "SETUP",
      canEditRosters: s === "IN_SEASON",
      canKeepers: s === "SETUP" || s === "DRAFT",
      isReadOnly: s === "COMPLETED",
      phaseGuidance: s ? PHASE_GUIDANCE[s] : "Create a new season to get started.",
    };
  }, [seasonStatus]);
}
