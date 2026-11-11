/**
 * "My list" on the server and auto-put-up on turn timeout (UX step F, Task 2,
 * Ruling 7).
 *
 * Same harness as engineRoutes.test.ts: the REAL auction routers through
 * supertest, with only the edges mocked. Prisma mocks hand back whatever rows
 * we give them regardless of the WHERE clause, so every DB-backed eligibility
 * test also asserts the query arguments.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextFunction, Request, Response } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    team: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    teamOwnership: { findFirst: vi.fn(), findUnique: vi.fn() },
    player: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    roster: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    auctionLot: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    auctionBid: { create: vi.fn() },
    league: { findUnique: vi.fn() },
    leagueMembership: { findUnique: vi.fn(), findFirst: vi.fn() },
    leagueRule: { findUnique: vi.fn(), findMany: vi.fn() },
    season: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/supabase.js", () => ({
  supabaseAdmin: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email: "a@example.com" } }, error: null }) },
  },
}));
const owners = vi.hoisted(() => new Map<number, number[]>());
vi.mock("../../../middleware/auth.js", () => {
  const ownsTeam = (teamId: number, userId: number) => (owners.get(userId) ?? []).includes(teamId);
  return {
    requireAuth: (req: any, res: any, next: () => void) =>
      req.user ? next() : res.status(401).json({ error: "Not authenticated" }),
    requireAdmin: (req: any, res: any, next: () => void) =>
      req.user?.isAdmin ? next() : res.status(403).json({ error: "Admin only" }),
    requireTeamOwner: (src = "teamId") => (req: any, res: any, next: () => void) => {
      const teamId = Number(req.params[src] ?? req.body?.[src]);
      if (req.user.isAdmin || ownsTeam(teamId, req.user.id)) return next();
      return res.status(403).json({ error: "You do not own this team" });
    },
    isTeamOwner: async (teamId: number, userId: number) => ownsTeam(teamId, userId),
    requireLeagueMember: () => (_req: any, _res: any, next: () => void) => next(),
    requireCommissionerOrAdmin: () => (_req: any, _res: any, next: () => void) => next(),
  };
});
vi.mock("../../../middleware/seasonGuard.js", () => ({
  requireSeasonStatus: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../../../lib/rosterGuard.js", () => ({ assertPlayerAvailable: vi.fn() }));
vi.mock("../services/auctionWsService.js", () => ({ broadcastState: vi.fn() }));
vi.mock("../services/auctionPersistence.js", () => ({
  saveState: vi.fn().mockResolvedValue(undefined),
  loadState: vi.fn().mockResolvedValue(null),
  clearState: vi.fn().mockResolvedValue(undefined),
}));

import express from "express";
import supertest from "supertest";
import http from "http";
import { WebSocket } from "ws";
import { prisma } from "../../../db/prisma.js";
import { auctionRouter } from "../routes.js";
import { broadcastState } from "../services/auctionWsService.js";
import { saveState } from "../services/auctionPersistence.js";
import {
  auctionStates,
  clearAutoFinishTimer,
  clearNominationTimer,
  createDefaultState,
  scheduleNominationTimer,
} from "../lib/auctionStateManager.js";
import type { AuctionState, AuctionTeam } from "../types.js";

const mockPrisma = prisma as any;
const mockBroadcast = broadcastState as unknown as ReturnType<typeof vi.fn>;
const mockSave = saveState as unknown as ReturnType<typeof vi.fn>;

// ── Users / app ──────────────────────────────────────────────────
const LEAGUE = 7;
const ADMIN = { id: 1, isAdmin: true };
const OWNER_A = { id: 3, isAdmin: false }; // owns team 10
const OWNER_B = { id: 4, isAdmin: false }; // owns team 11

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  const raw = req.header("x-test-user");
  if (raw) (req as any).user = JSON.parse(raw);
  next();
});
app.use(auctionRouter);

const as = (user: object) => ({ "x-test-user": JSON.stringify(user) });

function team(id: number, name: string, over: Partial<AuctionTeam> = {}): AuctionTeam {
  return {
    id, name, code: name.slice(0, 3).toUpperCase(),
    budget: 200, maxBid: 180, rosterCount: 2, spotsLeft: 21,
    pitcherCount: 1, hitterCount: 1, positionCounts: {}, roster: [],
    ...over,
  };
}

function seedNominating(over: Partial<AuctionState> = {}): AuctionState {
  const s = createDefaultState(LEAGUE);
  s.status = "nominating";
  s.teams = [team(10, "Alpha"), team(11, "Beta"), team(12, "Gamma")];
  s.queue = [10, 11, 12];
  s.queueIndex = 0;
  s.config.positionLimits = {};
  s.config.nominationTimer = 30;
  Object.assign(s, over);
  auctionStates.set(LEAGUE, s);
  return s;
}

function lastBroadcast(): AuctionState {
  const calls = mockBroadcast.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][1] as AuctionState;
}

/** Player table fixture, keyed by mlbId. Player 999 is deliberately absent. */
const PLAYERS: Record<number, { id: number; mlbId: number; name: string; posPrimary: string; posList: string; mlbTeam: string }> = {
  101: { id: 1, mlbId: 101, name: "Rostered Elsewhere", posPrimary: "OF", posList: "OF", mlbTeam: "LAD" },
  102: { id: 2, mlbId: 102, name: "Sold Today", posPrimary: "OF", posList: "OF", mlbTeam: "SF" },
  103: { id: 3, mlbId: 103, name: "Blocked Catcher", posPrimary: "C", posList: "C", mlbTeam: "SD" },
  104: { id: 4, mlbId: 104, name: "Good Pick", posPrimary: "SS", posList: "2B,SS", mlbTeam: "ATL" },
  105: { id: 5, mlbId: 105, name: "Backup Pick", posPrimary: "SP", posList: "SP", mlbTeam: "NYM" },
};
/** Player ids that the DB says are on an active roster in LEAGUE. */
const ROSTERED_PLAYER_IDS = new Set([1]);

