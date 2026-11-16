import { useEffect, useState } from "react";
import { getPeriodName } from "../api";

/** The period's name, fetched once per (league, period), not per poll. Undefined until known or if the lookup fails. */
export function usePeriodName(leagueId: number | null, periodId: number | null): string | undefined {
  const [name, setName] = useState<string | undefined>(undefined);
  useEffect(() => {
    setName(undefined);
    if (leagueId == null || periodId == null) return;
    let live = true;
    getPeriodName(leagueId, periodId).then(
      (n) => live && setName(n),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [leagueId, periodId]);
  return name;
}
