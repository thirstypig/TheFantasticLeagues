/**
 * Auction clocks (lot clock and turn clock). Shared by the lot header and the
 * "your turn" box so both count down the same way.
 */
import { useEffect, useState } from 'react';

/** `m:ss`, never negative: an expired clock reads `0:00`. Rounds up, so 8.2s reads `0:09`. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Milliseconds left until `endTime` (ISO). When `frozenMs` is a number the
 * clock is stopped (paused) and reads that value. Null when there is no clock.
 */
export function useClock(endTime: string | null | undefined, frozenMs?: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  const frozen = typeof frozenMs === 'number';
  useEffect(() => {
    if (!endTime || frozen) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endTime, frozen]);
  if (frozen) return Math.max(0, frozenMs as number);
  if (!endTime) return null;
  const end = new Date(endTime).getTime();
  if (Number.isNaN(end)) return null;
  return Math.max(0, end - now);
}
