/**
 * Archive player check: the names on archived rosters that the matcher could
 * not settle on its own, and a person's decision on each.
 *
 *   GET    /api/archive/player-check                 the names to decide + per-season counts
 *   PUT    /api/archive/player-check/:id/decision    confirm / pick / keep / reject
 *   DELETE /api/archive/player-check/:id/decision    undo
 *   GET    /api/archive/player-check/:id/search?q=   find someone who isn't a listed candidate
 *
 * Mounted inside the archive router, after its members-only guard, so every
 * route here already has a signed-in user who may see the archive. Rules live
 * in lib/archive/playerReview.ts.
 */
import express from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { validateBody } from "../../middleware/validate.js";
import { writeAuditLog } from "../../lib/auditLog.js";
import { logger } from "../../lib/logger.js";
import {
  canChangeDecision, decisionError, decisionResolution, defaultResolution,
  type DecisionInput, type ReviewDetail,
} from "../../lib/archive/playerReview.js";
import {
  PlayerCheckDecisionBodySchema,
  type PlayerCheckDecisionBody, type PlayerCheckItem, type PlayerCheckItemResponse, type PlayerCheckResponse,
  type PlayerCheckSearchResponse, type PlayerCheckStatus,
} from "../../../../shared/api/archivePlayerCheck.js";
import { archiveSeasonScope } from "./archiveAccess.js";
import { lookupPlayerName, MIN_QUERY_LENGTH, searchCandidates } from "./services/playerSearchService.js";

const router = express.Router();

type Viewer = { id: number; isAdmin: boolean };

/** A member sees and decides only the archive of a franchise he belongs to; an admin, all of it. */
const seasonScope = archiveSeasonScope;

const withContext = {
  season: { select: { year: true } },
  decidedBy: { select: { name: true, isAdmin: true } },
} satisfies Prisma.HistoricalPlayerMatchInclude;
type Row = Prisma.HistoricalPlayerMatchGetPayload<{ include: typeof withContext }>;

const detailOf = (row: Row) => row.detail as unknown as ReviewDetail;

/** A decision whose maker is gone is treated as the commissioner's, so nobody else can quietly change it. */
const decidedByAdmin = (row: Row) => (row.decidedBy ? row.decidedBy.isAdmin : true);

/** Verified names are settled and never reach the page; every query here filters them out. */
function listedStatus(row: Row): PlayerCheckStatus {
  if (row.status === "VERIFIED") throw new Error(`verified name ${row.key} reached the player check`);
  return row.status;
}

function toItem(row: Row, teamName: string, viewer: Viewer): PlayerCheckItem {
  const detail = detailOf(row);
  return {
    id: row.id,
    year: row.season.year,
    teamCode: row.teamCode,
    teamName,
    role: row.role,
    names: row.names,
    slots: row.slots,
    seenIn: row.seenIn,
    status: listedStatus(row),
    match: row.autoMlbId != null
      ? { mlbId: row.autoMlbId, name: row.autoName ?? "", line: detail.line ?? null, checks: detail.checks ?? [] }
      : null,
    candidates: detail.candidates ?? [],
    suggestion: detail.suggestion ?? null,
    decision: row.decision
      ? {
          decision: row.decision,
          mlbId: row.mlbId,
          name: row.mlbName,
          byName: row.decidedBy?.name ?? null,
          at: row.decidedAt ? row.decidedAt.toISOString() : null,
          locked: !canChangeDecision(viewer, { decision: row.decision, decidedByAdmin: decidedByAdmin(row) }),
        }
      : null,
  };
}

async function teamNameFor(row: Row): Promise<string> {
  const team = await prisma.historicalTeam.findUnique({
    where: { seasonId_code: { seasonId: row.seasonId, code: row.teamCode } },
    select: { name: true },
  });
  return team?.name ?? row.teamCode;
}

/** The row, if it is on the player check (not verified) and the viewer may see it. */
async function findRow(idParam: string, viewer: Viewer): Promise<Row | null> {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) return null;
  return prisma.historicalPlayerMatch.findFirst({
    where: { id, season: seasonScope(viewer), status: { not: "VERIFIED" } },
    include: withContext,
  });
}

