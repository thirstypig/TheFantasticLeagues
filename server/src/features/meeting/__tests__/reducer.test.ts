import { describe, it, expect } from "vitest";
import {
  createMeetingState,
  currentTeamId,
  reduceMeeting,
  MeetingRuleError,
  type Actor,
  type MeetingAction,
} from "../lib/reducer.js";
import type { MeetingPlayer, MeetingState } from "../../../../../shared/api/meeting.js";

const COMM: Actor = { kind: "commissioner" };
const owner = (teamId: number): Actor => ({ kind: "owner", teamId });
const settings = { turnSeconds: 120, canAddTime: true, overtimeFee: 1 };
const T0 = 1_000_000;

const player = (id: number): MeetingPlayer => ({
  playerId: id,
  name: `P${id}`,
  pos: "OF",
  mlbTeam: "CIN",
  mlbId: id,
});
const submit = (teamId: number, addId: number, dropId: number, moveId = `m${addId}`): MeetingAction => ({
  type: "submit",
  teamId,
  add: player(addId),
  drop: player(dropId),
  moveId,
});

function running(order = [1, 2, 3], s = settings): MeetingState {
  return reduceMeeting(createMeetingState(order, s), { type: "start" }, COMM, T0).state;
}
const step = (s: MeetingState, a: MeetingAction, actor: Actor = COMM, now = T0) =>
  reduceMeeting(s, a, actor, now);

describe("createMeetingState", () => {
  it("starts in setup with empty collections", () => {
    const s = createMeetingState([1, 2], settings);
    expect(s).toMatchObject({
      status: "setup",
      order: [1, 2],
      round: 1,
      turnIndex: 0,
      turnEndsAt: null,
      pausedRemainingMs: null,
      passedThisRound: [],
      moves: [],
      turnsLog: [],
      settings,
    });
    expect(currentTeamId(s)).toBeNull();
  });
});

describe("setOrder", () => {
  it("accepts a permutation in setup (commissioner)", () => {
    const s = createMeetingState([1, 2, 3], settings);
    const r = step(s, { type: "setOrder", order: [3, 1, 2] });
    expect(r.state.order).toEqual([3, 1, 2]);
  });
  it("rejects a non-permutation", () => {
    const s = createMeetingState([1, 2, 3], settings);
    expect(() => step(s, { type: "setOrder", order: [1, 2] })).toThrow(MeetingRuleError);
    expect(() => step(s, { type: "setOrder", order: [1, 2, 9] })).toThrow(MeetingRuleError);
    expect(() => step(s, { type: "setOrder", order: [1, 1, 2] })).toThrow(MeetingRuleError);
  });
  it("is refused once running and for owners", () => {
    expect(() => step(running(), { type: "setOrder", order: [3, 2, 1] })).toThrow(MeetingRuleError);
    const s = createMeetingState([1, 2], settings);
    expect(() => step(s, { type: "setOrder", order: [2, 1] }, owner(1))).toThrow(MeetingRuleError);
  });
});

describe("start", () => {
  it("runs round 1, turn 0, with a deadline", () => {
    const s = running();
    expect(s.status).toBe("running");
    expect(s.round).toBe(1);
    expect(s.turnIndex).toBe(0);
    expect(s.turnEndsAt).toBe(new Date(T0 + 120_000).toISOString());
    expect(currentTeamId(s)).toBe(1);
  });
  it("is refused when not in setup or for owners", () => {
    expect(() => step(running(), { type: "start" })).toThrow(MeetingRuleError);
    expect(() => step(createMeetingState([1], settings), { type: "start" }, owner(1))).toThrow(MeetingRuleError);
  });
});

