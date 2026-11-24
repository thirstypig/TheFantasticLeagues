/**
 * Contract: the rebuilt past-seasons archive page.
 *
 *   GET /api/archive/history          → ArchiveSeasonListResponse
 *   GET /api/archive/history/:year    → ArchiveSeasonResponse
 *
 * Built from HistoricalTeam / HistoricalRosterEntry (the commissioner's
 * workbooks), with each roster name resolved to an MLB player through
 * HistoricalPlayerMatch where the player check has settled it.
 */
import { z } from "zod";

export const ArchiveSeasonListItemSchema = z.object({
  year: z.number(),
  champion: z.object({ owner: z.string().nullable(), teamName: z.string() }).nullable(),
  /** The commissioner's original workbook for the season, unedited (GET /api/archive/history/:year/workbook). */
  workbook: z.object({ fileName: z.string(), bytes: z.number() }).nullable(),
});

export const ArchiveSeasonListResponseSchema = z.object({ seasons: z.array(ArchiveSeasonListItemSchema) }).strict();

export const ArchiveRosterEntrySchema = z.object({
  slot: z.string(),
  /** As written in the workbook. */
  name: z.string(),
  /** The MLB player, once the player check has settled who this is. */
  mlbId: z.number().nullable(),
  mlbName: z.string().nullable(),
  /** Draft-day price in dollars. */
  price: z.number().nullable(),
  /** A non-numeric price cell ("AL" = left the NL). */
  priceNote: z.string().nullable(),
  keeper: z.boolean(),
});

export const ArchiveSeasonTeamSchema = z.object({
  code: z.string(),
  /** The name the team used that season. */
  name: z.string(),
  owner: z.string().nullable(),
  /** Recorded points per scoring period, P1 first. */
  points: z.array(z.number()),
  total: z.number().nullable(),
  /** Finishing place from the recorded totals; tied totals share a place. */
  rank: z.number().nullable(),
  /** Why the numbers don't add up, when the workbook doesn't (2008, 2012). */
  note: z.string().nullable(),
});

export const ArchiveMoveSchema = z.object({
  /** Moves made at the meeting before this scoring period. Period 1: changes between the draft and the first period sheet. */
  period: z.number(),
  /** The day of that meeting ("2024-04-21"), which is the day the previous period ended. Null for period 1 or when unknown. */
  meetingDate: z.string().nullable(),
  byTeam: z.record(z.string(), z.object({ added: z.array(ArchiveRosterEntrySchema), dropped: z.array(ArchiveRosterEntrySchema) })),
});

export const ArchiveSeasonResponseSchema = z
  .object({
    year: z.number(),
    /** Keepers come from the workbook's Keepers sheet; otherwise they're "possible keepers". */
    keepersFromSheet: z.boolean(),
    /** The day each period ended, P1 first (from the workbook's period sheets). Shorter than periodCount: the last period ends with the season. */
    periodEnds: z.array(z.string().nullable()),
    /** Scoring periods with recorded points. */
    periodCount: z.number(),
    /** The workbook has a roster for every meeting, so moves are known. */
    hasMoves: z.boolean(),
    /** Ordered by finish. */
    teams: z.array(ArchiveSeasonTeamSchema),
    rosters: z.record(z.string(), z.object({ draft: z.array(ArchiveRosterEntrySchema), final: z.array(ArchiveRosterEntrySchema) })),
    moves: z.array(ArchiveMoveSchema),
  })
  .strict();

export type ArchiveSeasonListItem = z.infer<typeof ArchiveSeasonListItemSchema>;
export type ArchiveSeasonListResponse = z.infer<typeof ArchiveSeasonListResponseSchema>;
export type ArchiveRosterEntry = z.infer<typeof ArchiveRosterEntrySchema>;
export type ArchiveSeasonTeam = z.infer<typeof ArchiveSeasonTeamSchema>;
export type ArchiveMove = z.infer<typeof ArchiveMoveSchema>;
export type ArchiveSeasonResponse = z.infer<typeof ArchiveSeasonResponseSchema>;
