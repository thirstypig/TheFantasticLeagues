import { useEffect, useState } from "react";

interface DataFreshnessProps {
  /** Server-supplied ISO timestamp marking when the underlying data was computed. */
  computedAt: string | null | undefined;
  /** Optional label prefix (default: "Updated"). */
  label?: string;
  /** Wrapping element class — caller controls layout. */
  className?: string;
}

/**
 * Renders a "Updated 2m ago" badge whose source-of-truth is the server's
 * `computedAt` ISO string, NOT the time the client received the response.
 *
 * Re-renders every 60s so the relative label stays current without a full
 * page refresh. Hover shows the absolute local time.
 */
export function DataFreshness({ computedAt, label = "Updated", className }: DataFreshnessProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!computedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [computedAt]);

  if (!computedAt) return null;
  const date = new Date(computedAt);
  if (Number.isNaN(date.getTime())) return null;

  // Absolute date+time (e.g. "May 7, 2:30 PM") — visible without hover so
  // owners always know exactly when stats were last computed. Tooltip shows
  // full local string + relative as a secondary signal.
  const abs = date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <span
      className={className ?? "text-xs text-slate-500"}
      title={`${date.toLocaleString()} (${formatTimeAgo(date)})`}
    >
      {label} {abs}
    </span>
  );
}

export function formatTimeAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  if (ms < 0) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "moments ago";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}
