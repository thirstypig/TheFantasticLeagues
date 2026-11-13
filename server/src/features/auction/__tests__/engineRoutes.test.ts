/**
 * Route-level tests for the auction engine (UX step F, Task 1).
 *
 * These drive the REAL auction routers through supertest. Only the edges are
 * mocked (prisma, auth identity, WebSocket broadcast, persistence, audit log),
 * and every mutation test asserts on BOTH the HTTP status and the state handed
 * to the mocked `broadcastState` — the payload clients actually receive.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextFunction, Request, Response } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    team: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    teamOwnership: { findFirst: vi.fn(), findUnique: vi.fn() },
    player: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    roster: { create: vi.fn(), findFirst: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    auctionLot: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    auctionBid: { create: vi.fn() },
    league: { findUnique: vi.fn() },
    leagueMembership: { findUnique: vi.fn() },
    leagueRule: { findUnique: vi.fn(), findMany: vi.fn() },
    season: { findFirst: vi.fn() },
    auctionSession: { findUnique: vi.fn() },
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
// Owner map: userId -> owned team ids. Drives both requireTeamOwner and isTeamOwner.
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
const seasonNow = vi.hoisted(() => ({ status: "DRAFT" as string | null }));
vi.mock("../../../middleware/seasonGuard.js", () => ({
  requireSeasonStatus: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getCurrentSeasonStatus: async () => seasonNow.status,
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
import { prisma } from "../../../db/prisma.js";
import { auctionRouter } from "../routes.js";
import { broadcastState } from "../services/auctionWsService.js";
import { loadState } from "../services/auctionPersistence.js";
import { writeAuditLog } from "../../../lib/auditLog.js";
import {
  auctionStates,
  clearAutoFinishTimer,
  clearNominationTimer,
  createDefaultState,
  getState,
} from "../lib/auctionStateManager.js";
import type { AuctionState, AuctionTeam } from "../types.js";

const mockPrisma = prisma as any;
const mockBroadcast = broadcastState as unknown as ReturnType<typeof vi.fn>;
const mockAudit = writeAuditLog as unknown as ReturnType<typeof vi.fn>;
const mockLoadState = loadState as unknown as ReturnType<typeof vi.fn>;

// ── Users ────────────────────────────────────────────────────────
const LEAGUE = 7;
const ADMIN = { id: 1, isAdmin: true };
const COMMISH = { id: 2, isAdmin: false }; // commissioner, owns no team
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

/** A league in the nominating phase, team 10's turn. */
function seedNominating(over: Partial<AuctionState> = {}): AuctionState {
  const s = createDefaultState(LEAGUE);
  s.status = "nominating";
  s.teams = [team(10, "Alpha"), team(11, "Beta"), team(12, "Gamma")];
  s.queue = [10, 11, 12];
  s.queueIndex = 0;
  s.config.positionLimits = {};
  Object.assign(s, over);
  auctionStates.set(LEAGUE, s);
  return s;
}

/** A league with a running lot (Beta high at $5), queue on team 10. */
function seedBidding(): AuctionState {
  const s = seedNominating({ status: "bidding" });
  s.nomination = {
    playerId: "999", playerName: "Test Player", playerTeam: "LAD", positions: "OF",
    isPitcher: false, nominatorTeamId: 10, currentBid: 5, highBidderTeamId: 11,
    endTime: new Date(Date.now() + 10_000).toISOString(), timerDuration: 15, status: "running",
  };
  return s;
}

/** The state object most recently handed to broadcastState. */
function lastBroadcast(): AuctionState {
  const calls = mockBroadcast.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][1] as AuctionState;
}

const nominateBody = (nominatorTeamId: number) => ({
  leagueId: LEAGUE, nominatorTeamId, playerId: "555", playerName: "New Guy",
  startBid: 1, positions: "OF", team: "SF", isPitcher: false,
});

