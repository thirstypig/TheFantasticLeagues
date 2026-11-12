/**
 * UX step F final fix wave — server items S1, S2, S3, S5, S6, S7.
 *
 * Same harness as engineRoutes.test.ts (the REAL auction router through
 * supertest, edges mocked), with one difference: the season guard is REAL, so
 * season-status tests go through `requireSeasonStatus` / `getCurrentSeasonStatus`
 * and assert the prisma.season query, not a stub.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextFunction, Request, Response } from "express";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    team: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    teamOwnership: { findFirst: vi.fn(), findUnique: vi.fn() },
    player: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    roster: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    auctionLot: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    auctionBid: { create: vi.fn(), deleteMany: vi.fn() },
    league: { findUnique: vi.fn() },
    leagueMembership: { findUnique: vi.fn() },
    leagueRule: { findUnique: vi.fn(), findMany: vi.fn() },
    season: { findFirst: vi.fn() },
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
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
// NOTE: middleware/seasonGuard.js is deliberately NOT mocked.
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
import { prisma } from "../../../db/prisma.js";
import { auctionRouter } from "../routes.js";
import { broadcastState } from "../services/auctionWsService.js";
import {
  auctionStates,
  autoFinishTimers,
  clearAutoFinishTimer,
  clearNominationTimer,
  createDefaultState,
  handleNominationTimeout,
  nominateLocks,
  nominationTimers,
  scheduleNominationTimer,
  timeoutPending,
  undoLocks,
} from "../lib/auctionStateManager.js";
import type { AuctionState, AuctionTeam } from "../types.js";

const mockPrisma = prisma as any;
const mockBroadcast = broadcastState as unknown as ReturnType<typeof vi.fn>;

const LEAGUE = 7;
const ADMIN = { id: 1, isAdmin: true };
const COMMISH = { id: 2, isAdmin: false };
const OWNER_A = { id: 3, isAdmin: false }; // owns team 10

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

function seedBidding(): AuctionState {
  const s = seedNominating({ status: "bidding" });
  s.nomination = {
    playerId: "999", playerName: "Up Now", playerTeam: "LAD", positions: "OF",
    isPitcher: false, nominatorTeamId: 10, currentBid: 5, highBidderTeamId: 11,
    endTime: new Date(Date.now() + 10_000).toISOString(), timerDuration: 15, status: "running",
  };
  return s;
}

function deferred<T = unknown>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

/** Poll (macrotask) until `cond` holds. */
async function until(cond: () => boolean, ms = 4000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error("until: timed out");
    await new Promise((r) => setTimeout(r, 2));
  }
}

const nominateBody = {
  leagueId: LEAGUE, nominatorTeamId: 10, playerId: "555", playerName: "New Guy",
  startBid: 1, positions: "OF", team: "SF", isPitcher: false,
};

/** Fire a request now; supertest is lazy until .then is called. */
const fire = (t: supertest.Test) => t.then((r) => r);

beforeEach(() => {
  vi.clearAllMocks();
  auctionStates.clear();
  nominateLocks.clear();
  undoLocks.clear();
  timeoutPending.clear();
  owners.clear();
  owners.set(OWNER_A.id, [10]);
  mockPrisma.leagueMembership.findUnique.mockImplementation(async ({ where }: any) =>
    where.leagueId_userId.userId === COMMISH.id ? { role: "COMMISSIONER" } : { role: "OWNER" },
  );
  mockPrisma.season.findFirst.mockResolvedValue({ status: "DRAFT" });
  mockPrisma.player.findFirst.mockResolvedValue({ id: 5550, mlbId: 555, name: "New Guy", mlbTeam: "SF" });
  mockPrisma.roster.findFirst.mockResolvedValue(null);
  mockPrisma.auctionLot.create.mockResolvedValue({ id: 77 });
  mockPrisma.auctionBid.create.mockResolvedValue({ id: 1 });
  mockPrisma.auctionLot.delete.mockResolvedValue({ id: 77 });
  mockPrisma.auctionBid.deleteMany.mockResolvedValue({ count: 1 });
  mockPrisma.league.findUnique.mockResolvedValue({ season: 2026, sport: "baseball" });
  mockPrisma.team.findMany.mockResolvedValue([]);
});

