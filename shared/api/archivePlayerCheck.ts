/**
 * Contract: the archive player check.
 *
 *   GET    /api/archive/player-check                 → PlayerCheckResponse
 *   PUT    /api/archive/player-check/:id/decision    PlayerCheckDecisionBody → PlayerCheckItemResponse
 *   DELETE /api/archive/player-check/:id/decision    → PlayerCheckItemResponse
 *   GET    /api/archive/player-check/:id/search?q=   → PlayerCheckSearchResponse
 *
 * Every name on an archived roster resolves to one MLB player. The ones the
 * matcher could not settle on its own are listed here for a person to decide.
 * Rules: server/src/lib/archive/playerReview.ts.
 */
import { z } from "zod";

/** One MLB season, all teams combined. A hitter's pitching fields are zero and vice versa. */
export const SeasonLineSchema = z.object({
  g: z.number(), pa: z.number(), hr: z.number(), avg: z.string(), r: z.number(), rbi: z.number(), sb: z.number(),
  ip: z.number(), w: z.number(), sv: z.number(), k: z.number(), era: z.string(),
});

/** Was he eligible for this slot that season, and why. */
export const SlotCheckSchema = z.object({ slot: z.string(), eligible: z.boolean(), reason: z.string() });

export const PlayerCheckCandidateSchema = z.object({
  mlbId: z.number(),
  name: z.string(),
  line: SeasonLineSchema.nullable(),
  /** Plate appearances (hitter slot) or innings (pitcher slot) that season. */
  playingTime: z.number(),
  eligibleSlots: z.number(),
  checks: z.array(SlotCheckSchema),
  /** Why he's offered when the spelling doesn't match ("wrong first initial"). */
  note: z.string().optional(),
});

/** VERIFIED names are settled and never listed. */
export const PlayerCheckStatusSchema = z.enum(["SUGGESTED", "FLAGGED", "OPEN"]);
export const PlayerCheckDecisionKindSchema = z.enum(["PICK", "EXCEPTION", "WRONG", "NONE"]);

export const PlayerCheckItemSchema = z
  .object({
    id: z.number(),
    year: z.number(),
    teamCode: z.string(),
    /** The name the team used that season. */
    teamName: z.string(),
    /** P pitcher slot, H hitter slot, X either (IL, rookie spot). */
    role: z.string(),
    /** Spellings as written in the workbook. */
    names: z.array(z.string()),
    slots: z.array(z.string()),
    /** "draft", "P2" … "P7", "final". */
    seenIn: z.array(z.string()),
    status: PlayerCheckStatusSchema,
    /** The matcher's player (FLAGGED only): the name fits him, a slot doesn't. */
    match: z
      .object({ mlbId: z.number(), name: z.string(), line: SeasonLineSchema.nullable(), checks: z.array(SlotCheckSchema) })
      .nullable(),
    /** Ranked: most eligible slots first, then playing time. */
    candidates: z.array(PlayerCheckCandidateSchema),
    suggestion: z.object({ mlbId: z.number(), why: z.string(), closeCall: z.boolean() }).nullable(),
    decision: z
      .object({
        decision: PlayerCheckDecisionKindSchema,
        /** Who the name resolves to now; null for WRONG and NONE (still unknown). */
        mlbId: z.number().nullable(),
        name: z.string().nullable(),
        byName: z.string().nullable(),
        at: z.string().nullable(),
        /** The viewer may not change it (the commissioner decided). */
        locked: z.boolean(),
      })
      .nullable(),
  })
  .strict();

export const ArchiveAuditLevelSchema = z.enum(["ALL", "OWN_TEAM"]);
/** Per-member player-check access a site admin sets (FranchiseMembership.archiveAudit). */
export const ArchiveAuditAccessSchema = z.enum(["NONE", "OWN_TEAM", "ALL"]);

export const PlayerCheckSeasonSchema = z.object({
  year: z.number(), verified: z.number(), suggested: z.number(), flagged: z.number(), open: z.number(),
});