function wirePlayerTable() {
  mockPrisma.player.findMany.mockImplementation(async ({ where }: any) =>
    (where?.mlbId?.in ?? []).map((m: number) => PLAYERS[m]).filter(Boolean),
  );
  mockPrisma.player.findFirst.mockImplementation(async ({ where }: any) => PLAYERS[where?.mlbId] ?? null);
  mockPrisma.roster.findMany.mockImplementation(async ({ where }: any) =>
    (where?.playerId?.in ?? []).filter((id: number) => ROSTERED_PLAYER_IDS.has(id)).map((playerId: number) => ({ playerId })),
  );
  mockPrisma.roster.findFirst.mockImplementation(async ({ where }: any) =>
    ROSTERED_PLAYER_IDS.has(where?.playerId) ? { id: 900, playerId: where.playerId } : null,
  );
}

/** Let the async timeout handler run its awaited prisma calls to completion. */
async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}

beforeEach(() => {
  vi.clearAllMocks();
  auctionStates.clear();
  owners.clear();
  owners.set(OWNER_A.id, [10]);
  owners.set(OWNER_B.id, [11]);
  mockPrisma.leagueMembership.findUnique.mockResolvedValue({ role: "OWNER" });
  mockPrisma.team.findUnique.mockImplementation(async ({ where }: any) =>
    [10, 11, 12].includes(where.id) ? { id: where.id, leagueId: LEAGUE, ownerUserId: null } : null,
  );
  mockPrisma.auctionLot.create.mockResolvedValue({ id: 77 });
  mockPrisma.auctionBid.create.mockResolvedValue({});
  mockPrisma.league.findUnique.mockResolvedValue({ season: 2026, sport: "baseball" });
  wirePlayerTable();
});

afterEach(() => {
  vi.useRealTimers();
  clearNominationTimer(LEAGUE);
  clearAutoFinishTimer(LEAGUE);
});

// ── GET / PUT /my-list ───────────────────────────────────────────

