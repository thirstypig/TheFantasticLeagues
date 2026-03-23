// server/src/middleware/auth.ts
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { createHash } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { logger } from "../lib/logger.js";
import { supabaseAdmin } from "../lib/supabase.js";

// In-memory cache for Supabase user resolution (avoids hitting Supabase API on every request)
const USER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 1000;
const userCache = new Map<string, { user: AuthedUser; expiresAt: number }>();

// In-memory cache for league membership lookups (avoids DB round-trip on every request)
const MEMBERSHIP_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
type MembershipCacheEntry = { role: string | null; expiresAt: number };
const membershipCache = new Map<string, MembershipCacheEntry>();

function membershipKey(userId: number, leagueId: number): string {
  return `${userId}:${leagueId}`;
}

function getCachedMembership(userId: number, leagueId: number): MembershipCacheEntry | null {
  const key = membershipKey(userId, leagueId);
  const cached = membershipCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached;
  membershipCache.delete(key);
  return null;
}

function setCachedMembership(userId: number, leagueId: number, role: string | null): void {
  if (membershipCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = membershipCache.keys().next().value;
    if (oldestKey) membershipCache.delete(oldestKey);
  }
  membershipCache.set(membershipKey(userId, leagueId), {
    role,
    expiresAt: Date.now() + MEMBERSHIP_CACHE_TTL_MS,
  });
}

/** Evict membership cache for a user+league (call when roles change). */
export function evictMembershipCache(userId: number, leagueId: number): void {
  membershipCache.delete(membershipKey(userId, leagueId));
}

/** Clear all membership cache entries (for testing). */
export function clearMembershipCache(): void {
  membershipCache.clear();
}

/** Hash a token for use as cache key (avoids storing raw JWTs in memory). */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Evict a specific token from the user cache (e.g. on logout). */
export function evictUserCache(token: string): void {
  userCache.delete(hashToken(token));
}

/** Clear all cached users (for testing). */
export function clearUserCache(): void {
  userCache.clear();
}

export type AuthedUser = {
  id: number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser | null;
      requestId?: string;
    }
  }
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      req.user = null;
      return next();
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      req.user = null;
      return next();
    }

    // Check cache first (keyed by hash, not raw token)
    const tokenKey = hashToken(token);
    const cached = userCache.get(tokenKey);
    if (cached && cached.expiresAt > Date.now()) {
      req.user = cached.user;
      return next();
    }

    const { data: { user: sbUser }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !sbUser || !sbUser.email) {
      req.user = null;
      return next();
    }

    // Link by email
    let u = await prisma.user.findUnique({
      where: { email: sbUser.email },
      select: { id: true, email: true, name: true, avatarUrl: true, isAdmin: true },
    });

    if (!u) {
      // Auto-create user from Supabase identity
      const metadata = sbUser.user_metadata || {};
      const name = metadata.name || metadata.full_name || sbUser.email?.split("@")[0] || "New User";
      const avatarUrl = metadata.avatar_url || metadata.picture || null;
      
      const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase());
      const isAdmin = sbUser.email ? adminEmails.includes(sbUser.email.toLowerCase()) : false;

      try {
        u = await prisma.user.create({
          data: {
            email: sbUser.email,
            name,
            avatarUrl,
            isAdmin, // Auto-admin if in env list
          },
          select: { id: true, email: true, name: true, avatarUrl: true, isAdmin: true },
        });
      } catch (e) {
        // Race condition: user created by another request?
        u = await prisma.user.findUnique({
          where: { email: sbUser.email },
          select: { id: true, email: true, name: true, avatarUrl: true, isAdmin: true },
        });
      }
    }

    req.user = u ?? null;
    if (u) {
      // Evict oldest entry if cache is full
      if (userCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = userCache.keys().next().value;
        if (oldestKey) userCache.delete(oldestKey);
      }
      userCache.set(tokenKey, { user: u, expiresAt: Date.now() + USER_CACHE_TTL_MS });
    }
    return next();
  } catch (err) {
    logger.error({ error: String(err) }, "Auth middleware error");
    req.user = null;
    return next();
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  return next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  if (!req.user.isAdmin) return res.status(403).json({ error: "Admin only" });
  return next();
}

/**
 * Middleware factory: requires the user to be a COMMISSIONER of the league
 * (identified by `leagueIdParam` in req.params) or a site admin.
 * Must be placed after `requireAuth` in the middleware chain.
 */
