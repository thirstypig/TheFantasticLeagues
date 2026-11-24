import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

/**
 * Archive pages show past teams and their owners' names, so only members of
 * the franchise whose league the archive belongs to (OGBA today) — or an
 * admin — may read them. Run after requireAuth.
 *
 * Membership is checked at the franchise level: FranchiseMembership spans
 * every season's league (OGBA 2025 = league 1, 2026 = league 20, both
 * franchise 1), and archived seasons hang off one of those leagues.
 */
export function requireArchiveAccess(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Not signed in" });
    if (user.isAdmin) return next();
    const membership = await prisma.franchiseMembership.findFirst({
      where: {
        userId: user.id,
        franchise: { leagues: { some: { historicalSeasons: { some: {} } } } },
      },
      select: { id: true },
    });
    if (!membership) return res.status(403).json({ error: "The archive is visible to league members only" });
    return next();
  };
}

/**
 * The archived seasons a viewer may see: an admin, all of them; a member, the
 * seasons of a franchise he belongs to.
 */
export function archiveSeasonScope(user: { id: number; isAdmin: boolean }): Prisma.HistoricalSeasonWhereInput {
  return user.isAdmin ? {} : { league: { franchise: { memberships: { some: { userId: user.id } } } } };
}

/**
 * May this viewer read the archive of the franchise that `leagueId` belongs to?
 * Same rule as requireArchiveAccess, applied to one franchise: an admin, or a
 * member of that franchise. Membership of the one league isn't required, so
 * an owner who sat out a season still sees his franchise's trophy case.
 */
export async function canViewLeagueArchive(user: { id: number; isAdmin: boolean }, leagueId: number): Promise<boolean> {
  if (user.isAdmin) return true;
  const membership = await prisma.franchiseMembership.findFirst({
    where: { userId: user.id, franchise: { leagues: { some: { id: leagueId } } } },
    select: { id: true },
  });
  return membership !== null;
}
