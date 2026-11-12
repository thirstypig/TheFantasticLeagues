/*
 * What every auction page loads before it can render: the player feed, my
 * team, and whether I'm the commissioner (site admins count as commissioners,
 * matching server `isAdminOrCommissioner`). Shared by /auction and
 * /auction/assign so the two can't drift.
 */
import { useEffect, useState } from 'react';
import { getPlayerSeasonStats, type PlayerSeasonStat, getLeague, getMe } from '../../../api';
import { useLeague, findMyTeam } from '../../../contexts/LeagueContext';

export interface AuctionPageData {
  /** The league whose auction this is; null until loaded, or when no league is picked. */
  leagueId: number | null;
  players: PlayerSeasonStat[];
  myTeamId: number | undefined;
  isCommissioner: boolean;
  loading: boolean;
}

export function useAuctionPageData(): AuctionPageData {
  const { leagueId: currentLeagueId } = useLeague();
  const [players, setPlayers] = useState<PlayerSeasonStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [myTeamId, setMyTeamId] = useState<number | undefined>(undefined);
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [isCommissioner, setIsCommissioner] = useState(false);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        setLoading(true);
        const [stats, meRes] = await Promise.all([
          getPlayerSeasonStats(currentLeagueId || undefined),
          getMe(),
        ]);
        if (!mounted) return;
        setPlayers(stats);
        const fetchedUserId = meRes.user?.id;

        if (currentLeagueId) {
          setLeagueId(currentLeagueId);
          const membership = meRes.user?.memberships?.find((m: { leagueId: number; role: string }) => m.leagueId === currentLeagueId);
          setIsCommissioner(membership?.role === 'COMMISSIONER' || !!meRes.user?.isAdmin);
          const detail = await getLeague(currentLeagueId);
          if (!mounted) return;
          const myTeam = fetchedUserId ? findMyTeam(detail.league.teams, fetchedUserId) : null;
          setMyTeamId(myTeam ? myTeam.id : undefined);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    init();
    return () => { mounted = false; };
  }, [currentLeagueId]);

  return { leagueId, players, myTeamId, isCommissioner, loading };
}
