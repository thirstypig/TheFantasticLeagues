// Today's "meeting is live" banner: shown only while a session is running or
// paused, its period is still pending (a session left open for an earlier,
// since-activated period is not "live"), and my team is in the order. A slow
// poll while idle so a meeting opened later still shows, and an ended one clears.
import React from "react";
import { Link } from "react-router-dom";
import { useMeetingPeriod } from "../hooks/usePeriodName";
import { useMeetingSession } from "../hooks/useMeetingSession";
import { ordinal, placeInOrder } from "../lib/place";

const IDLE_POLL_MS = 30_000;

export function MeetingLiveBanner({ leagueId, myTeamId }: { leagueId: number; myTeamId: number }) {
  const { data } = useMeetingSession(leagueId, { idlePollMs: IDLE_POLL_MS });
  const s = data?.session?.state;
  const live = s != null && (s.status === "running" || s.status === "paused");
  const period = useMeetingPeriod(live ? leagueId : null, live ? data?.session?.periodId ?? null : null);
  if (!s || !live) return null;
  // Wait for the period lookup (no flash for a leftover session); a failed lookup still shows.
  if (!period.settled || period.stale) return null;
  const periodName = period.name;
  const place = placeInOrder(s, myTeamId);
  if (!place) return null;
  const label = `${periodName ?? "Period"} meeting is live`;
  const text = place.onClock ? `${label}: you're up` : `${label}: you're ${ordinal(place.nth)}`;
  return (
    <Link className="today-note" to={`/leagues/${leagueId}/meeting`} style={place.onClock ? { fontWeight: 700, borderStyle: "solid", borderColor: "var(--am-accent)" } : undefined}>
      <span aria-hidden="true">●</span>
      <span>{text}</span>
    </Link>
  );
}

export default MeetingLiveBanner;
