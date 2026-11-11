import { useAuth } from "../auth/AuthProvider";

/** True for site admins, or for a COMMISSIONER membership in the given league. */
export function useIsCommissioner(leagueId: number | null): boolean {
  const { me } = useAuth();
  const user = me?.user;
  if (!user) return false;
  if (user.isAdmin) return true;
  if (leagueId === null || Number.isNaN(leagueId)) return false;
  return (user.memberships ?? []).some((m) => Number(m.leagueId) === leagueId && m.role === "COMMISSIONER");
}
