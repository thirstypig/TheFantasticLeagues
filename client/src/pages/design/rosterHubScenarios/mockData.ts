// client/src/pages/design/rosterHubScenarios/mockData.ts
//
// Shared mock data + helpers for the four roster-hub deferred design
// scenarios (Hub mutations / FA add-drop / IL management / Complex
// batch). Pure preview state — NO backend calls, NO Prisma reads.
//
// Two of the original 14 hitters are flagged IL-eligible via
// `mlbStatus` so the IL-stash demos work. One pre-existing IL player
// (Yamamoto) sits in the IL section so the activate demo works. The
// FA pool is a fixed ~30-player set with mix of positions and mock
// projected dollar values.

import type { RosterHubPlayer } from "../../../features/teams/components/RosterHub";

/** Augmented player carrying optional preview-only fields.
 *
 * NOTE: uses `type` + intersection rather than `interface extends` because
 * `RosterHubPlayer` is a discriminated union — `interface extends`
 * collapses the union into the base only, dropping the per-variant
 * property access. Type intersection preserves the union narrowing.
 */
export type PreviewPlayer = RosterHubPlayer & {
  /** Real MLB API status string, e.g. "Injured 10-Day". Drives IL badge. */
  mlbStatus?: string;
  /** Mock projected dollar value (used by FA pool). */
  projectedValue?: number;
};

