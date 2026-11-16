/**
 * Contract: /api/meeting/* — live period-meeting turn clock.
 *
 * State lives in MeetingSession.state (JSON). Spec: docs/superpowers/specs/2026-11-13-live-meeting-design.md
 */
import { z } from "zod";

/** Matches the client `DraftPlayer` exactly. */
export const MeetingPlayerSchema = z.object({
  playerId: z.number().int(),
  name: z.string(),
  pos: z.string(),
  mlbTeam: z.string().nullable(),
  mlbId: z.number().int().nullable(),
});
export type MeetingPlayer = z.infer<typeof MeetingPlayerSchema>;

export const MeetingMoveSchema = z.object({
  id: z.string(),
  teamId: z.number().int(),
  add: MeetingPlayerSchema,
  drop: MeetingPlayerSchema,
});
export type MeetingMove = z.infer<typeof MeetingMoveSchema>;

export const MeetingStatusSchema = z.enum(["setup", "running", "paused", "ended"]);
export type MeetingStatus = z.infer<typeof MeetingStatusSchema>;

export const MeetingTurnLogSchema = z.object({
  teamId: z.number().int(),
  round: z.number().int(),
  result: z.enum(["move", "pass", "skipped"]),
  enteredBy: z.enum(["owner", "commissioner"]),
  overMs: z.number(),
});
export type MeetingTurnLog = z.infer<typeof MeetingTurnLogSchema>;

export const MeetingSettingsSchema = z.object({
  turnSeconds: z.number().int().positive(),
  canAddTime: z.boolean(),
  overtimeFee: z.number().nonnegative(),
});
export type MeetingSettings = z.infer<typeof MeetingSettingsSchema>;

export const MeetingStateSchema = z.object({
  status: MeetingStatusSchema,
  order: z.array(z.number().int()),
  round: z.number().int().min(1),
  turnIndex: z.number().int().min(0),
  turnEndsAt: z.string().nullable(),
  pausedRemainingMs: z.number().nullable(),
  passedThisRound: z.array(z.number().int()),
  moves: z.array(MeetingMoveSchema),
  turnsLog: z.array(MeetingTurnLogSchema),
  settings: MeetingSettingsSchema,
});
export type MeetingState = z.infer<typeof MeetingStateSchema>;

export const MeetingSessionResponseSchema = z.object({
  session: z
    .object({
      id: z.number().int(),
      leagueId: z.number().int(),
      periodId: z.number().int(),
      handedOffAt: z.string().nullable(),
      state: MeetingStateSchema,
    })
    .nullable(),
  version: z.number().int(),
  serverNow: z.string(),
  online: z.array(z.number().int()),
});
export type MeetingSessionResponse = z.infer<typeof MeetingSessionResponseSchema>;

export const MeetingChoicesResponseSchema = z.object({
  list: z.array(MeetingPlayerSchema),
  /** Droppable players: active (not IL), minus players already dropped in this meeting. */
  roster: z.array(MeetingPlayerSchema),
  /** The team's active (non-IL) roster size; unchanged by meeting moves (each is add + drop). */
  activeCount: z.number().int().nonnegative(),
});
export type MeetingChoicesResponse = z.infer<typeof MeetingChoicesResponseSchema>;

// ─── Request bodies ──────────────────────────────────────────────────

export const OpenBodySchema = z.object({
  periodId: z.number().int(),
  order: z.array(z.number().int()),
});
export type OpenBody = z.infer<typeof OpenBodySchema>;

export const VersionBodySchema = z.object({ version: z.number().int() });
export type VersionBody = z.infer<typeof VersionBodySchema>;

export const OrderBodySchema = z.object({
  order: z.array(z.number().int()),
  version: z.number().int(),
});
export type OrderBody = z.infer<typeof OrderBodySchema>;

export const SubmitBodySchema = z.object({
  teamId: z.number().int(),
  addPlayerId: z.number().int(),
  dropPlayerId: z.number().int(),
  version: z.number().int(),
});
export type SubmitBody = z.infer<typeof SubmitBodySchema>;

export const PassBodySchema = z.object({
  teamId: z.number().int(),
  version: z.number().int(),
});
export type PassBody = z.infer<typeof PassBodySchema>;
