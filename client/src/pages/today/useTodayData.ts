import { useEffect, useState } from "react";
import { getSeasonStandings } from "../../features/players/api";
import { getPeriods, type PeriodInfo } from "../../features/periods/api";
import { getActivePeriod, type WaiverPeriod } from "../../features/wire-list/api";
import { normalizeStandings, type TodayStandingsRow } from "./todayModel";
import { getMyPlayersToday, getMyPlayerNews, type MyPlayerToday, type PlayerNewsTx } from "./api";

export type Source<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error" };

export interface TodayData {
  standings: Source<{ rows: TodayStandingsRow[]; periodNames: string[] }>;
  periods: Source<PeriodInfo[]>;
  wirePeriod: Source<WaiverPeriod | null>;
  tonight: Source<MyPlayerToday[]>;
  news: Source<PlayerNewsTx[]>;
}

const loading: Source<never> = { status: "loading" };

export function useTodayData(leagueId: number | null, hasTeam: boolean): TodayData {
  const [data, setData] = useState<TodayData>({
    standings: loading, periods: loading, wirePeriod: loading, tonight: loading, news: loading,
  });

  useEffect(() => {
    if (leagueId == null) return;
    let canceled = false;
    setData({
      standings: loading,
      periods: loading,
      wirePeriod: hasTeam ? loading : { status: "ok", data: null },
      tonight: hasTeam ? loading : { status: "ok", data: [] },
      news: hasTeam ? loading : { status: "ok", data: [] },
    });

    // Each source settles independently; failures never throw or toast.
    const run = <K extends keyof TodayData, T>(
      key: K,
      load: () => Promise<T>,
      pick: (v: T) => Extract<TodayData[K], { status: "ok" }>["data"],
    ) => {
      load().then(
        (v) => {
          if (!canceled) setData((d) => ({ ...d, [key]: { status: "ok", data: pick(v) } }));
        },
        () => {
          if (!canceled) setData((d) => ({ ...d, [key]: { status: "error" } }));
        },
      );
    };

    run("standings", () => getSeasonStandings(leagueId), (r) => ({
      rows: normalizeStandings(r),
      periodNames: r.periodNames ?? [],
    }));
    run("periods", () => getPeriods(leagueId), (p) => p);
    if (hasTeam) {
      run("wirePeriod", () => getActivePeriod(leagueId), (r) => r.period ?? null);
      run("tonight", () => getMyPlayersToday(leagueId), (r) => r.players ?? []);
      run("news", () => getMyPlayerNews(leagueId), (r) => r.items ?? []);
    }

    return () => {
      canceled = true;
    };
  }, [leagueId, hasTeam]);

  return data;
}
