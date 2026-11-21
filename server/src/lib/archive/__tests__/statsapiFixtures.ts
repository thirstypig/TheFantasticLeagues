/**
 * Real statsapi responses (fetched 2026-11-21), trimmed to the fields the
 * parsers read. Keep the shapes exact: a hand-made fixture is how the
 * traded-player double count went unnoticed.
 *
 *   pillar*      Kevin Pillar 2019 — traded Toronto → San Francisco mid-season
 *   gorzelanny*  Tom Gorzelanny — a pitcher who also bats; traded in 2009
 *   bayCareer    Jason Bay — traded in 2003, the season before his rookie year
 */
import type { StatsPerson } from "../mlbFacts.js";

export const pillarFielding2019: StatsPerson = {
  id: 607680, fullName: "Kevin Pillar", primaryPosition: {"abbreviation": "LF"},
  stats: [
    { group: {"displayName": "fielding"}, splits: [
      {"season": "2019", "numTeams": 2, "sport": {"id": 1}, "position": {"abbreviation": "CF"}, "stat": {"games": 133, "gamesPlayed": 133}},
      {"season": "2019", "team": {"id": 137, "name": "San Francisco Giants"}, "sport": {"id": 1}, "position": {"abbreviation": "CF"}, "stat": {"games": 129, "gamesPlayed": 129}},
      {"season": "2019", "team": {"id": 141, "name": "Toronto Blue Jays"}, "sport": {"id": 1}, "position": {"abbreviation": "CF"}, "stat": {"games": 4, "gamesPlayed": 4}},
      {"season": "2019", "team": {"id": 137, "name": "San Francisco Giants"}, "sport": {"id": 1}, "position": {"abbreviation": "RF"}, "stat": {"games": 27, "gamesPlayed": 27}},
    ] },
  ],
};

export const pillarLine2019: StatsPerson = {
  id: 607680, fullName: "Kevin Pillar", primaryPosition: {"abbreviation": "LF"},
  stats: [
    { group: {"displayName": "hitting"}, splits: [
      {"season": "2019", "numTeams": 2, "sport": {"id": 1}, "stat": {"gamesPlayed": 161, "atBats": 611, "plateAppearances": 645, "homeRuns": 21, "runs": 83, "rbi": 88, "stolenBases": 14, "avg": ".259", "strikeOuts": 89}},
      {"season": "2019", "team": {"id": 137, "name": "San Francisco Giants"}, "sport": {"id": 1}, "stat": {"gamesPlayed": 156, "atBats": 595, "plateAppearances": 628, "homeRuns": 21, "runs": 82, "rbi": 87, "stolenBases": 14, "avg": ".264", "strikeOuts": 86}},
      {"season": "2019", "team": {"id": 141, "name": "Toronto Blue Jays"}, "sport": {"id": 1}, "stat": {"gamesPlayed": 5, "atBats": 16, "plateAppearances": 17, "homeRuns": 0, "runs": 1, "rbi": 1, "stolenBases": 0, "avg": ".063", "strikeOuts": 3}},
    ] },
  ],
};

export const gorzelannyLine2007: StatsPerson = {
  id: 452733, fullName: "Tom Gorzelanny", primaryPosition: {"abbreviation": "P"},
  stats: [
    { group: {"displayName": "hitting"}, splits: [
      {"season": "2007", "team": {"id": 134, "name": "Pittsburgh Pirates"}, "sport": {"id": 1}, "stat": {"gamesPlayed": 32, "atBats": 63, "plateAppearances": 72, "homeRuns": 0, "runs": 1, "rbi": 3, "stolenBases": 0, "avg": ".063", "strikeOuts": 31}},
    ] },
    { group: {"displayName": "pitching"}, splits: [
      {"season": "2007", "team": {"id": 134, "name": "Pittsburgh Pirates"}, "sport": {"id": 1}, "stat": {"gamesPlayed": 32, "atBats": 783, "homeRuns": 18, "runs": 90, "stolenBases": 17, "avg": ".273", "inningsPitched": "201.2", "wins": 14, "saves": 0, "strikeOuts": 135, "era": "3.88"}},
    ] },
  ],
};

