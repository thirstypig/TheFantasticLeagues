import { Router, Request, Response } from "express";
import { prisma } from "../../db/prisma.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { logger } from "../../lib/logger.js";
import { evictUserCache } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";

const router = Router();

// --- Extracted handler functions ---

export function handleAuthHealth(_req: Request, res: Response) {
    const status = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) ? "ok" : "degraded";

    res.json({
        status,
        provider: "supabase",
    });
}

export async function handleGetMe(req: Request, res: Response) {
  const sessionUser = req.user ?? null;
  const userId = sessionUser?.id ?? null;

  if (!userId) return res.json({ user: null });

  const full = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        select: {
          leagueId: true,
          role: true,
          league: { select: { id: true, name: true, season: true } },
        },
      },
    },
  });

  if (!full) return res.json({ user: null });

  const user = {
    id: full.id,
    email: full.email,
    name: full.name,
    avatarUrl: full.avatarUrl,
    isAdmin: full.isAdmin,
    memberships: full.memberships.map((m) => ({
      leagueId: m.leagueId,
      role: m.role,
      league: m.league ? { id: m.league.id, name: m.league.name, season: m.league.season } : undefined,
    })),
  };

  return res.json({ user });
}

export async function handleDevLogin(_req: Request, res: Response) {
  const DEV_PASSWORD = process.env.DEV_LOGIN_PASSWORD;
  if (!DEV_PASSWORD) {
    return res.status(500).json({ error: "DEV_LOGIN_PASSWORD env var is required" });
  }

  const dbUser = await prisma.user.findFirst({
    where: { isAdmin: true },
    select: { email: true },
  });

  if (!dbUser) {
    return res.status(404).json({ error: "No admin user found in DB" });
  }

  // Find or create the Supabase user with a known password
  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
  const sbUser = users.find((u) => u.email === dbUser.email);

  if (sbUser) {
    await supabaseAdmin.auth.admin.updateUserById(sbUser.id, { password: DEV_PASSWORD });
  } else {
    await supabaseAdmin.auth.admin.createUser({
      email: dbUser.email,
      password: DEV_PASSWORD,
      email_confirm: true,
    });
  }

  logger.info({ email: dbUser.email }, "Dev login ready");
  return res.json({ message: "Dev login ready. Use the password from DEV_LOGIN_PASSWORD env var." });
}

export function handleLogout(req: Request, res: Response) {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token) evictUserCache(token);
  }
  return res.json({ success: true });
}

// --- Route wiring ---

router.get("/health", handleAuthHealth);
router.get("/me", asyncHandler(handleGetMe));
router.post("/logout", handleLogout);

if (process.env.ENABLE_DEV_LOGIN === "true") {
  if (!process.env.DEV_LOGIN_PASSWORD) {
    logger.warn({}, "ENABLE_DEV_LOGIN is true but DEV_LOGIN_PASSWORD is not set — dev-login will fail");
  }
  router.post("/dev-login", asyncHandler(handleDevLogin));
}

export const authRouter = router;
