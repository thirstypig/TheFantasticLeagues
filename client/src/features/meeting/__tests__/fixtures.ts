// Meeting fixtures, parsed through the real wire schema so a shape drift fails here first.
import { MeetingChoicesResponseSchema, MeetingSessionResponseSchema } from "@shared/api/meeting";
import type { MeetingChoicesResponse, MeetingSessionResponse, MeetingState } from "@shared/api/meeting";

export const FRALEY = { playerId: 101, name: "Jake Fraley", pos: "OF", mlbTeam: "CIN", mlbId: 641584 };
export const HAYS = { playerId: 201, name: "Austin Hays", pos: "OF", mlbTeam: "PHI", mlbId: 669720 };
export const CASAS = { playerId: 102, name: "Triston Casas", pos: "1B", mlbTeam: "BOS", mlbId: 671213 };
export const ALONSO = { playerId: 41, name: "Pete Alonso", pos: "1B", mlbTeam: "NYM", mlbId: 624413 };

export function state(patch: Partial<MeetingState> = {}): MeetingState {
  return {
    status: "running",
    order: [3, 1, 2],
    round: 1,
    turnIndex: 0,
    turnEndsAt: null,
    pausedRemainingMs: null,
    passedThisRound: [],
    moves: [],
    turnsLog: [],
    settings: { turnSeconds: 120, canAddTime: true, overtimeFee: 0 },
    ...patch,
  };
}

export function sessionResponse(
  s: MeetingState | null,
  opts: { version?: number; handedOffAt?: string | null; online?: number[]; id?: number; periodId?: number } = {},
): MeetingSessionResponse {
  return MeetingSessionResponseSchema.parse({
    session: s
      ? { id: opts.id ?? 55, leagueId: 7, periodId: opts.periodId ?? 9, handedOffAt: opts.handedOffAt ?? null, state: s }
      : null,
    version: opts.version ?? 1,
    serverNow: new Date().toISOString(),
    online: opts.online ?? [],
  });
}

export function choices(c: MeetingChoicesResponse): MeetingChoicesResponse {
  return MeetingChoicesResponseSchema.parse(c);
}

export const TEAMS = [
  { id: 1, name: "Diamond Kings" },
  { id: 2, name: "Skunk Dogs" },
  { id: 3, name: "Los Doyers" },
];
