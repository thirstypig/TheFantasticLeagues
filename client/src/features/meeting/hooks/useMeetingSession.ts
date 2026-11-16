import { useCallback, useEffect, useRef, useState } from "react";
import type { MeetingSessionResponse } from "@shared/api/meeting";
import { getCurrentMeeting } from "../api";
import { skewMs } from "../lib/clock";

export const VISIBLE_POLL_MS = 2000;
export const HIDDEN_POLL_MS = 15000;
export const CONFLICT_MESSAGE = "The meeting just changed. Try again.";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Could not load the meeting";
}

export function useMeetingSession(leagueId: number | null) {
  const [data, setData] = useState<MeetingSessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skew, setSkew] = useState(0);
  const dataRef = useRef<MeetingSessionResponse | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  const apply = useCallback((res: MeetingSessionResponse) => {
    dataRef.current = res;
    setData(res);
    setSkew(skewMs(res.serverNow, Date.now()));
    setError(null);
  }, []);

  useEffect(() => {
    dataRef.current = null;
    setData(null);
    setError(null);
    if (leagueId == null) return;
    let cancelled = false;

    const schedule = () => {
      if (cancelled) return;
      if (dataRef.current?.session?.state.status === "ended") return;
      const delay = document.visibilityState === "visible" ? VISIBLE_POLL_MS : HIDDEN_POLL_MS;
      timer.current = setTimeout(load, delay);
    };

    async function load() {
      if (timer.current) clearTimeout(timer.current);
      try {
        const res = await getCurrentMeeting(leagueId as number);
        if (!cancelled) apply(res);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
      schedule();
    }
    loadRef.current = load;

    void load();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [leagueId, apply]);

  const refresh = useCallback(() => {
    void loadRef.current();
  }, []);

  const act = useCallback(
    async (fn: (version: number) => Promise<MeetingSessionResponse>) => {
      const version = dataRef.current?.version ?? 0;
      try {
        apply(await fn(version));
      } catch (e) {
        if ((e as { status?: number })?.status === 409) {
          refresh();
          throw new Error(CONFLICT_MESSAGE);
        }
        throw e;
      }
    },
    [apply, refresh],
  );

  return { data, error, skew, act, refresh };
}