export const gorzelannyCareer: StatsPerson = {
  id: 452733, fullName: "Tom Gorzelanny", primaryPosition: {"abbreviation": "P"},
  stats: [
    { group: {"displayName": "hitting"}, splits: [
      {"season": "2005", "team": {"id": 134, "name": "Pittsburgh Pirates"}, "sport": {"id": 1}, "stat": {"gamesPlayed": 3, "atBats": 1, "plateAppearances": 2, "homeRuns": 0, "runs": 0, "rbi": 0, "stolenBases": 0, "avg": ".000", "strikeOuts": 1}},
      {"season": "2006", "team": {"id": 134, "name": "Pittsburgh Pirates"}, "sport": {"id": 1}, "stat": {"gamesPlayed": 11, "atBats": 19, "plateAppearances": 21, "homeRuns": 0, "runs": 0, "rbi": 1, "stolenBases": 0, "avg": ".000", "strikeOuts": 11}},
      {"season": "2007", "team": {"id": 134, "name": "Pittsburgh Pirates"}, "sport": {"id": 1}, "stat": {"gamesPlayed": 32, "atBats": 63, "plateAppearances": 72, "homeRuns": 0, "runs": 1, "rbi": 3, "stolenBases": 0, "avg": ".063", "strikeOuts": 31}},
      {"season": "2008", "team": {"id": 134, "name": "Pittsburgh Pirates"}, "sport": {"id": 1}, "stat": {"gamesPlayed": 21, "atBats": 28, "plateAppearances": 36, "homeRuns": 0, "runs": 2, "rbi": 3, "stolenBases": 0, "avg": ".107", "strikeOuts": 12}},
      {"season": "2009", "team": {"id": 134, "name": "Pittsburgh Pirates"}, "sport": {"id": 1}, "stat": {"gamesPlayed": 9, "atBats": 2, "plateAppearances": 2, "homeRuns": 0, "runs": 0, "rbi": 0, "stolenBases": 0, "avg": ".000", "strikeOuts": 1}},
      {"season": "2009", "team": {"id": 112, "name": "Chicago Cubs"}, "sport": {"id": 1}, "stat": {"gamesPlayed": 13, "atBats": 12, "plateAppearances": 14, "homeRuns": 0, "runs": 0, "rbi": 2, "stolenBases": 0, "avg": ".167", "strikeOuts": 4}},
      {"season": "2009", "numTeams": 2, "sport": {"id": 1}, "stat": {"gamesPlayed": 22, "atBats": 14, "plateAppearances": 16, "homeRuns": 0, "runs": 0, "rbi": 2, "stolenBases": 0, "avg": ".143", "strikeOuts": 5}},
      {"season": "2010", "team": {"id": 112, "name": "Chicago Cubs"}, "sport": {"id": 1}, "stat": {"gamesPlayed": 29, "atBats": 40, "plateAppearances": 45, "homeRuns": 0, "runs": 1, "rbi": 2, "stolenBases": 0, "avg": ".125", "strikeOuts": 18}},
    ] },
    { group: {"displayName": "pitching"}, splits: [
      {"season": "2005", "team": {"id": 134, "name": "Pittsburgh Pirates"}, "sport": {"id": 1}, "stat": {"gamesPlayed": 3, "atBats": 28, "homeRuns": 1, "runs": 8, "stolenBases": 0, "avg": ".357", "inningsPitched": "6.0", "wins": 0, "saves": 0, "strikeOuts": 3, "era": "12.00"}},
      {"season": "2006", "team": {"id": 134, "name": "Pittsburgh Pirates"}, "sport": {"id": 1}, "stat": {"gamesPlayed": 11, "atBats": 221, "homeRuns": 3, "runs": 29, "stolenBases": 4, "avg": ".226", "inningsPitched": "61.2", "wins": 2, "saves": 0, "strikeOuts": 40, "era": "3.79"}},
      {"season": "2007", "team": {"id": 134, "name": "Pittsburgh Pirates"}, "sport": {"id": 1}, "stat": {"gamesPlayed": 32, "atBats": 783, "homeRuns": 18, "runs": 90, "stolenBases": 17, "avg": ".273", "inningsPitched": "201.2", "wins": 14, "saves": 0, "strikeOuts": 135, "era": "3.88"}},
      {"season": "2008", "team": {"id": 134, "name": "Pittsburgh Pirates"}, "sport": {"id": 1}, "stat": {"gamesPlayed": 21, "atBats": 410, "homeRuns": 20, "runs": 79, "stolenBases": 16, "avg": ".293", "inningsPitched": "105.1", "wins": 6, "saves": 0, "strikeOuts": 67, "era": "6.66"}},
      {"season": "2009", "team": {"id": 134, "name": "Pittsburgh Pirates"}, "sport": {"id": 1}, "stat": {"gamesPlayed": 9, "atBats": 31, "homeRuns": 0, "runs": 5, "stolenBases": 0, "avg": ".194", "inningsPitched": "8.2", "wins": 3, "saves": 0, "strikeOuts": 7, "era": "5.19"}},
      {"season": "2009", "team": {"id": 112, "name": "Chicago Cubs"}, "sport": {"id": 1}, "stat": {"gamesPlayed": 13, "atBats": 149, "homeRuns": 6, "runs": 25, "stolenBases": 1, "avg": ".262", "inningsPitched": "38.1", "wins": 4, "saves": 0, "strikeOuts": 40, "era": "5.63"}},
      {"season": "2009", "numTeams": 2, "sport": {"id": 1}, "stat": {"gamesPlayed": 22, "atBats": 180, "homeRuns": 6, "runs": 30, "stolenBases": 1, "avg": ".250", "inningsPitched": "47.0", "wins": 7, "saves": 0, "strikeOuts": 47, "era": "5.55"}},
      {"season": "2010", "team": {"id": 112, "name": "Chicago Cubs"}, "sport": {"id": 1}, "stat": {"gamesPlayed": 29, "atBats": 524, "homeRuns": 11, "runs": 70, "stolenBases": 18, "avg": ".260", "inningsPitched": "136.1", "wins": 7, "saves": 1, "strikeOuts": 119, "era": "4.09"}},
    ] },
  ],
};

