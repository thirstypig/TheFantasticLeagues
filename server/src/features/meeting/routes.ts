/**
 * /api/meeting — live period meeting (turn clock for between-period add/drops).
 *
 * Every state change is read → reduce (pure, lib/reducer.ts) → compare-and-set
 * on `version`. Zero rows updated → 409, and the client refetches. No timers:
 * expiry is computed on read from `turnEndsAt` and `serverNow`.
 *
 * Meeting code never writes Roster. Only Review & save does.
 * Spec: docs/superpowers/specs/2026-11-13-live-meeting-design.md ("Turn flow", "API").
 */
import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { Prisma, type MeetingSession } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import {
  requireAuth,
  requireCommissionerOrAdmin,
  requireLeagueMember,
  isTeamOwner,
} from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { getLeagueStatsSource, getTeamsForSource } from "../../lib/mlbTeams.js";
import {
  MeetingStateSchema,
  OpenBodySchema,
  OrderBodySchema,
  PassBodySchema,
  SubmitBodySchema,
  VersionBodySchema,
  type MeetingPlayer,
  type MeetingSessionResponse,
  type MeetingState,
  type OpenBody,
  type OrderBody,
  type PassBody,
  type SubmitBody,
  type VersionBody,
} from "../../../../shared/api/meeting.js";
import {
  createMeetingState,
  currentTeamId,
  reduceMeeting,
  MeetingRuleError,
  type Actor,
  type MeetingAction,
  type ReduceResult,
} from "./lib/reducer.js";
import { readMeetingSettings } from "./lib/settings.js";
import { markSeen, onlineTeamIds } from "./lib/presence.js";

const router = Router();

// ─── Errors ──────────────────────────────────────────────────────────

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

/** The compare-and-set updated 0 rows (or the client acted on a stale version). */
class CasLost extends Error {
  constructor() {
    super("The meeting just changed");
    this.name = "CasLost";
  }
}

function handle(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof MeetingRuleError) {
        res.status(400).json({ error: err.message });
      } else if (err instanceof CasLost) {
        res.status(409).json({ error: err.message });
      } else if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
      } else {
        next(err);
      }
    }
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

type LoadedSession = Omit<MeetingSession, "state"> & { state: MeetingState };

function parseSession(row: MeetingSession): LoadedSession {
  return { ...row, state: MeetingStateSchema.parse(row.state) };
}

function toResponse(row: LoadedSession | null, leagueId: number, nowMs: number): MeetingSessionResponse {
  const handedOffAt = row?.handedOffAt
    ? row.handedOffAt instanceof Date
      ? row.handedOffAt.toISOString()
      : String(row.handedOffAt)
    : null;
  return {
    session: row
      ? { id: row.id, leagueId: row.leagueId, periodId: row.periodId, handedOffAt, state: row.state }
      : null,
    version: row?.version ?? 0,
    serverNow: new Date(nowMs).toISOString(),
    online: onlineTeamIds(leagueId, nowMs),
  };
}

/**
 * Loads `:id` into res.locals.session and sets req.params.leagueId from the row,
 * so `requireCommissionerOrAdmin("leagueId")` can run next in the same route.
 */
const loadSession: RequestHandler = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid session id" });
      return;
    }
    const row = await prisma.meetingSession.findUnique({ where: { id } });
    if (!row) {
      res.status(404).json({ error: "Meeting not found" });
      return;
    }
    res.locals.session = parseSession(row);
    req.params.leagueId = String(row.leagueId);
    next();
  } catch (err) {
    next(err);
  }
};

async function isCommissionerOrAdmin(req: Request, leagueId: number): Promise<boolean> {
  if (req.user!.isAdmin) return true;
  const m = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId, userId: req.user!.id } },
    select: { role: true },
  });
  return m?.role === "COMMISSIONER";
}

/** Commissioner if commissioner/admin of the league, else owner of `teamId`, else 403. */
async function resolveActor(req: Request, leagueId: number, teamId: number): Promise<Actor> {
  if (await isCommissionerOrAdmin(req, leagueId)) return { kind: "commissioner" };
  if (await isTeamOwner(teamId, req.user!.id)) return { kind: "owner", teamId };
  throw new HttpError(403, "Not authorized.");
}

