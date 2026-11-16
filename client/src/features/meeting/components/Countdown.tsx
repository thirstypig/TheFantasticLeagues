// Turn clock: re-renders every 250ms from turnEndsAt − (now + skew); red once the turn runs over.
import React, { useEffect, useState } from "react";
import { formatClock, remainingMs } from "../lib/clock";

const TICK_MS = 250;

export function Countdown({
  turnEndsAt,
  pausedRemainingMs,
  skew,
  size = 32,
}: {
  turnEndsAt: string | null;
  pausedRemainingMs: number | null;
  skew: number;
  size?: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  const ticking = pausedRemainingMs == null && turnEndsAt != null;

  useEffect(() => {
    setNow(Date.now());
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [ticking, turnEndsAt]);

  const ms = remainingMs(turnEndsAt, pausedRemainingMs, skew, now);
  if (ms == null) return null;
  const over = ms < 0;
  return (
    <span
      data-testid="countdown"
      data-over={over ? "true" : "false"}
      role="timer"
      aria-label={over ? `Over time by ${formatClock(ms).slice(1)}` : `${formatClock(ms)} left`}
      style={{
        fontSize: size,
        fontWeight: 700,
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
        color: over ? "var(--am-negative)" : "var(--am-text)",
      }}
    >
      {formatClock(ms)}
    </span>
  );
}

export default Countdown;