export const bayCareer: StatsPerson = {
  id: 424726, fullName: "Jason Bay", primaryPosition: {"abbreviation": "LF"},
  stats: [
    { group: {"displayName": "hitting"}, splits: [
      {"season": "2003", "team": {"id": 135, "name": "San Diego Padres"}, "sport": {"id": 1}, "stat": {"gamesPlayed": 3, "atBats": 8, "plateAppearances": 10, "homeRuns": 1, "runs": 2, "rbi": 2, "stolenBases": 0, "avg": ".250", "strikeOuts": 1}},
      {"season": "2003", "team": {"id": 134, "name": "Pittsburgh Pirates"}, "sport": {"id": 1}, "stat": {"gamesPlayed": 27, "atBats": 79, "plateAppearances": 97, "homeRuns": 3, "runs": 13, "rbi": 12, "stolenBases": 3, "avg": ".291", "strikeOuts": 28}},
      {"season": "2003", "numTeams": 2, "sport": {"id": 1}, "stat": {"gamesPlayed": 30, "atBats": 87, "plateAppearances": 107, "homeRuns": 4, "runs": 15, "rbi": 14, "stolenBases": 3, "avg": ".287", "strikeOuts": 29}},
      {"season": "2004", "team": {"id": 134, "name": "Pittsburgh Pirates"}, "sport": {"id": 1}, "stat": {"gamesPlayed": 120, "atBats": 411, "plateAppearances": 472, "homeRuns": 26, "runs": 61, "rbi": 82, "stolenBases": 4, "avg": ".282", "strikeOuts": 129}},
    ] },
  ],
};