describe("GET/PUT /my-list", () => {
  it("owner can save and read back their list; it is persisted with the state", async () => {
    const s = seedNominating();
    const put = await supertest(app).put(`/my-list?leagueId=${LEAGUE}`).set(as(OWNER_A))
      .send({ teamId: 10, mlbIds: [104, 101, 104, 105] });
    expect(put.status).toBe(200);
    // Deduped, order preserved
    expect(put.body).toEqual({ teamId: 10, mlbIds: [104, 101, 105] });
    expect(s.nominationLists?.[10]).toEqual([104, 101, 105]);
    expect(mockSave).toHaveBeenCalled();
    const saved = mockSave.mock.calls[mockSave.mock.calls.length - 1][1] as AuctionState;
    expect(saved.nominationLists?.[10]).toEqual([104, 101, 105]);

    const get = await supertest(app).get(`/my-list?leagueId=${LEAGUE}&teamId=10`).set(as(OWNER_A));
    expect(get.status).toBe(200);
    expect(get.body).toEqual({ teamId: 10, mlbIds: [104, 101, 105] });
  });

  it("GET returns an empty list when the team has none", async () => {
    seedNominating();
    const get = await supertest(app).get(`/my-list?leagueId=${LEAGUE}&teamId=10`).set(as(OWNER_A));
    expect(get.status).toBe(200);
    expect(get.body).toEqual({ teamId: 10, mlbIds: [] });
  });

  it("PUT for another owner's team is 403 and changes nothing", async () => {
    const s = seedNominating({ nominationLists: { 10: [104] } });
    const put = await supertest(app).put(`/my-list?leagueId=${LEAGUE}`).set(as(OWNER_B))
      .send({ teamId: 10, mlbIds: [101] });
    expect(put.status).toBe(403);
    expect(s.nominationLists?.[10]).toEqual([104]);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("GET for another owner's team is 403 and leaks nothing", async () => {
    seedNominating({ nominationLists: { 10: [104] } });
    const get = await supertest(app).get(`/my-list?leagueId=${LEAGUE}&teamId=10`).set(as(OWNER_B));
    expect(get.status).toBe(403);
    expect(get.body.mlbIds).toBeUndefined();
  });

  it("rejects a team that is not in this league (404)", async () => {
    seedNominating();
    owners.set(OWNER_A.id, [10, 50]);
    mockPrisma.team.findUnique.mockResolvedValueOnce({ id: 50, leagueId: 999, ownerUserId: OWNER_A.id });
    const put = await supertest(app).put(`/my-list?leagueId=${LEAGUE}`).set(as(OWNER_A))
      .send({ teamId: 50, mlbIds: [101] });
    expect(put.status).toBe(404);
    expect(mockPrisma.team.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 50 } }));
  });

  it("accepts exactly 50 ids and rejects 51 with 400", async () => {
    const s = seedNominating();
    const fifty = Array.from({ length: 50 }, (_, i) => i + 1);
    const ok = await supertest(app).put(`/my-list?leagueId=${LEAGUE}`).set(as(OWNER_A))
      .send({ teamId: 10, mlbIds: fifty });
    expect(ok.status).toBe(200);
    expect(s.nominationLists?.[10]).toHaveLength(50);

    const tooMany = await supertest(app).put(`/my-list?leagueId=${LEAGUE}`).set(as(OWNER_A))
      .send({ teamId: 10, mlbIds: [...fifty, 51] });
    expect(tooMany.status).toBe(400);
    expect(s.nominationLists?.[10]).toHaveLength(50);
  });

  it("rejects non-positive or non-integer ids with 400", async () => {
    seedNominating();
    for (const bad of [[0], [-3], [1.5], ["7"]]) {
      const res = await supertest(app).put(`/my-list?leagueId=${LEAGUE}`).set(as(OWNER_A))
        .send({ teamId: 10, mlbIds: bad });
      expect(res.status).toBe(400);
    }
  });
});

// ── Never broadcast ──────────────────────────────────────────────

