/**
 * Sport registry — central access point for sport configurations.
 * Phase 1: Baseball only. Future sports register here.
 */

import { baseballConfig } from "./baseball";
import type { SportConfig } from "./types";

const sportRegistry = new Map<string, SportConfig>();
sportRegistry.set("baseball", baseballConfig);

export function getSportConfig(sport: string): SportConfig {
  const config = sportRegistry.get(sport);
  if (!config) throw new Error(`Unknown sport: ${sport}`);
  return config;
}

export function getAllSports(): SportConfig[] {
  return [...sportRegistry.values()];
}

export type { SportConfig, PositionConfig, CategoryConfig } from "./types";
