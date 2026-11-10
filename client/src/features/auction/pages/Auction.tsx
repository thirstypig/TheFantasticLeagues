
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import AuctionLayout from '../components/AuctionLayout';
import AuctionStage from '../components/AuctionStage';
import AuctionComplete from '../components/AuctionComplete';
import ContextDeck from '../components/ContextDeck';
import PlayerPoolTab from '../components/PlayerPoolTab';
import TeamListTab from '../components/TeamListTab';
import MyNominationQueue from '../components/MyNominationQueue';
import { getPlayerSeasonStats, type PlayerSeasonStat, getLeague, getMe } from '../../../api';
import { useAuctionState } from '../hooks/useAuctionState';
import { useNominationQueue } from '../hooks/useNominationQueue';
import { useWatchlist } from '../hooks/useWatchlist';
import { useAuctionSounds } from '../hooks/useAuctionSounds';
import { useToast } from "../../../contexts/ToastContext";
import { useLeague, findMyTeam } from "../../../contexts/LeagueContext";
import { useSeasonGating } from "../../../hooks/useSeasonGating";
import AuctionResults from "./AuctionResults";
import AuctionDraftLog from '../components/AuctionDraftLog';
import ChatTab from '../components/ChatTab';
import AuctionSettingsTab from '../components/AuctionSettingsTab';
import { useAuctionPrefs } from '../hooks/useAuctionPrefs';
import { useAuctionNotifications } from '../hooks/useAuctionNotifications';
import { useMyRankings } from '../hooks/useMyRankings';
import { Glass, IridText, SectionLabel } from '../../../components/aurora/atoms';

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
  const { state: auctionState, chatMessages, connectionStatus, actions } = useAuctionState(activeLeagueId);
  const [myUserId, setMyUserId] = useState<number | undefined>(undefined);
  const { queue: myQueue, add: addToQueue, remove: removeFromQueue, isQueued, moveUp: moveQueueUp, moveDown: moveQueueDown } = useNominationQueue(myTeamId);
  const { starred: starredIds, toggle: toggleStar } = useWatchlist(activeLeagueId);
  const sounds = useAuctionSounds();
  const { prefs: auctionPrefs, toggle: togglePref, update: updatePref } = useAuctionPrefs();
  const { rankings, rankingsCount, importRankings, clearRankings } = useMyRankings(activeLeagueId);

  // Browser notifications (fires on state transitions: your turn, outbid, win)
  useAuctionNotifications(auctionState, myTeamId, !auctionPrefs.notifications);

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
                const myTeam = fetchedUserId ? findMyTeam(detail.league.teams, fetchedUserId) : null;
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
              team: player.mlb_team || '',
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

  // Stable fingerprint of roster assignments — only changes when a player is
  // drafted/moved, not on every auction state update (bids, nominations, log entries).
  const rosterFingerprint = useMemo(() => {
    if (!auctionState?.teams) return "";
    return auctionState.teams
      .map(t => t.roster.map(r => `${r.mlbId ?? r.playerId}:${t.code}`).sort().join(","))
      .join("|");
  }, [auctionState?.teams]);

  // Enrich players with real-time draft status from auction state.
  // The initial player fetch may not reflect force-assigns or recent wins,
  // so we overlay team ownership from the live auction state.
  const enrichedPlayers = useMemo(() => {
    if (!auctionState?.teams || auctionState.teams.length === 0) return players;
    // Build a map: mlbId → team code for all drafted players
    const draftedMap = new Map<string, string>();
    for (const team of auctionState.teams) {
      for (const r of team.roster) {
        const mlbId = String(r.mlbId ?? r.playerId);
        draftedMap.set(mlbId, team.code);
      }
    }
    if (draftedMap.size === 0) return players;
    return players.map(p => {
      const teamCode = draftedMap.get(String(p.mlb_id));
      if (teamCode && !p.ogba_team_code) {
        return { ...p, ogba_team_code: teamCode, team: teamCode };
      }
      return p;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, rosterFingerprint]);

  // If not in DRAFT, show read-only auction results instead of the live auction
  if (!gating.canAuction) {
    return <AuctionResults />;
  }

  if (initLoading) return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
      <Glass><div style={{ height: 96, borderRadius: 12, background: "var(--am-surface-faint)", animation: "pulse 1.5s ease-in-out infinite" }} /></Glass>
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Glass><div style={{ height: 240, borderRadius: 12, background: "var(--am-surface-faint)", animation: "pulse 1.5s ease-in-out infinite" }} /></Glass>
          <Glass><div style={{ height: 140, borderRadius: 12, background: "var(--am-surface-faint)", animation: "pulse 1.5s ease-in-out infinite" }} /></Glass>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Glass><div style={{ height: 36, borderRadius: 12, background: "var(--am-surface-faint)", animation: "pulse 1.5s ease-in-out infinite" }} /></Glass>
          <Glass><div style={{ height: 320, borderRadius: 12, background: "var(--am-surface-faint)", animation: "pulse 1.5s ease-in-out infinite" }} /></Glass>
        </div>
      </div>
    </div>
  );

  // Non-commissioner sees waiting screen before auction starts
  if (activeLeagueId && auctionState && auctionState.status === 'not_started' && !isCommissioner) return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "60px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <Glass strong>
        <div style={{ textAlign: "center", padding: "24px 8px" }}>
          <SectionLabel>✦ Auction Draft</SectionLabel>
          <h2 style={{ fontFamily: "var(--am-display)", fontSize: 30, fontWeight: 300, color: "var(--am-text)", margin: "8px 0 12px", lineHeight: 1.1 }}>
            Auction Draft
          </h2>
          <p style={{ fontSize: 13, color: "var(--am-text-muted)", margin: 0 }}>Waiting for the commissioner to start the auction…</p>
        </div>
      </Glass>
    </div>
  );

  if (needsInit) return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "60px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <Glass strong>
        <div style={{ textAlign: "center", padding: "24px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <SectionLabel>✦ Auction Draft</SectionLabel>
          <h2 style={{ fontFamily: "var(--am-display)", fontSize: 32, fontWeight: 300, color: "var(--am-text)", margin: 0, lineHeight: 1.1 }}>
            Start the auction
          </h2>
          <p style={{ fontSize: 13, color: "var(--am-text-muted)", margin: 0, maxWidth: 480 }}>
            Initialize the auction to begin the live draft. <IridText size={13}>Once started, owners can nominate, bid, and watch the live floor in real time.</IridText>
          </p>
          <button
            type="button"
            onClick={() => actions.initAuction(activeLeagueId!)}
            style={{
              marginTop: 8,
              padding: "12px 28px",
              borderRadius: 99,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0.4,
              background: "var(--am-irid)",
              color: "var(--am-on-accent)",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: "0 14px 40px rgba(255,80,80,0.18)",
            }}
          >
            Start Auction →
          </button>
        </div>
      </Glass>
    </div>
  );

  // Auction completed — show results screen
  if (auctionState && auctionState.status === 'completed') {
    return <AuctionComplete auctionState={auctionState} myTeamId={myTeamId} onRefresh={actions.refetch} />;
  }

  return (
    <AuctionLayout
        title="Auction"
        subtitle="Real-time auction draft room. Nominate players and manage bids."
        isMuted={sounds.isMuted}
        onToggleMute={sounds.toggleMute}
        connectionStatus={connectionStatus}
        stage={
            <div className="flex flex-col h-full gap-2 min-w-0">
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
                        players={enrichedPlayers}
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
                                    players={enrichedPlayers}
                                    teams={displayTeams}
                                    onNominate={auctionState?.status === 'nominating' ? handleNominate : undefined}
                                    onQueue={addToQueue}
                                    isQueued={isQueued}
                                    myTeamId={myTeamId}
                                    auctionConfig={auctionState?.config}
                                    onForceAssign={isCommissioner ? handleForceAssign : undefined}
                                    isCommissioner={isCommissioner}
                                    starredIds={auctionPrefs.watchlist ? starredIds : undefined}
                                    onToggleStar={auctionPrefs.watchlist ? toggleStar : undefined}
                                    showBidPicker={auctionPrefs.openingBidPicker}
                                    defaultLeagueFilter={auctionPrefs.defaultLeagueFilter}
                                    activeBidPlayerId={auctionPrefs.valueColumn ? auctionState?.nomination?.playerId : undefined}
                                    activeBidAmount={auctionPrefs.valueColumn ? auctionState?.nomination?.currentBid : undefined}
                                    rankings={rankingsCount > 0 ? rankings : undefined}
                                 />
                    },
                    {
                        key: 'teams',
                        label: 'Teams',
                        count: displayTeams.length,
                        content: <TeamListTab teams={displayTeams} players={enrichedPlayers} budgetCap={auctionState?.config?.budgetCap} rosterSize={auctionState?.config?.rosterSize} pitcherMax={auctionState?.config?.pitcherCount} hitterMax={auctionState?.config?.batterCount} showPace={auctionPrefs.spendingPace} positionLimits={auctionState?.config?.positionLimits} />
                    },
                    {
                        key: 'log',
                        label: 'Log',
                        content: <AuctionDraftLog log={auctionState?.log || []} teams={displayTeams} />
                    },
                    ...(auctionPrefs.chat ? [{
                        key: 'chat',
                        label: 'Chat',
                        count: chatMessages.length || undefined,
                        content: <ChatTab messages={chatMessages} onSend={actions.sendChat} myUserId={myUserId} />
                    }] : []),
                    {
                        key: 'settings',
                        label: 'Settings',
                        content: <AuctionSettingsTab prefs={auctionPrefs} onToggle={togglePref} onUpdate={updatePref} rankingsCount={rankingsCount} onImportRankings={importRankings} onClearRankings={clearRankings} />
                    }
                ]} 
            />
        }
    />
  );
}
