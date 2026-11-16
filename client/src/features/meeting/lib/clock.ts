/** Server clock offset: positive when the server is ahead of this client. */
export function skewMs(serverNowIso: string, clientNowMs: number): number {
  return new Date(serverNowIso).getTime() - clientNowMs;
}

/** Milliseconds left on the turn clock (negative once in overtime), or null when no clock is running. */
export function remainingMs(
  turnEndsAtIso: string | null,
  pausedRemainingMs: number | null,
  skew: number,
  clientNowMs: number,
): number | null {
  if (pausedRemainingMs != null) return pausedRemainingMs;
  if (!turnEndsAtIso) return null;
  return new Date(turnEndsAtIso).getTime() - (clientNowMs + skew);
}

/** "1:24", "0:05", and "+0:12" for overtime. */
export function formatClock(ms: number): string {
  const over = ms < 0;
  const totalSeconds = over ? Math.floor(-ms / 1000) : Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${over ? "+" : ""}${m}:${s}`;
}
