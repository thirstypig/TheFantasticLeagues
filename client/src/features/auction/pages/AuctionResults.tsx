import React, { useEffect, useState } from 'react';
import { getMe, getLeague } from '../../../api';
import { useLeague } from '../../../contexts/LeagueContext';
import { fetchJsonApi } from '../../../api/base';
import type { ClientAuctionState } from '../hooks/useAuctionState';
import AuctionComplete from '../components/AuctionComplete';

export default function AuctionResults() {
  const { leagueId } = useLeague();
  const [auctionState, setAuctionState] = useState<ClientAuctionState | null>(null);
  const [myTeamId, setMyTeamId] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    let mounted = true;

    const init = async () => {
      try {
        setLoading(true);
        setError(null);

        const [state, meRes] = await Promise.all([
          fetchJsonApi<ClientAuctionState>(`/api/auction/state?leagueId=${leagueId}`),
          getMe(),
        ]);

        if (!mounted) return;
        setAuctionState(state);

        const myUserId = meRes.user?.id;
        if (myUserId) {
          const detail = await getLeague(leagueId);
          if (!mounted) return;
          const myTeam = detail.league.teams.find((t: any) =>
            t.ownerUserId === myUserId || (t.ownerships || []).some((o: any) => o.userId === myUserId)
          );
          if (myTeam) setMyTeamId(myTeam.id);
        }
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load auction results');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();
    return () => { mounted = false; };
  }, [leagueId]);

  if (loading) {
    return (
      <div className="p-4 md:p-8 space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded-2xl bg-[var(--lg-tint)]" />
        <div className="h-4 w-72 rounded-2xl bg-[var(--lg-tint)]" />
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="h-24 rounded-xl bg-[var(--lg-tint)]" />
          <div className="h-24 rounded-xl bg-[var(--lg-tint)]" />
          <div className="h-24 rounded-xl bg-[var(--lg-tint)]" />
        </div>
        <div className="h-64 rounded-xl bg-[var(--lg-tint)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h2 className="text-2xl font-semibold text-[var(--lg-text-heading)]">Auction Results</h2>
        <p className="text-sm text-[var(--lg-text-muted)]">{error}</p>
      </div>
    );
  }

  if (!auctionState || auctionState.status === 'not_started') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h2 className="text-2xl font-semibold text-[var(--lg-text-heading)]">Auction Results</h2>
        <p className="text-sm text-[var(--lg-text-muted)]">No auction data available for this league.</p>
      </div>
    );
  }

  return <AuctionComplete auctionState={auctionState} myTeamId={myTeamId} />;
}
