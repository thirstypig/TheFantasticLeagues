import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => {
  const p: any = {
    meetingSession: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    leagueMembership: { findUnique: vi.fn() },
    leagueRule: { findMany: vi.fn() },
    team: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    teamOwnership: { findUnique: vi.fn() },
    period: { findFirst: vi.fn(), findUnique: vi.fn() },
    waiverPeriod: { findFirst: vi.fn() },
    waiverAddEntry: { findMany: vi.fn() },
    player: { findUnique: vi.fn() },
    roster: { findFirst: vi.fn(), findMany: vi.fn() },
    financeLedger: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma: p };
});
vi.mock("../../../lib/supabase.js", () => ({ supabaseAdmin: {} }));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import express from "express";
import { Prisma } from "@prisma/client";
import supertest from "supertest";
import { prisma } from "../../../db/prisma.js";
import { clearMembershipCache } from "../../../middleware/auth.js";
import { _clearLeagueRuleCache } from "../../../lib/leagueRuleCache.js";
import { meetingRouter } from "../index.js";
import { _resetPresence, markSeen } from "../lib/presence.js";
import { createMeetingState, reduceMeeting } from "../lib/reducer.js";
import type { MeetingState } from "../../../../../shared/api/meeting.js";

const mockPrisma = prisma as any;

// ── Fixtures ─────────────────────────────────────────────────────

const LEAGUE = 1;
const COMMISH = 10; // userId with COMMISSIONER membership
const OWNER_3 = 30; // owns team 3
const OWNER_4 = 40; // owns team 4
const OWNER_B = 70; // owns team 77 in another league
const SETTINGS = { turnSeconds: 120, canAddTime: true, overtimeFee: 0 };

function runningState(order = [3, 4, 5], settings = SETTINGS, nowMs = Date.now()): MeetingState {
  const s = createMeetingState(order, settings);
  return reduceMeeting(s, { type: "start" }, { kind: "commissioner" }, nowMs).state;
}

function sessionRow(state: MeetingState, version = 3) {
  return { id: 7, leagueId: LEAGUE, periodId: 42, state, handedOffAt: null, version, updatedAt: new Date() };
}

function appAs(userId: number, isAdmin = false) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: NextFunction) => {
    req.user = { id: userId, email: "x@y", name: null, avatarUrl: null, isAdmin };
    next();
  });
  app.use("/api/meeting", meetingRouter);
  app.use((err: any, _req: any, res: any, _next: NextFunction) => {
    res.status(500).json({ error: String(err?.message ?? err) });
  });
  return app;
}

function rules(map: Record<string, string>) {
  mockPrisma.leagueRule.findMany.mockResolvedValue(
    Object.entries(map).map(([key, value]) => ({ category: "meeting", key, value })),
  );
}

/** Memberships: COMMISH is commissioner, owners are OWNER role. */
function memberships() {
  mockPrisma.leagueMembership.findUnique.mockImplementation(async ({ where }: any) => {
    const uid = where.leagueId_userId.userId;
    if (uid === COMMISH) return { role: "COMMISSIONER" };
    if (uid === OWNER_3 || uid === OWNER_4) return { role: "OWNER" };
    return null;
  });
}

/** Team ownership via Team.ownerUserId. */
function ownership() {
  const owners: Record<number, number> = { 3: OWNER_3, 4: OWNER_4, 77: OWNER_B };
  mockPrisma.team.findUnique.mockImplementation(async ({ where }: any) =>
    owners[where.id] !== undefined ? { ownerUserId: owners[where.id] } : null,
  );
  mockPrisma.teamOwnership.findUnique.mockResolvedValue(null);
}

/**
 * A tiny row store that applies `where` the way Postgres would: a missing
 * `version` key matches any version. Lets the race test fail if the CAS
 * where clause ever drops `version`.
 */
function casStore(initialVersion: number) {
  const row = { id: 7, version: initialVersion };
  mockPrisma.meetingSession.updateMany.mockImplementation(async ({ where }: any) => {
    const matches = where.id === row.id && (where.version === undefined || where.version === row.version);
    if (!matches) return { count: 0 };
    row.version += 1;
    return { count: 1 };
  });
  return row;
}