/** Active hitters — 14 slots; #4 (Trea) and #11 (Soto) are IL-eligible. */
export const INITIAL_HITTERS: PreviewPlayer[] = [
  {
    rosterId: 1, playerId: 101, name: "Will Smith", posList: "C", posPrimary: "C",
    assignedSlot: "C", slotInstance: 0, mlbTeam: "LAD", isPitcher: false,
    gamesPlayedByPosition: { C: 28 },
    hitterStats: { R: 22, HR: 8, RBI: 27, SB: 0, AVG: 0.258 },
  },
  {
    rosterId: 2, playerId: 102, name: "Adley Rutschman", posList: "C", posPrimary: "C",
    assignedSlot: "C", slotInstance: 1, mlbTeam: "BAL", isPitcher: false,
    gamesPlayedByPosition: { C: 32 },
    hitterStats: { R: 24, HR: 7, RBI: 23, SB: 1, AVG: 0.272 },
  },
  {
    rosterId: 3, playerId: 103, name: "Vladimir Guerrero Jr.", posList: "1B", posPrimary: "1B",
    assignedSlot: "1B", mlbTeam: "TOR", isPitcher: false,
    gamesPlayedByPosition: { "1B": 38 },
    hitterStats: { R: 31, HR: 14, RBI: 36, SB: 0, AVG: 0.291 },
  },
  {
    rosterId: 4, playerId: 104, name: "Trea Turner", posList: "2B,SS", posPrimary: "SS",
    assignedSlot: "2B", mlbTeam: "PHI", isKeeper: true, isPitcher: false,
    gamesPlayedByPosition: { "2B": 38, SS: 12 },
    hitterStats: { R: 28, HR: 6, RBI: 19, SB: 14, AVG: 0.275 },
    mlbStatus: "Injured 10-Day",
  },
  {
    rosterId: 5, playerId: 105, name: "Alec Bohm", posList: "3B,1B", posPrimary: "3B",
    assignedSlot: "3B", mlbTeam: "PHI", isPitcher: false,
    gamesPlayedByPosition: { "3B": 35, "1B": 5 },
    hitterStats: { R: 21, HR: 9, RBI: 28, SB: 1, AVG: 0.280 },
  },
  {
    rosterId: 6, playerId: 106, name: "Bobby Witt Jr.", posList: "SS", posPrimary: "SS",
    assignedSlot: "SS", mlbTeam: "KC", isPitcher: false,
    gamesPlayedByPosition: { SS: 41 },
    hitterStats: { R: 33, HR: 11, RBI: 24, SB: 18, AVG: 0.301 },
  },
  {
    rosterId: 7, playerId: 107, name: "Marcus Semien", posList: "2B", posPrimary: "2B",
    assignedSlot: "MI", mlbTeam: "TEX", isPitcher: false,
    gamesPlayedByPosition: { "2B": 40 },
    hitterStats: { R: 26, HR: 10, RBI: 22, SB: 9, AVG: 0.244 },
  },
  {
    rosterId: 8, playerId: 108, name: "Pete Alonso", posList: "1B", posPrimary: "1B",
    assignedSlot: "CM", mlbTeam: "NYM", isPitcher: false,
    gamesPlayedByPosition: { "1B": 39 },
    hitterStats: { R: 24, HR: 13, RBI: 32, SB: 0, AVG: 0.247 },
  },
  {
    rosterId: 9, playerId: 109, name: "Mookie Betts", posList: "OF,2B", posPrimary: "OF",
    assignedSlot: "OF", slotInstance: 0, mlbTeam: "LAD", isKeeper: true, isPitcher: false,
    gamesPlayedByPosition: { OF: 47, "2B": 8 },
    hitterStats: { R: 38, HR: 12, RBI: 26, SB: 5, AVG: 0.302 },
  },
  {
    rosterId: 10, playerId: 110, name: "Aaron Judge", posList: "OF", posPrimary: "OF",
    assignedSlot: "OF", slotInstance: 1, mlbTeam: "NYY", isPitcher: false,
    gamesPlayedByPosition: { OF: 44 },
    hitterStats: { R: 35, HR: 18, RBI: 41, SB: 1, AVG: 0.284 },
  },
  {
    rosterId: 11, playerId: 111, name: "Juan Soto", posList: "OF", posPrimary: "OF",
    assignedSlot: "OF", slotInstance: 2, mlbTeam: "NYM", isPitcher: false,
    gamesPlayedByPosition: { OF: 42 },
    hitterStats: { R: 32, HR: 14, RBI: 31, SB: 4, AVG: 0.311 },
    mlbStatus: "Injured 60-Day",
  },
  {
    rosterId: 12, playerId: 112, name: "Kyle Tucker", posList: "OF", posPrimary: "OF",
    assignedSlot: "OF", slotInstance: 3, mlbTeam: "CHC", isPitcher: false,
    gamesPlayedByPosition: { OF: 39 },
    hitterStats: { R: 27, HR: 11, RBI: 28, SB: 6, AVG: 0.288 },
  },
  {
    rosterId: 13, playerId: 113, name: "Corbin Carroll", posList: "OF", posPrimary: "OF",
    assignedSlot: "OF", slotInstance: 4, mlbTeam: "ARI", isPitcher: false,
    gamesPlayedByPosition: { OF: 41 },
    hitterStats: { R: 30, HR: 7, RBI: 18, SB: 22, AVG: 0.262 },
  },
  {
    rosterId: 14, playerId: 114, name: "Shohei Ohtani", posList: "DH", posPrimary: "DH",
    assignedSlot: "DH", mlbTeam: "LAD", isKeeper: true, isPitcher: false,
    gamesPlayedByPosition: {},
    hitterStats: { R: 41, HR: 19, RBI: 38, SB: 7, AVG: 0.299 },
  },
];