describe("nominationLists never leaves the server in state payloads", () => {
  it("GET /state strips nominationLists", async () => {
    seedNominating({ nominationLists: { 10: [104, 105], 11: [101] } });
    const res = await supertest(app).get(`/state?leagueId=${LEAGUE}`).set(as(OWNER_A));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("nominating");
    expect("nominationLists" in res.body).toBe(false);
  });

  it("route responses that return the state (e.g. /nominate, /skip-turn) strip it too", async () => {
    seedNominating({ nominationLists: { 10: [104], 11: [101] } });
    const nom = await supertest(app).post("/nominate").set(as(OWNER_A)).send({
      leagueId: LEAGUE, nominatorTeamId: 10, playerId: "104", playerName: "Good Pick",
      startBid: 1, positions: "SS", team: "ATL", isPitcher: false,
    });
    expect(nom.status).toBe(200);
    expect("nominationLists" in nom.body).toBe(false);

    seedNominating({ nominationLists: { 10: [104] } });
    const skip = await supertest(app).post("/skip-turn").set(as(ADMIN)).send({ leagueId: LEAGUE });
    expect(skip.status).toBe(200);
    expect("nominationLists" in skip.body).toBe(false);
  });

  it("the real WebSocket broadcast payload contains neither nominationLists nor proxyBids", async () => {
    const real = await vi.importActual<typeof import("../services/auctionWsService.js")>(
      "../services/auctionWsService.js",
    );
    mockPrisma.user.findUnique.mockResolvedValue({ id: 3, name: "A", email: "a@example.com" });
    mockPrisma.leagueMembership.findFirst.mockResolvedValue({ id: 1 });

    const server = http.createServer();
    const wss = real.attachAuctionWs(server);
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as any).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/auction?token=t&leagueId=${LEAGUE}`);
    try {
      await new Promise((r, j) => { ws.once("open", r); ws.once("error", j); });
      // Room join happens after async auth lookups on the server side
      await new Promise((r) => setTimeout(r, 50));

      const s = seedNominating({ nominationLists: { 10: [104, 105] } });
      s.nomination = {
        playerId: "104", playerName: "Good Pick", playerTeam: "ATL", positions: "SS",
        isPitcher: false, nominatorTeamId: 10, currentBid: 3, highBidderTeamId: 11,
        endTime: new Date().toISOString(), timerDuration: 15, status: "running",
        proxyBids: { 11: 40 },
      };
      const msg = new Promise<string>((r) => ws.once("message", (d) => r(d.toString())));
      real.broadcastState(LEAGUE, s);
      const payload = JSON.parse(await msg);
      expect(payload.status).toBe("nominating");
      expect(payload.teams).toHaveLength(3);
      expect("nominationLists" in payload).toBe(false);
      expect(payload.nomination.proxyBids).toBeUndefined();
      // The real state is untouched
      expect(s.nominationLists?.[10]).toEqual([104, 105]);
      expect(s.nomination.proxyBids).toEqual({ 11: 40 });
    } finally {
      ws.close();
      wss.close();
      await new Promise((r) => server.close(r));
    }
  });
});

// ── Auto-put-up on turn timeout ──────────────────────────────────

describe("turn clock runs out: auto-put-up from the team's list", () => {
  it("skips rostered, sold-in-this-auction, missing and position-blocked players; nominates the first eligible at $1", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const s = seedNominating({
      // 101 rostered (DB), 102 sold today (state roster), 999 not in Player,
      // 103 catcher but team 10's C slot is full, 104 eligible, 105 also eligible.
      nominationLists: { 10: [101, 102, 999, 103, 104, 105] },
    });
    s.config.positionLimits = { C: 1 };
    s.teams[0].positionCounts = { C: 1 };
    s.teams[1].roster = [{ id: 1, playerId: 2, mlbId: 102, playerName: "Sold Today", price: 4 }];

    scheduleNominationTimer(LEAGUE, s);
    await vi.advanceTimersByTimeAsync(30_000);
    await flush();

    const b = lastBroadcast();
    expect(b.status).toBe("bidding");
    expect(b.nomination).toMatchObject({
      playerId: "104", playerName: "Good Pick", playerTeam: "ATL",
      nominatorTeamId: 10, highBidderTeamId: 10, currentBid: 1, isPitcher: false, status: "running",
    });
    // Primary position first so checkPositionLimit reads the right slot
    expect(b.nomination!.positions.split(",")[0]).toBe("SS");
    expect(b.log[0]).toMatchObject({ type: "NOMINATION", teamId: 10, playerId: "104", amount: 1 });
    expect(b.nominationEndTime).toBeNull();

    // The DB eligibility query really is league-scoped and active-only
    expect(mockPrisma.player.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { mlbId: { in: [101, 102, 999, 103, 104, 105] } } }),
    );
    expect(mockPrisma.roster.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { playerId: { in: expect.arrayContaining([1]) }, team: { leagueId: LEAGUE }, releasedAt: null } }),
    );
    // Lot created for the right player, once
    expect(mockPrisma.auctionLot.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auctionLot.create).toHaveBeenCalledWith({
      data: { playerId: 4, nominatingTeamId: 10, status: "active" },
    });
    // The list itself is untouched
    expect(s.nominationLists?.[10]).toEqual([101, 102, 999, 103, 104, 105]);
  });

  it("uses the same nominate core as POST /nominate (identical AuctionLot/AuctionBid writes and nomination shape)", async () => {
    // 1) Manual nomination through the route
    seedNominating();
    const res = await supertest(app).post("/nominate").set(as(OWNER_A)).send({
      leagueId: LEAGUE, nominatorTeamId: 10, playerId: "104", playerName: "Good Pick",
      startBid: 1, positions: "SS,2B", team: "ATL", isPitcher: false,
    });
    expect(res.status).toBe(200);
    const manualLot = mockPrisma.auctionLot.create.mock.calls[0][0];
    const manualBid = mockPrisma.auctionBid.create.mock.calls[0][0];
    const manualNom = { ...lastBroadcast().nomination! };
    const manualLog = { ...lastBroadcast().log[0] };
    clearAutoFinishTimer(LEAGUE);

    // 2) Timeout nomination for the same player
    vi.clearAllMocks();
    wirePlayerTable();
    mockPrisma.auctionLot.create.mockResolvedValue({ id: 77 });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const s = seedNominating({ nominationLists: { 10: [104] } });
    scheduleNominationTimer(LEAGUE, s);
    await vi.advanceTimersByTimeAsync(30_000);
    await flush();

    expect(mockPrisma.auctionLot.create.mock.calls[0][0]).toEqual(manualLot);
    expect(mockPrisma.auctionBid.create.mock.calls[0][0]).toEqual(manualBid);
    const autoNom = lastBroadcast().nomination!;
    const strip = ({ endTime: _e, ...rest }: any) => rest;
    expect(strip(autoNom)).toEqual(strip(manualNom));
    const stripTs = ({ timestamp: _t, ...rest }: any) => rest;
    expect(stripTs(lastBroadcast().log[0])).toEqual(stripTs(manualLog));
  });

  it("an exhausted list skips the turn and logs SKIP with reason 'timeout'", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const s = seedNominating({ nominationLists: { 10: [101, 999] } });

    scheduleNominationTimer(LEAGUE, s);
    await vi.advanceTimersByTimeAsync(30_000);
    await flush();

    const b = lastBroadcast();
    expect(b.status).toBe("nominating");
    expect(b.queueIndex).toBe(1);
    expect(b.nomination).toBeNull();
    expect(b.log[0]).toMatchObject({ type: "SKIP", reason: "timeout", teamId: 10, teamName: "Alpha" });
    // Next team's clock is running
    expect(b.nominationEndTime).not.toBeNull();
    expect(mockPrisma.auctionLot.create).not.toHaveBeenCalled();
  });

  it("a team with no list skips with reason 'timeout' and makes no player queries", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const s = seedNominating();

    scheduleNominationTimer(LEAGUE, s);
    await vi.advanceTimersByTimeAsync(30_000);
    await flush();

    expect(lastBroadcast().log[0]).toMatchObject({ type: "SKIP", reason: "timeout", teamId: 10 });
    expect(s.queueIndex).toBe(1);
    expect(mockPrisma.player.findMany).not.toHaveBeenCalled();
  });

  it("completes the auction on a timeout skip when every other roster is full", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const s = seedNominating();
    s.teams[0].spotsLeft = 0; // team 10 itself is full too, after the skip nobody has room
    s.teams[1].spotsLeft = 0;
    s.teams[2].spotsLeft = 0;

    scheduleNominationTimer(LEAGUE, s);
    await vi.advanceTimersByTimeAsync(30_000);
    await flush();

    const b = lastBroadcast();
    expect(b.status).toBe("completed");
    expect(b.log[0]).toMatchObject({ type: "SKIP", reason: "timeout" });
    expect(b.nominationEndTime).toBeNull();
  });

  it("no clock runs while paused, so nothing is auto-nominated", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const s = seedNominating({ paused: true, nominationLists: { 10: [104] } });

    scheduleNominationTimer(LEAGUE, s);
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();

    expect(mockBroadcast).not.toHaveBeenCalled();
    expect(s.status).toBe("nominating");
    expect(s.queueIndex).toBe(0);
  });

  it("does nothing if the auction is paused while the list lookup is in flight", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const s = seedNominating({ nominationLists: { 10: [104] } });
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    mockPrisma.player.findMany.mockImplementationOnce(async ({ where }: any) => {
      await gate;
      return where.mlbId.in.map((m: number) => PLAYERS[m]).filter(Boolean);
    });

    scheduleNominationTimer(LEAGUE, s);
    await vi.advanceTimersByTimeAsync(30_000);
    s.paused = true; // commissioner pauses mid-lookup
    release();
    await flush();

    expect(s.status).toBe("nominating");
    expect(s.nomination).toBeNull();
    expect(mockPrisma.auctionLot.create).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});