function players(map: Record<number, { name: string; posPrimary: string; mlbTeam: string | null; mlbId: number | null }>) {
  mockPrisma.player.findUnique.mockImplementation(async ({ where }: any) =>
    map[where.id] ? { id: where.id, ...map[where.id] } : null,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  clearMembershipCache();
  _clearLeagueRuleCache();
  _resetPresence();
  memberships();
  ownership();
  rules({});
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
  mockPrisma.meetingSession.updateMany.mockResolvedValue({ count: 1 });
});

// ── CAS ──────────────────────────────────────────────────────────

describe("compare-and-set writes", () => {
  it("CAS uses where {id, version}", async () => {
    mockPrisma.meetingSession.findUnique.mockResolvedValue(sessionRow(runningState(), 3));

    const res = await supertest(appAs(COMMISH)).post("/api/meeting/sessions/7/skip").send({ version: 3 });

    expect(res.status).toBe(200);
    expect(mockPrisma.meetingSession.updateMany).toHaveBeenCalledTimes(1);
    const args = mockPrisma.meetingSession.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: 7, version: 3 });
    expect(args.data.version).toBe(4);
    expect(args.data.state.turnIndex).toBe(1);
    expect(res.body.version).toBe(4);
    expect(res.body.session.state.turnIndex).toBe(1);
    expect(typeof res.body.serverNow).toBe("string");
    expect(Array.isArray(res.body.online)).toBe(true);
  });

  it("submit and skip race → second gets 409", async () => {
    // Both requests read the session at version 3 before either writes.
    mockPrisma.meetingSession.findUnique.mockResolvedValue(sessionRow(runningState(), 3));
    casStore(3);
    players({
      100: { name: "Add Guy", posPrimary: "OF", mlbTeam: "LAD", mlbId: 1100 },
      200: { name: "Drop Guy", posPrimary: "SS", mlbTeam: "SD", mlbId: 1200 },
    });
    mockPrisma.roster.findFirst.mockImplementation(async ({ where }: any) =>
      where.playerId === 200 && where.teamId === 3 ? { id: 1 } : null,
    );

    const submit = await supertest(appAs(OWNER_3))
      .post("/api/meeting/sessions/7/submit")
      .send({ teamId: 3, addPlayerId: 100, dropPlayerId: 200, version: 3 });
    const skip = await supertest(appAs(COMMISH)).post("/api/meeting/sessions/7/skip").send({ version: 3 });

    expect(submit.status).toBe(200);
    expect(skip.status).toBe(409);
    expect(skip.body.error).toBe("The meeting just changed");
  });

  it("stale body version → 409 without writing", async () => {
    mockPrisma.meetingSession.findUnique.mockResolvedValue(sessionRow(runningState(), 3));
    const res = await supertest(appAs(COMMISH)).post("/api/meeting/sessions/7/skip").send({ version: 2 });
    expect(res.status).toBe(409);
    expect(mockPrisma.meetingSession.updateMany).not.toHaveBeenCalled();
  });

  it("reducer rule error → 400 with its message", async () => {
    mockPrisma.meetingSession.findUnique.mockResolvedValue(
      sessionRow(createMeetingState([3, 4, 5], SETTINGS), 0),
    );
    const res = await supertest(appAs(COMMISH)).post("/api/meeting/sessions/7/skip").send({ version: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("You can't do that while the meeting is setup");
  });

  it("zod failure → 400", async () => {
    mockPrisma.meetingSession.findUnique.mockResolvedValue(sessionRow(runningState(), 3));
    const res = await supertest(appAs(COMMISH)).post("/api/meeting/sessions/7/skip").send({ version: "x" });
    expect(res.status).toBe(400);
    expect(mockPrisma.meetingSession.updateMany).not.toHaveBeenCalled();
  });
});

// ── Authorization ────────────────────────────────────────────────

