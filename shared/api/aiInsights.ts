/**
 * Contract: GET /api/ai/insights/history
 *
 * Source-of-truth Zod schemas for the AI Insights history endpoint that
 * powers the AI Hub history list (`client/src/features/ai/pages/AIHub.tsx`).
 * The endpoint merges two persistence stores:
 *
 *   1. `AiInsight` rows (`type` discriminant: "weekly" | "league_digest")
 *   2. `Trade.aiAnalysis` JSON, lifted into a synthetic
 *      `processed_trade_analysis` row by the service layer.
 *
 * Why this matters (todo #159): the route used to return `row.data` (Prisma
 * `Json`) verbatim and the client typed it `any`, masking shape drift between
 * the prompt schemas in `aiAnalysisService` and the consumer code in
 * `summarizeInsight()`. We don't yet have full Zod schemas for every prompt
 * payload, so this contract takes a **discriminant-only** stance: the
 * `type` literal is enumerated and the per-variant `data` is `z.unknown()`.
 * The discriminant alone is a major correctness improvement — consumers can
 * `switch` on it exhaustively, and adding a new insight type without updating
 * this enum is now a parse error at the seam.
 *
 * Future tightening: enumerate per-variant data shapes (weekly insights,
 * league digest, trade analysis) once `aiAnalysisService` exposes its
 * internal Zod validators here.
 */
import { z } from "zod";

/** Discriminant — every insight `type` literal that flows through history. */
export const AiInsightTypeSchema = z.enum([
  "weekly",
  "league_digest",
  "processed_trade_analysis",
]);
export type AiInsightType = z.infer<typeof AiInsightTypeSchema>;

/**
 * Per-variant data payload. Today every variant is `z.unknown()` because the
 * upstream prompt schemas live inside `aiAnalysisService` and have not been
 * lifted into shared/. The discriminated union shape is preserved so future
 * tightening (replacing `unknown` with a strict object schema) is additive.
 */
export const AiInsightDataSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("weekly"), payload: z.unknown() }),
  z.object({ kind: z.literal("league_digest"), payload: z.unknown() }),
  z.object({ kind: z.literal("processed_trade_analysis"), payload: z.unknown() }),
]);
export type AiInsightData = z.infer<typeof AiInsightDataSchema>;

/**
 * History row as returned on the wire. `kind` distinguishes the source store:
 *   - "insight"        → row originated in `AiInsight`
 *   - "trade_analysis" → row was lifted from `Trade.aiAnalysis`
 *
 * `data` is left as `unknown` at the row level (consumers should narrow via
 * the `type` discriminant). `id` is the prefixed string the service emits
 * ("insight-123" / "trade-456") so the client can use it as a stable React
 * key without colliding across the two stores.
 */
export const AiInsightHistoryItemSchema = z.object({
  id: z.string(),
  kind: z.enum(["insight", "trade_analysis"]),
  type: AiInsightTypeSchema,
  weekKey: z.string().nullable().optional(),
  generatedAt: z.string(), // ISO timestamp
  teamName: z.string().nullable().optional(),
  data: z.unknown(),
});
export type AiInsightHistoryItem = z.infer<typeof AiInsightHistoryItemSchema>;

export const AiInsightHistoryResponseSchema = z.object({
  insights: z.array(AiInsightHistoryItemSchema),
});
export type AiInsightHistoryResponse = z.infer<typeof AiInsightHistoryResponseSchema>;