/** 9 active pitchers. */
export const INITIAL_PITCHERS: PreviewPlayer[] = [
  {
    rosterId: 15, playerId: 115, name: "Tarik Skubal", posList: "SP", posPrimary: "SP",
    assignedSlot: "P", slotInstance: 0, mlbTeam: "DET", isPitcher: true,
    gamesPlayedByPosition: { P: 9 },
    pitcherStats: { IP: 56.2, W: 7, SV: 0, K: 78, ERA: 2.41, WHIP: 0.98 },
  },
  {
    rosterId: 16, playerId: 116, name: "Paul Skenes", posList: "SP", posPrimary: "SP",
    assignedSlot: "P", slotInstance: 1, mlbTeam: "PIT", isPitcher: true,
    gamesPlayedByPosition: { P: 8 },
    pitcherStats: { IP: 52.1, W: 6, SV: 0, K: 82, ERA: 2.05, WHIP: 0.94 },
  },
  {
    rosterId: 17, playerId: 117, name: "Logan Gilbert", posList: "SP", posPrimary: "SP",
    assignedSlot: "P", slotInstance: 2, mlbTeam: "SEA", isPitcher: true,
    gamesPlayedByPosition: { P: 9 },
    pitcherStats: { IP: 58.0, W: 5, SV: 0, K: 64, ERA: 3.02, WHIP: 1.12 },
  },
  {
    rosterId: 18, playerId: 118, name: "Zack Wheeler", posList: "SP", posPrimary: "SP",
    assignedSlot: "P", slotInstance: 3, mlbTeam: "PHI", isPitcher: true,
    gamesPlayedByPosition: { P: 9 },
    pitcherStats: { IP: 60.1, W: 7, SV: 0, K: 71, ERA: 2.68, WHIP: 1.04 },
  },
  {
    rosterId: 19, playerId: 119, name: "Corbin Burnes", posList: "SP", posPrimary: "SP",
    assignedSlot: "P", slotInstance: 4, mlbTeam: "ARI", isPitcher: true,
    gamesPlayedByPosition: { P: 8 },
    pitcherStats: { IP: 50.0, W: 4, SV: 0, K: 56, ERA: 3.21, WHIP: 1.15 },
  },
  {
    rosterId: 20, playerId: 120, name: "Spencer Strider", posList: "SP", posPrimary: "SP",
    assignedSlot: "P", slotInstance: 5, mlbTeam: "ATL", isPitcher: true,
    gamesPlayedByPosition: { P: 9 },
    pitcherStats: { IP: 55.2, W: 6, SV: 0, K: 88, ERA: 2.86, WHIP: 1.02 },
  },
  {
    rosterId: 21, playerId: 121, name: "Edwin Díaz", posList: "RP", posPrimary: "RP",
    assignedSlot: "P", slotInstance: 6, mlbTeam: "NYM", isPitcher: true,
    gamesPlayedByPosition: { P: 22 },
    pitcherStats: { IP: 22.0, W: 1, SV: 14, K: 31, ERA: 2.10, WHIP: 0.95 },
  },
  {
    rosterId: 22, playerId: 122, name: "Emmanuel Clase", posList: "RP", posPrimary: "RP",
    assignedSlot: "P", slotInstance: 7, mlbTeam: "CLE", isPitcher: true,
    gamesPlayedByPosition: { P: 24 },
    pitcherStats: { IP: 24.1, W: 2, SV: 18, K: 27, ERA: 1.78, WHIP: 0.88 },
  },
  {
    rosterId: 23, playerId: 123, name: "Mason Miller", posList: "RP", posPrimary: "RP",
    assignedSlot: "P", slotInstance: 8, mlbTeam: "ATH", isPitcher: true,
    gamesPlayedByPosition: { P: 21 },
    pitcherStats: { IP: 21.0, W: 1, SV: 12, K: 35, ERA: 2.04, WHIP: 0.93 },
  },
];

/** One pre-existing IL player so the activate demo has an occupant. */
export const INITIAL_IL: PreviewPlayer[] = [
  {
    rosterId: 24, playerId: 124, name: "Yoshinobu Yamamoto", posList: "SP", posPrimary: "SP",
    assignedSlot: "IL", slotInstance: 0, mlbTeam: "LAD", isPitcher: true,
    gamesPlayedByPosition: { P: 7 },
    pitcherStats: { IP: 41.0, W: 3, SV: 0, K: 49, ERA: 2.96, WHIP: 1.06 },
    mlbStatus: "Injured 15-Day",
  },
];