describe("pause / resume", () => {
  it("pause stores remaining ms and clears the deadline", () => {
    const r = step(running(), { type: "pause" }, COMM, T0 + 30_000);
    expect(r.state.status).toBe("paused");
    expect(r.state.pausedRemainingMs).toBe(90_000);
    expect(r.state.turnEndsAt).toBeNull();
  });
  it("pause keeps negative remaining, resume restores it", () => {
    const paused = step(running(), { type: "pause" }, COMM, T0 + 150_000).state;
    expect(paused.pausedRemainingMs).toBe(-30_000);
    const resumed = step(paused, { type: "resume" }, COMM, T0 + 500_000).state;
    expect(resumed.status).toBe("running");
    expect(resumed.turnEndsAt).toBe(new Date(T0 + 500_000 - 30_000).toISOString());
    expect(resumed.pausedRemainingMs).toBeNull();
  });
  it("pause needs running; resume needs paused; commissioner only", () => {
    expect(() => step(createMeetingState([1], settings), { type: "pause" })).toThrow(MeetingRuleError);
    expect(() => step(running(), { type: "resume" })).toThrow(MeetingRuleError);
    expect(() => step(running(), { type: "pause" }, owner(1))).toThrow(MeetingRuleError);
  });
});

describe("addTime", () => {
  it("adds 60s to the deadline while running", () => {
    const r = step(running(), { type: "addTime" });
    expect(r.state.turnEndsAt).toBe(new Date(T0 + 180_000).toISOString());
  });
  it("adds 60s to pausedRemainingMs while paused", () => {
    const paused = step(running(), { type: "pause" }, COMM, T0 + 20_000).state;
    const r = step(paused, { type: "addTime" }, COMM, T0 + 20_000);
    expect(r.state.pausedRemainingMs).toBe(100_000 + 60_000);
  });
  it("addTime refused when canAddTime false", () => {
    const s = running([1, 2], { ...settings, canAddTime: false });
    expect(() => step(s, { type: "addTime" })).toThrow(MeetingRuleError);
  });
  it("is refused in setup", () => {
    expect(() => step(createMeetingState([1], settings), { type: "addTime" })).toThrow(MeetingRuleError);
  });
});

describe("submit", () => {
  it("appends the move, logs it and advances", () => {
    const r = step(running(), submit(1, 10, 20, "mv-1"), owner(1), T0 + 10_000);
    expect(r.state.moves).toEqual([{ id: "mv-1", teamId: 1, add: player(10), drop: player(20) }]);
    expect(r.state.turnsLog).toEqual([
      { teamId: 1, round: 1, result: "move", enteredBy: "owner", overMs: 0 },
    ]);
    expect(r.state.turnIndex).toBe(1);
    expect(r.state.turnEndsAt).toBe(new Date(T0 + 10_000 + 120_000).toISOString());
    expect(r.overtime).toBeNull();
  });
  it("commissioner may enter for the team on the clock", () => {
    const r = step(running(), submit(1, 10, 20), COMM);
    expect(r.state.turnsLog[0].enteredBy).toBe("commissioner");
  });
  it("owner cannot act for another team", () => {
    expect(() => step(running(), submit(1, 10, 20), owner(2))).toThrow("It isn't your turn");
  });
  it("owner out of turn is refused", () => {
    expect(() => step(running(), submit(2, 10, 20), owner(2))).toThrow("It isn't your turn");
  });
  it("rejects an add already picked in this meeting", () => {
    const s = step(running(), submit(1, 10, 20)).state;
    expect(() => step(s, submit(2, 10, 21))).toThrow("That player was already picked in this meeting");
  });
  it("rejects a drop already being dropped", () => {
    const s = step(running(), submit(1, 10, 20)).state;
    expect(() => step(s, submit(2, 11, 20))).toThrow("That player is already being dropped");
  });
  it("is refused when not running", () => {
    expect(() => step(createMeetingState([1], settings), submit(1, 10, 20))).toThrow(MeetingRuleError);
  });
  it("overtime reported on submit after deadline", () => {
    const r = step(running([1, 2], { ...settings, turnSeconds: 120 }), submit(1, 10, 20), COMM, T0 + 150_000);
    expect(r.overtime).toEqual({ teamId: 1, overMs: 30_000 });
    expect(r.state.turnsLog[0].overMs).toBe(30_000);
  });
});