afterEach(() => {
  clearNominationTimer(LEAGUE);
  clearAutoFinishTimer(LEAGUE);
});

// ── S1: nominate write window ────────────────────────────────────

describe("S1: commissioner routes vs an in-flight nomination", () => {
  const routes = [
    { path: "/pause" },
    { path: "/complete" },
    { path: "/skip-turn" },
    { path: "/undo-finish" },
  ];

  it.each(routes)("$path returns 409 while the nominate lock is held; the nomination then completes cleanly", async ({ path }) => {
    const s = seedNominating();
    s.log.unshift({ type: "WIN", teamId: 11, playerId: "1", playerName: "Old", amount: 3, rosterId: 501, saleKind: "lot", timestamp: 1, message: "won" });
    const gate = deferred<{ id: number }>();
    mockPrisma.auctionLot.create.mockImplementationOnce(() => gate.promise);

    const nom = fire(supertest(app).post("/nominate").set(as(OWNER_A)).send(nominateBody));
    await until(() => mockPrisma.auctionLot.create.mock.calls.length > 0);
    expect(nominateLocks.get(LEAGUE)).toBe(true);

    const r = await supertest(app).post(path).set(as(COMMISH)).send({ leagueId: LEAGUE, expectedRosterId: 501 });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("Nomination in progress, try again");
    // Nothing moved under the nomination.
    expect(s.paused).toBe(false);
    expect(s.status).toBe("nominating");
    expect(s.queueIndex).toBe(0);
    expect(mockPrisma.roster.delete).not.toHaveBeenCalled();

    gate.resolve({ id: 77 });
    const n = await nom;
    expect(n.status).toBe(200);
    expect(s.status).toBe("bidding");
    expect(s.paused).toBe(false);
    expect(s.nomination?.playerId).toBe("555");
    expect(s.nomination?.lotId).toBe(77);
    expect(mockPrisma.auctionLot.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auctionLot.delete).not.toHaveBeenCalled();
  });

  it.each([
    { name: "paused", mutate: (s: AuctionState) => { s.paused = true; } },
    { name: "completed", mutate: (s: AuctionState) => { s.status = "completed"; } },
    { name: "turn moved on", mutate: (s: AuctionState) => { s.queueIndex = 1; } },
  ])("a state change landing during the inserts ($name) cancels the lot: 409, lot deleted, no lot runs", async ({ mutate }) => {
    const s = seedNominating();
    const gate = deferred<{ id: number }>();
    mockPrisma.auctionBid.create.mockImplementationOnce(() => gate.promise);

    const nom = fire(supertest(app).post("/nominate").set(as(OWNER_A)).send(nominateBody));
    await until(() => mockPrisma.auctionBid.create.mock.calls.length > 0);
    mutate(s); // a path that bypassed the lock (defence in depth)
    const statusBefore = s.status;
    gate.resolve({ id: 1 });

    const n = await nom;
    expect(n.status).toBe(409);
    expect(n.body.error).toBe("Turn no longer active");
    expect(mockPrisma.auctionBid.deleteMany).toHaveBeenCalledWith({ where: { lotId: 77 } });
    expect(mockPrisma.auctionLot.delete).toHaveBeenCalledWith({ where: { id: 77 } });
    expect(s.nomination).toBeNull();
    expect(s.status).toBe(statusBefore);
    expect(s.log.some((e) => e.type === "NOMINATION")).toBe(false);
    expect(autoFinishTimers.has(LEAGUE)).toBe(false);
    expect(mockBroadcast.mock.calls.some(([, st]: any) => st.status === "bidding")).toBe(false);
    expect(nominateLocks.get(LEAGUE)).toBeFalsy();
  });
});

// ── S2: undo race and target ─────────────────────────────────────

