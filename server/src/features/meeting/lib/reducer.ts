/**
 * Pure turn reducer for the live period meeting.
 *
 * No timers and no clock reads: time arrives as `nowMs`. Expiry is computed
 * on read; nothing happens when a clock hits zero.
 * Spec: docs/superpowers/specs/2026-11-13-live-meeting-design.md ("Turn flow").
 */
import type { MeetingPlayer, MeetingState } from "../../../../../shared/api/meeting.js";

export class MeetingRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeetingRuleError";
  }
}

export type MeetingAction =
  | { type: "setOrder"; order: number[] }
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "addTime" }
  | { type: "skip" }
  | { type: "end" }
  | { type: "submit"; teamId: number; add: MeetingPlayer; drop: MeetingPlayer; moveId: string }
  | { type: "pass"; teamId: number };

export type Actor = { kind: "commissioner" } | { kind: "owner"; teamId: number };

export type ReduceResult = {
  state: MeetingState;
  overtime: { teamId: number; overMs: number } | null;
};

const ADD_TIME_MS = 60_000;

export function createMeetingState(order: number[], settings: MeetingState["settings"]): MeetingState {
  return {
    status: "setup",
    order: [...order],
    round: 1,
    turnIndex: 0,
    turnEndsAt: null,
    pausedRemainingMs: null,
    passedThisRound: [],
    moves: [],
    turnsLog: [],
    settings: { ...settings },
  };
}

export function currentTeamId(s: MeetingState): number | null {
  if (s.status !== "running" && s.status !== "paused") return null;
  return s.order[s.turnIndex] ?? null;
}

function requireCommissioner(actor: Actor): void {
  if (actor.kind !== "commissioner") throw new MeetingRuleError("Only the commissioner can do that");
}

function requireStatus(s: MeetingState, ...allowed: MeetingState["status"][]): void {
  if (!allowed.includes(s.status)) throw new MeetingRuleError(`You can't do that while the meeting is ${s.status}`);
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Close the current turn: log it, compute overtime, move to the next team / round / end. */
function advance(
  s: MeetingState,
  result: "move" | "pass" | "skipped",
  actor: Actor,
  nowMs: number,
): ReduceResult {
  const teamId = s.order[s.turnIndex];
  const overMs = s.turnEndsAt ? Math.max(0, nowMs - Date.parse(s.turnEndsAt)) : 0;

  const next: MeetingState = {
    ...s,
    turnsLog: [
      ...s.turnsLog,
      { teamId, round: s.round, result, enteredBy: actor.kind === "owner" ? "owner" : "commissioner", overMs },
    ],
    turnIndex: s.turnIndex + 1,
  };

  if (next.turnIndex >= next.order.length) {
    if (next.order.every((t) => next.passedThisRound.includes(t))) {
      next.status = "ended";
    } else {
      next.round += 1;
      next.passedThisRound = [];
      next.turnIndex = 0;
    }
  }

  if (next.status === "ended") {
    next.turnEndsAt = null;
    next.pausedRemainingMs = null;
  } else {
    next.turnEndsAt = iso(nowMs + s.settings.turnSeconds * 1000);
  }

  return { state: next, overtime: overMs > 0 ? { teamId, overMs } : null };
}

function requireOnTheClock(s: MeetingState, actor: Actor, teamId: number): void {
  requireStatus(s, "running");
  if (teamId !== currentTeamId(s)) throw new MeetingRuleError("It isn't your turn");
  if (actor.kind === "owner" && actor.teamId !== teamId) throw new MeetingRuleError("It isn't your turn");
}

export function reduceMeeting(s: MeetingState, a: MeetingAction, actor: Actor, nowMs: number): ReduceResult {
  if (s.status === "ended") throw new MeetingRuleError("The meeting has ended");

  switch (a.type) {
    case "setOrder": {
      requireCommissioner(actor);
      requireStatus(s, "setup");
      const same =
        a.order.length === s.order.length &&
        new Set(a.order).size === a.order.length &&
        a.order.every((t) => s.order.includes(t));
      if (!same) throw new MeetingRuleError("The order must include every team exactly once");
      return { state: { ...s, order: [...a.order] }, overtime: null };
    }
    case "start": {
      requireCommissioner(actor);
      requireStatus(s, "setup");
      if (s.order.length === 0) throw new MeetingRuleError("There are no teams in the order");
      return {
        state: {
          ...s,
          status: "running",
          round: 1,
          turnIndex: 0,
          passedThisRound: [],
          pausedRemainingMs: null,
          turnEndsAt: iso(nowMs + s.settings.turnSeconds * 1000),
        },
        overtime: null,
      };
    }
    case "pause": {
      requireCommissioner(actor);
      requireStatus(s, "running");
      const remaining = Date.parse(s.turnEndsAt as string) - nowMs;
      return { state: { ...s, status: "paused", pausedRemainingMs: remaining, turnEndsAt: null }, overtime: null };
    }
    case "resume": {
      requireCommissioner(actor);
      requireStatus(s, "paused");
      return {
        state: {
          ...s,
          status: "running",
          turnEndsAt: iso(nowMs + (s.pausedRemainingMs ?? 0)),
          pausedRemainingMs: null,
        },
        overtime: null,
      };
    }
    case "addTime": {
      requireCommissioner(actor);
      requireStatus(s, "running", "paused");
      if (!s.settings.canAddTime) throw new MeetingRuleError("Adding time is turned off for this league");
      if (s.status === "paused") {
        return { state: { ...s, pausedRemainingMs: (s.pausedRemainingMs ?? 0) + ADD_TIME_MS }, overtime: null };
      }
      return { state: { ...s, turnEndsAt: iso(Date.parse(s.turnEndsAt as string) + ADD_TIME_MS) }, overtime: null };
    }
    case "skip": {
      requireCommissioner(actor);
      requireStatus(s, "running");
      return advance(s, "skipped", actor, nowMs);
    }
    case "end": {
      requireCommissioner(actor);
      return { state: { ...s, status: "ended", turnEndsAt: null, pausedRemainingMs: null }, overtime: null };
    }
    case "submit": {
      requireOnTheClock(s, actor, a.teamId);
      if (s.moves.some((m) => m.add.playerId === a.add.playerId)) {
        throw new MeetingRuleError("That player was already picked in this meeting");
      }
      if (s.moves.some((m) => m.drop.playerId === a.drop.playerId)) {
        throw new MeetingRuleError("That player is already being dropped");
      }
      const withMove: MeetingState = {
        ...s,
        moves: [...s.moves, { id: a.moveId, teamId: a.teamId, add: a.add, drop: a.drop }],
      };
      return advance(withMove, "move", actor, nowMs);
    }
    case "pass": {
      requireOnTheClock(s, actor, a.teamId);
      const withPass: MeetingState = { ...s, passedThisRound: [...s.passedThisRound, a.teamId] };
      return advance(withPass, "pass", actor, nowMs);
    }
  }
}
