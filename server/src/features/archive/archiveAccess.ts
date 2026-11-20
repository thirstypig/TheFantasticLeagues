import type { NextFunction, Request, RequestHandler, Response } from "express";
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