/**
 * Cheap turn check before any player/roster read, so a caller can't probe
 * another league's rosters through submit (and gets the turn error first).
 * Messages match the reducer's.
 */
function requireTurn(state: MeetingState, teamId: number): void {
  if (state.status === "ended") throw new MeetingRuleError("The meeting has ended");
  if (state.status !== "running" || !state.order.includes(teamId) || teamId !== currentTeamId(state)) {
    throw new MeetingRuleError("It isn't your turn");
  }
}

/**
 * Compare-and-set write. When the turn ran over and the league charges for it,
 * the CAS and the ledger row share one transaction; a lost CAS throws inside it
 * so no ledger row is written.
 */
async function commit(session: LoadedSession, result: ReduceResult, actorUserId: number): Promise<LoadedSession> {
  const where = { id: session.id, version: session.version };
  const data = { state: result.state as unknown as Prisma.InputJsonValue, version: session.version + 1 };
  const fee = session.state.settings.overtimeFee;
  const overtime = result.overtime;

  if (overtime && fee > 0) {
    const period = await prisma.period.findUnique({ where: { id: session.periodId }, select: { name: true } });
    const reason = period ? `Over time at the ${period.name} meeting` : "Over time at the meeting";
    await prisma.$transaction(async (tx) => {
      const r = await tx.meetingSession.updateMany({ where, data });
      if (r.count === 0) throw new CasLost();
      await tx.financeLedger.create({
        data: {
          type: "meeting_overtime",
          amount: Math.round(fee),
          periodId: session.periodId,
          teamId: overtime.teamId,
          reason,
          createdBy: actorUserId,
        },
      });
    });
  } else {
    const r = await prisma.meetingSession.updateMany({ where, data });
    if (r.count === 0) throw new CasLost();
  }

  return { ...session, state: result.state, version: session.version + 1 };
}

/** Reduce + commit + respond, for every versioned session action. */
async function act(req: Request, res: Response, bodyVersion: number, action: MeetingAction, actor: Actor) {
  const session = res.locals.session as LoadedSession;
  if (bodyVersion !== session.version) throw new CasLost();
  const nowMs = Date.now();
  const result = reduceMeeting(session.state, action, actor, nowMs);
  const saved = await commit(session, result, req.user!.id);
  res.json(toResponse(saved, saved.leagueId, nowMs));
}

const PLAYER_SELECT = { id: true, name: true, posPrimary: true, mlbTeam: true, mlbId: true } as const;

type PlayerRow = { id: number; name: string; posPrimary: string; mlbTeam: string | null; mlbId: number | null };

function toMeetingPlayer(p: PlayerRow): MeetingPlayer {
  return { playerId: p.id, name: p.name, pos: p.posPrimary, mlbTeam: p.mlbTeam ?? null, mlbId: p.mlbId ?? null };
}

/**
 * Same policy as transactions/lib/freeAgent.ts (not imported — ADR-015):
 * "FA" sentinel is fine; empty/null is refused; otherwise the MLB team must be
 * in the league's stats source (no filter for ALL/Other).
 */
async function isInPlayerPool(mlbTeam: string | null, leagueId: number): Promise<boolean> {
  const team = mlbTeam ?? "";
  if (!team) return false;
  if (team === "FA") return true;
  const allowed = getTeamsForSource(await getLeagueStatsSource(leagueId));
  return allowed === null || allowed.has(team);
}

// ─── GET current ─────────────────────────────────────────────────────

router.get(
  "/leagues/:leagueId/current",
  requireAuth,
  requireLeagueMember("leagueId"),
  handle(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const nowMs = Date.now();
    const userId = req.user!.id;

    const [rows, myTeams] = await Promise.all([
      prisma.meetingSession.findMany({ where: { leagueId }, orderBy: { periodId: "desc" } }),
      prisma.team.findMany({
        where: { leagueId, OR: [{ ownerUserId: userId }, { ownerships: { some: { userId } } }] },
        select: { id: true },
      }),
    ]);
    markSeen(leagueId, myTeams.map((t) => t.id), nowMs);

    const sessions = rows.map(parseSession);
    const pick = sessions.find((s) => s.state.status !== "ended") ?? sessions[0] ?? null;
    res.json(toResponse(pick, leagueId, nowMs));
  }),
);

// ─── POST open ───────────────────────────────────────────────────────