beforeEach(() => {
  vi.clearAllMocks();
  auctionStates.clear();
  owners.clear();
  owners.set(OWNER_A.id, [10]);
  owners.set(OWNER_B.id, [11]);
  mockPrisma.leagueMembership.findUnique.mockImplementation(async ({ where }: any) =>
    where.leagueId_userId.userId === COMMISH.id ? { role: "COMMISSIONER" } : { role: "OWNER" },
  );
  mockPrisma.player.findFirst.mockResolvedValue(null);
  mockPrisma.roster.findFirst.mockResolvedValue(null);
  mockPrisma.league.findUnique.mockResolvedValue({ season: 2026, sport: "baseball" });
});

afterEach(() => {
  clearNominationTimer(LEAGUE);
  clearAutoFinishTimer(LEAGUE);
});

// ── Ruling 2: new state fields ───────────────────────────────────

describe("state fields: paused / nominationEndTime", () => {
  it("default state carries paused=false and nominationEndTime=null", () => {
    const s = createDefaultState(LEAGUE);
    expect(s.paused).toBe(false);
    expect(s.nominationEndTime).toBeNull();
  });

  it("old persisted states without the fields load as paused=false, nominationEndTime=null", async () => {
    const legacy: any = createDefaultState(LEAGUE);
    delete legacy.paused;
    delete legacy.nominationEndTime;
    legacy.status = "nominating";
    legacy.queue = [10];
    legacy.config.positionLimits = {};
    mockLoadState.mockResolvedValueOnce(legacy);
    mockPrisma.team.findMany.mockResolvedValueOnce([]);

    const s = await getState(LEAGUE);
    expect(s.paused).toBe(false);
    expect(s.nominationEndTime).toBeNull();
  });

  it("pause in the nominating phase broadcasts paused=true and clears the turn clock; resume restarts it with full time", async () => {
    const s = seedNominating();
    s.config.nominationTimer = 30;
    s.nominationEndTime = new Date(Date.now() + 5_000).toISOString();

    const p = await supertest(app).post("/pause").set(as(COMMISH)).send({ leagueId: LEAGUE });
    expect(p.status).toBe(200);
    expect(lastBroadcast().paused).toBe(true);
    expect(lastBroadcast().nominationEndTime).toBeNull();

    const before = Date.now();
    const r = await supertest(app).post("/resume").set(as(COMMISH)).send({ leagueId: LEAGUE });
    expect(r.status).toBe(200);
    const b = lastBroadcast();
    expect(b.paused).toBe(false);
    expect(b.nominationEndTime).not.toBeNull();
    const end = new Date(b.nominationEndTime!).getTime();
    expect(end).toBeGreaterThanOrEqual(before + 30_000 - 50);
    expect(end).toBeLessThanOrEqual(Date.now() + 30_000 + 50);
  });

  it("pause in the bidding phase broadcasts paused=true; resume broadcasts paused=false", async () => {
    seedBidding();
    await supertest(app).post("/pause").set(as(COMMISH)).send({ leagueId: LEAGUE }).expect(200);
    expect(lastBroadcast().paused).toBe(true);
    expect(lastBroadcast().nomination?.status).toBe("paused");

    await supertest(app).post("/resume").set(as(COMMISH)).send({ leagueId: LEAGUE }).expect(200);
    expect(lastBroadcast().paused).toBe(false);
    expect(lastBroadcast().nomination?.status).toBe("running");
  });

  it("a finished lot schedules the next turn and broadcasts a nominationEndTime", async () => {
    // Undo is the simplest route that schedules a nomination turn
    const s = seedNominating();
    s.config.nominationTimer = 20;
    mockPrisma.roster.findFirst.mockResolvedValueOnce({
      id: 77, playerId: 5, price: 12, player: { name: "Sold Guy" }, team: { name: "Alpha" },
    });
    mockPrisma.team.findMany.mockResolvedValueOnce([]);
    const res = await supertest(app).post("/undo-finish").set(as(ADMIN)).send({ leagueId: LEAGUE });
    expect(res.status).toBe(200);
    expect(lastBroadcast().nominationEndTime).not.toBeNull();
  });
});

