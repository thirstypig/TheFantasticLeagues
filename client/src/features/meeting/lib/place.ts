import type { MeetingState } from "@shared/api/meeting";

/**
 * Where a team sits relative to the clock. `nth` counts from the team on the
 * clock (1st = up now, 2nd = next). A team whose turn already came this round
 * is counted into the next round.
 */
export function placeInOrder(s: MeetingState, teamId: number): { onClock: boolean; nth: number } | null {
  const i = s.order.indexOf(teamId);
  if (i < 0) return null;
  const t = s.turnIndex;
  if (i === t) return { onClock: true, nth: 1 };
  if (i > t) return { onClock: false, nth: i - t + 1 };
  return { onClock: false, nth: s.order.length - t + i + 1 };
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10]}`;
}
