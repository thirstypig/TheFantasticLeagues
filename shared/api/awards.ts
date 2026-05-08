/**
 * Contract: GET /api/leagues/:leagueId/awards
 *
 * Source-of-truth Zod schemas for the Fantasy MVP / Cy Young rankings
 * endpoint. The same `AwardsRankings` shape is also persisted into
 * `AiInsight.data.awards` by the league-digest writer (see
 * `server/src/features/mlb-feed/digestRoutes.ts`) — so both the wire format
 * AND the persisted blob conform to this schema.
 *
 * Why this matters (todo #118): The endpoint shipped in PR #178 with bare
 * server-private TypeScript interfaces (`MvpCandidate`, `CyYoungCandidate`,
 * `AwardsRankings`). The route also did a blind cast on the persisted blob
 * (`as AwardsRankings | null | undefined`), so a malformed pre-#115 digest
 * could ship garbage to consumers without falling through to compute. The
 * endpoint is explicitly *agent-native* — agents and downstream UIs (Home AI
 * hub, future MVP race widget, digest UI) need a discoverable wire contract
 * to plan against. Hand-writing the type on the consumer side and watching
 * it drift is exactly the bug class
 * `docs/solutions/logic-errors/under-declared-ts-type-hid-server-fields.md`
 * was authored to prevent.
 *
 * Pilot precedents: `shared/api/playerSeasonStats.ts`, `shared/api/rosterMoves.ts`.
 *
 * Schemas use `.strict()` on candidate objects so adding a field without
 * updating the schema is a parse error — flushes drift out at the seam
 * instead of silently smuggling new wire fields through.
 */
import { z } from "zod";

// ─── MVP candidate ───────────────────────────────────────────────

/**
 * Raw counting + rate stats for one MVP candidate over the period set
 * (season-to-date). Mirrors `awardsService.computeAwardsRankings`'s `stats`
 * sub-object exactly.
 */
export const MvpStatsSchema = z
  .object({
    AB: z.number(),
    H: z.number(),
    HR: z.number(),
    RBI: z.number(),
    R: z.number(),
    SB: z.number(),
    BB: z.number(),
    TB: z.number(),
    SO: z.number(),
    AVG: z.number(),
    OBP: z.number(),
    SLG: z.number(),
    OPS: z.number(),
  })
  .strict();

/**
 * Per-component z-scores for one MVP candidate. Sign convention: positive =
 * above the league mean. `SO` is naturally signed (more strikeouts at the
 * plate is worse), the negative weight is applied at composite time.
 */
export const MvpZScoresSchema = z
  .object({
    OPS: z.number(),
    HR: z.number(),
    OBP: z.number(),
    RBI: z.number(),
    R: z.number(),
    SB: z.number(),
    TB: z.number(),
    BB: z.number(),
    SO: z.number(),
  })
  .strict();

/** One MVP candidate row as emitted by `computeAwardsRankings`. */
export const MvpCandidateSchema = z
  .object({
    rank: z.number(),
    playerId: z.number(),
    name: z.string(),
    team: z.string(),
    /** Composite z-score weighted by `MVP_WEIGHTS`. */
    mvpScore: z.number(),
    stats: MvpStatsSchema,
    zScores: MvpZScoresSchema,
  })
  .strict();

// ─── Cy Young candidate ──────────────────────────────────────────

/**
 * Raw counting + rate stats for one Cy Young candidate. ERA / WHIP / BB9
 * are computed; the rest are sums.
 */
export const CyYoungStatsSchema = z
  .object({
    W: z.number(),
    L: z.number(),
    K: z.number(),
    SV: z.number(),
    IP: z.number(),
    ERA: z.number(),
    WHIP: z.number(),
    K9: z.number(),
    BB9: z.number(),
    HR_A: z.number(),
  })
  .strict();

/**
 * Per-component z-scores for one Cy Young candidate. Sign convention:
 * positive = better. `ERA`, `WHIP`, `BB9` are sign-flipped at compute time
 * (lower is better → negate so higher is "better"); the weight tables in
 * `awardsService.ts` assume that flip has already been applied.
 */
export const CyYoungZScoresSchema = z
  .object({
    ERA: z.number(),
    WHIP: z.number(),
    K: z.number(),
    K9: z.number(),
    IP: z.number(),
    W: z.number(),
    L: z.number(),
    HR_A: z.number(),
    BB9: z.number(),
    SV: z.number(),
  })
  .strict();

