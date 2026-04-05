/**
 * Rule Lock Tiers — determines which league settings can be changed
 * based on the current season status.
 *
 * Lock tiers:
 *   NEVER          — cannot be changed once the league is created (immutable after first season transition)
 *   SEASON_START   — locked once the season moves past SETUP/DRAFT → IN_SEASON
 *   DRAFT_START    — locked once the season moves past SETUP → DRAFT
 *   PLAYOFF_START  — locked once playoffs begin (future; currently treated same as ANYTIME)
 *   ANYTIME        — commissioner can change at any time
 */

export type LockTier = "NEVER" | "SEASON_START" | "DRAFT_START" | "PLAYOFF_START" | "ANYTIME";

/**
 * Mapping of league setting fields to their lock tier.
 * Only fields listed here are subject to locking; unlisted fields are always editable.
 */
export const RULE_LOCKS: Record<string, LockTier> = {
  // Format & structure — locked at season start
  scoringFormat: "SEASON_START",
  waiverType: "SEASON_START",
  faabBudget: "SEASON_START",
  faabMinBid: "SEASON_START",
  faabTiebreaker: "SEASON_START",
  conditionalClaims: "SEASON_START",
  waiverPeriodDays: "SEASON_START",
  maxTeams: "SEASON_START",
  playoffWeeks: "SEASON_START",
  playoffTeams: "SEASON_START",
  regularSeasonWeeks: "SEASON_START",
  pointsConfig: "SEASON_START",

  // Draft — locked once draft begins
  draftMode: "DRAFT_START",

  // Commissioner-editable anytime
  tradeDeadline: "ANYTIME",
  acquisitionLimit: "ANYTIME",
  processingFreq: "ANYTIME",
  rosterLockTime: "ANYTIME",
  tradeReviewPolicy: "ANYTIME",
  vetoThreshold: "ANYTIME",
  name: "ANYTIME",
  visibility: "ANYTIME",
  description: "ANYTIME",
  entryFee: "ANYTIME",
  entryFeeNote: "ANYTIME",
};

type SeasonStatus = "SETUP" | "DRAFT" | "IN_SEASON" | "COMPLETED";

/**
 * Returns true if the given field is locked for the current season status.
 */
export function isRuleLocked(field: string, seasonStatus: string | null): boolean {
  const tier = RULE_LOCKS[field];
  if (!tier) return false; // Unlisted fields are always editable

  if (tier === "ANYTIME") return false;

  const status = seasonStatus as SeasonStatus | null;

  switch (tier) {
    case "NEVER":
      // Locked once any season has started (anything beyond SETUP)
      return status !== null && status !== "SETUP";

    case "DRAFT_START":
      // Locked once status is DRAFT or later
      return status === "DRAFT" || status === "IN_SEASON" || status === "COMPLETED";

    case "SEASON_START":
      // Locked once status is IN_SEASON or COMPLETED
      return status === "IN_SEASON" || status === "COMPLETED";

    case "PLAYOFF_START":
      // Future: locked during playoffs. For now, treat as ANYTIME (not locked).
      return false;

    default:
      return false;
  }
}

/**
 * Returns all field names that are currently locked for the given season status.
 */
export function getLockedFields(seasonStatus: string | null): string[] {
  return Object.keys(RULE_LOCKS).filter((field) => isRuleLocked(field, seasonStatus));
}

/**
 * Returns a human-readable message explaining why a field is locked.
 */
export function lockMessage(field: string): string {
  const tier = RULE_LOCKS[field];
  switch (tier) {
    case "NEVER":
      return "This setting cannot be changed once the league has been created.";
    case "DRAFT_START":
      return "This setting is locked because the draft has started.";
    case "SEASON_START":
      return "This setting is locked because the season has started.";
    case "PLAYOFF_START":
      return "This setting is locked because playoffs have started.";
    default:
      return "This setting is currently locked.";
  }
}
