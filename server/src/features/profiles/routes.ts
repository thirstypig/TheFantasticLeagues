import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { validateBody } from "../../middleware/validate.js";

const router = Router();

const updateProfileSchema = z.object({
  bio: z.string().max(200).nullable().optional(),
  favoriteTeam: z.string().max(5).nullable().optional(),
  experienceLevel: z.enum(["1-3", "3-5", "5-10", "10+"]).nullable().optional(),
  preferredFormats: z.array(z.enum(["ROTO", "H2H", "KEEPER", "DYNASTY", "POINTS"])).optional(),
  paymentHandles: z.object({
    venmo: z.string().max(50).optional(),
    paypal: z.string().max(100).optional(),
    zelle: z.string().max(100).optional(),
    cashapp: z.string().max(50).optional(),
  }).nullable().optional(),
  timezone: z.string().max(50).nullable().optional(),
  isPublic: z.boolean().optional(),
});

/**
 * GET /api/profiles/me
 * Returns the authenticated user's full profile (all fields).
 */
router.get("/profiles/me", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      venmoHandle: true,
      zelleHandle: true,
      paypalHandle: true,
    },
  });

  if (!user) return res.status(404).json({ error: "User not found" });

  // Get or create profile
  let profile = await (prisma as any).userProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    profile = await (prisma as any).userProfile.create({
      data: { userId },
    });
  }

  // Get league history
  const memberships = await prisma.leagueMembership.findMany({
    where: { userId },
    select: {
      role: true,
      league: {
        select: { id: true, name: true, season: true, sport: true },
      },
    },
    orderBy: { league: { season: "desc" } },
  });

  return res.json({
    user,
    profile,
    leagueHistory: memberships.map((m) => ({
      leagueId: m.league.id,
      leagueName: m.league.name,
      season: m.league.season,
      sport: m.league.sport,
      role: m.role,
    })),
  });
}));

/**
 * PUT /api/profiles/me
 * Update the authenticated user's profile.
 */
router.put("/profiles/me", requireAuth, validateBody(updateProfileSchema), asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const data = req.body;

  const profile = await (prisma as any).userProfile.upsert({
    where: { userId },
    create: {
      userId,
      ...data,
    },
    update: data,
  });

  return res.json({ profile });
}));

/**
 * GET /api/profiles/:userId
 * Returns a public profile for the given user.
 * Payment handles are only visible if the requester shares a league with the profile owner.
 */
router.get("/profiles/:userId", asyncHandler(async (req, res) => {
  const targetUserId = Number(req.params.userId);
  if (!Number.isFinite(targetUserId)) {
    return res.status(400).json({ error: "Invalid userId" });
  }

  // Admins get email for support/moderation workflows; non-admins never see it.
  const isAdminRequester = req.user?.isAdmin === true;
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      email: isAdminRequester,
      isAdmin: isAdminRequester,
      createdAt: isAdminRequester,
    },
  });

  if (!user) return res.status(404).json({ error: "User not found" });

  const profile = await (prisma as any).userProfile.findUnique({
    where: { userId: targetUserId },
  });

  // Respect privacy — but admins see everything (support, moderation, debugging).
  if (profile && !profile.isPublic && !isAdminRequester) {
    return res.json({
      user: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
      profile: { isPublic: false },
      leagueHistory: [],
    });
  }

  // Check if requester shares a league with the target
  let sharesLeague = false;
  const requesterId = req.user?.id;
  if (requesterId) {
    const sharedMembership = await prisma.leagueMembership.findFirst({
      where: {
        userId: targetUserId,
        league: {
          memberships: {
            some: { userId: requesterId },
          },
        },
      },
    });
    sharesLeague = !!sharedMembership;
  }

  // Get league history
  const memberships = await prisma.leagueMembership.findMany({
    where: { userId: targetUserId },
    select: {
      role: true,
      league: {
        select: { id: true, name: true, season: true, sport: true },
      },
    },
    orderBy: { league: { season: "desc" } },
  });

  // Build response — hide payment handles unless same league OR requester is admin
  const profileData = profile ? {
    bio: profile.bio,
    favoriteTeam: profile.favoriteTeam,
    experienceLevel: profile.experienceLevel,
    preferredFormats: profile.preferredFormats,
    timezone: profile.timezone,
    isPublic: profile.isPublic,
    paymentHandles: (sharesLeague || isAdminRequester) ? profile.paymentHandles : undefined,
  } : null;

  // Admins see email + isAdmin + signup date; non-admins get the minimal view.
  const userData = isAdminRequester
    ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl, email: (user as any).email, isAdmin: (user as any).isAdmin, signupAt: (user as any).createdAt }
    : { id: user.id, name: user.name, avatarUrl: user.avatarUrl };

  return res.json({
    user: userData,
    profile: profileData,
    leagueHistory: memberships.map((m) => ({
      leagueId: m.league.id,
      leagueName: m.league.name,
      season: m.league.season,
      sport: m.league.sport,
      role: m.role,
    })),
  });
}));

export const profilesRouter = router;