describe("S2: undo lock and expected rosterId", () => {
  function seedWithSales(): AuctionState {
    const s = seedNominating();
    s.log.unshift({ type: "WIN", teamId: 11, playerId: "1", playerName: "A", amount: 3, rosterId: 501, saleKind: "lot", timestamp: 1, message: "won" });
    s.log.unshift({ type: "WIN", teamId: 12, playerId: "2", playerName: "B", amount: 4, rosterId: 502, saleKind: "lot", timestamp: 2, message: "won" });
    mockPrisma.roster.findFirst.mockImplementation(async ({ where }: any) => ({
      id: where.id, playerId: 900 + where.id, price: 4,
      player: { name: "B" }, team: { name: "Gamma" },
    }));
    mockPrisma.roster.delete.mockResolvedValue({});
    return s;
  }

  it("a double press gives exactly one delete; the second press gets 409", async () => {
    seedWithSales();
    const gate = deferred<unknown>();
    mockPrisma.roster.delete.mockImplementationOnce(() => gate.promise);

    const first = fire(supertest(app).post("/undo-finish").set(as(COMMISH)).send({ leagueId: LEAGUE, expectedRosterId: 502 }));
    await until(() => mockPrisma.roster.delete.mock.calls.length > 0);
    const second = await supertest(app).post("/undo-finish").set(as(COMMISH)).send({ leagueId: LEAGUE, expectedRosterId: 502 });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("Undo in progress, try again");

    gate.resolve({});
    const r1 = await first;
    expect(r1.status).toBe(200);
    expect(mockPrisma.roster.delete).toHaveBeenCalledTimes(1);
    expect(mockPrisma.roster.delete).toHaveBeenCalledWith({ where: { id: 502 } });
    expect(undoLocks.get(LEAGUE)).toBeFalsy();
  });

  it("two presses fired together: exactly one delete", async () => {
    seedWithSales();
    const [a, b] = await Promise.all([
      supertest(app).post("/undo-finish").set(as(COMMISH)).send({ leagueId: LEAGUE, expectedRosterId: 502 }),
      supertest(app).post("/undo-finish").set(as(COMMISH)).send({ leagueId: LEAGUE, expectedRosterId: 502 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(mockPrisma.roster.delete).toHaveBeenCalledTimes(1);
  });

  it("a stale expected rosterId gets 409 'Sales changed — refresh' and deletes nothing", async () => {
    const s = seedWithSales();
    const r = await supertest(app).post("/undo-finish").set(as(COMMISH)).send({ leagueId: LEAGUE, expectedRosterId: 501 });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("Sales changed — refresh");
    expect(mockPrisma.roster.delete).not.toHaveBeenCalled();
    expect(s.log.find((e) => e.rosterId === 502)?.undone).toBeUndefined();
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("a missing expected rosterId gets 409 when the newest sale has a rosterId", async () => {
    seedWithSales();
    const r = await supertest(app).post("/undo-finish").set(as(COMMISH)).send({ leagueId: LEAGUE });
    expect(r.status).toBe(409);
    expect(mockPrisma.roster.delete).not.toHaveBeenCalled();
  });

  it("a legacy WIN without rosterId is accepted without the check", async () => {
    const s = seedNominating();
    s.log.unshift({ type: "WIN", teamId: 11, playerName: "Legacy", amount: 3, timestamp: 1, message: "won" });
    mockPrisma.roster.findFirst.mockResolvedValue({ id: 400, playerId: 9, price: 3, player: { name: "Legacy" }, team: { name: "Beta" } });
    mockPrisma.roster.delete.mockResolvedValue({});
    const r = await supertest(app).post("/undo-finish").set(as(COMMISH)).send({ leagueId: LEAGUE });
    expect(r.status).toBe(200);
    expect(mockPrisma.roster.delete).toHaveBeenCalledWith({ where: { id: 400 } });
  });

  it("a P2025 on delete (row vanished) maps to 409, nothing marked undone", async () => {
    const s = seedWithSales();
    mockPrisma.roster.delete.mockRejectedValueOnce(Object.assign(new Error("Record to delete does not exist."), { code: "P2025" }));
    const r = await supertest(app).post("/undo-finish").set(as(COMMISH)).send({ leagueId: LEAGUE, expectedRosterId: 502 });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("Sale already undone");
    expect(s.log.find((e) => e.rosterId === 502)?.undone).toBeUndefined();
    expect(undoLocks.get(LEAGUE)).toBeFalsy();
  });
});

// ── S3: season gating ────────────────────────────────────────────

describe("S3: nothing auto-put-up, resumed, skipped or undone outside DRAFT", () => {
  it("the turn timeout with season IN_SEASON creates no AuctionLot and nominates nothing", async () => {
    const s = seedNominating({ nominationLists: { 10: [555] } });
    mockPrisma.season.findFirst.mockResolvedValue({ status: "IN_SEASON" });
    mockPrisma.player.findMany.mockResolvedValue([{ id: 5550, mlbId: 555, name: "New Guy", posPrimary: "OF", posList: "OF", mlbTeam: "SF" }]);
    mockPrisma.roster.findMany.mockResolvedValue([]);

    await handleNominationTimeout(LEAGUE, s);

    expect(mockPrisma.season.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { leagueId: LEAGUE, status: { not: "COMPLETED" } },
    }));
    expect(mockPrisma.auctionLot.create).not.toHaveBeenCalled();
    expect(mockPrisma.player.findMany).not.toHaveBeenCalled();
    expect(s.nomination).toBeNull();
    expect(s.status).toBe("nominating");
    expect(s.log.some((e) => e.type === "NOMINATION")).toBe(false);
    // No clock left running to fire again.
    expect(nominationTimers.has(LEAGUE)).toBe(false);
    expect(s.nominationEndTime).toBeNull();
  });

  it("control: the same timeout in DRAFT does nominate", async () => {
    const s = seedNominating({ nominationLists: { 10: [555] } });
    mockPrisma.player.findMany.mockResolvedValue([{ id: 5550, mlbId: 555, name: "New Guy", posPrimary: "OF", posList: "OF", mlbTeam: "SF" }]);
    mockPrisma.roster.findMany.mockResolvedValue([]);
    await handleNominationTimeout(LEAGUE, s);
    expect(mockPrisma.auctionLot.create).toHaveBeenCalledTimes(1);
    expect(s.status).toBe("bidding");
  });

  it.each(["/resume", "/skip-turn", "/undo-finish"])("%s is refused (403) outside DRAFT and changes nothing", async (path) => {
    const s = seedNominating({ paused: true });
    s.log.unshift({ type: "WIN", teamId: 11, playerId: "1", playerName: "A", amount: 3, rosterId: 501, saleKind: "lot", timestamp: 1, message: "won" });
    mockPrisma.season.findFirst.mockResolvedValue({ status: "IN_SEASON" });
    const r = await supertest(app).post(path).set(as(COMMISH)).send({ leagueId: LEAGUE, expectedRosterId: 501 });
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/only allowed during DRAFT/);
    expect(s.paused).toBe(true);
    expect(s.queueIndex).toBe(0);
    expect(mockPrisma.roster.delete).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("/skip-turn with leagueId only in the query string still reaches the season check", async () => {
    seedNominating();
    mockPrisma.season.findFirst.mockResolvedValue({ status: "IN_SEASON" });
    const r = await supertest(app).post(`/skip-turn?leagueId=${LEAGUE}`).set(as(COMMISH)).send({});
    expect(r.status).toBe(403);
  });
});

// ── S5: force-assign safety ──────────────────────────────────────

describe("S5: force-assign safety", () => {
  const body = (over: object = {}) => ({
    leagueId: LEAGUE, teamId: 11, playerId: "777", playerName: "Fix Me",
    price: 5, positions: "OF", team: "NYM", isPitcher: false, ...over,
  });
  beforeEach(() => {
    mockPrisma.team.findFirst.mockResolvedValue({ id: 11, name: "Beta", leagueId: LEAGUE });
    mockPrisma.player.findFirst.mockResolvedValue({ id: 7770, mlbId: 777, name: "Fix Me", mlbTeam: "NYM", posPrimary: "OF" });
    mockPrisma.roster.create.mockResolvedValue({ id: 900 });
  });

  it("refuses (409) the player currently up for bid", async () => {
    seedBidding();
    const r = await supertest(app).post("/force-assign").set(as(COMMISH)).send(body({ playerId: "999" }));
    expect(r.status).toBe(409);
    expect(mockPrisma.roster.create).not.toHaveBeenCalled();
  });

  it("refuses a team with no open spot", async () => {
    const s = seedNominating();
    s.teams[1] = team(11, "Beta", { spotsLeft: 0, maxBid: 0, budget: 50 });
    const r = await supertest(app).post("/force-assign").set(as(COMMISH)).send(body());
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/no open roster spot/i);
    expect(mockPrisma.roster.create).not.toHaveBeenCalled();
  });

  it("refuses a price above the team's max bid (calculateMaxBid)", async () => {
    const s = seedNominating();
    // budget 30, 3 spots → max bid 28
    s.teams[1] = team(11, "Beta", { budget: 30, spotsLeft: 3, maxBid: 999 });
    const over = await supertest(app).post("/force-assign").set(as(COMMISH)).send(body({ price: 29 }));
    expect(over.status).toBe(400);
    expect(over.body.error).toMatch(/up to \$28/);
    expect(mockPrisma.roster.create).not.toHaveBeenCalled();

    const ok = await supertest(app).post("/force-assign").set(as(COMMISH)).send(body({ price: 28 }));
    expect(ok.status).toBe(200);
    expect(mockPrisma.roster.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ teamId: 11, playerId: 7770, price: 28, source: "auction_2026" }),
    }));
  });

  it.each(["not_started", "completed"] as const)("refuses (409) when the auction is %s", async (status) => {
    seedNominating({ status });
    const r = await supertest(app).post("/force-assign").set(as(COMMISH)).send(body());
    expect(r.status).toBe(409);
    expect(mockPrisma.roster.create).not.toHaveBeenCalled();
  });

  it("refuses (409) when there is no auction state at all", async () => {
    const r = await supertest(app).post("/force-assign").set(as(COMMISH)).send(body());
    expect(r.status).toBe(409);
    expect(mockPrisma.roster.create).not.toHaveBeenCalled();
  });

  it.each(["nominating", "bidding", "paused"] as const)("allows status %s", async (status) => {
    const s = status === "bidding" ? seedBidding() : seedNominating({ status: status as any });
    expect(s.status).toBe(status);
    const r = await supertest(app).post("/force-assign").set(as(COMMISH)).send(body());
    expect(r.status).toBe(200);
  });

  it("refuses (403) outside DRAFT", async () => {
    seedNominating();
    mockPrisma.season.findFirst.mockResolvedValue({ status: "IN_SEASON" });
    const r = await supertest(app).post("/force-assign").set(as(COMMISH)).send(body());
    expect(r.status).toBe(403);
    expect(mockPrisma.roster.create).not.toHaveBeenCalled();
  });
});

