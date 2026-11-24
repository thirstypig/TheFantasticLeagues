/**
 * Archive player check: the names on archived rosters that the matcher could
 * not settle on its own, and a person's decision on each.
 *
 *   GET    /api/archive/player-check                 the names to decide + per-season counts
 *   PUT    /api/archive/player-check/:id/decision    confirm / pick / keep / reject
 *   DELETE /api/archive/player-check/:id/decision    undo
 *   GET    /api/archive/player-check/:id/search?q=   find someone who isn't a listed candidate
 *
 * Mounted inside the archive router, after its members-only guard. On top of
 * that, every route here needs player-check access (auditAccess.ts): a site
 * admin, the commissioner (every name, final say), or an owner a site admin let
 * in (his own franchise's names). Rules live in lib/archive/playerReview.ts.
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
import { auditOf, hasFinalSay, requireAuditAccess, type AuditAccess } from "./auditAccess.js";
import { lookupPlayerName, MIN_QUERY_LENGTH, searchCandidates } from "./services/playerSearchService.js";

const router = express.Router();

router.use("/archive/player-check", requireAuditAccess());

const withContext = {
  season: { select: { year: true, league: { select: { franchiseId: true } } } },
  decidedBy: {
    select: { name: true, isAdmin: true, franchiseMemberships: { where: { archiveAudit: "ALL" }, select: { franchiseId: true } } },
  },
} satisfies Prisma.HistoricalPlayerMatchInclude;
type Row = Prisma.HistoricalPlayerMatchGetPayload<{ include: typeof withContext }>;

const detailOf = (row: Row) => row.detail as unknown as ReviewDetail;

const franchiseOf = (row: Row) => row.season.league?.franchiseId ?? null;

/**
 * Was this decision made by someone with final say over this row's franchise (a
 * site admin, or a member set to ALL in that franchise)? One whose maker is gone
 * counts as final, so nobody can quietly change it.
 */
const decidedByFinal = (row: Row) =>
  row.decidedBy
    ? row.decidedBy.isAdmin || row.decidedBy.franchiseMemberships.some((m) => m.franchiseId === franchiseOf(row))
    : true;

/** May this viewer change the row's current decision? */
const canChange = (row: Row, audit: AuditAccess) =>
  canChangeDecision({ final: hasFinalSay(audit, franchiseOf(row)) }, { decision: row.decision, decidedByFinal: decidedByFinal(row) });

/** Verified names are settled and never reach the page; every query here filters them out. */
function listedStatus(row: Row): PlayerCheckStatus {
  if (row.status === "VERIFIED") throw new Error(`verified name ${row.key} reached the player check`);
  return row.status;
}

function toItem(row: Row, teamName: string, audit: AuditAccess): PlayerCheckItem {
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
          locked: !canChange(row, audit),
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

/** The row, if it is on the player check (not verified) and the viewer may decide it. */
async function findRow(idParam: string, audit: AuditAccess): Promise<Row | null> {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) return null;
  return prisma.historicalPlayerMatch.findFirst({
    where: { AND: [audit.where, { id, status: { not: "VERIFIED" } }] },
    include: withContext,
  });
}

router.get("/archive/player-check", asyncHandler(async (req, res) => {
  const viewer = req.user!;
  const audit = auditOf(res);
  const [seasons, counts, rows] = await Promise.all([
    prisma.historicalSeason.findMany({
      where: { playerMatches: { some: audit.where } },
      select: { id: true, year: true, teams: { select: { code: true, name: true } } },
      orderBy: { year: "desc" },
    }),
    prisma.historicalPlayerMatch.groupBy({ by: ["seasonId", "status"], where: audit.where, _count: { _all: true } }),
    prisma.historicalPlayerMatch.findMany({ where: { AND: [audit.where, { status: { not: "VERIFIED" } }] }, include: withContext }),
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
    .map((row) => toItem(row, teamNames.get(`${row.seasonId}|${row.teamCode}`) ?? row.teamCode, audit))
    .sort((a, b) => a.year - b.year || a.teamName.localeCompare(b.teamName) || (a.names[0] ?? "").localeCompare(b.names[0] ?? "") || a.id - b.id);

  const body: PlayerCheckResponse = {
    viewer: { isAdmin: viewer.isAdmin, final: audit.final, level: audit.level, teamCodes: audit.teamCodes },
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
  const viewer = req.user!;
  const audit = auditOf(res);
  const body = req.body as PlayerCheckDecisionBody;
  const row = await findRow(req.params.id, audit);
  if (!row) return res.status(404).json({ error: "That name isn't on the player check." });
  if (!canChange(row, audit)) {
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
  const reply: PlayerCheckItemResponse = { item: toItem(updated, await teamNameFor(updated), audit) };
  return res.json(reply);
}));

router.delete("/archive/player-check/:id/decision", asyncHandler(async (req, res) => {
  const viewer = req.user!;
  const audit = auditOf(res);
  const row = await findRow(req.params.id, audit);
  if (!row) return res.status(404).json({ error: "That name isn't on the player check." });
  if (!row.decision) {
    const same: PlayerCheckItemResponse = { item: toItem(row, await teamNameFor(row), audit) };
    return res.json(same);
  }
  if (!canChange(row, audit)) {
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
  const reply: PlayerCheckItemResponse = { item: toItem(updated, await teamNameFor(updated), audit) };
  return res.json(reply);
}));

router.get("/archive/player-check/:id/search", asyncHandler(async (req, res) => {
  const audit = auditOf(res);
  const q = String(req.query.q ?? "").trim().slice(0, 60);
  if (q.replace(/[^\p{L}]/gu, "").length < MIN_QUERY_LENGTH) {
    return res.status(400).json({ error: `Type at least ${MIN_QUERY_LENGTH} letters of the name.` });
  }
  const row = await findRow(req.params.id, audit);
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
