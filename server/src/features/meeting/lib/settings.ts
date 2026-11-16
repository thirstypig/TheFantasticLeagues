/**
 * Live meeting switches from LeagueRule (category "meeting"), with the spec
 * defaults when a row is missing or unparseable.
 */
import { prisma } from "../../../db/prisma.js";
import { getLeagueRules } from "../../../lib/leagueRuleCache.js";

export type MeetingSettingsRead = {
  live: boolean;
  turnSeconds: number;
  canAddTime: boolean;
  overtimeFee: number;
};

const DEFAULT_TURN_SECONDS = 120;

export async function readMeetingSettings(leagueId: number): Promise<MeetingSettingsRead> {
  const rules = await getLeagueRules(prisma, leagueId);
  const m = rules.meeting ?? {};

  const turn = Number(m.turn_seconds);
  const fee = Number(m.overtime_fee);

  return {
    live: m.live === "true",
    turnSeconds: Number.isInteger(turn) && turn > 0 ? turn : DEFAULT_TURN_SECONDS,
    canAddTime: m.can_add_time !== "false",
    overtimeFee: Number.isFinite(fee) && fee >= 0 ? fee : 0,
  };
}
