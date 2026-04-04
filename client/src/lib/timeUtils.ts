import { useState, useEffect } from "react";

// ─── Cached Intl.DateTimeFormat instances (2-10x faster than recreating) ───

const formatCache = new Map<string, Intl.DateTimeFormat>();

function getCachedFormat(
  locale: string,
  opts: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(opts)}`;
  let fmt = formatCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, opts);
    formatCache.set(key, fmt);
  }
  return fmt;
}

const relativeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

// ─── Helpers ────────────────────────────────────────────────────────

function toDate(date: Date | string): Date {
  if (date instanceof Date) return date;
  return new Date(date);
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Format a date in the user's local timezone.
 * Uses cached Intl.DateTimeFormat for performance.
 */
export function formatLocalDate(
  date: Date | string,
  opts?: Intl.DateTimeFormatOptions
): string {
  const d = toDate(date);
  const defaults: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  };
  return getCachedFormat("en-US", opts ?? defaults).format(d);
}

/**
 * Format time in user's local timezone (e.g., "4:30 PM PDT").
 */
export function formatLocalTime(date: Date | string): string {
  const d = toDate(date);
  return getCachedFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

/**
 * Format a countdown string from a target epoch ms.
 * Returns "3h 22m", "15m", or "0m" if past.
 */
export function formatCountdown(targetMs: number): string {
  const diff = targetMs - Date.now();
  if (diff <= 0) return "0m";
  const totalMin = Math.floor(diff / 60_000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/**
 * Format a relative time string (e.g., "2 hours ago", "yesterday").
 * Uses Intl.RelativeTimeFormat.
 */
export function formatRelativeTime(date: Date | string): string {
  const d = toDate(date);
  const diffMs = d.getTime() - Date.now();
  const absDiffSec = Math.abs(diffMs / 1000);

  if (absDiffSec < 60) return "just now";
  if (absDiffSec < 3600) {
    const mins = Math.round(diffMs / 60_000);
    return relativeFormatter.format(mins, "minute");
  }
  if (absDiffSec < 86400) {
    const hours = Math.round(diffMs / 3_600_000);
    return relativeFormatter.format(hours, "hour");
  }
  if (absDiffSec < 604800) {
    const days = Math.round(diffMs / 86_400_000);
    return relativeFormatter.format(days, "day");
  }
  const weeks = Math.round(diffMs / 604_800_000);
  return relativeFormatter.format(weeks, "week");
}

/**
 * THREE-TIER event time display:
 * - Countdown if <24h in the future (e.g., "3h 22m")
 * - Relative if <7d in the past (e.g., "2 hours ago")
 * - Local absolute otherwise (e.g., "Mar 28, 4:30 PM")
 */
export function formatEventTime(epochMs: number): string {
  const now = Date.now();
  const diff = epochMs - now;

  // Future: less than 24h → countdown
  if (diff > 0 && diff < 86_400_000) {
    return formatCountdown(epochMs);
  }

  // Past: less than 7d → relative
  if (diff <= 0 && -diff < 604_800_000) {
    return formatRelativeTime(new Date(epochMs));
  }

  // Otherwise: absolute local date + time
  const d = new Date(epochMs);
  return getCachedFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/**
 * Safely parse a date-only string (YYYY-MM-DD) by anchoring to noon UTC,
 * preventing timezone-related day shifts.
 */
export function safeParseDate(dateStr: string): Date {
  // If it looks like a date-only string (no T, no time component)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + "T12:00:00Z");
  }
  return new Date(dateStr);
}

/**
 * React hook returning seconds remaining until targetMs.
 * Updates once per second via setInterval.
 */
export function useCountdownSeconds(targetMs: number): number {
  const [seconds, setSeconds] = useState(() =>
    Math.max(0, Math.floor((targetMs - Date.now()) / 1000))
  );

  useEffect(() => {
    const update = () =>
      setSeconds(Math.max(0, Math.floor((targetMs - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  return seconds;
}
