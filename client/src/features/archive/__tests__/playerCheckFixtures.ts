// Wire-shaped fixtures for the player check. Each one is parsed by the shared
// schema at import time, so a fixture can't drift from what the server sends.
import {
  PlayerCheckItemSchema, PlayerCheckResponseSchema,
  type PlayerCheckCandidate, type PlayerCheckItem, type PlayerCheckResponse, type SeasonLine,
} from "@shared/api/archivePlayerCheck";

export const line = (over: Partial<SeasonLine> = {}): SeasonLine =>
  ({ g: 0, pa: 0, hr: 0, avg: "", r: 0, rbi: 0, sb: 0, ip: 0, w: 0, sv: 0, k: 0, era: "", ...over });

const pitcher = (mlbId: number, name: string, ip: number, games: number): PlayerCheckCandidate => ({
  mlbId, name, line: line({ g: games, ip, w: 15, sv: 0, k: 159, era: "3.28" }), playingTime: ip, eligibleSlots: 1,
  checks: [{ slot: "P", eligible: true, reason: `${games} G at P` }],
});

export const JARET = pitcher(124605, "Jaret Wright", 186 + 1 / 3, 32);
export const JAMEY = pitcher(124604, "Jamey Wright", 78 + 2 / 3, 14);

/** 2004 MoneyBall "J. Wright": two pitchers fit, the rules can't separate them. */
export const openWright: PlayerCheckItem = PlayerCheckItemSchema.parse({
  id: 10, year: 2004, teamCode: "MNB", teamName: "MoneyBall", role: "P",
  names: ["J. Wright"], slots: ["P"], seenIn: ["final"], status: "OPEN",
  match: null, candidates: [JARET, JAMEY],
  suggestion: { mlbId: 124605, why: "eligible and played the most (186.1 IP)", closeCall: false },
  decision: null,
});

/** 2004 MoneyBall "A. Pujols" at 3B: the name fits one player, the slot doesn't. */
export const flaggedPujols: PlayerCheckItem = PlayerCheckItemSchema.parse({
  id: 11, year: 2004, teamCode: "MNB", teamName: "MoneyBall", role: "H",
  names: ["A. Pujols"], slots: ["3B"], seenIn: ["draft", "final"], status: "FLAGGED",
  match: {
    mlbId: 405395, name: "Albert Pujols", line: line({ g: 154, pa: 692, hr: 46, avg: ".331", sb: 5 }),
    checks: [{ slot: "3B", eligible: false, reason: "not eligible at 3B: 150 G at 1B, 3 G at DH that season" }],
  },
  candidates: [], suggestion: null, decision: null,
});

/** 2005 B.O.H.I.C.A. "C. Hawpe": no player fits the spelling; one closest guess. */
export const suggestedHawpe: PlayerCheckItem = PlayerCheckItemSchema.parse({
  id: 12, year: 2005, teamCode: "BOH", teamName: "B.O.H.I.C.A.", role: "H",
  names: ["C. Hawpe"], slots: ["OF"], seenIn: ["draft"], status: "SUGGESTED",
  match: null,
  candidates: [{
    mlbId: 425547, name: "Brad Hawpe", line: line({ g: 101, pa: 351, hr: 9, avg: ".262", sb: 2 }), playingTime: 351, eligibleSlots: 1,
    checks: [{ slot: "OF", eligible: true, reason: "89 G at RF" }], note: "wrong first initial",
  }],
  suggestion: { mlbId: 425547, why: "the only one eligible for every slot", closeCall: false },
  decision: null,
});

export function decided(item: PlayerCheckItem, decision: NonNullable<PlayerCheckItem["decision"]>): PlayerCheckItem {
  return PlayerCheckItemSchema.parse({ ...item, decision });
}

export const picked = (item: PlayerCheckItem, c: { mlbId: number; name: string }, over: Partial<NonNullable<PlayerCheckItem["decision"]>> = {}) =>
  decided(item, { decision: "PICK", mlbId: c.mlbId, name: c.name, byName: "James", at: "2026-11-20T18:00:00.000Z", locked: false, ...over });

export function response(items: PlayerCheckItem[], over: Partial<PlayerCheckResponse> = {}): PlayerCheckResponse {
  return PlayerCheckResponseSchema.parse({
    viewer: { isAdmin: true, final: true, level: "ALL", teamCodes: null },
    seasons: [
      { year: 2005, verified: 248, suggested: 2, flagged: 1, open: 5 },
      { year: 2004, verified: 267, suggested: 3, flagged: 1, open: 4 },
    ],
    teams: [{ code: "BOH", name: "B.O.H.I.C.A." }, { code: "MNB", name: "MoneyBall" }],
    items,
    ...over,
  });
}