describe("authorization", () => {
  it("owner of another team → 403", async () => {
    mockPrisma.meetingSession.findUnique.mockResolvedValue(sessionRow(runningState(), 3));

    const res = await supertest(appAs(OWNER_4))
      .post("/api/meeting/sessions/7/submit")
      .send({ teamId: 3, addPlayerId: 100, dropPlayerId: 200, version: 3 });

    expect(res.status).toBe(403);
    expect(mockPrisma.meetingSession.updateMany).not.toHaveBeenCalled();
  });

  it("owner cannot run commissioner actions → 403, membership looked up on the session's league", async () => {
    mockPrisma.meetingSession.findUnique.mockResolvedValue(sessionRow(runningState(), 3));

    const res = await supertest(appAs(OWNER_3)).post("/api/meeting/sessions/7/skip").send({ version: 3 });

    expect(res.status).toBe(403);
    expect(mockPrisma.meetingSession.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 } }),
    );
    expect(mockPrisma.leagueMembership.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { leagueId_userId: { leagueId: LEAGUE, userId: OWNER_3 } } }),
    );
    expect(mockPrisma.meetingSession.updateMany).not.toHaveBeenCalled();
  });

  it("owner of a team in another league submitting to this session → 400 \"It isn't your turn\", no player/roster reads", async () => {
    mockPrisma.meetingSession.findUnique.mockResolvedValue(sessionRow(runningState(), 3));

    const res = await supertest(appAs(OWNER_B))
      .post("/api/meeting/sessions/7/submit")
      .send({ teamId: 77, addPlayerId: 100, dropPlayerId: 200, version: 3 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("It isn't your turn");
    expect(mockPrisma.player.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.roster.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.roster.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.meetingSession.updateMany).not.toHaveBeenCalled();
  });

  it("owner off the clock → 400 \"It isn't your turn\" before any player read", async () => {
    mockPrisma.meetingSession.findUnique.mockResolvedValue(sessionRow(runningState(), 3)); // team 3 is up
    const res = await supertest(appAs(OWNER_4))
      .post("/api/meeting/sessions/7/submit")
      .send({ teamId: 4, addPlayerId: 100, dropPlayerId: 200, version: 3 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("It isn't your turn");
    expect(mockPrisma.player.findUnique).not.toHaveBeenCalled();
  });

  it("pass on an ended meeting → 400 \"The meeting has ended\"", async () => {
    const ended = { ...runningState(), status: "ended" as const };
    mockPrisma.meetingSession.findUnique.mockResolvedValue(sessionRow(ended, 3));
    const res = await supertest(appAs(OWNER_3)).post("/api/meeting/sessions/7/pass").send({ teamId: 3, version: 3 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("The meeting has ended");
  });

  it("missing session → 404", async () => {
    mockPrisma.meetingSession.findUnique.mockResolvedValue(null);
    const res = await supertest(appAs(COMMISH)).post("/api/meeting/sessions/7/skip").send({ version: 3 });
    expect(res.status).toBe(404);
  });

  it("owner on the clock can pass their own team", async () => {
    mockPrisma.meetingSession.findUnique.mockResolvedValue(sessionRow(runningState(), 3));
    const res = await supertest(appAs(OWNER_3)).post("/api/meeting/sessions/7/pass").send({ teamId: 3, version: 3 });
    expect(res.status).toBe(200);
    expect(res.body.session.state.passedThisRound).toEqual([3]);
    expect(res.body.session.state.turnsLog[0].enteredBy).toBe("owner");
  });
});

// ── Open ─────────────────────────────────────────────────────────

describe("POST /leagues/:leagueId/open", () => {
  function openHappyPath() {
    rules({ live: "true", turn_seconds: "60", can_add_time: "false", overtime_fee: "5" });
    mockPrisma.period.findFirst.mockImplementation(async ({ where }: any) =>
      where.status === "pending" && where.id === 42 ? { id: 42 } : null,
    );
    mockPrisma.waiverPeriod.findFirst.mockResolvedValue(null);
    mockPrisma.team.findMany.mockResolvedValue([{ id: 3 }, { id: 4 }, { id: 5 }]);
    mockPrisma.meetingSession.upsert.mockImplementation(async ({ create }: any) => ({
      id: 7, ...create, handedOffAt: null, version: 0, updatedAt: new Date(),
    }));
  }

  it("opens a session with snapshotted settings, upsert-if-absent on (league, period)", async () => {
    openHappyPath();
    const res = await supertest(appAs(COMMISH))
      .post(`/api/meeting/leagues/${LEAGUE}/open`)
      .send({ periodId: 42, order: [5, 3, 4] });

    expect(res.status).toBe(200);
    const args = mockPrisma.meetingSession.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ leagueId_periodId: { leagueId: LEAGUE, periodId: 42 } });
    expect(args.update).toEqual({});
    expect(args.create.state.status).toBe("setup");
    expect(args.create.state.order).toEqual([5, 3, 4]);
    expect(args.create.state.settings).toEqual({ turnSeconds: 60, canAddTime: false, overtimeFee: 5 });
    expect(mockPrisma.team.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { leagueId: LEAGUE } }));
    expect(res.body.session.state.order).toEqual([5, 3, 4]);
  });

  it("open race: P2002 from the upsert re-reads and returns the existing session", async () => {
    openHappyPath();
    mockPrisma.meetingSession.upsert.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
    );
    const existing = sessionRow(createMeetingState([4, 3, 5], SETTINGS), 0);
    mockPrisma.meetingSession.findUnique.mockResolvedValue(existing);

    const res = await supertest(appAs(COMMISH))
      .post(`/api/meeting/leagues/${LEAGUE}/open`)
      .send({ periodId: 42, order: [5, 3, 4] });

    expect(res.status).toBe(200);
    expect(mockPrisma.meetingSession.findUnique).toHaveBeenCalledWith({
      where: { leagueId_periodId: { leagueId: LEAGUE, periodId: 42 } },
    });
    expect(res.body.session.id).toBe(7);
    expect(res.body.session.state.order).toEqual([4, 3, 5]);
  });

  it("open rethrows non-P2002 upsert errors", async () => {
    openHappyPath();
    mockPrisma.meetingSession.upsert.mockRejectedValue(new Error("db down"));
    const res = await supertest(appAs(COMMISH))
      .post(`/api/meeting/leagues/${LEAGUE}/open`)
      .send({ periodId: 42, order: [5, 3, 4] });
    expect(res.status).toBe(500);
    expect(mockPrisma.meetingSession.findUnique).not.toHaveBeenCalled();
  });

  it("open refused when live off", async () => {
    openHappyPath();
    rules({ live: "false" });
    const res = await supertest(appAs(COMMISH))
      .post(`/api/meeting/leagues/${LEAGUE}/open`)
      .send({ periodId: 42, order: [3, 4, 5] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Turn on the live meeting in Rules first");
    expect(mockPrisma.meetingSession.upsert).not.toHaveBeenCalled();
  });

  it("open refused while period active", async () => {
    openHappyPath();
    mockPrisma.period.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.status === "active") return where.leagueId === LEAGUE ? { id: 41 } : null;
      return where.id === 42 && where.leagueId === LEAGUE ? { id: 42 } : null;
    });
    const res = await supertest(appAs(COMMISH))
      .post(`/api/meeting/leagues/${LEAGUE}/open`)
      .send({ periodId: 42, order: [3, 4, 5] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Close the period before opening the meeting");
    expect(mockPrisma.period.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { leagueId: LEAGUE, status: "active" } }),
    );
    expect(mockPrisma.period.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 42, leagueId: LEAGUE, status: "pending" } }),
    );
    expect(mockPrisma.meetingSession.upsert).not.toHaveBeenCalled();
  });

  it("open refused when period is not pending", async () => {
    openHappyPath();
    mockPrisma.period.findFirst.mockResolvedValue(null);
    const res = await supertest(appAs(COMMISH))
      .post(`/api/meeting/leagues/${LEAGUE}/open`)
      .send({ periodId: 42, order: [3, 4, 5] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Close the period before opening the meeting");
  });

  it("open refused during List run", async () => {
    openHappyPath();
    mockPrisma.waiverPeriod.findFirst.mockResolvedValue({ id: 9 });
    const res = await supertest(appAs(COMMISH))
      .post(`/api/meeting/leagues/${LEAGUE}/open`)
      .send({ periodId: 42, order: [3, 4, 5] });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("A List run is in progress");
    expect(mockPrisma.waiverPeriod.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { leagueId: LEAGUE, status: "LOCKED", addEntries: { some: { outcome: { not: "PENDING" } } } },
      }),
    );
    expect(mockPrisma.meetingSession.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["missing a team", [3, 4]],
    ["duplicate team", [3, 3, 4]],
    ["foreign team", [3, 4, 99]],
    ["extra team", [3, 4, 5, 6]],
  ])("open refuses an order that isn't an exact permutation (%s)", async (_label, order) => {
    openHappyPath();
    const res = await supertest(appAs(COMMISH))
      .post(`/api/meeting/leagues/${LEAGUE}/open`)
      .send({ periodId: 42, order });
    expect(res.status).toBe(400);
    expect(mockPrisma.meetingSession.upsert).not.toHaveBeenCalled();
  });

  it("owner cannot open → 403", async () => {
    openHappyPath();
    const res = await supertest(appAs(OWNER_3))
      .post(`/api/meeting/leagues/${LEAGUE}/open`)
      .send({ periodId: 42, order: [3, 4, 5] });
    expect(res.status).toBe(403);
  });
});

