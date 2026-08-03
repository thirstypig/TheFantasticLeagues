// server/src/lib/audit/fbstTotals.ts
import { emptyStatLine, type StatLine } from "./types.js";

/** Slot codes that score as pitching. Mirrors audit_period.ts PITCHER_CODES. */
const PITCHER_CODES = new Set(["P", "SP", "RP", "CL", "TWP"]);

export interface RosterStint {
  teamId: number;
  playerId: number;
  acquiredAt: Date;
  releasedAt: Date | null;
  assignedPosition: string | null;
  posPrimary: string | null;
}

/**
 * Per-team period totals from PlayerStatsPeriod, using the same window and IL
 * rules as audit_period.ts — plus a per-team dedup guard that audit_period.ts
 * lacks (a same-period drop-and-re-add would otherwise count twice; see PR #402).
 *
 * Pure: all I/O is the caller's job, so this is unit-testable with no DB.
 */
export function computeTeamPeriodTotals(args: {
  teams: { id: number; name: string }[];
  rosters: RosterStint[];
  pspByPlayer: Map<number, StatLine>;
  period: { startDate: Date; endDate: Date };
  isOnIlAtPeriodStart: (playerId: number) => boolean;
}): Map<number, StatLine> {
  const { teams, rosters, pspByPlayer, period, isOnIlAtPeriodStart } = args;

  const acc = new Map<number, StatLine>(teams.map((t) => [t.id, emptyStatLine()]));
  const counted = new Set<string>(); // `${teamId}:${playerId}` — the PR #402 guard

  for (const r of rosters) {
    if (r.acquiredAt > period.endDate) continue;
    if (r.releasedAt && r.releasedAt <= period.startDate) continue;
    if (isOnIlAtPeriodStart(r.playerId)) continue;

    const key = `${r.teamId}:${r.playerId}`;
    if (counted.has(key)) continue;

    const ps = pspByPlayer.get(r.playerId);
    if (!ps) continue;

    const a = acc.get(r.teamId);
    if (!a) continue;

    counted.add(key);

    const pos = (r.assignedPosition ?? r.posPrimary ?? "").toUpperCase();
    if (PITCHER_CODES.has(pos)) {
      a.W += ps.W; a.SV += ps.SV; a.K += ps.K;
      a.ER += ps.ER; a.IP += ps.IP; a.BB_H += ps.BB_H;
    } else {
      a.R += ps.R; a.HR += ps.HR; a.RBI += ps.RBI;
      a.SB += ps.SB; a.H += ps.H; a.AB += ps.AB;
    }
  }

  return acc;
}