describe("pass", () => {
  it("records the pass and advances", () => {
    const r = step(running(), { type: "pass", teamId: 1 }, owner(1));
    expect(r.state.passedThisRound).toEqual([1]);
    expect(r.state.turnsLog[0]).toMatchObject({ teamId: 1, result: "pass", enteredBy: "owner" });
    expect(r.state.turnIndex).toBe(1);
  });
  it("owner cannot pass for another team", () => {
    expect(() => step(running(), { type: "pass", teamId: 1 }, owner(2))).toThrow("It isn't your turn");
  });
  it("wrong teamId is refused even for the commissioner", () => {
    expect(() => step(running(), { type: "pass", teamId: 2 }, COMM)).toThrow("It isn't your turn");
  });
});

describe("skip", () => {
  it("logs skipped and advances without passing", () => {
    const r = step(running(), { type: "skip" });
    expect(r.state.turnsLog[0]).toMatchObject({ teamId: 1, result: "skipped", enteredBy: "commissioner" });
    expect(r.state.passedThisRound).toEqual([]);
    expect(r.state.turnIndex).toBe(1);
  });
  it("is commissioner-only and needs running", () => {
    expect(() => step(running(), { type: "skip" }, owner(1))).toThrow(MeetingRuleError);
    expect(() => step(createMeetingState([1], settings), { type: "skip" })).toThrow(MeetingRuleError);
  });
});

describe("rounds", () => {
  it("round wraps and repeats order", () => {
    let s = running([1, 2]);
    s = step(s, submit(1, 10, 20)).state;
    s = step(s, submit(2, 11, 21)).state;
    expect(s.status).toBe("running");
    expect(s.round).toBe(2);
    expect(s.turnIndex).toBe(0);
    expect(s.passedThisRound).toEqual([]);
    expect(currentTeamId(s)).toBe(1);
  });
  it("all teams pass in one round → ended", () => {
    let s = running([1, 2, 3]);
    s = step(s, { type: "pass", teamId: 1 }).state;
    s = step(s, { type: "pass", teamId: 2 }).state;
    s = step(s, { type: "pass", teamId: 3 }).state;
    expect(s.status).toBe("ended");
    expect(s.turnEndsAt).toBeNull();
    expect(currentTeamId(s)).toBeNull();
  });
  it("skip is not a pass", () => {
    let s = running([1, 2, 3]);
    s = step(s, { type: "pass", teamId: 1 }).state;
    s = step(s, { type: "skip" }).state;
    s = step(s, { type: "pass", teamId: 3 }).state;
    expect(s.status).toBe("running");
    expect(s.round).toBe(2);
    expect(s.passedThisRound).toEqual([]);
  });
});

describe("end", () => {
  it("ends from setup, running or paused", () => {
    expect(step(createMeetingState([1], settings), { type: "end" }).state.status).toBe("ended");
    expect(step(running(), { type: "end" }).state.status).toBe("ended");
    const paused = step(running(), { type: "pause" }).state;
    expect(step(paused, { type: "end" }).state.status).toBe("ended");
  });
  it("no overtime on end", () => {
    const r = step(running(), { type: "end" }, COMM, T0 + 999_000);
    expect(r.overtime).toBeNull();
    expect(r.state.turnEndsAt).toBeNull();
  });
  it("is commissioner-only", () => {
    expect(() => step(running(), { type: "end" }, owner(1))).toThrow(MeetingRuleError);
  });
});

describe("ended session", () => {
  it("refuses every action", () => {
    const ended = step(running(), { type: "end" }).state;
    const actions: MeetingAction[] = [
      { type: "setOrder", order: [1, 2, 3] },
      { type: "start" },
      { type: "pause" },
      { type: "resume" },
      { type: "addTime" },
      { type: "skip" },
      { type: "end" },
      submit(1, 10, 20),
      { type: "pass", teamId: 1 },
    ];
    for (const a of actions) {
      expect(() => step(ended, a)).toThrow("The meeting has ended");
    }
  });
});

describe("purity", () => {
  it("does not mutate the input state", () => {
    const s = running();
    const snap = JSON.stringify(s);
    step(s, submit(1, 10, 20));
    expect(JSON.stringify(s)).toBe(snap);
  });
});