// ── Overtime ledger ──────────────────────────────────────────────

describe("overtime", () => {
  const PAST = Date.now() - 10 * 60_000; // turn started 10 minutes ago → clock long expired

  it("overtime writes ledger in same transaction", async () => {
    const state = runningState([3, 4, 5], { ...SETTINGS, overtimeFee: 5 }, PAST);
    mockPrisma.meetingSession.findUnique.mockResolvedValue(sessionRow(state, 3));
    const order: string[] = [];
    const tx = {
      meetingSession: {
        updateMany: vi.fn(async () => {
          order.push("cas");
          return { count: 1 };
        }),
      },
      financeLedger: {
        create: vi.fn(async () => {
          order.push("ledger");
          return { id: 1 };
        }),
      },
    };
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));
    mockPrisma.period.findUnique.mockResolvedValue({ name: "Period 8" });

    const res = await supertest(appAs(COMMISH)).post("/api/meeting/sessions/7/skip").send({ version: 3 });

    expect(res.status).toBe(200);
    expect(mockPrisma.period.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 42 } }));
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.meetingSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7, version: 3 } }),
    );
    expect(tx.financeLedger.create).toHaveBeenCalledTimes(1);
    expect((tx.financeLedger.create.mock.calls as any)[0][0].data).toMatchObject({
      type: "meeting_overtime",
      amount: 5,
      periodId: 42,
      teamId: 3,
      reason: "Over time at the Period 8 meeting",
    });
    expect(order).toEqual(["cas", "ledger"]);
    // Nothing written outside the transaction client.
    expect(mockPrisma.meetingSession.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.financeLedger.create).not.toHaveBeenCalled();
  });

  it("no ledger row when the CAS loses inside the overtime transaction", async () => {
    const state = runningState([3, 4, 5], { ...SETTINGS, overtimeFee: 5 }, PAST);
    mockPrisma.meetingSession.findUnique.mockResolvedValue(sessionRow(state, 3));
    mockPrisma.meetingSession.updateMany.mockResolvedValue({ count: 0 });

    const res = await supertest(appAs(COMMISH)).post("/api/meeting/sessions/7/skip").send({ version: 3 });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("The meeting just changed");
    expect(mockPrisma.financeLedger.create).not.toHaveBeenCalled();
  });

  it("no ledger when fee is 0", async () => {
    const state = runningState([3, 4, 5], { ...SETTINGS, overtimeFee: 0 }, PAST);
    mockPrisma.meetingSession.findUnique.mockResolvedValue(sessionRow(state, 3));

    const res = await supertest(appAs(COMMISH)).post("/api/meeting/sessions/7/skip").send({ version: 3 });

    expect(res.status).toBe(200);
    expect(mockPrisma.meetingSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7, version: 3 } }),
    );
    expect(mockPrisma.financeLedger.create).not.toHaveBeenCalled();
    expect(mockPrisma.period.findUnique).not.toHaveBeenCalled();
  });

  it("no ledger when the turn ends on time even with a fee", async () => {
    const state = runningState([3, 4, 5], { ...SETTINGS, overtimeFee: 5 });
    mockPrisma.meetingSession.findUnique.mockResolvedValue(sessionRow(state, 3));
    const res = await supertest(appAs(COMMISH)).post("/api/meeting/sessions/7/skip").send({ version: 3 });
    expect(res.status).toBe(200);
    expect(mockPrisma.financeLedger.create).not.toHaveBeenCalled();
  });
});

