/**
 * Sport-agnostic type definitions for the sport registry.
 * Phase 1: Extract refactor — baseball only.
 */

export interface SportConfig {
  id: string;           // "baseball"
  name: string;         // "Fantasy Baseball"
  positions: PositionConfig[];
  categories: CategoryConfig[];
  rosterSlots: Record<string, number>;
  scoringFormats: string[];
  draftFormats: string[];
  seasonMonths: [number, number];
  dataProvider: string;
  defaultRules: Record<string, any>;
}

export interface PositionConfig {
  code: string;
  name: string;
  group: string;        // "H" for hitters, "P" for pitchers
  isMultiSlot?: boolean;
  slotEligible?: string[];
}

export interface CategoryConfig {
  id: string;
  name: string;
  group: string;        // "H" for hitting, "P" for pitching
  isLowerBetter?: boolean;
  formatFn: string;     // name of formatting function to use
}
