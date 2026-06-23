/**
 * Sport registry — central access point for sport configurations.
 * Week 1 refactor: MLB + NFL/NBA stubs.
 */

import { baseballConfig } from "./baseball.js";
import { nflConfig } from "./nfl.js";
import { nbaConfig } from "./nba.js";
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

export type { SportConfig, PositionConfig, CategoryConfig } from "./types.js";