// ── Submit checks ────────────────────────────────────────────────

describe("submit", () => {
  beforeEach(() => {
    mockPrisma.meetingSession.findUnique.mockResolvedValue(sessionRow(runningState(), 3));
    rules({});
    mockPrisma.leagueRule.findMany.mockResolvedValue([{ category: "overview", key: "stats_source", value: "NL" }]);
    players({
      100: { name: "Add Guy", posPrimary: "OF", mlbTeam: "LAD", mlbId: 1100 },
      101: { name: "AL Guy", posPrimary: "OF", mlbTeam: "NYY", mlbId: 1101 },
      102: { name: "No Team", posPrimary: "OF", mlbTeam: null, mlbId: 1102 },
      103: { name: "FA Guy", posPrimary: "C", mlbTeam: "FA", mlbId: 1103 },
      200: { name: "Drop Guy", posPrimary: "SS", mlbTeam: "SD", mlbId: 1200 },
    });
  });

  it("rostered add → 400 \"That player is already on a team\"", async () => {
    mockPrisma.roster.findFirst.mockImplementation(async ({ where }: any) =>
      where.playerId === 100 ? { id: 9 } : { id: 1 },
    );
    const res = await supertest(appAs(OWNER_3))
      .post("/api/meeting/sessions/7/submit")
      .send({ teamId: 3, addPlayerId: 100, dropPlayerId: 200, version: 3 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("That player is already on a team");
    expect(mockPrisma.roster.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { playerId: 100, releasedAt: null, team: { leagueId: LEAGUE } } }),
    );
    expect(mockPrisma.meetingSession.updateMany).not.toHaveBeenCalled();
  });

  it("drop not on this team → 400 \"That player isn't on this team\"", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null);
    const res = await supertest(appAs(OWNER_3))
      .post("/api/meeting/sessions/7/submit")
      .send({ teamId: 3, addPlayerId: 100, dropPlayerId: 200, version: 3 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("That player isn't on this team");
    expect(mockPrisma.roster.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { playerId: 200, teamId: 3, releasedAt: null } }),
    );
  });

  it("add outside the league's stats source → 400", async () => {
    mockPrisma.roster.findFirst.mockImplementation(async ({ where }: any) => (where.teamId === 3 ? { id: 1 } : null));
    const res = await supertest(appAs(OWNER_3))
      .post("/api/meeting/sessions/7/submit")
      .send({ teamId: 3, addPlayerId: 101, dropPlayerId: 200, version: 3 });
    expect(res.status).toBe(400);
    expect(mockPrisma.meetingSession.updateMany).not.toHaveBeenCalled();
  });

  it("add with no MLB team is refused (fail-closed)", async () => {
    mockPrisma.roster.findFirst.mockImplementation(async ({ where }: any) => (where.teamId === 3 ? { id: 1 } : null));
    const res = await supertest(appAs(OWNER_3))
      .post("/api/meeting/sessions/7/submit")
      .send({ teamId: 3, addPlayerId: 102, dropPlayerId: 200, version: 3 });
    expect(res.status).toBe(400);
  });

  it("add pick with the same player as the drop → 400", async () => {
    const res = await supertest(appAs(OWNER_3))
      .post("/api/meeting/sessions/7/submit")
      .send({ teamId: 3, addPlayerId: 200, dropPlayerId: 200, version: 3 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Pick a different player to drop");
  });

  it("valid submit records the move with server-built players and a generated id", async () => {
    mockPrisma.roster.findFirst.mockImplementation(async ({ where }: any) => (where.teamId === 3 ? { id: 1 } : null));
    const res = await supertest(appAs(COMMISH))
      .post("/api/meeting/sessions/7/submit")
      .send({ teamId: 3, addPlayerId: 103, dropPlayerId: 200, version: 3 });

    expect(res.status).toBe(200);
    const move = res.body.session.state.moves[0];
    expect(move.teamId).toBe(3);
    expect(move.add).toEqual({ playerId: 103, name: "FA Guy", pos: "C", mlbTeam: "FA", mlbId: 1103 });
    expect(move.drop).toEqual({ playerId: 200, name: "Drop Guy", pos: "SS", mlbTeam: "SD", mlbId: 1200 });
    expect(typeof move.id).toBe("string");
    expect(move.id.length).toBeGreaterThan(0);
    expect(res.body.session.state.turnsLog[0].enteredBy).toBe("commissioner");
  });
});

