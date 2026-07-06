// Public (no-auth) marketing signup endpoint. Mounted OUTSIDE requireAuth.
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { subscribe } from "./service.js";

export const subscribersRouter = Router();

// Per-IP rate limit (the second anti-abuse layer, alongside the per-address
// cooldown in the service). Default IP keying is IPv6-safe (no custom
// keyGenerator — see the ERR_ERL_KEY_GEN_IPV6 note in routes/public.ts).
const subscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5,                    // 5 signups per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many attempts — please try again in a few minutes." },
});

/**
 * POST /api/public/subscribe
 * Body: { email: string, website?: string }  ← `website` is the hidden honeypot.
 * Always returns 200 with a generic message on acceptance (no enumeration);
 * returns 400 only for a bad-format / disposable email.
 */
subscribersRouter.post("/subscribe", subscribeLimiter, async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email : "";
    const honeypot = req.body?.website ?? null; // hidden field bots fill in
    const result = await subscribe({ email, honeypot });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch {
    // Never leak internals to a public endpoint.
    return res.status(500).json({ ok: false, error: "Something went wrong. Please try again." });
  }
});