router.get("/archive/player-check", asyncHandler(async (req, res) => {
  const viewer: Viewer = req.user!;
  const scope = seasonScope(viewer);
  const [seasons, counts, rows] = await Promise.all([
    prisma.historicalSeason.findMany({
      where: { ...scope, playerMatches: { some: {} } },
      select: { id: true, year: true, teams: { select: { code: true, name: true } } },
      orderBy: { year: "desc" },
    }),
    prisma.historicalPlayerMatch.groupBy({ by: ["seasonId", "status"], where: { season: scope }, _count: { _all: true } }),
    prisma.historicalPlayerMatch.findMany({ where: { season: scope, status: { not: "VERIFIED" } }, include: withContext }),
  ]);

  const teamNames = new Map<string, string>();
  // The name a franchise goes by now: its name in the latest archived season.
  const latestName = new Map<string, string>();
  for (const s of seasons) {
    for (const t of s.teams) {
      teamNames.set(`${s.id}|${t.code}`, t.name);
      if (!latestName.has(t.code)) latestName.set(t.code, t.name); // seasons are newest first
    }
  }
  const count = (seasonId: number, status: string) =>
    counts.find((c) => c.seasonId === seasonId && c.status === status)?._count._all ?? 0;

  const items = rows
    .map((row) => toItem(row, teamNames.get(`${row.seasonId}|${row.teamCode}`) ?? row.teamCode, viewer))
    .sort((a, b) => a.year - b.year || a.teamName.localeCompare(b.teamName) || (a.names[0] ?? "").localeCompare(b.names[0] ?? "") || a.id - b.id);

  const body: PlayerCheckResponse = {
    viewer: { isAdmin: viewer.isAdmin },
    seasons: seasons.map((s) => ({
      year: s.year,
      verified: count(s.id, "VERIFIED"),
      suggested: count(s.id, "SUGGESTED"),
      flagged: count(s.id, "FLAGGED"),
      open: count(s.id, "OPEN"),
    })),
    teams: [...new Set(items.map((i) => i.teamCode))]
      .map((code) => ({ code, name: latestName.get(code) ?? code }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    items,
  };
  res.json(body);
}));

const LOCKED = "The commissioner already decided this one.";

router.put("/archive/player-check/:id/decision", validateBody(PlayerCheckDecisionBodySchema), asyncHandler(async (req, res) => {
  const viewer: Viewer = req.user!;
  const body = req.body as PlayerCheckDecisionBody;
  const row = await findRow(req.params.id, viewer);
  if (!row) return res.status(404).json({ error: "That name isn't on the player check." });
  if (!canChangeDecision(viewer, { decision: row.decision, decidedByAdmin: decidedByAdmin(row) })) {
    return res.status(403).json({ error: LOCKED });
  }

  let input: DecisionInput;
  if (body.decision === "PICK") {
    // A listed candidate's name comes from our own record; anyone else is checked against MLB.
    let name = row.autoMlbId === body.mlbId ? row.autoName : detailOf(row).candidates?.find((c) => c.mlbId === body.mlbId)?.name;
    if (!name) {
      try {
        name = await lookupPlayerName(body.mlbId);
      } catch (err) {
        logger.warn({ error: String(err), mlbId: body.mlbId }, "player check: MLB lookup failed");
        return res.status(502).json({ error: "Couldn't reach MLB to look that player up. Try again in a minute." });
      }
      if (!name) return res.status(422).json({ error: "MLB has no player with that id." });
    }
    input = { decision: "PICK", mlbId: body.mlbId, name };
  } else {
    input = { decision: body.decision };
  }

  const problem = decisionError(row, input);
  if (problem) return res.status(409).json({ error: problem });

  const resolved = decisionResolution(row, input);
  const updated = await prisma.historicalPlayerMatch.update({
    where: { id: row.id },
    data: { decision: input.decision, decidedById: viewer.id, decidedAt: new Date(), ...resolved },
    include: withContext,
  });
  writeAuditLog({
    userId: viewer.id,
    action: "ARCHIVE_PLAYER_DECIDE",
    resourceType: "HistoricalPlayerMatch",
    resourceId: row.id,
    metadata: {
      key: row.key, decision: input.decision, mlbId: resolved.mlbId, name: resolved.mlbName,
      previous: row.decision ? { decision: row.decision, mlbId: row.mlbId, name: row.mlbName } : null,
    },
  });
  const reply: PlayerCheckItemResponse = { item: toItem(updated, await teamNameFor(updated), viewer) };
  return res.json(reply);
}));

router.delete("/archive/player-check/:id/decision", asyncHandler(async (req, res) => {
  const viewer: Viewer = req.user!;
  const row = await findRow(req.params.id, viewer);
  if (!row) return res.status(404).json({ error: "That name isn't on the player check." });
  if (!row.decision) {
    const same: PlayerCheckItemResponse = { item: toItem(row, await teamNameFor(row), viewer) };
    return res.json(same);
  }
  if (!canChangeDecision(viewer, { decision: row.decision, decidedByAdmin: decidedByAdmin(row) })) {
    return res.status(403).json({ error: LOCKED });
  }
  const updated = await prisma.historicalPlayerMatch.update({
    where: { id: row.id },
    data: { decision: null, decidedById: null, decidedAt: null, ...defaultResolution(row) },
    include: withContext,
  });
  writeAuditLog({
    userId: viewer.id,
    action: "ARCHIVE_PLAYER_UNDO",
    resourceType: "HistoricalPlayerMatch",
    resourceId: row.id,
    metadata: { key: row.key, previous: { decision: row.decision, mlbId: row.mlbId, name: row.mlbName } },
  });
  const reply: PlayerCheckItemResponse = { item: toItem(updated, await teamNameFor(updated), viewer) };
  return res.json(reply);
}));

router.get("/archive/player-check/:id/search", asyncHandler(async (req, res) => {
  const viewer: Viewer = req.user!;
  const q = String(req.query.q ?? "").trim().slice(0, 60);
  if (q.replace(/[^\p{L}]/gu, "").length < MIN_QUERY_LENGTH) {
    return res.status(400).json({ error: `Type at least ${MIN_QUERY_LENGTH} letters of the name.` });
  }
  const row = await findRow(req.params.id, viewer);
  if (!row) return res.status(404).json({ error: "That name isn't on the player check." });
  try {
    const result: PlayerCheckSearchResponse = await searchCandidates(q, {
      year: row.season.year, slots: row.slots, role: row.role, keptFromSlot: detailOf(row).keptFromSlot ?? null,
    });
    return res.json(result);
  } catch (err) {
    logger.warn({ error: String(err), q, year: row.season.year }, "player check: MLB search failed");
    return res.status(502).json({ error: "Couldn't reach MLB's player search. Try again in a minute." });
  }
}));

export const playerCheckRouter = router;