// ── GET current ──────────────────────────────────────────────────

describe("GET /leagues/:leagueId/current", () => {
  it("GET current returns serverNow and online ids", async () => {
    const ended = { ...createMeetingState([3, 4], SETTINGS), status: "ended" as const };
    const live = runningState([3, 4]);
    mockPrisma.meetingSession.findMany.mockResolvedValue([
      { ...sessionRow(ended, 9), id: 8, periodId: 43 },
      { ...sessionRow(live, 3), id: 7, periodId: 42 },
    ]);
    mockPrisma.team.findMany.mockResolvedValue([{ id: 3 }]);
    markSeen(LEAGUE, [4], Date.now() - 20_000); // stale — not online
    markSeen(LEAGUE, [5], Date.now() - 2_000); // fresh

    const before = Date.now();
    const res = await supertest(appAs(OWNER_3)).get(`/api/meeting/leagues/${LEAGUE}/current`);

    expect(res.status).toBe(200);
    expect(Date.parse(res.body.serverNow)).toBeGreaterThanOrEqual(before - 5);
    expect(res.body.online.sort()).toEqual([3, 5]);
    expect(res.body.session.id).toBe(7); // non-ended beats the newer ended one
    expect(res.body.version).toBe(3);
    expect(mockPrisma.meetingSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { leagueId: LEAGUE }, orderBy: { periodId: "desc" } }),
    );
    // Presence recorded only for the caller's teams in THIS league.
    const teamWhere = mockPrisma.team.findMany.mock.calls[0][0].where;
    expect(teamWhere).toEqual({
      leagueId: LEAGUE,
      OR: [{ ownerUserId: OWNER_3 }, { ownerships: { some: { userId: OWNER_3 } } }],
    });
  });

  it("falls back to the latest ended session, and to null when none", async () => {
    const ended = { ...createMeetingState([3, 4], SETTINGS), status: "ended" as const };
    mockPrisma.meetingSession.findMany.mockResolvedValue([{ ...sessionRow(ended, 9), id: 8, periodId: 43 }]);
    mockPrisma.team.findMany.mockResolvedValue([]);
    const a = await supertest(appAs(OWNER_3)).get(`/api/meeting/leagues/${LEAGUE}/current`);
    expect(a.body.session.id).toBe(8);

    mockPrisma.meetingSession.findMany.mockResolvedValue([]);
    const b = await supertest(appAs(OWNER_3)).get(`/api/meeting/leagues/${LEAGUE}/current`);
    expect(b.status).toBe(200);
    expect(b.body.session).toBeNull();
    expect(b.body.version).toBe(0);
  });

  it("non-member → 403", async () => {
    const res = await supertest(appAs(999)).get(`/api/meeting/leagues/${LEAGUE}/current`);
    expect(res.status).toBe(403);
  });
});

