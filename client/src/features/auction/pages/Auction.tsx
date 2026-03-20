
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import AuctionLayout from '../components/AuctionLayout';
import AuctionStage from '../components/AuctionStage';
import AuctionComplete from '../components/AuctionComplete';
import ContextDeck from '../components/ContextDeck';
import PlayerPoolTab from '../components/PlayerPoolTab';
import TeamListTab from '../components/TeamListTab';
import AIAnalysisTab from '../components/AIAnalysisTab';
import MyNominationQueue from '../components/MyNominationQueue';
import { getPlayerSeasonStats, type PlayerSeasonStat, getLeague, getMe } from '../../../api';
import { useAuctionState } from '../hooks/useAuctionState';
import { useNominationQueue } from '../hooks/useNominationQueue';
import { useWatchlist } from '../hooks/useWatchlist';
import { useAuctionSounds } from '../hooks/useAuctionSounds';
import { useToast } from "../../../contexts/ToastContext";
import { useLeague } from "../../../contexts/LeagueContext";
import { useSeasonGating } from "../../../hooks/useSeasonGating";
import AuctionResults from "./AuctionResults";
import AuctionDraftLog from '../components/AuctionDraftLog';
import ChatTab from '../components/ChatTab';

export default function Auction() {
  const { toast } = useToast();
  const { leagueId: currentLeagueId } = useLeague();
  const gating = useSeasonGating();
  const [players, setPlayers] = useState<PlayerSeasonStat[]>([]);
  const [initLoading, setInitLoading] = useState(true);

  // Auth / Context State
  const [myTeamId, setMyTeamId] = useState<number | undefined>(undefined);
  const [activeLeagueId, setActiveLeagueId] = useState<number | null>(null);
  const [isCommissioner, setIsCommissioner] = useState(false);

  // Use the Hook
  const { state: auctionState, chatMessages, actions } = useAuctionState(activeLeagueId);
  const [myUserId, setMyUserId] = useState<number | undefined>(undefined);
  const { queue: myQueue, add: addToQueue, remove: removeFromQueue, isQueued, moveUp: moveQueueUp, moveDown: moveQueueDown } = useNominationQueue(myTeamId);
  const { starred: starredIds, toggle: toggleStar } = useWatchlist(activeLeagueId);
  const sounds = useAuctionSounds();

  // Proxy bid state (private — only the owner sees their own max bid)
  const [myProxyBid, setMyProxyBid] = useState<number | null>(null);
  const lastNominationId = auctionState?.nomination?.playerId;

  // Fetch proxy bid when nomination changes
  useEffect(() => {
    if (!myTeamId || !lastNominationId || !activeLeagueId) {
      setMyProxyBid(null);
      return;
    }
    actions.getMyProxyBid(myTeamId).then(setMyProxyBid).catch(() => setMyProxyBid(null));
  }, [myTeamId, lastNominationId, activeLeagueId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-clear proxy bid display when current bid exceeds it
  const currentBidAmount = auctionState?.nomination?.currentBid;
  useEffect(() => {
    if (myProxyBid && currentBidAmount && currentBidAmount >= myProxyBid) {
      setMyProxyBid(null);
    }
  }, [currentBidAmount, myProxyBid]);

  // Initialization: Fetch Data & Identify User
  useEffect(() => {
    let mounted = true;
    const init = async () => {
        try {
            setInitLoading(true);

            // Parallel fetch: players + me
            const [stats, meRes] = await Promise.all([
                getPlayerSeasonStats(currentLeagueId || undefined),
                getMe(),
            ]);
            if (!mounted) return;
            setPlayers(stats);

            const fetchedUserId = meRes.user?.id;
            if (fetchedUserId) setMyUserId(fetchedUserId);

            if (currentLeagueId) {
                setActiveLeagueId(currentLeagueId);

                // Check commissioner role from memberships
                const membership = meRes.user?.memberships?.find((m: { leagueId: number; role: string }) => m.leagueId === currentLeagueId);
                if (membership?.role === 'COMMISSIONER' || meRes.user?.isAdmin) {
                    setIsCommissioner(true);
                }

                const detail = await getLeague(currentLeagueId);
                if (!mounted) return;
                const teamsWithOwnership = detail.league.teams as Array<typeof detail.league.teams[number] & { ownerships?: { userId: number }[] }>;
                const myTeam = teamsWithOwnership.find(t =>
                  t.ownerUserId === fetchedUserId || (t.ownerships || []).some(o => o.userId === fetchedUserId)
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
  }, [currentLeagueId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show "Start Auction" button instead of auto-init — commissioner explicitly starts
  const needsInit = activeLeagueId && auctionState && auctionState.status === 'not_started' && isCommissioner;

  // Detect if it's my turn to nominate
  const isMyTurnToNominate = auctionState?.status === 'nominating'
    && myTeamId
    && auctionState.queue?.[auctionState.queueIndex] === myTeamId;

  // Sound effect triggers — detect state transitions
  const prevNomPlayerRef = useRef<string | null>(null);
  const prevHighBidderRef = useRef<number | null>(null);
  const prevLogLenRef = useRef(0);
  const prevIsMyTurnRef = useRef(false);

  useEffect(() => {
    const nomPlayer = auctionState?.nomination?.playerId ?? null;
    const highBidder = auctionState?.nomination?.highBidderTeamId ?? null;
    const logLen = auctionState?.log?.length ?? 0;

    // New nomination
    if (nomPlayer && nomPlayer !== prevNomPlayerRef.current) {
      sounds.playNomination();
    }

    // Outbid — was high bidder, now someone else is
    if (prevHighBidderRef.current === myTeamId && highBidder !== null && highBidder !== myTeamId) {
      sounds.playOutbid();
    }

    // Won a player — check for new WIN events for my team
    // Log uses unshift (prepend), so new events are at the beginning
    if (logLen > prevLogLenRef.current && auctionState?.log) {
      const newCount = logLen - prevLogLenRef.current;
      const newEvents = auctionState.log.slice(0, newCount);
      if (newEvents.some(e => e.type === 'WIN' && e.teamId === myTeamId)) {
        sounds.playWin();
      }
    }

    prevNomPlayerRef.current = nomPlayer;
    prevHighBidderRef.current = highBidder;
    prevLogLenRef.current = logLen;
  }, [auctionState?.nomination?.playerId, auctionState?.nomination?.highBidderTeamId, auctionState?.log?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Your turn to nominate — sound
  useEffect(() => {
    if (isMyTurnToNominate && !prevIsMyTurnRef.current) {
      sounds.playYourTurn();
    }
    prevIsMyTurnRef.current = !!isMyTurnToNominate;
  }, [isMyTurnToNominate]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Handler: Nominate (startBid defaults to $1 if not specified)
  const handleNominate = useCallback(async (player: PlayerSeasonStat, startBid?: number) => {
      if (!myTeamId) {
          toast("You are not part of this league/auction.", "error");
          return;
      }
      if (!activeLeagueId) return;

      try {
          await actions.nominate({
              nominatorTeamId: myTeamId,
              playerId: player.mlb_id || '',
              playerName: player.player_name || 'Unknown',
              startBid: startBid ?? 1,
              positions: player.positions || (player.is_pitcher ? 'P' : 'UT'),
              team: player.mlb_team || 'FA',
              isPitcher: Boolean(player.is_pitcher)
          });
      } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Nomination failed";
          toast(msg, "error");
      }
  }, [myTeamId, activeLeagueId, actions, toast]);

  const handleBid = useCallback(async (amount: number) => {
      if (!myTeamId) {
          toast("You are not part of this league/auction.", "error");
          return;
      }
      try {
          await actions.bid({
              bidderTeamId: myTeamId,
              amount
          });
      } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Bid failed";
          toast(msg, "error");
      }
  }, [myTeamId, actions, toast]);

  const handleSetProxyBid = useCallback(async (maxBid: number) => {
      if (!myTeamId) {
          toast("You are not part of this league/auction.", "error");
          return;
      }
      try {
          await actions.setProxyBid({ bidderTeamId: myTeamId, maxBid });
          setMyProxyBid(maxBid);
          toast(`Auto-bid set: up to $${maxBid}`, "success");
      } catch (e: any) {
          toast(e?.message || "Failed to set max bid", "error");
      }
  }, [myTeamId, actions, toast]);

  const handleCancelProxyBid = useCallback(async () => {
      if (!myTeamId) return;
      try {
          await actions.cancelProxyBid(myTeamId);
          setMyProxyBid(null);
          toast("Auto-bid cancelled", "info");
      } catch (e: any) {
          toast(e?.message || "Failed to cancel", "error");
      }
  }, [myTeamId, actions, toast]);

  const handleForceAssign = useCallback(async (player: PlayerSeasonStat, teamId: number, price: number) => {
      try {
          await actions.forceAssign({
              teamId,
              playerId: String(player.mlb_id),
              playerName: player.player_name || 'Unknown',
              price,
              positions: player.positions || (player.is_pitcher ? 'P' : 'UT'),
              isPitcher: Boolean(player.is_pitcher),
          });
          toast(`Assigned ${player.player_name} to team for $${price}`, "success");
      } catch (e: any) {
          toast(e?.message || "Force assign failed", "error");
      }
  }, [actions, toast]);

  // Adapter for TeamListTab (it expects local TeamData, we have server AuctionTeam)
  // We mash them together or refactor TeamListTab.
  // For now, let's map server teams to expected shape.
  const displayTeams = useMemo(() => {
      if (!auctionState?.teams) return [];
      return auctionState.teams.map(t => ({
          ...t,
          isMe: t.id === myTeamId,
          rosterCount: t.rosterCount || 0
      }));
  }, [auctionState?.teams, myTeamId]);

  // If not in DRAFT, show read-only auction results instead of the live auction
  if (!gating.canAuction) {
    return <AuctionResults />;
  }

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

  // Auction completed — show results screen
  if (auctionState && auctionState.status === 'completed') {
    return <AuctionComplete auctionState={auctionState} myTeamId={myTeamId} />;
  }

  return (
    <AuctionLayout
        title="Auction"
        subtitle="Real-time auction draft room. Nominate players and manage bids."
        isMuted={sounds.isMuted}
        onToggleMute={sounds.toggleMute}
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
                    onSetProxyBid={handleSetProxyBid}
                    myProxyBid={myProxyBid}
                    onCancelProxyBid={handleCancelProxyBid}
                />
                {myQueue.length > 0 && (
                    <MyNominationQueue
                        players={players}
                        queueIds={myQueue}
                        onRemove={removeFromQueue}
                        onMoveUp={moveQueueUp}
                        onMoveDown={moveQueueDown}
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
                                    onForceAssign={isCommissioner ? handleForceAssign : undefined}
                                    isCommissioner={isCommissioner}
                                    starredIds={starredIds}
                                    onToggleStar={toggleStar}
                                    activeBidPlayerId={auctionState?.nomination?.playerId}
                                    activeBidAmount={auctionState?.nomination?.currentBid}
                                 /> 
                    },
                    { 
                        key: 'teams', 
                        label: 'Teams', 
                        count: displayTeams.length, 
                        content: <TeamListTab teams={displayTeams} players={players} budgetCap={auctionState?.config?.budgetCap} rosterSize={auctionState?.config?.rosterSize} /> 
                    },
                    { 
                        key: 'analysis', 
                        label: 'AI Analysis', 
                        content: <AIAnalysisTab log={auctionState?.log || []} teams={displayTeams} />
                    },
                    {
                        key: 'log',
                        label: 'Log',
                        content: <AuctionDraftLog log={auctionState?.log || []} teams={displayTeams} />
                    },
                    {
                        key: 'chat',
                        label: 'Chat',
                        count: chatMessages.length || undefined,
                        content: <ChatTab messages={chatMessages} onSend={actions.sendChat} myUserId={myUserId} />
                    }
                ]} 
            />
        }
    />
  );
}
