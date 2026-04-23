/**
 * Centralized sport configuration for baseball.
 * Re-exports from sports/baseball.ts for backward compatibility.
 * All baseball-specific constants now live in sports/baseball.ts.
 */

export {
  POS_ORDER,
  POS_SCORE,
  POSITIONS,
  PITCHER_CODES,
  positionToSlots,
  SLOT_CODES,
  HITTING_CATS,
  PITCHING_CATS,
  NL_TEAMS,
  AL_TEAMS,
  OHTANI_MLB_ID,
  OHTANI_PITCHER_MLB_ID,
  resolveRealMlbId,
  isPitcher,
  getPrimaryPosition,
  sortByPosition,
  mapPosition,
  normalizePosition,
  getMlbTeamAbbr,
  fmt2,
  fmt3Avg,
  fmtRate,
  gradeColor,
  baseballConfig,
} from "./sports/baseball";

// Re-export registry for convenience
export { getSportConfig, getAllSports } from "./sports/index";
export type { SportConfig, PositionConfig, CategoryConfig } from "./sports/types";
export type { SlotCode } from "./sports/baseball";