export const PlayerCheckResponseSchema = z
  .object({
    viewer: z.object({
      isAdmin: z.boolean(),
      /** The viewer's decisions are final (site admin or commissioner). */
      final: z.boolean(),
      /** ALL: every team; OWN_TEAM: only teamCodes. */
      level: ArchiveAuditLevelSchema,
      /** The franchises an OWN_TEAM viewer may decide; null for ALL. */
      teamCodes: z.array(z.string()).nullable(),
    }),
    /** Newest first. */
    seasons: z.array(PlayerCheckSeasonSchema),
    /** Franchises that have a name to decide, by their current name. */
    teams: z.array(z.object({ code: z.string(), name: z.string() })),
    /** Oldest season first. */
    items: z.array(PlayerCheckItemSchema),
  })
  .strict();

export const PlayerCheckDecisionBodySchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("PICK"), mlbId: z.number().int().positive() }),
  z.object({ decision: z.literal("EXCEPTION") }),
  z.object({ decision: z.literal("WRONG") }),
  z.object({ decision: z.literal("NONE") }),
]);

export const PlayerCheckItemResponseSchema = z.object({ item: PlayerCheckItemSchema }).strict();

export const PlayerCheckSearchResponseSchema = z
  .object({ candidates: z.array(PlayerCheckCandidateSchema), /** More players matched than are shown. */ more: z.boolean() })
  .strict();

/** GET /api/archive/audit-access/me — may the viewer help on the player check? (any member) */
export const AuditAccessMeResponseSchema = z
  .object({ level: ArchiveAuditLevelSchema.nullable(), teamCodes: z.array(z.string()).nullable() })
  .strict();

/** GET /api/archive/audit-access — every franchise member and his player-check access (site admin). */
export const AuditAccessMemberSchema = z
  .object({
    membershipId: z.number(),
    name: z.string(),
    /** LeagueRole in the franchise: COMMISSIONER / OWNER / VIEWER. */
    role: z.string(),
    /** Codes of the teams he owns now: what OWN_TEAM lets him decide. */
    teamCodes: z.array(z.string()),
    /** Those teams' names, in the same order. */
    teamNames: z.array(z.string()),
    access: ArchiveAuditAccessSchema,
  })
  .strict();
export const AuditAccessListResponseSchema = z.object({ members: z.array(AuditAccessMemberSchema) }).strict();
export const AuditAccessUpdateBodySchema = z.object({ access: ArchiveAuditAccessSchema }).strict();

export type ArchiveAuditLevel = z.infer<typeof ArchiveAuditLevelSchema>;
export type ArchiveAuditAccess = z.infer<typeof ArchiveAuditAccessSchema>;
export type AuditAccessMeResponse = z.infer<typeof AuditAccessMeResponseSchema>;
export type AuditAccessMember = z.infer<typeof AuditAccessMemberSchema>;
export type AuditAccessListResponse = z.infer<typeof AuditAccessListResponseSchema>;
export type AuditAccessUpdateBody = z.infer<typeof AuditAccessUpdateBodySchema>;
export type SeasonLine = z.infer<typeof SeasonLineSchema>;
export type SlotCheck = z.infer<typeof SlotCheckSchema>;
export type PlayerCheckCandidate = z.infer<typeof PlayerCheckCandidateSchema>;
export type PlayerCheckStatus = z.infer<typeof PlayerCheckStatusSchema>;
export type PlayerCheckDecisionKind = z.infer<typeof PlayerCheckDecisionKindSchema>;
export type PlayerCheckItem = z.infer<typeof PlayerCheckItemSchema>;
export type PlayerCheckSeason = z.infer<typeof PlayerCheckSeasonSchema>;
export type PlayerCheckResponse = z.infer<typeof PlayerCheckResponseSchema>;
export type PlayerCheckDecisionBody = z.infer<typeof PlayerCheckDecisionBodySchema>;
export type PlayerCheckItemResponse = z.infer<typeof PlayerCheckItemResponseSchema>;
export type PlayerCheckSearchResponse = z.infer<typeof PlayerCheckSearchResponseSchema>;
