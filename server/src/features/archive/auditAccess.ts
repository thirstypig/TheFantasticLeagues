import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";

/**
 * Who may help on the archive player check, and with which names.
 *
 * - A site admin: every name; decisions final.
 * - A franchise member set to ALL (the commissioner): every name of that
 *   franchise's archive; decisions final, like an admin's.
 * - A franchise member set to OWN_TEAM: the names on his own franchise's
 *   archived rosters, every year. "Own" is the code of the team he owns now
 *   (archive franchise codes are stable across years: DMK is DMK in 2003 and
 *   2025). His decisions are ordinary: a final-say decision locks them.
 * - Anyone else (NONE, the default): no player check at all.
 *
 * Access is granted per member by a site admin (/archive/player-check/access).
 */
export interface AuditAccess {
  /** Decisions lock: nobody without final say can change them. */
  final: boolean;
  /** ALL when any grant covers whole franchises; OWN_TEAM when only own teams. */
  level: "ALL" | "OWN_TEAM";
  /** The franchise codes an OWN_TEAM viewer may decide; null = no team limit. */
  teamCodes: string[] | null;
  /** Rows of HistoricalPlayerMatch this viewer may see and decide. */
  where: Prisma.HistoricalPlayerMatchWhereInput;
}

export const NO_ACCESS = "Ask the commissioner to turn on player-check access for you.";

type Viewer = { id: number; isAdmin: boolean };

export async function resolveAuditAccess(user: Viewer): Promise<AuditAccess | null> {
  if (user.isAdmin) return { final: true, level: "ALL", teamCodes: null, where: {} };

  const grants = await prisma.franchiseMembership.findMany({
    where: { userId: user.id, archiveAudit: { not: "NONE" } },
    select: { franchiseId: true, archiveAudit: true },
  });
  if (grants.length === 0) return null;

  const scopes: Prisma.HistoricalPlayerMatchWhereInput[] = [];
  const codes = new Set<string>();
  let final = false;
  for (const g of grants) {
    const inFranchise = { season: { league: { franchiseId: g.franchiseId } } };
    if (g.archiveAudit === "ALL") {
      final = true;
      scopes.push(inFranchise);
      continue;
    }
    const owned = await prisma.teamOwnership.findMany({
      where: { userId: user.id, team: { league: { franchiseId: g.franchiseId }, code: { not: null } } },
      select: { team: { select: { code: true } } },
    });
    const own = [...new Set(owned.map((o) => o.team.code!))];
    // A member granted OWN_TEAM who owns no team yet gets nothing rather than everything.
    if (own.length === 0) continue;
    own.forEach((c) => codes.add(c));
    scopes.push({ ...inFranchise, teamCode: { in: own } });
  }
  if (scopes.length === 0) return null;

  return {
    final,
    level: final ? "ALL" : "OWN_TEAM",
    teamCodes: final ? null : [...codes].sort(),
    where: scopes.length === 1 ? scopes[0] : { OR: scopes },
  };
}

/** 403 unless the viewer has player-check access; puts it on res.locals.audit. Run after requireAuth. */
export function requireAuditAccess(): RequestHandler {
  // asyncHandler: Express 4 drops a rejected promise, which would hang the request.
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const access = await resolveAuditAccess(req.user!);
    if (!access) return res.status(403).json({ error: NO_ACCESS });
    res.locals.audit = access;
    return next();
  });
}

export function auditOf(res: Response): AuditAccess {
  const access = res.locals.audit as AuditAccess | undefined;
  if (!access) throw new Error("player check route ran without requireAuditAccess");
  return access;
}