// ── Choices ──────────────────────────────────────────────────────

describe("GET /sessions/:id/choices", () => {
  it("returns the team's List minus rostered and already-picked, roster minus drops and IL, and the active count", async () => {
    const base = runningState([3, 4, 5]);
    const state: MeetingState = {
      ...base,
      moves: [
        {
          id: "m1",
          teamId: 4,
          add: { playerId: 102, name: "Taken", pos: "OF", mlbTeam: "LAD", mlbId: null },
          drop: { playerId: 301, name: "Gone", pos: "C", mlbTeam: "SD", mlbId: null },
        },
        {
          id: "m2",
          teamId: 3,
          add: { playerId: 103, name: "Mine", pos: "OF", mlbTeam: "LAD", mlbId: null },
          drop: { playerId: 201, name: "Dropped", pos: "C", mlbTeam: "SD", mlbId: null },
        },
      ],
    };
    mockPrisma.meetingSession.findUnique.mockResolvedValue(sessionRow(state, 3));
    mockPrisma.team.findFirst.mockResolvedValue({ id: 3 });
    mockPrisma.waiverPeriod.findFirst.mockResolvedValue({ id: 55 });
    const p = (id: number, name: string) => ({ id, name, posPrimary: "OF", mlbTeam: "LAD", mlbId: id + 1000 });
    mockPrisma.waiverAddEntry.findMany.mockResolvedValue([
      { playerId: 100, player: p(100, "Free") },
      { playerId: 101, player: p(101, "Rostered") },
      { playerId: 102, player: p(102, "Taken") },
    ]);
    mockPrisma.roster.findMany.mockImplementation(async ({ where }: any) => {
      if (where.teamId === 3)
        return [
          { playerId: 200, assignedPosition: "OF", player: p(200, "Keep") },
          { playerId: 201, assignedPosition: "C", player: p(201, "Dropped") },
          { playerId: 202, assignedPosition: "IL", player: p(202, "Hurt") },
          { playerId: 203, assignedPosition: null, player: p(203, "Unslotted") },
        ];
      return [{ playerId: 101 }];
    });

    const res = await supertest(appAs(OWNER_3)).get("/api/meeting/sessions/7/choices?teamId=3");

    expect(res.status).toBe(200);
    expect(res.body.list.map((x: any) => x.playerId)).toEqual([100]);
    // IL players are neither droppable nor counted; meeting drops leave the drop list but not the count.
    expect(res.body.roster.map((x: any) => x.playerId)).toEqual([200, 203]);
    expect(res.body.activeCount).toBe(3);
    expect(res.body.list[0]).toEqual({ playerId: 100, name: "Free", pos: "OF", mlbTeam: "LAD", mlbId: 1100 });
    expect(mockPrisma.team.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 3, leagueId: LEAGUE } }),
    );
    expect(mockPrisma.waiverPeriod.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { leagueId: LEAGUE, status: { in: ["PENDING", "LOCKED"] } },
        orderBy: { deadlineAt: "desc" },
      }),
    );
    expect(mockPrisma.waiverAddEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { periodId: 55, teamId: 3 }, orderBy: { priority: "asc" } }),
    );
    const rosteredCall = mockPrisma.roster.findMany.mock.calls.find((c: any) => c[0].where.team);
    expect(rosteredCall[0].where).toEqual({
      playerId: { in: [100, 101, 102] },
      releasedAt: null,
      team: { leagueId: LEAGUE },
    });
    const teamCall = mockPrisma.roster.findMany.mock.calls.find((c: any) => c[0].where.teamId === 3);
    expect(teamCall[0].where).toEqual({ teamId: 3, releasedAt: null });
    expect(teamCall[0].select).toEqual(expect.objectContaining({ assignedPosition: true }));
  });

  it("owner of another team → 403", async () => {
    mockPrisma.meetingSession.findUnique.mockResolvedValue(sessionRow(runningState(), 3));
    mockPrisma.team.findFirst.mockResolvedValue({ id: 3 });
    const res = await supertest(appAs(OWNER_4)).get("/api/meeting/sessions/7/choices?teamId=3");
    expect(res.status).toBe(403);
  });
});