// ── S6: resume when not paused ───────────────────────────────────

describe("S6: /resume when not paused", () => {
  it("returns the state unchanged and does not restart the clock", async () => {
    const s = seedNominating();
    scheduleNominationTimer(LEAGUE, s);
    const endBefore = s.nominationEndTime;
    const timerBefore = nominationTimers.get(LEAGUE);
    await new Promise((r) => setTimeout(r, 5));

    const r = await supertest(app).post("/resume").set(as(COMMISH)).send({ leagueId: LEAGUE });
    expect(r.status).toBe(200);
    expect(r.body.nominationEndTime).toBe(endBefore);
    expect(s.nominationEndTime).toBe(endBefore);
    expect(nominationTimers.get(LEAGUE)).toBe(timerBefore);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});

// ── S7: timeout catch with the nominate lock held ───────────────

describe("S7: a timeout that throws while a nomination holds the lock is deferred", () => {
  it("adds the league to timeoutPending instead of dropping it", async () => {
    const s = seedNominating({ nominationLists: { 10: [555] } });
    s.config.nominationTimer = 0.01; // 10ms clock
    let failLookup!: (e: Error) => void;
    mockPrisma.player.findMany.mockImplementationOnce(() => new Promise((_r, j) => { failLookup = j; }));

    scheduleNominationTimer(LEAGUE, s);
    await until(() => mockPrisma.player.findMany.mock.calls.length > 0);
    nominateLocks.set(LEAGUE, true); // a manual nomination grabbed the lock mid-lookup
    failLookup(new Error("db down"));
    await until(() => timeoutPending.has(LEAGUE));

    expect(timeoutPending.has(LEAGUE)).toBe(true);
    expect(s.log.some((e) => e.type === "SKIP")).toBe(false);
    expect(s.queueIndex).toBe(0);
  });
});