/** One Cy Young candidate row as emitted by `computeAwardsRankings`. */
export const CyYoungCandidateSchema = z
  .object({
    rank: z.number(),
    playerId: z.number(),
    name: z.string(),
    team: z.string(),
    /** "SP" if predominantly a starter (GS >= 3), "RP" otherwise. */
    role: z.enum(["SP", "RP"]),
    /** Composite z-score weighted by starter or reliever weight set. */
    cyScore: z.number(),
    stats: CyYoungStatsSchema,
    zScores: CyYoungZScoresSchema,
  })
  .strict();

// ─── Core compute output ─────────────────────────────────────────

/**
 * The full awards rankings for a league at a given week. Persisted into
 * `AiInsight.data.awards` and also returned by the awards endpoint (wrapped
 * in the response envelope below).
 *
 * Note: `computedAt` is the ISO timestamp from when `computeAwardsRankings`
 * ran. For persisted rankings, this differs from `digestGeneratedAt` (the
 * timestamp when the digest row was written) — same data, two clocks.
 */
export const AwardsRankingsSchema = z
  .object({
    leagueId: z.number(),
    weekKey: z.string(),
    /** ISO timestamp of when the snapshot was computed. */
    computedAt: z.string(),
    /** Total players considered after eligibility filters (post AB / IP min). */
    hitterPool: z.number(),
    starterPool: z.number(),
    /** Top 3 MVP candidates by composite score (desc). Empty if pool < 3. */
    mvp: z.array(MvpCandidateSchema),
    /** Top 3 Cy Young candidates by composite score (desc). Empty if pool < 3. */
    cyYoung: z.array(CyYoungCandidateSchema),
  })
  .strict();

// ─── Available weeks (todo #179) ─────────────────────────────────

/**
 * One entry in the `availableWeeks` enumeration on the awards response.
 * Mirrors the shape `mlb-feed/digestRoutes.ts` already exposes for
 * `/league-digest/weeks` so consumers see one consistent vocabulary.
 *
 * `generatedAt` is the digest row's createdAt (when a persisted snapshot
 * exists) or `null` for the synthetic current-week entry that we always
 * append even when no digest has run yet.
 */
export const AwardsAvailableWeekSchema = z
  .object({
    weekKey: z.string(),
    label: z.string(),
    generatedAt: z.string().datetime().nullable(),
  })
  .strict();

// ─── Wire envelope ───────────────────────────────────────────────

/**
 * Wire envelope returned by `GET /api/leagues/:leagueId/awards`.
 *
 * Discriminated on `source`:
 * - `"persisted"` — round-tripped from `AiInsight.data.awards`. Carries
 *   `digestGeneratedAt` (ISO timestamp) so consumers can show "last
 *   updated" without inspecting the digest row separately.
 * - `"computed"` — fell through to on-demand `computeAwardsRankings`. No
 *   digest row exists for the requested week (or the persisted blob failed
 *   schema validation, in which case we re-compute defensively). No
 *   `digestGeneratedAt` because there is no digest row.
 *
 * Both branches carry `availableWeeks` (todo #179): the list of weekKeys
 * that have a persisted snapshot, plus the current week (synthetic). One
 * call answers both "this week's awards" and "what other weeks can I
 * ask for?" — saves a round-trip vs a separate sub-route.
 *
 * Forcing the discriminator at the schema layer means consumers must handle
 * both branches at compile time — they can't accidentally `.digestGeneratedAt`
 * a freshly computed payload and get `undefined`.
 */
export const AwardsResponseSchema = z.discriminatedUnion("source", [
  AwardsRankingsSchema.extend({
    source: z.literal("persisted"),
    digestGeneratedAt: z.string().datetime(),
    availableWeeks: z.array(AwardsAvailableWeekSchema),
  }),
  AwardsRankingsSchema.extend({
    source: z.literal("computed"),
    availableWeeks: z.array(AwardsAvailableWeekSchema),
  }),
]);

// ─── Inferred types ──────────────────────────────────────────────

export type MvpStats = z.infer<typeof MvpStatsSchema>;
export type MvpZScores = z.infer<typeof MvpZScoresSchema>;
export type MvpCandidate = z.infer<typeof MvpCandidateSchema>;

export type CyYoungStats = z.infer<typeof CyYoungStatsSchema>;
export type CyYoungZScores = z.infer<typeof CyYoungZScoresSchema>;
export type CyYoungCandidate = z.infer<typeof CyYoungCandidateSchema>;

export type AwardsRankings = z.infer<typeof AwardsRankingsSchema>;
export type AwardsResponse = z.infer<typeof AwardsResponseSchema>;
export type AwardsAvailableWeek = z.infer<typeof AwardsAvailableWeekSchema>;