// ── Handed off ───────────────────────────────────────────────────

describe("POST /sessions/:id/handed-off", () => {
  it("stamps handedOffAt without a version bump", async () => {
    const ended = { ...runningState(), status: "ended" as const };
    mockPrisma.meetingSession.findUnique.mockResolvedValue(sessionRow(ended, 6));
    mockPrisma.meetingSession.update.mockImplementation(async ({ data }: any) => ({ ...sessionRow(ended, 6), ...data }));

    const res = await supertest(appAs(COMMISH)).post("/api/meeting/sessions/7/handed-off").send({});

    expect(res.status).toBe(200);
    const args = mockPrisma.meetingSession.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: 7 });
    expect(args.data.handedOffAt).toBeInstanceOf(Date);
    expect(args.data.version).toBeUndefined();
    expect(res.body.version).toBe(6);
    expect(typeof res.body.session.handedOffAt).toBe("string");
  });

  it("refuses before the meeting has ended → 400 \"End the meeting first\"", async () => {
    mockPrisma.meetingSession.findUnique.mockResolvedValue(sessionRow(runningState(), 6));
    const res = await supertest(appAs(COMMISH)).post("/api/meeting/sessions/7/handed-off").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("End the meeting first");
    expect(mockPrisma.meetingSession.update).not.toHaveBeenCalled();
  });
});