export function requireCommissionerOrAdmin(leagueIdParam = "leagueId"): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const leagueId = Number(req.params[leagueIdParam]);
    if (!Number.isFinite(leagueId)) {
      return res.status(400).json({ error: "Invalid leagueId" });
    }

    if (req.user!.isAdmin) return next();

    const userId = req.user!.id;
    const cached = getCachedMembership(userId, leagueId);
    if (cached) {
      if (cached.role !== "COMMISSIONER") {
        return res.status(403).json({ error: "Commissioner only" });
      }
      return next();
    }

    const m = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
      select: { role: true },
    });

    setCachedMembership(userId, leagueId, m?.role ?? null);

    if (!m || m.role !== "COMMISSIONER") {
      return res.status(403).json({ error: "Commissioner only" });
    }

    return next();
  };
}

/**
 * Middleware factory: requires the user to be a member of the league
 * (any role: COMMISSIONER or OWNER). Reads leagueId from
 * req.params[leagueIdParam], then req.query[leagueIdParam], then req.body[leagueIdParam].
 * Admins bypass. Must be placed after `requireAuth`.
 */
export function requireLeagueMember(leagueIdParam = "leagueId"): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const raw = req.params[leagueIdParam] ?? req.query[leagueIdParam] ?? req.body?.[leagueIdParam];
    const leagueId = Number(raw);
    if (!Number.isFinite(leagueId)) {
      return res.status(400).json({ error: "Invalid leagueId" });
    }

    if (req.user!.isAdmin) return next();

    const userId = req.user!.id;
    const cached = getCachedMembership(userId, leagueId);
    if (cached) {
      if (!cached.role) {
        return res.status(403).json({ error: "Not a member of this league" });
      }
      return next();
    }

    const m = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
      select: { role: true },
    });

    setCachedMembership(userId, leagueId, m?.role ?? null);

    if (!m) {
      return res.status(403).json({ error: "Not a member of this league" });
    }

    return next();
  };
}

/**
 * Middleware factory: requires the user to be a COMMISSIONER of the franchise
 * (identified by `franchiseIdParam` in req.params) or a site admin.
 * Must be placed after `requireAuth` in the middleware chain.
 */
export function requireFranchiseCommissioner(franchiseIdParam = "franchiseId"): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const franchiseId = Number(req.params[franchiseIdParam]);
    if (!Number.isFinite(franchiseId)) {
      return res.status(400).json({ error: "Invalid franchiseId" });
    }

    if (req.user!.isAdmin) return next();

    const m = await prisma.franchiseMembership.findUnique({
      where: { franchiseId_userId: { franchiseId, userId: req.user!.id } },
      select: { role: true },
    });

    if (!m || m.role !== "COMMISSIONER") {
      return res.status(403).json({ error: "Franchise commissioner only" });
    }

    return next();
  };
}

/**
 * Check if a user owns a team (via legacy ownerUserId or TeamOwnership table).
 * Admins bypass ownership checks.
 */
export async function isTeamOwner(teamId: number, userId: number): Promise<boolean> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { ownerUserId: true },
  });
  if (!team) return false;
  if (team.ownerUserId === userId) return true;

  const ownership = await prisma.teamOwnership.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  return !!ownership;
}

/**
 * Returns all team IDs owned by a user (via legacy ownerUserId or TeamOwnership table).
 * Queries run in parallel for efficiency.
 */
export async function getOwnedTeamIds(userId: number): Promise<number[]> {
  const [directTeams, ownershipTeams] = await Promise.all([
    prisma.team.findMany({
      where: { ownerUserId: userId },
      select: { id: true },
    }),
    prisma.teamOwnership.findMany({
      where: { userId },
      select: { teamId: true },
    }),
  ]);
  return [...new Set([
    ...directTeams.map(t => t.id),
    ...ownershipTeams.map(t => t.teamId),
  ])];
}

/**
 * Middleware factory: requires the authenticated user to own the team
 * identified by `teamIdSource`. Reads from req.params first, then req.body.
 * Admins bypass the check. Must be placed after `requireAuth`.
 */
export function requireTeamOwner(teamIdSource = "teamId"): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const teamId = Number(req.params[teamIdSource] ?? req.body?.[teamIdSource]);
    if (!Number.isFinite(teamId)) {
      return res.status(400).json({ error: "Invalid teamId" });
    }

    if (req.user!.isAdmin) return next();

    const owns = await isTeamOwner(teamId, req.user!.id);
    if (!owns) {
      return res.status(403).json({ error: "You do not own this team" });
    }

    return next();
  };
}
