/** MLB image-server URL helpers (headshots and team logos). */

export function playerHeadshotUrl(mlbId: number | string, width: 120 | 213 | 426 = 213): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_${width},q_auto:best/v1/people/${mlbId}/headshot/67/current`;
}

export const MLB_TEAM_IDS: Record<string, number> = {
  ARI: 109, ATL: 144, BAL: 110, BOS: 111, CHC: 112, CWS: 145, CIN: 113, CLE: 114, COL: 115, DET: 116,
  HOU: 117, KC: 118, LAA: 108, LAD: 119, MIA: 146, MIL: 158, MIN: 142, NYM: 121, NYY: 147, OAK: 133,
  PHI: 143, PIT: 134, SD: 135, SF: 137, SEA: 136, STL: 138, TB: 139, TEX: 140, TOR: 141, WSH: 120,
  // aliases
  AZ: 109, CHW: 145, KCR: 118, SDP: 135, SFG: 137, TBR: 139, WSN: 120, ATH: 133,
};

export function teamLogoUrl(abbr: string): string | null {
  const id = MLB_TEAM_IDS[(abbr ?? "").toUpperCase()];
  return id ? `https://www.mlbstatic.com/team-logos/${id}.svg` : null;
}