router.post(
  "/leagues/:leagueId/open",
  requireAuth,
  requireCommissionerOrAdmin("leagueId"),
  validateBody(OpenBodySchema),
  handle(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const { periodId, order } = req.body as OpenBody;

    const settings = await readMeetingSettings(leagueId);
    if (!settings.live) throw new HttpError(400, "Turn on the live meeting in Rules first");

    const [pending, active] = await Promise.all([
      prisma.period.findFirst({ where: { id: periodId, leagueId, status: "pending" }, select: { id: true } }),
      prisma.period.findFirst({ where: { leagueId, status: "active" }, select: { id: true } }),
    ]);
    if (!pending || active) throw new HttpError(400, "Close the period before opening the meeting");

    const listRun = await prisma.waiverPeriod.findFirst({
      where: { leagueId, status: "LOCKED", addEntries: { some: { outcome: { not: "PENDING" } } } },
      select: { id: true },
    });
    if (listRun) throw new HttpError(409, "A List run is in progress");

    const teams = await prisma.team.findMany({ where: { leagueId }, select: { id: true } });
    const teamIds = new Set(teams.map((t) => t.id));
    const exactPermutation =
      order.length === teamIds.size && new Set(order).size === order.length && order.every((t) => teamIds.has(t));
    if (!exactPermutation) throw new HttpError(400, "The order must include every team exactly once");

    const state = createMeetingState(order, {
      turnSeconds: settings.turnSeconds,
      canAddTime: settings.canAddTime,
      overtimeFee: settings.overtimeFee,
    });
    let row: MeetingSession;
    try {
      row = await prisma.meetingSession.upsert({
        where: { leagueId_periodId: { leagueId, periodId } },
        create: { leagueId, periodId, state: state as unknown as Prisma.InputJsonValue },
        update: {},
      });
    } catch (err) {
      // Two opens raced: the other request's insert won the unique key. Return its session.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;
      const existing = await prisma.meetingSession.findUnique({
        where: { leagueId_periodId: { leagueId, periodId } },
      });
      if (!existing) throw err;
      row = existing;
    }
    res.json(toResponse(parseSession(row), leagueId, Date.now()));
  }),
);

// ─── Commissioner session actions ────────────────────────────────────

router.post(
  "/sessions/:id/order",
  requireAuth,
  loadSession,
  requireCommissionerOrAdmin("leagueId"),
  validateBody(OrderBodySchema),
  handle(async (req, res) => {
    const { order, version } = req.body as OrderBody;
    await act(req, res, version, { type: "setOrder", order }, { kind: "commissioner" });
  }),
);

const SIMPLE_ACTIONS: Record<string, MeetingAction> = {
  start: { type: "start" },
  pause: { type: "pause" },
  resume: { type: "resume" },
  "add-time": { type: "addTime" },
  skip: { type: "skip" },
  end: { type: "end" },
};

for (const [path, action] of Object.entries(SIMPLE_ACTIONS)) {
  router.post(
    `/sessions/:id/${path}`,
    requireAuth,
    loadSession,
    requireCommissionerOrAdmin("leagueId"),
    validateBody(VersionBodySchema),
    handle(async (req, res) => {
      const { version } = req.body as VersionBody;
      await act(req, res, version, action, { kind: "commissioner" });
    }),
  );
}

router.post(
  "/sessions/:id/handed-off",
  requireAuth,
  loadSession,
  requireCommissionerOrAdmin("leagueId"),
  handle(async (_req, res) => {
    const session = res.locals.session as LoadedSession;
    if (session.state.status !== "ended") throw new HttpError(400, "End the meeting first");
    // Not a turn-state change: no version bump.
    const row = await prisma.meetingSession.update({
      where: { id: session.id },
      data: { handedOffAt: new Date() },
    });
    res.json(toResponse(parseSession(row), session.leagueId, Date.now()));
  }),
);

// ─── Submit / pass (owner on the clock, or commissioner) ────────────

