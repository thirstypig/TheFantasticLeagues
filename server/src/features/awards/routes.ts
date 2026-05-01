/**
 * Awards endpoint — exposes the structured MVP/Cy Young rankings that the
 * digest service has historically computed but only persisted as AI prose.
 *
 * Mounted at /api/leagues so the canonical URL is
 *   GET /api/leagues/:leagueId/awards?weekKey=YYYY-WNN
 *
 * Read order (todo #115):
 *   1. If a digest exists for the requested weekKey AND has `awards` payload
 *      → return persisted snapshot (round-trip from digest creation).
 *   2. Otherwise compute rankings on demand. Useful for past-week queries
 *      against digests created before #115 shipped, and for "give me the
 *      current MVP race" without forcing digest generation.
 */
import { Router, type Request } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, requireLeagueMember } from "../../middleware/auth.js";
import { rateLimitPerUser } from "../../middleware/rateLimitPerUser.js";
import { prisma } from "../../db/prisma.js";
import { getWeekKey } from "../../lib/utils.js";
import { computeAwardsRankings } from "./services/awardsService.js";
import {
  AwardsRankingsSchema,
  type AwardsResponse,
} from "../../../../shared/api/awards.js";

const router = Router();

const WEEK_KEY_REGEX = /^\d{4}-W\d{2}$/;

/**
 * Express 5 exposes `req.signal` natively, but we're still on Express 4.19.
 * Shim it via the `close` event: when the underlying socket closes BEFORE the
 * response has been fully sent, the client disconnected — abort the signal so
 * downstream service code can bail out (todo #138).
 */
function abortSignalForRequest(req: Request): AbortSignal {
  // If Express ever upgrades and starts populating req.signal, prefer it.
  const native = (req as unknown as { signal?: AbortSignal }).signal;
  if (native) return native;

  const controller = new AbortController();
  req.on("close", () => {
    // `req.res!.writableEnded` is true after a successful response — only
    // treat the close as an abort when the response hasn't finished yet.
    if (!req.res?.writableEnded) controller.abort();
  });
  return controller.signal;
}

router.get(
  "/:leagueId/awards",
  requireAuth,
  rateLimitPerUser({ capacity: 30, windowMs: 60_000, bucketName: "awards" }),
  requireLeagueMember("leagueId"),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    if (!Number.isFinite(leagueId) || leagueId <= 0) {
      return res.status(400).json({ error: "Invalid leagueId" });
    }

    const raw = typeof req.query.weekKey === "string" ? req.query.weekKey : null;
    const weekKey = raw && WEEK_KEY_REGEX.test(raw) ? raw : getWeekKey();

    // Try persisted snapshot first
    const persisted = await prisma.aiInsight.findFirst({
      where: { type: "league_digest", leagueId, weekKey },
      select: { data: true, createdAt: true },
    });

    if (persisted?.data && typeof persisted.data === "object") {
      const data = persisted.data as Record<string, unknown>;
      // Validate the persisted blob via the shared Zod schema (todo #118).
      // Pre-#115 digests have no `awards` field at all; malformed digests
      // (e.g. shape changes that landed without backfill) would previously
      // ship garbage to consumers via a blind cast. On any validation
      // failure, fall through to compute so consumers get a fresh, valid
      // payload instead of the bad persisted one.
      const parsed = AwardsRankingsSchema.safeParse(data.awards);
      if (parsed.success) {
        const body: AwardsResponse = {
          ...parsed.data,
          source: "persisted",
          digestGeneratedAt: persisted.createdAt.toISOString(),
        };
        return res.json(body);
      }
    }

    // Fall back to on-demand compute (covers pre-#115 digests, malformed
    // persisted blobs, and ad hoc queries). Pass the request's abort signal
    // so the service can stop work early when the client disconnects
    // mid-flight.
    const signal = abortSignalForRequest(req);
    const rankings = await computeAwardsRankings(leagueId, weekKey, signal);
    const body: AwardsResponse = { ...rankings, source: "computed" };
    res.json(body);
  }),
);

export const awardsRouter = router;
