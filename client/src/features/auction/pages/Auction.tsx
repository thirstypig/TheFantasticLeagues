
import React, { useEffect, useState, useMemo } from 'react';
import AuctionLayout from '../components/AuctionLayout';
import AuctionStage from '../components/AuctionStage';
import ContextDeck from '../components/ContextDeck';
import PlayerPoolTab from '../components/PlayerPoolTab';
import TeamListTab from '../components/TeamListTab';
import AIAnalysisTab from '../components/AIAnalysisTab';
import MyNominationQueue from '../components/MyNominationQueue';
import { getPlayerSeasonStats, type PlayerSeasonStat, getLeagues, getLeague, getMe } from '../../../api';
import { useAuctionState } from '../hooks/useAuctionState';
import { useNominationQueue } from '../hooks/useNominationQueue';
import { useToast } from "../../../contexts/ToastContext";

export default function Auction() {
  const { toast } = useToast();
  const [players, setPlayers] = useState<PlayerSeasonStat[]>([]);
  const [initLoading, setInitLoading] = useState(true);
  
  // Auth / Context State
  const [myTeamId, setMyTeamId] = useState<number | undefined>(undefined);
  const [activeLeagueId, setActiveLeagueId] = useState<number | null>(null);
  const [isCommissioner, setIsCommissioner] = useState(false);

  // Use the Hook
  const { state: auctionState, actions } = useAuctionState(activeLeagueId);
  const { queue: myQueue, add: addToQueue, remove: removeFromQueue, isQueued } = useNominationQueue(myTeamId);

  // Initialization: Fetch Data & Identify User
  useEffect(() => {
    let mounted = true;
    const init = async () => {
        try {
            setInitLoading(true);

            // Parallel fetch: players + leagues + me
            const [stats, leaguesRes, meRes] = await Promise.all([
                getPlayerSeasonStats(),
                getLeagues(),
                getMe(),
            ]);
            if (!mounted) return;
            setPlayers(stats);

            const firstLeague = leaguesRes.leagues[0];
            const myUserId = meRes.user?.id;

            if (firstLeague) {
                setActiveLeagueId(firstLeague.id);

                // Check commissioner role from memberships
                const membership = meRes.user?.memberships?.find((m: any) => m.leagueId === firstLeague.id);
                if (membership?.role === 'COMMISSIONER' || meRes.user?.isAdmin) {
                    setIsCommissioner(true);
                }

                const detail = await getLeague(firstLeague.id);
                if (!mounted) return;
                const myTeam = detail.league.teams.find((t: any) =>
                  t.ownerUserId === myUserId || (t.ownerships || []).some((o: any) => o.userId === myUserId)
                );
                if (myTeam) {
                    setMyTeamId(myTeam.id);
                }
            }

        } catch (e) {
            console.error(e);
        } finally {
            if(mounted) setInitLoading(false);
        }
    };
    init();
    return () => { mounted = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show "Start Auction" button instead of auto-init — commissioner explicitly starts
  const needsInit = activeLeagueId && auctionState && auctionState.status === 'not_started' && isCommissioner;

  // Detect if it's my turn to nominate
  const isMyTurnToNominate = auctionState?.status === 'nominating'
    && myTeamId
    && auctionState.queue?.[auctionState.queueIndex] === myTeamId;

  // Auto-nominate from personal queue when it's my turn
  useEffect(() => {
    if (!isMyTurnToNominate || myQueue.length === 0 || players.length === 0) return;

    // Find the first queued player that's still available
    const candidate = myQueue
      .map(id => players.find(p => String(p.mlb_id) === id))
      .find(p => p && !p.ogba_team_code && !p.team);

    if (candidate) {
      // Small delay so the UI shows "Your turn" before auto-nominating
      const timer = setTimeout(() => {
        handleNominate(candidate);
        removeFromQueue(String(candidate.mlb_id));
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isMyTurnToNominate, myQueue, players]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handler: Nominate
  const handleNominate = async (player: PlayerSeasonStat) => {
      if (!myTeamId) {
          toast("You are not part of this league/auction.", "error");
          return;
      }
      if (!activeLeagueId) return;

      // Ask for opening bid? Default $1
      const startBid = 1;

      try {
          await actions.nominate({
              nominatorTeamId: myTeamId,
              playerId: player.mlb_id || '',
              playerName: player.player_name || 'Unknown',
              startBid: startBid,
              positions: player.positions || (player.is_pitcher ? 'P' : 'UT'),
              team: player.mlb_team || 'FA',
              isPitcher: Boolean(player.is_pitcher)
          });
      } catch (e: any) {
          const msg = e?.message || "Nomination failed";
          toast(msg, "error");
      }
  };

  const handleBid = async (amount: number) => {
      if (!myTeamId) {
          toast("You are not part of this league/auction.", "error");
          return;
      }
      try {
          await actions.bid({
              bidderTeamId: myTeamId,
              amount
          });
      } catch (e: any) {
          const msg = e?.message || "Bid failed";
          toast(msg, "error");
      }
  };

  // Adapter for TeamListTab (it expects local TeamData, we have server AuctionTeam)
  // We mash them together or refactor TeamListTab.
  // For now, let's map server teams to expected shape.
  const displayTeams = useMemo(() => {
      if (!auctionState?.teams) return [];
      return auctionState.teams.map((t: any) => ({
          ...t,
          isMe: t.id === myTeamId,
          rosterCount: t.rosterCount || 0 // Ensure field exists
      }));
  }, [auctionState?.teams, myTeamId]);
  
  if (initLoading) return (
    <div className="p-4 md:p-8 space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="h-8 w-48 rounded-2xl bg-[var(--lg-tint)]" />
      <div className="h-4 w-72 rounded-2xl bg-[var(--lg-tint)]" />
      {/* Two-column layout skeleton */}
      <div className="flex flex-col lg:flex-row gap-6 mt-6">
        {/* Left panel ~60% */}
        <div className="flex-[3] space-y-4">
          <div className="h-64 rounded-2xl bg-[var(--lg-tint)]" />
          <div className="h-40 rounded-2xl bg-[var(--lg-tint)]" />
        </div>
        {/* Right panel ~40% */}
        <div className="flex-[2] space-y-4">
          <div className="h-10 rounded-2xl bg-[var(--lg-tint)]" />
          <div className="h-80 rounded-2xl bg-[var(--lg-tint)]" />
        </div>
      </div>
    </div>
  );

  // Non-commissioner sees waiting screen before auction starts
  if (activeLeagueId && auctionState && auctionState.status === 'not_started' && !isCommissioner) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h2 className="text-2xl font-semibold text-[var(--lg-text-heading)]">Auction Draft</h2>
      <p className="text-sm text-[var(--lg-text-muted)]">Waiting for the commissioner to start the auction...</p>
    </div>
  );

  if (needsInit) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <h2 className="text-3xl font-semibold text-[var(--lg-text-heading)]">Auction Draft</h2>
      <p className="text-sm text-[var(--lg-text-muted)]">Initialize the auction to begin the live draft.</p>
      <button
        onClick={() => actions.initAuction(activeLeagueId!)}
        className="px-8 py-4 bg-[var(--lg-accent)] text-white font-semibold rounded-[var(--lg-radius-lg)] text-lg hover:opacity-90 transition-opacity"
      >
        Start Auction
      </button>
    </div>
  );

  return (
    <AuctionLayout
        title="Auction"
        subtitle="Real-time auction draft room. Nominate players and manage bids."
        stage={
            <div className="flex flex-col h-full gap-2">
                <AuctionStage
                    serverState={auctionState}
                    myTeamId={myTeamId}
                    onBid={handleBid}
                    onFinish={actions.finishAuction}
                    onPause={isCommissioner ? actions.pause : undefined}
                    onResume={isCommissioner ? actions.resume : undefined}
                    onReset={isCommissioner ? actions.reset : undefined}
                    onUndoFinish={isCommissioner ? actions.undoFinish : undefined}
                />
                {myQueue.length > 0 && (
                    <MyNominationQueue
                        players={players}
                        queueIds={myQueue}
                        onRemove={removeFromQueue}
                        onNominate={auctionState?.status === 'nominating' ? handleNominate : undefined}
                        isMyTurn={!!isMyTurnToNominate}
                        myTeamId={myTeamId}
                    />
                )}
            </div>
        }
        context={
            <ContextDeck 
                tabs={[
                    { 
                        key: 'pool', 
                        label: 'Player Pool', 
                        content: <PlayerPoolTab
                                    players={players}
                                    teams={displayTeams}
                                    onNominate={auctionState?.status === 'nominating' ? handleNominate : undefined}
                                    onQueue={addToQueue}
                                    isQueued={isQueued}
                                    myTeamId={myTeamId}
                                    auctionConfig={auctionState?.config}
                                 /> 
                    },
                    { 
                        key: 'teams', 
                        label: 'Teams', 
                        count: displayTeams.length, 
                        content: <TeamListTab teams={displayTeams} players={players} /> 
                    },
                    { 
                        key: 'analysis', 
                        label: 'AI Analysis', 
                        content: <AIAnalysisTab log={auctionState?.log || []} teams={displayTeams} />
                    },
                    { 
                        key: 'log', 
                        label: 'Log', 
                        content: <div className="h-full overflow-auto bg-[var(--lg-glass-bg)] divide-y divide-[var(--lg-table-border)]">
                            {(!auctionState?.log || auctionState.log.length === 0) && (
                                <div className="p-4 text-center text-[var(--lg-text-muted)] text-sm">
                                    No auction activity yet.
                                </div>
                            )}
                            {auctionState?.log?.map((evt, i) => (
                                <div key={i} className="p-3 flex flex-col gap-1 text-sm hover:bg-[var(--lg-bg-secondary)]/30">
                                    <div className="flex justify-between items-start">
                                        <span className={`font-bold ${evt.type === 'WIN' ? 'text-[var(--lg-success)]' : evt.type === 'BID' ? 'text-[var(--lg-text-primary)]' : 'text-[var(--lg-accent)]'}`}>
                                            {evt.type}
                                        </span>
                                        <span className="text-xs text-[var(--lg-text-muted)]">
                                            {new Date(evt.timestamp).toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <div className="text-[var(--lg-text-secondary)]">
                                        {evt.message}
                                    </div>
                                </div>
                            ))}
                        </div> 
                    }
                ]} 
            />
        }
    />
  );
}
