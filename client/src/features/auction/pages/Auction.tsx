
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

// MOCK for verify
const MOCK_LOG = [
    { type: 'WIN', amount: 3, playerName: 'Test Player', teamName: 'Test Team', timestamp: Date.now() },
    { type: 'WIN', amount: 45, playerName: 'Star Player', teamName: 'Big Spender', timestamp: Date.now() }
];
export default function Auction() {
  const [players, setPlayers] = useState<PlayerSeasonStat[]>([]);
  const [initLoading, setInitLoading] = useState(true);
  
  // Auth / Context State
  const [myTeamId, setMyTeamId] = useState<number | undefined>(undefined);
  const [activeLeagueId, setActiveLeagueId] = useState<number | null>(null);

  // Use the Hook
  const { state: auctionState, actions } = useAuctionState(activeLeagueId);
  const { queue: myQueue, add: addToQueue, remove: removeFromQueue, isQueued } = useNominationQueue(myTeamId);

  // Initialization: Fetch Data & Identify User
  useEffect(() => {
    let mounted = true;
    const init = async () => {
        try {
            setInitLoading(true);

            // 1. Fetch Players
            const stats = await getPlayerSeasonStats();
            if(mounted) setPlayers(stats);
            
            // 2. Identify League & User
            const leaguesRes = await getLeagues();
            const firstLeague = leaguesRes.leagues[0]; 
            const meRes = await getMe();
            const myUserId = meRes.user?.id;

            if (firstLeague) {
                if(mounted) setActiveLeagueId(firstLeague.id);
                // Fetch full league detail to get teams
                const detail = await getLeague(firstLeague.id);
                const myTeam = detail.league.teams.find((t: any) => t.ownerUserId === myUserId);
                if (myTeam && mounted) {
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

  // Ensure Auction Server is Initialized for this League
  useEffect(() => {
      // One-time check: if we have a league ID but server says null, trying initing.
      // This is a convenience for now.
      if (activeLeagueId && auctionState && auctionState.leagueId !== activeLeagueId && auctionState.status === 'not_started') {
           // We only auto-init if we are confident? Or maybe providing a "Start Auction" button is better.
           // For audit "continue", let's leave it to manual or existing state.
           // But wait, if server is fresh restart, state is empty. We need to init.
           actions.initAuction(activeLeagueId);
      }
  }, [activeLeagueId, auctionState?.leagueId, auctionState?.status]); // eslint-disable-line react-hooks/exhaustive-deps


  // Handler: Nominate
  const handleNominate = (player: PlayerSeasonStat) => {
      if (!myTeamId) {
          alert("You are not part of this league/auction.");
          return;
      }
      if (!activeLeagueId) return;

      // Ask for opening bid? Default $1
      const startBid = 1; 

      actions.nominate({
          nominatorTeamId: myTeamId,
          playerId: player.mlb_id || '',
          playerName: player.player_name || 'Unknown',
          startBid: startBid,
          positions: player.positions || (player.is_pitcher ? 'P' : 'UT'),
          team: player.mlb_team || 'FA',
          isPitcher: player.is_pitcher || false
      });
  };

  const handleBid = (amount: number) => {
      if (!myTeamId) return;
      actions.bid({
          bidderTeamId: myTeamId,
          amount
      });
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
  
  if (initLoading) return <div className="p-8 text-center text-[var(--lg-text-muted)]">Loading auction room...</div>;

  return (
    <AuctionLayout
        title="Auction"
        subtitle="Real-time auction draft room. Nominate players and manage bids."
        stage={
            <div className="flex flex-col h-full gap-4">
                <div className="flex-1 overflow-auto">
                    <AuctionStage 
                        serverState={auctionState}
                        myTeamId={myTeamId}
                        onBid={handleBid}
                        onFinish={actions.finishAuction}
                        onPause={actions.pause}
                        onResume={actions.resume}
                        onReset={actions.reset}
                    />
                </div>
                {/* Personal Queue */}
                <div className="shrink-0 max-h-[250px] flex flex-col">
                    <MyNominationQueue 
                        players={players}
                        queueIds={myQueue}
                        onRemove={removeFromQueue}
                        onNominate={auctionState?.status === 'nominating' ? handleNominate : undefined}
                        isMyTurn={displayTeams.find(t => t.id === myTeamId)?.isMe && auctionState?.queue?.[auctionState.queueIndex] === myTeamId /* Approximation, AuctionStage handles logic actually */}
                        myTeamId={myTeamId}
                    />
                </div>
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
                        content: <AIAnalysisTab log={auctionState?.log?.length ? auctionState.log : (MOCK_LOG as any)} teams={displayTeams} /> 
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
