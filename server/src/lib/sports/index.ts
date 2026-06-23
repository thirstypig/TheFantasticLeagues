/**
 * Sport registry — central access point for sport configurations.
 * Week 1-2 refactor: positionToSlots() dispatcher.
 */

import { baseballConfig, mlbPositionToSlots } from "./baseball.js";
import { nflConfig, nflPositionToSlots } from "./nfl.js";
import { nbaConfig, nbaPositionToSlots } from "./nba.js";
import type { SportConfig } from "./types.js";

const sportRegistry = new Map<string, SportConfig>();
sportRegistry.set("baseball", baseballConfig);
sportRegistry.set("nfl", nflConfig);
sportRegistry.set("nba", nbaConfig);

export function getSportConfig(sport: string = "baseball"): SportConfig {
  const config = sportRegistry.get(sport.toLowerCase());
  if (!config) throw new Error(`Unknown sport: ${sport}`);
  return config;
}

export function getAllSports(): SportConfig[] {
  return [...sportRegistry.values()];
}

/** Sport-aware position-to-slots dispatcher. Routes to the appropriate sport's implementation. */
export function getPositionToSlots(sport: string = "baseball"): (pos: string) => string[] {
  const sportLower = sport.toLowerCase();
  if (sportLower === "baseball") return mlbPositionToSlots;
  if (sportLower === "nfl") return nflPositionToSlots;
  if (sportLower === "nba") return nbaPositionToSlots;
  throw new Error(`Unknown sport: ${sport}`);
}

export type { SportConfig, PositionConfig, CategoryConfig } from "./types.js";
