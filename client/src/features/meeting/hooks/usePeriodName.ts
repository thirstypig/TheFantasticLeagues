import { useEffect, useState } from "react";
import { getMeetingPeriod } from "../api";

export interface MeetingPeriodInfo {
  /** e.g. "Period 9"; undefined until known or if the lookup fails. */
  name: string | undefined;
  /** True once the lookup has settled (found, not found, or failed). */
  settled: boolean;
  /**
   * True when the period is known and is no longer pending: a meeting is held
   * while its period is pending, so a session for an activated or closed period
   * is a leftover, not a live meeting. False while loading or if the lookup fails.
   */
  stale: boolean;
}

const UNKNOWN: MeetingPeriodInfo = { name: undefined, settled: false, stale: false };

/** The period's name and whether it is still pending, fetched once per (league, period), not per poll. */
export function useMeetingPeriod(leagueId: number | null, periodId: number | null): MeetingPeriodInfo {
  const [info, setInfo] = useState<MeetingPeriodInfo>(UNKNOWN);
  useEffect(() => {
    setInfo(UNKNOWN);
    if (leagueId == null || periodId == null) return;
    let live = true;
    getMeetingPeriod(leagueId, periodId).then(
      (p) => live && setInfo({ name: p?.name, settled: true, stale: p != null && p.status !== "pending" }),
      () => live && setInfo({ name: undefined, settled: true, stale: false }),
    );
    return () => {
      live = false;
    };
  }, [leagueId, periodId]);
  return info;
}

/** The period's name, fetched once per (league, period). Undefined until known or if the lookup fails. */
export function usePeriodName(leagueId: number | null, periodId: number | null): string | undefined {
  return useMeetingPeriod(leagueId, periodId).name;
}
