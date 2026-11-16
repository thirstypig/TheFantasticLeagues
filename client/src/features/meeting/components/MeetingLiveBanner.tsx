// Today's "meeting is live" banner: shown only while a session is running or
// paused and my team is in the order. A slow poll while idle so a meeting opened later still shows.
import React from "react";
import { Link } from "react-router-dom";
import { useMeetingSession } from "../hooks/useMeetingSession";
import { ordinal, placeInOrder } from "../lib/place";

const IDLE_POLL_MS = 30_000;

export function MeetingLiveBanner({ leagueId, myTeamId }: { leagueId: number; myTeamId: number }) {
  const { data } = useMeetingSession(leagueId, { idlePollMs: IDLE_POLL_MS });
  const s = data?.session?.state;
  if (!s || (s.status !== "running" && s.status !== "paused")) return null;
  const place = placeInOrder(s, myTeamId);
  if (!place) return null;
  const text = place.onClock ? "Period meeting is live: you're up" : `Period meeting is live: you're ${ordinal(place.nth)}`;
  return (
    <Link className="today-note" to={`/leagues/${leagueId}/meeting`} style={place.onClock ? { fontWeight: 700, borderStyle: "solid", borderColor: "var(--am-accent)" } : undefined}>
      <span aria-hidden="true">●</span>
      <span>{text}</span>
    </Link>
  );
}

export default MeetingLiveBanner;
