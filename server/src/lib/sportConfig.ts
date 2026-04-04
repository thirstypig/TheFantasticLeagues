/**
 * Centralized sport configuration for baseball (server-side).
 * Re-exports from sports/baseball.ts for backward compatibility.
 * All baseball-specific constants now live in sports/baseball.ts.
 */

export {
  POS_ORDER,
  PITCHER_CODES,
  POSITIONS,
  positionToSlots,
  CATEGORY_CONFIG,
  KEY_TO_DB_FIELD,
  DEFAULT_RULES,
  OPENING_DAYS,
  OHTANI_MLB_ID,
  OHTANI_PITCHER_MLB_ID,
  TWO_WAY_PLAYERS,
  KEEPER_SOURCE,
  isKeeperRoster,
  isPitcher,
  baseballConfig,
} from "./sports/baseball.js";

export type { CategoryKey } from "./sports/baseball.js";

// Re-export registry for convenience
export { getSportConfig, getAllSports } from "./sports/index.js";
export type { SportConfig, PositionConfig, CategoryConfig } from "./sports/types.js";