router.post(
  "/sessions/:id/submit",
  requireAuth,
  validateBody(SubmitBodySchema),
  loadSession,
  handle(async (req, res) => {
    const session = res.locals.session as LoadedSession;
    const { teamId, addPlayerId, dropPlayerId, version } = req.body as SubmitBody;
    if (addPlayerId === dropPlayerId) throw new HttpError(400, "Pick a different player to drop");

    const actor = await resolveActor(req, session.leagueId, teamId);
    requireTurn(session.state, teamId);

    const [add, drop] = await Promise.all([
      prisma.player.findUnique({ where: { id: addPlayerId }, select: PLAYER_SELECT }),
      prisma.player.findUnique({ where: { id: dropPlayerId }, select: PLAYER_SELECT }),
    ]);
    if (!add || !drop) throw new HttpError(400, "Player not found");

    const addRostered = await prisma.roster.findFirst({
      where: { playerId: addPlayerId, releasedAt: null, team: { leagueId: session.leagueId } },
      select: { id: true },
    });
    if (addRostered) throw new HttpError(400, "That player is already on a team");
    if (!(await isInPlayerPool(add.mlbTeam, session.leagueId))) {
      throw new HttpError(400, "That player isn't in this league's player pool");
    }

    const dropOnTeam = await prisma.roster.findFirst({
      where: { playerId: dropPlayerId, teamId, releasedAt: null },
      select: { id: true },
    });
    if (!dropOnTeam) throw new HttpError(400, "That player isn't on this team");

    await act(
      req,
      res,
      version,
      { type: "submit", teamId, add: toMeetingPlayer(add), drop: toMeetingPlayer(drop), moveId: randomUUID() },
      actor,
    );
  }),
);

router.post(
  "/sessions/:id/pass",
  requireAuth,
  validateBody(PassBodySchema),
  loadSession,
  handle(async (req, res) => {
    const session = res.locals.session as LoadedSession;
    const { teamId, version } = req.body as PassBody;
    const actor = await resolveActor(req, session.leagueId, teamId);
    requireTurn(session.state, teamId);
    await act(req, res, version, { type: "pass", teamId }, actor);
  }),
);

// ─── Choices for a team's turn ───────────────────────────────────────

router.get(
  "/sessions/:id/choices",
  requireAuth,
  loadSession,
  handle(async (req, res) => {
    const session = res.locals.session as LoadedSession;
    const leagueId = session.leagueId;
    const teamId = Number(req.query.teamId);
    if (!Number.isInteger(teamId)) throw new HttpError(400, "Invalid teamId");

    const team = await prisma.team.findFirst({ where: { id: teamId, leagueId }, select: { id: true } });
    if (!team) throw new HttpError(404, "Team not found");
    await resolveActor(req, leagueId, teamId);

    const picked = new Set(session.state.moves.map((m) => m.add.playerId));
    const dropped = new Set(session.state.moves.map((m) => m.drop.playerId));

    const period = await prisma.waiverPeriod.findFirst({
      where: { leagueId, status: { in: ["PENDING", "LOCKED"] } },
      // Same ordering field wire-list uses for its periods (deadlineAt); newest first.
      orderBy: { deadlineAt: "desc" },
      select: { id: true },
    });

    let list: MeetingPlayer[] = [];
    if (period) {
      const entries = await prisma.waiverAddEntry.findMany({
        where: { periodId: period.id, teamId },
        orderBy: { priority: "asc" },
        select: { playerId: true, player: { select: PLAYER_SELECT } },
      });
      const ids = entries.map((e) => e.playerId);
      const rostered = ids.length
        ? await prisma.roster.findMany({
            where: { playerId: { in: ids }, releasedAt: null, team: { leagueId } },
            select: { playerId: true },
          })
        : [];
      const rosteredIds = new Set(rostered.map((r) => r.playerId));
      list = entries
        .filter((e) => !rosteredIds.has(e.playerId) && !picked.has(e.playerId))
        .map((e) => toMeetingPlayer(e.player));
    }

    const rosterRows = await prisma.roster.findMany({
      where: { teamId, releasedAt: null },
      select: { playerId: true, assignedPosition: true, player: { select: PLAYER_SELECT } },
    });
    // IL players can't be dropped here and don't count (as on today's meeting page).
    // Every meeting move is add + drop, so the active count holds for the whole meeting.
    const active = rosterRows.filter((r) => r.assignedPosition !== "IL");
    const roster = active.filter((r) => !dropped.has(r.playerId)).map((r) => toMeetingPlayer(r.player));

    res.json({ list, roster, activeCount: active.length });
  }),
);

export const meetingRouter = router;
