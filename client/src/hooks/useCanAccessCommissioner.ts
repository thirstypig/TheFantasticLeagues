import { useMemo } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useLeague } from "../contexts/LeagueContext";
import type { LeagueListItem } from "../api";

/** True for site admins, or for a COMMISSIONER member of the current league. */
export function useCanAccessCommissioner(): boolean {
  const { user } = useAuth();
  const { leagues, leagueId } = useLeague();
  return useMemo(() => {
    if (Boolean(user?.isAdmin)) return true;
    const selected = (leagues ?? []).find((l: LeagueListItem) => l.id === leagueId);
    return selected?.access?.type === "MEMBER" && selected?.access?.role === "COMMISSIONER";
  }, [leagues, user, leagueId]);
}