// ── Ruling 3a: /bid and /proxy-bid rejected while paused ─────────

describe("3a: bids are rejected while paused", () => {
  it("/bid after /pause returns 409 'Auction is paused' and changes nothing", async () => {
    const s = seedBidding();
    await supertest(app).post("/pause").set(as(COMMISH)).send({ leagueId: LEAGUE }).expect(200);
    mockBroadcast.mockClear();

    const res = await supertest(app).post("/bid").set(as(OWNER_A))
      .send({ leagueId: LEAGUE, bidderTeamId: 10, amount: 6 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Auction is paused");
    expect(mockBroadcast).not.toHaveBeenCalled();
    expect(s.nomination!.currentBid).toBe(5);
    expect(s.nomination!.highBidderTeamId).toBe(11);
  });

  it("/bid returns 409 when state.paused is set even if the lot looks running", async () => {
    const s = seedBidding();
    s.paused = true;
    const res = await supertest(app).post("/bid").set(as(OWNER_A))
      .send({ leagueId: LEAGUE, bidderTeamId: 10, amount: 6 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Auction is paused");
  });

  it("/bid on a running lot still works and broadcasts the new high bid", async () => {
    seedBidding();
    const res = await supertest(app).post("/bid").set(as(OWNER_A))
      .send({ leagueId: LEAGUE, bidderTeamId: 10, amount: 6 });
    expect(res.status).toBe(200);
    expect(lastBroadcast().nomination?.currentBid).toBe(6);
    expect(lastBroadcast().nomination?.highBidderTeamId).toBe(10);
  });

  it("/proxy-bid placement returns 409 'Auction is paused' while paused", async () => {
    const s = seedBidding();
    await supertest(app).post("/pause").set(as(COMMISH)).send({ leagueId: LEAGUE }).expect(200);
    mockBroadcast.mockClear();
    const res = await supertest(app).post("/proxy-bid").set(as(OWNER_A))
      .send({ leagueId: LEAGUE, bidderTeamId: 10, maxBid: 30 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Auction is paused");
    expect(mockBroadcast).not.toHaveBeenCalled();
    expect(s.nomination!.currentBid).toBe(5);
  });
});

// ── Ruling 3b: /nominate enforces turn, phase and pause ──────────

describe("3b: /nominate enforces whose turn it is", () => {
  it("owner nominating out of turn gets 409 and nothing is broadcast", async () => {
    const s = seedNominating();
    const res = await supertest(app).post("/nominate").set(as(OWNER_B)).send(nominateBody(11));
    expect(res.status).toBe(409);
    expect(mockBroadcast).not.toHaveBeenCalled();
    expect(s.status).toBe("nominating");
    expect(s.nomination).toBeNull();
  });

  it("owner nominating on their turn succeeds; broadcast shows bidding and a cleared turn clock", async () => {
    const s = seedNominating();
    s.nominationEndTime = new Date(Date.now() + 5_000).toISOString();
    const res = await supertest(app).post("/nominate").set(as(OWNER_A)).send(nominateBody(10));
    expect(res.status).toBe(200);
    const b = lastBroadcast();
    expect(b.status).toBe("bidding");
    expect(b.nomination?.nominatorTeamId).toBe(10);
    expect(b.nominationEndTime).toBeNull();
  });

  it("rejects with 409 while the auction is paused, even on your turn", async () => {
    seedNominating({ paused: true });
    const res = await supertest(app).post("/nominate").set(as(OWNER_A)).send(nominateBody(10));
    expect(res.status).toBe(409);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("rejects with 409 when a lot is already being bid on", async () => {
    seedBidding();
    const res = await supertest(app).post("/nominate").set(as(OWNER_A)).send(nominateBody(10));
    expect(res.status).toBe(409);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("commissioner (not an owner) may nominate for the team whose turn it is", async () => {
    seedNominating();
    const res = await supertest(app).post("/nominate").set(as(COMMISH)).send(nominateBody(10));
    expect(res.status).toBe(200);
    expect(lastBroadcast().nomination?.nominatorTeamId).toBe(10);
    expect(lastBroadcast().nomination?.highBidderTeamId).toBe(10);
  });

  it("commissioner may NOT nominate for a team that is not on the clock (409)", async () => {
    seedNominating();
    const res = await supertest(app).post("/nominate").set(as(COMMISH)).send(nominateBody(11));
    expect(res.status).toBe(409);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("a plain owner cannot nominate for someone else's team, even on its turn (403)", async () => {
    seedNominating();
    const res = await supertest(app).post("/nominate").set(as(OWNER_B)).send(nominateBody(10));
    expect(res.status).toBe(403);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});

// ── Ruling 4: commissioner authorization ─────────────────────────

describe("4: commissioner may undo and end; a plain owner may not", () => {
  const lastSale = () => ({
    id: 77, playerId: 5, price: 12, player: { name: "Sold Guy" }, team: { name: "Alpha" },
  });

  it("/undo-finish: commissioner 200 with UNDO in broadcast log and an audit row", async () => {
    seedNominating();
    mockPrisma.roster.findFirst.mockResolvedValueOnce(lastSale());
    mockPrisma.team.findMany.mockResolvedValueOnce([]);
    const res = await supertest(app).post("/undo-finish").set(as(COMMISH)).send({ leagueId: LEAGUE });
    expect(res.status).toBe(200);
    expect(mockPrisma.roster.delete).toHaveBeenCalledWith({ where: { id: 77 } });
    expect(lastBroadcast().log[0].type).toBe("UNDO");
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "AUCTION_UNDO", userId: COMMISH.id }));
  });

  it("/undo-finish: plain owner 403, nothing deleted", async () => {
    seedNominating();
    const res = await supertest(app).post("/undo-finish").set(as(OWNER_A)).send({ leagueId: LEAGUE });
    expect(res.status).toBe(403);
    expect(mockPrisma.roster.delete).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("/complete: commissioner 200, broadcast completed with an END log entry and an audit row", async () => {
    seedNominating();
    const res = await supertest(app).post("/complete").set(as(COMMISH)).send({ leagueId: LEAGUE });
    expect(res.status).toBe(200);
    const b = lastBroadcast();
    expect(b.status).toBe("completed");
    expect(b.log[0].type).toBe("END");
    expect(b.nominationEndTime).toBeNull();
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "AUCTION_COMPLETE", userId: COMMISH.id }));
  });

  it("/complete: plain owner 403, auction still running", async () => {
    const s = seedNominating();
    const res = await supertest(app).post("/complete").set(as(OWNER_A)).send({ leagueId: LEAGUE });
    expect(res.status).toBe(403);
    expect(s.status).toBe("nominating");
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("/init: a plain owner can't start the auction", async () => {
    const res = await supertest(app).post("/init").set(as(OWNER_A)).send({ leagueId: LEAGUE });
    expect(res.status).toBe(403);
  });

  it("/init: the commissioner starts an auction that hasn't started", async () => {
    mockPrisma.season.findFirst.mockResolvedValue(null);
    mockPrisma.leagueRule.findMany.mockResolvedValue([]);
    mockPrisma.leagueRule.findUnique.mockResolvedValue(null);
    mockPrisma.team.findMany.mockResolvedValue([]);
    auctionStates.set(LEAGUE, createDefaultState(LEAGUE));
    const res = await supertest(app).post("/init").set(as(COMMISH)).send({ leagueId: LEAGUE });
    expect(res.status).toBe(200);
    expect(auctionStates.get(LEAGUE)!.status).toBe("nominating");
    clearNominationTimer(LEAGUE);
  });

  it("/init: a commissioner can't start once the season is under way", async () => {
    seasonNow.status = "IN_SEASON";
    try {
      auctionStates.set(LEAGUE, createDefaultState(LEAGUE));
      const res = await supertest(app).post("/init").set(as(COMMISH)).send({ leagueId: LEAGUE });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("An auction can only start before the season");
      expect(auctionStates.get(LEAGUE)!.status).toBe("not_started");
    } finally {
      seasonNow.status = "DRAFT";
    }
  });

  it("/init: a saved live auction counts even when nothing is in memory (no fail-open)", async () => {
    auctionStates.clear();
    mockPrisma.auctionSession.findUnique.mockResolvedValueOnce({ state: { status: "bidding" } });
    const res = await supertest(app).post("/init").set(as(COMMISH)).send({ leagueId: LEAGUE });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("The auction is already running");
    expect(auctionStates.has(LEAGUE)).toBe(false);
  });

  it("/init: a DB error reading the saved auction refuses the start (fails closed)", async () => {
    auctionStates.clear();
    mockPrisma.auctionSession.findUnique.mockRejectedValueOnce(new Error("db down"));
    const res = await supertest(app).post("/init").set(as(COMMISH)).send({ leagueId: LEAGUE });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(auctionStates.has(LEAGUE)).toBe(false);
  });

  it("/init: a second tap while the first start is in flight is refused", async () => {
    // Hold the first start mid-flight (its first DB read) so the two really overlap.
    let release!: () => void;
    const held = new Promise<null>(r => { release = () => r(null); });
    mockPrisma.season.findFirst.mockReturnValueOnce(held as never).mockResolvedValue(null);
    mockPrisma.leagueRule.findMany.mockResolvedValue([]);
    mockPrisma.leagueRule.findUnique.mockResolvedValue(null);
    mockPrisma.team.findMany.mockResolvedValue([]);
    auctionStates.set(LEAGUE, createDefaultState(LEAGUE));

    const first = supertest(app).post("/init").set(as(COMMISH)).send({ leagueId: LEAGUE }).then(r => r);
    await vi.waitFor(() => expect(mockPrisma.season.findFirst).toHaveBeenCalled());
    const second = await supertest(app).post("/init").set(as(COMMISH)).send({ leagueId: LEAGUE });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("The auction is already starting");
    release();
    expect((await first).status).toBe(200);
    clearNominationTimer(LEAGUE);
  });

  it("/init: the commissioner can't restart a live or finished auction (it would wipe it)", async () => {
    const s = seedNominating();
    const live = await supertest(app).post("/init").set(as(COMMISH)).send({ leagueId: LEAGUE });
    expect(live.status).toBe(409);
    expect(live.body.error).toBe("The auction is already running");
    expect(auctionStates.get(LEAGUE)).toBe(s);

    s.status = "completed";
    const done = await supertest(app).post("/init").set(as(COMMISH)).send({ leagueId: LEAGUE });
    expect(done.status).toBe(409);
    expect(done.body.error).toBe("This auction has already finished");
    expect(auctionStates.get(LEAGUE)).toBe(s);
  });
});

// ── Ruling 5: skip turn ──────────────────────────────────────────

describe("5: POST /skip-turn", () => {
  it("commissioner skips: queue advances, SKIP logged, turn clock restarted, audited", async () => {
    const s = seedNominating();
    s.config.nominationTimer = 25;
    const res = await supertest(app).post(`/skip-turn?leagueId=${LEAGUE}`).set(as(COMMISH)).send({});
    expect(res.status).toBe(200);
    const b = lastBroadcast();
    expect(b.queueIndex).toBe(1);
    expect(b.log[0].type).toBe("SKIP");
    expect(b.log[0].teamId).toBe(10);
    expect(b.log[0].reason).toBe("commissioner");
    expect(b.nominationEndTime).not.toBeNull();
    expect(new Date(b.nominationEndTime!).getTime()).toBeGreaterThan(Date.now() + 20_000);
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "AUCTION_SKIP_TURN", userId: COMMISH.id }));
  });

  it("skips past full teams (reuses advanceQueue)", async () => {
    const s = seedNominating();
    s.teams[1].spotsLeft = 0; // Beta full
    await supertest(app).post(`/skip-turn?leagueId=${LEAGUE}`).set(as(ADMIN)).send({}).expect(200);
    expect(lastBroadcast().queueIndex).toBe(2);
  });

  it("completes the auction when every other roster is full", async () => {
    const s = seedNominating();
    s.teams.forEach((t) => (t.spotsLeft = 0));
    await supertest(app).post(`/skip-turn?leagueId=${LEAGUE}`).set(as(ADMIN)).send({}).expect(200);
    const b = lastBroadcast();
    expect(b.status).toBe("completed");
    expect(b.nominationEndTime).toBeNull();
  });

  it("while paused: advances the turn but keeps the clock stopped", async () => {
    seedNominating({ paused: true });
    await supertest(app).post(`/skip-turn?leagueId=${LEAGUE}`).set(as(COMMISH)).send({}).expect(200);
    const b = lastBroadcast();
    expect(b.queueIndex).toBe(1);
    expect(b.paused).toBe(true);
    expect(b.nominationEndTime).toBeNull();
  });

  it("plain owner gets 403", async () => {
    const s = seedNominating();
    const res = await supertest(app).post(`/skip-turn?leagueId=${LEAGUE}`).set(as(OWNER_A)).send({});
    expect(res.status).toBe(403);
    expect(s.queueIndex).toBe(0);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("409 when not in the nominating phase", async () => {
    const s = seedBidding();
    const res = await supertest(app).post(`/skip-turn?leagueId=${LEAGUE}`).set(as(COMMISH)).send({});
    expect(res.status).toBe(409);
    expect(s.queueIndex).toBe(0);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});

// ── Ruling 6: every fix is logged ────────────────────────────────

describe("6: force-assign is logged as ASSIGN", () => {
  it("adds an ASSIGN entry to the broadcast log and an audit row", async () => {
    seedNominating();
    mockPrisma.team.findFirst.mockResolvedValueOnce({ id: 11, name: "Beta", leagueId: LEAGUE });
    mockPrisma.player.create.mockResolvedValueOnce({ id: 88, posPrimary: "OF", mlbTeam: "SF" });
    mockPrisma.roster.create.mockResolvedValueOnce({ id: 5150 }); // real prisma returns the created row
    mockPrisma.team.findMany.mockResolvedValueOnce([]);
    const res = await supertest(app).post("/force-assign").set(as(COMMISH)).send({
      leagueId: LEAGUE, teamId: 11, playerId: "555", playerName: "New Guy",
      price: 3, positions: "OF", team: "SF", isPitcher: false,
    });
    expect(res.status).toBe(200);
    const types = lastBroadcast().log.map((l) => l.type);
    expect(types).toContain("ASSIGN");
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "AUCTION_FORCE_ASSIGN" }));
  });
});

// ── Task 6 fix round 1: undo targets the exact sale ──────────────

describe("undo-finish undoes exactly the newest sale that is not undone", () => {
  const win = (rosterId: number, playerId: string, name: string, teamId: number, saleKind: "lot" | "assign", ts: number) => ({
    type: "WIN" as const, teamId, teamName: teamId === 10 ? "Alpha" : "Beta", playerId, playerName: name,
    amount: 10, rosterId, saleKind, timestamp: ts, message: `won ${name}`,
  });

  /** Roster rows that still exist; findFirst answers only for these ids, delete removes them. */
  function rosterRows(rows: Array<{ id: number; name: string; team: string }>) {
    const live = new Map(rows.map((r) => [r.id, r]));
    mockPrisma.roster.findFirst.mockImplementation(async ({ where }: any) => {
      if (typeof where?.id !== "number") return null; // legacy newest-by-acquiredAt query
      const r = live.get(where.id);
      return r ? { id: r.id, playerId: r.id + 1000, price: 10, player: { name: r.name }, team: { name: r.team } } : null;
    });
    mockPrisma.roster.delete.mockImplementation(async ({ where }: any) => { live.delete(where.id); return {}; });
    mockPrisma.team.findMany.mockResolvedValue([]);
    return live;
  }

  // Like the client: name the newest live sale's rosterId (final fix S2).
  const undo = () => {
    const live = auctionStates.get(LEAGUE)?.log.find((e) => e.type === "WIN" && !e.undone);
    return supertest(app).post("/undo-finish").set(as(COMMISH)).send({ leagueId: LEAGUE, expectedRosterId: live?.rosterId });
  };

  it("sell A then B: undo deletes B's row, then A's row, then refuses", async () => {
    const s = seedNominating({ queueIndex: 2 });
    s.log = [
      win(502, "2", "Bee Player", 11, "lot", 20),
      { type: "NOMINATION", timestamp: 15, message: "n" },
      win(501, "1", "Aye Player", 10, "lot", 10),
    ];
    rosterRows([{ id: 501, name: "Aye Player", team: "Alpha" }, { id: 502, name: "Bee Player", team: "Beta" }]);

    const r1 = await undo();
    expect(r1.status).toBe(200);
    expect(mockPrisma.roster.delete).toHaveBeenCalledTimes(1);
    expect(mockPrisma.roster.delete).toHaveBeenLastCalledWith({ where: { id: 502 } });
    let b = lastBroadcast();
    expect(b.log[0]).toMatchObject({ type: "UNDO", playerId: "2", rosterId: 502, playerName: "Bee Player" });
    expect(b.log.find((e) => e.rosterId === 502 && e.type === "WIN")?.undone).toBe(true);
    expect(b.log.find((e) => e.rosterId === 501 && e.type === "WIN")?.undone).toBeFalsy();

    const r2 = await undo();
    expect(r2.status).toBe(200);
    expect(mockPrisma.roster.delete).toHaveBeenCalledTimes(2);
    expect(mockPrisma.roster.delete).toHaveBeenLastCalledWith({ where: { id: 501 } });
    b = lastBroadcast();
    expect(b.log[0]).toMatchObject({ type: "UNDO", playerId: "1", rosterId: 501 });

    const r3 = await undo();
    expect([400, 409]).toContain(r3.status);
    expect(mockPrisma.roster.delete).toHaveBeenCalledTimes(2);
  });

  it("the sale's roster row is already gone: 409 'Sale already undone', nothing deleted", async () => {
    const s = seedNominating();
    s.log = [win(600, "6", "Gone Guy", 10, "lot", 5)];
    rosterRows([]);
    const res = await undo();
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Sale already undone");
    expect(mockPrisma.roster.delete).not.toHaveBeenCalled();
  });

  it("the row lookup keeps the season/source and league guard", async () => {
    const s = seedNominating();
    s.log = [win(501, "1", "Aye Player", 10, "lot", 10)];
    rosterRows([{ id: 501, name: "Aye Player", team: "Alpha" }]);
    await undo();
    expect(mockPrisma.roster.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 501, source: "auction_2026", team: { leagueId: LEAGUE }, releasedAt: null },
    }));
  });

  it("undoing a lot sale rewinds the turn one team", async () => {
    const s = seedNominating({ queueIndex: 1 });
    s.log = [win(501, "1", "Aye Player", 10, "lot", 10)];
    rosterRows([{ id: 501, name: "Aye Player", team: "Alpha" }]);
    await undo().expect(200);
    expect(lastBroadcast().queueIndex).toBe(0);
  });

  it("undoing a force-assign leaves the turn where it is", async () => {
    const s = seedNominating({ queueIndex: 1 });
    s.log = [
      { type: "ASSIGN", teamId: 11, playerId: "3", timestamp: 11, message: "a" },
      win(503, "3", "Assigned Guy", 11, "assign", 10),
    ];
    rosterRows([{ id: 503, name: "Assigned Guy", team: "Beta" }]);
    await undo().expect(200);
    expect(mockPrisma.roster.delete).toHaveBeenCalledWith({ where: { id: 503 } });
    expect(lastBroadcast().queueIndex).toBe(1);
  });

  it("LEGACY: a WIN without rosterId falls back to the newest auction row and marks that WIN undone", async () => {
    const s = seedNominating({ queueIndex: 1 });
    s.log = [{ type: "WIN", teamId: 10, teamName: "Alpha", playerName: "Old Sale", amount: 4, timestamp: 1, message: "w" }];
    mockPrisma.roster.findFirst.mockResolvedValueOnce({
      id: 77, playerId: 5, price: 4, player: { name: "Old Sale" }, team: { name: "Alpha" },
    });
    mockPrisma.team.findMany.mockResolvedValue([]);
    await undo().expect(200);
    expect(mockPrisma.roster.findFirst).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { acquiredAt: "desc" } }));
    expect(mockPrisma.roster.delete).toHaveBeenCalledWith({ where: { id: 77 } });
    const b = lastBroadcast();
    expect(b.log.find((e) => e.type === "WIN")?.undone).toBe(true);
    expect(b.queueIndex).toBe(0); // legacy: no saleKind, rewinds as before
  });

  it("undo while paused does not start the turn clock", async () => {
    const s = seedNominating({ paused: true });
    s.config.nominationTimer = 20;
    s.log = [win(501, "1", "Aye Player", 10, "lot", 10)];
    rosterRows([{ id: 501, name: "Aye Player", team: "Alpha" }]);
    await undo().expect(200);
    const b = lastBroadcast();
    expect(b.paused).toBe(true);
    expect(b.nominationEndTime).toBeNull();
  });
});

describe("WIN entries carry playerId, rosterId and saleKind", () => {
  it("a finished lot logs WIN with the lot's mlbId, the created roster id and saleKind 'lot'", async () => {
    seedBidding();
    mockPrisma.player.create.mockResolvedValueOnce({ id: 88, posPrimary: "OF", mlbTeam: "LAD" });
    mockPrisma.roster.create.mockResolvedValueOnce({ id: 4242 });
    mockPrisma.team.findMany.mockResolvedValue([]);
    const res = await supertest(app).post("/finish").set(as(ADMIN)).send({ leagueId: LEAGUE });
    expect(res.status).toBe(200);
    const w = lastBroadcast().log.find((e) => e.type === "WIN");
    expect(w).toMatchObject({ playerId: "999", rosterId: 4242, saleKind: "lot" });
  });

  it("force-assign logs WIN with the mlbId, the created roster id and saleKind 'assign'", async () => {
    seedNominating();
    mockPrisma.team.findFirst.mockResolvedValueOnce({ id: 11, name: "Beta", leagueId: LEAGUE });
    mockPrisma.player.create.mockResolvedValueOnce({ id: 88, posPrimary: "OF", mlbTeam: "SF" });
    mockPrisma.roster.create.mockResolvedValueOnce({ id: 5151 });
    mockPrisma.team.findMany.mockResolvedValue([]);
    const res = await supertest(app).post("/force-assign").set(as(COMMISH)).send({
      leagueId: LEAGUE, teamId: 11, playerId: "555", playerName: "New Guy",
      price: 3, positions: "OF", team: "SF", isPitcher: false,
    });
    expect(res.status).toBe(200);
    const w = lastBroadcast().log.find((e) => e.type === "WIN");
    expect(w).toMatchObject({ playerId: "555", rosterId: 5151, saleKind: "assign" });
  });
});