/** Free agent pool — ~30 players, mix of positions, mock projected $. */
export const FREE_AGENTS: PreviewPlayer[] = [
  // Catchers (3)
  { rosterId: -1, playerId: 201, name: "Salvador Perez", posList: "C,1B", posPrimary: "C",
    assignedSlot: "C", mlbTeam: "KC", isPitcher: false,
    gamesPlayedByPosition: { C: 28, "1B": 8 },
    hitterStats: { R: 18, HR: 9, RBI: 24, SB: 0, AVG: 0.265 },
    projectedValue: 14 },
  { rosterId: -2, playerId: 202, name: "Cal Raleigh", posList: "C", posPrimary: "C",
    assignedSlot: "C", mlbTeam: "SEA", isPitcher: false,
    gamesPlayedByPosition: { C: 35 },
    hitterStats: { R: 19, HR: 10, RBI: 22, SB: 0, AVG: 0.236 },
    projectedValue: 12 },
  { rosterId: -3, playerId: 203, name: "Yainer Diaz", posList: "C", posPrimary: "C",
    assignedSlot: "C", mlbTeam: "HOU", isPitcher: false,
    gamesPlayedByPosition: { C: 26 },
    hitterStats: { R: 16, HR: 6, RBI: 18, SB: 0, AVG: 0.279 },
    projectedValue: 6 },

  // Corner/Middle infielders (8)
  { rosterId: -4, playerId: 204, name: "Matt Olson", posList: "1B", posPrimary: "1B",
    assignedSlot: "1B", mlbTeam: "ATL", isPitcher: false,
    gamesPlayedByPosition: { "1B": 41 },
    hitterStats: { R: 28, HR: 12, RBI: 30, SB: 0, AVG: 0.251 },
    projectedValue: 22 },
  { rosterId: -5, playerId: 205, name: "Spencer Steer", posList: "1B,3B,OF", posPrimary: "1B",
    assignedSlot: "1B", mlbTeam: "CIN", isPitcher: false,
    gamesPlayedByPosition: { "1B": 14, "3B": 12, OF: 9 },
    hitterStats: { R: 20, HR: 7, RBI: 22, SB: 4, AVG: 0.254 },
    projectedValue: 9 },
  { rosterId: -6, playerId: 206, name: "Gleyber Torres", posList: "2B", posPrimary: "2B",
    assignedSlot: "2B", mlbTeam: "DET", isPitcher: false,
    gamesPlayedByPosition: { "2B": 38 },
    hitterStats: { R: 22, HR: 6, RBI: 18, SB: 4, AVG: 0.259 },
    projectedValue: 11 },
  { rosterId: -7, playerId: 207, name: "Brendan Donovan", posList: "2B,3B,OF", posPrimary: "2B",
    assignedSlot: "2B", mlbTeam: "STL", isPitcher: false,
    gamesPlayedByPosition: { "2B": 22, "3B": 8, OF: 10 },
    hitterStats: { R: 25, HR: 4, RBI: 16, SB: 3, AVG: 0.291 },
    projectedValue: 8 },
  { rosterId: -8, playerId: 208, name: "Willy Adames", posList: "SS", posPrimary: "SS",
    assignedSlot: "SS", mlbTeam: "SF", isPitcher: false,
    gamesPlayedByPosition: { SS: 39 },
    hitterStats: { R: 24, HR: 9, RBI: 26, SB: 5, AVG: 0.244 },
    projectedValue: 15 },
  { rosterId: -9, playerId: 209, name: "Junior Caminero", posList: "3B", posPrimary: "3B",
    assignedSlot: "3B", mlbTeam: "TB", isPitcher: false,
    gamesPlayedByPosition: { "3B": 36 },
    hitterStats: { R: 21, HR: 11, RBI: 25, SB: 2, AVG: 0.262 },
    projectedValue: 13 },
  { rosterId: -10, playerId: 210, name: "Jordan Westburg", posList: "2B,3B", posPrimary: "3B",
    assignedSlot: "3B", mlbTeam: "BAL", isPitcher: false,
    gamesPlayedByPosition: { "3B": 24, "2B": 14 },
    hitterStats: { R: 23, HR: 8, RBI: 21, SB: 3, AVG: 0.270 },
    projectedValue: 10 },
  { rosterId: -11, playerId: 211, name: "Anthony Volpe", posList: "SS", posPrimary: "SS",
    assignedSlot: "SS", mlbTeam: "NYY", isPitcher: false,
    gamesPlayedByPosition: { SS: 41 },
    hitterStats: { R: 26, HR: 5, RBI: 17, SB: 11, AVG: 0.231 },
    projectedValue: 7 },

  // Outfielders (8)
  { rosterId: -12, playerId: 212, name: "Steven Kwan", posList: "OF", posPrimary: "OF",
    assignedSlot: "OF", mlbTeam: "CLE", isPitcher: false,
    gamesPlayedByPosition: { OF: 41 },
    hitterStats: { R: 30, HR: 3, RBI: 12, SB: 9, AVG: 0.298 },
    projectedValue: 14 },
  { rosterId: -13, playerId: 213, name: "Jackson Chourio", posList: "OF", posPrimary: "OF",
    assignedSlot: "OF", mlbTeam: "MIL", isPitcher: false,
    gamesPlayedByPosition: { OF: 38 },
    hitterStats: { R: 26, HR: 9, RBI: 22, SB: 12, AVG: 0.266 },
    projectedValue: 17 },
  { rosterId: -14, playerId: 214, name: "Jarren Duran", posList: "OF", posPrimary: "OF",
    assignedSlot: "OF", mlbTeam: "BOS", isPitcher: false,
    gamesPlayedByPosition: { OF: 42 },
    hitterStats: { R: 31, HR: 6, RBI: 19, SB: 16, AVG: 0.279 },
    projectedValue: 18 },
  { rosterId: -15, playerId: 215, name: "Lawrence Butler", posList: "OF", posPrimary: "OF",
    assignedSlot: "OF", mlbTeam: "ATH", isPitcher: false,
    gamesPlayedByPosition: { OF: 36 },
    hitterStats: { R: 22, HR: 8, RBI: 20, SB: 10, AVG: 0.255 },
    projectedValue: 11 },
  { rosterId: -16, playerId: 216, name: "Wyatt Langford", posList: "OF", posPrimary: "OF",
    assignedSlot: "OF", mlbTeam: "TEX", isPitcher: false,
    gamesPlayedByPosition: { OF: 38 },
    hitterStats: { R: 24, HR: 7, RBI: 21, SB: 9, AVG: 0.260 },
    projectedValue: 12 },
  { rosterId: -17, playerId: 217, name: "Heliot Ramos", posList: "OF", posPrimary: "OF",
    assignedSlot: "OF", mlbTeam: "SF", isPitcher: false,
    gamesPlayedByPosition: { OF: 35 },
    hitterStats: { R: 19, HR: 8, RBI: 23, SB: 4, AVG: 0.268 },
    projectedValue: 9 },
  { rosterId: -18, playerId: 218, name: "Brent Rooker", posList: "OF,DH", posPrimary: "DH",
    assignedSlot: "DH", mlbTeam: "ATH", isPitcher: false,
    gamesPlayedByPosition: { OF: 18, DH: 22 },
    hitterStats: { R: 25, HR: 13, RBI: 28, SB: 1, AVG: 0.244 },
    projectedValue: 13 },
  { rosterId: -19, playerId: 219, name: "Riley Greene", posList: "OF", posPrimary: "OF",
    assignedSlot: "OF", mlbTeam: "DET", isPitcher: false,
    gamesPlayedByPosition: { OF: 39 },
    hitterStats: { R: 26, HR: 10, RBI: 24, SB: 5, AVG: 0.282 },
    projectedValue: 16 },

  // Starting pitchers (6)
  { rosterId: -20, playerId: 220, name: "Garrett Crochet", posList: "SP", posPrimary: "SP",
    assignedSlot: "P", mlbTeam: "BOS", isPitcher: true,
    gamesPlayedByPosition: { P: 9 },
    pitcherStats: { IP: 54.0, W: 5, SV: 0, K: 75, ERA: 2.78, WHIP: 1.05 },
    projectedValue: 21 },
  { rosterId: -21, playerId: 221, name: "Hunter Brown", posList: "SP", posPrimary: "SP",
    assignedSlot: "P", mlbTeam: "HOU", isPitcher: true,
    gamesPlayedByPosition: { P: 9 },
    pitcherStats: { IP: 56.0, W: 6, SV: 0, K: 64, ERA: 2.52, WHIP: 1.01 },
    projectedValue: 19 },
  { rosterId: -22, playerId: 222, name: "Bryan Woo", posList: "SP", posPrimary: "SP",
    assignedSlot: "P", mlbTeam: "SEA", isPitcher: true,
    gamesPlayedByPosition: { P: 8 },
    pitcherStats: { IP: 50.1, W: 5, SV: 0, K: 52, ERA: 2.84, WHIP: 0.97 },
    projectedValue: 14 },
  { rosterId: -23, playerId: 223, name: "Jared Jones", posList: "SP", posPrimary: "SP",
    assignedSlot: "P", mlbTeam: "PIT", isPitcher: true,
    gamesPlayedByPosition: { P: 8 },
    pitcherStats: { IP: 47.2, W: 4, SV: 0, K: 58, ERA: 3.18, WHIP: 1.14 },
    projectedValue: 9 },
  { rosterId: -24, playerId: 224, name: "Reynaldo López", posList: "SP", posPrimary: "SP",
    assignedSlot: "P", mlbTeam: "ATL", isPitcher: true,
    gamesPlayedByPosition: { P: 9 },
    pitcherStats: { IP: 54.2, W: 5, SV: 0, K: 51, ERA: 3.04, WHIP: 1.10 },
    projectedValue: 8 },
  { rosterId: -25, playerId: 225, name: "Nestor Cortes", posList: "SP", posPrimary: "SP",
    assignedSlot: "P", mlbTeam: "MIL", isPitcher: true,
    gamesPlayedByPosition: { P: 8 },
    pitcherStats: { IP: 48.0, W: 4, SV: 0, K: 50, ERA: 3.31, WHIP: 1.16 },
    projectedValue: 6 },

  // Relievers / closers (4)
  { rosterId: -26, playerId: 226, name: "Devin Williams", posList: "RP", posPrimary: "RP",
    assignedSlot: "P", mlbTeam: "NYY", isPitcher: true,
    gamesPlayedByPosition: { P: 22 },
    pitcherStats: { IP: 22.0, W: 1, SV: 11, K: 28, ERA: 2.45, WHIP: 1.00 },
    projectedValue: 13 },
  { rosterId: -27, playerId: 227, name: "Robert Suarez", posList: "RP", posPrimary: "RP",
    assignedSlot: "P", mlbTeam: "SD", isPitcher: true,
    gamesPlayedByPosition: { P: 23 },
    pitcherStats: { IP: 22.2, W: 2, SV: 13, K: 24, ERA: 2.38, WHIP: 0.95 },
    projectedValue: 12 },
  { rosterId: -28, playerId: 228, name: "Andrés Muñoz", posList: "RP", posPrimary: "RP",
    assignedSlot: "P", mlbTeam: "SEA", isPitcher: true,
    gamesPlayedByPosition: { P: 21 },
    pitcherStats: { IP: 21.1, W: 2, SV: 10, K: 30, ERA: 2.11, WHIP: 0.93 },
    projectedValue: 11 },
  { rosterId: -29, playerId: 229, name: "Tanner Scott", posList: "RP", posPrimary: "RP",
    assignedSlot: "P", mlbTeam: "LAD", isPitcher: true,
    gamesPlayedByPosition: { P: 24 },
    pitcherStats: { IP: 23.0, W: 1, SV: 9, K: 26, ERA: 2.74, WHIP: 1.04 },
    projectedValue: 9 },

  // Utility / DH (1)
  { rosterId: -30, playerId: 230, name: "Marcell Ozuna", posList: "DH", posPrimary: "DH",
    assignedSlot: "DH", mlbTeam: "ATL", isPitcher: false,
    gamesPlayedByPosition: { DH: 38 },
    hitterStats: { R: 23, HR: 11, RBI: 27, SB: 0, AVG: 0.270 },
    projectedValue: 14 },
];

export function makeInitialRoster(): PreviewPlayer[] {
  return [...INITIAL_HITTERS, ...INITIAL_PITCHERS, ...INITIAL_IL].map((p) => ({ ...p }));
}

export function makeFreeAgents(): PreviewPlayer[] {
  return FREE_AGENTS.map((p) => ({ ...p }));
}
