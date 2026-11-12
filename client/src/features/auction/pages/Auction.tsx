/*
 * /auction — thin loader for the live auction (UX step F).
 *
 * Loads the league, me and the player feed; works out my team and whether I'm
 * the commissioner; runs sounds and browser notifications; shows the
 * not-started screen; then renders the live screen (screens/LiveAuction), or
 * the team board (AuctionResults) once the auction is completed or the league
 * is out of the draft phase.
 */
import React, { useEffect, useRef, useState } from 'react';
import { getPlayerSeasonStats, type PlayerSeasonStat, getLeague, getMe } from '../../../api';
import { useAuctionState } from '../hooks/useAuctionState';
import { useAuctionSounds } from '../hooks/useAuctionSounds';
import { useAuctionPrefs } from '../hooks/useAuctionPrefs';
import { useAuctionNotifications } from '../hooks/useAuctionNotifications';
import { useToast } from '../../../contexts/ToastContext';
import { useLeague, findMyTeam } from '../../../contexts/LeagueContext';
import { useSeasonGating } from '../../../hooks/useSeasonGating';
// Deliberate: AuctionResults is the Screen 11 team board (Task 7), shown when the auction is over.
import AuctionResults from './AuctionResults';
import LiveAuction from '../screens/LiveAuction';
import '../components/live/live.css';

function PlainCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="la-page" style={{ maxWidth: 560, padding: '48px 16px' }}>
      <div className="la-box" style={{ padding: 24, alignItems: 'center', textAlign: 'center', gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

export default function Auction() {
  const { toast } = useToast();
  const { leagueId: currentLeagueId } = useLeague();
  const gating = useSeasonGating();
  const [players, setPlayers] = useState<PlayerSeasonStat[]>([]);
  const [initLoading, setInitLoading] = useState(true);

  const [myTeamId, setMyTeamId] = useState<number | undefined>(undefined);
  const [activeLeagueId, setActiveLeagueId] = useState<number | null>(null);
  const [isCommissioner, setIsCommissioner] = useState(false);

  const { state: auctionState, connectionStatus, actions } = useAuctionState(activeLeagueId);
  const sounds = useAuctionSounds();
  const { prefs: auctionPrefs, update: updatePref } = useAuctionPrefs();
  const soundOn = auctionPrefs.sounds && !sounds.isMuted;

  // Browser notifications (your turn, outbid, win)
  useAuctionNotifications(auctionState, myTeamId, !auctionPrefs.notifications);

  // Initialization: fetch data and identify the user
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        setInitLoading(true);
        const [stats, meRes] = await Promise.all([
          getPlayerSeasonStats(currentLeagueId || undefined),
          getMe(),
        ]);
        if (!mounted) return;
        setPlayers(stats);
        const fetchedUserId = meRes.user?.id;

        if (currentLeagueId) {
          setActiveLeagueId(currentLeagueId);
          const membership = meRes.user?.memberships?.find((m: { leagueId: number; role: string }) => m.leagueId === currentLeagueId);
          if (membership?.role === 'COMMISSIONER' || meRes.user?.isAdmin) {
            setIsCommissioner(true);
          }
          const detail = await getLeague(currentLeagueId);
          if (!mounted) return;
          const myTeam = fetchedUserId ? findMyTeam(detail.league.teams, fetchedUserId) : null;
          if (myTeam) setMyTeamId(myTeam.id);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setInitLoading(false);
      }
    };
    init();
    return () => { mounted = false; };
  }, [currentLeagueId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show "Start auction" instead of auto-init — the commissioner starts it explicitly
  const needsInit = activeLeagueId && auctionState && auctionState.status === 'not_started' && isCommissioner;

  const isMyTurnToNominate = auctionState?.status === 'nominating'
    && myTeamId
    && auctionState.queue?.[auctionState.queueIndex] === myTeamId;

  // Sound effects on state transitions
  const prevNomPlayerRef = useRef<string | null>(null);
  const prevHighBidderRef = useRef<number | null>(null);
  const prevLogLenRef = useRef(0);
  const prevIsMyTurnRef = useRef(false);

  useEffect(() => {
    const nomPlayer = auctionState?.nomination?.playerId ?? null;
    const highBidder = auctionState?.nomination?.highBidderTeamId ?? null;
    const logLen = auctionState?.log?.length ?? 0;

    if (auctionPrefs.sounds) {
      if (nomPlayer && nomPlayer !== prevNomPlayerRef.current) sounds.playNomination();
      if (prevHighBidderRef.current === myTeamId && highBidder !== null && highBidder !== myTeamId) sounds.playOutbid();
      // The log is newest first (server unshifts)
      if (logLen > prevLogLenRef.current && auctionState?.log) {
        const newEvents = auctionState.log.slice(0, logLen - prevLogLenRef.current);
        if (newEvents.some(e => e.type === 'WIN' && e.teamId === myTeamId)) sounds.playWin();
      }
    }

    prevNomPlayerRef.current = nomPlayer;
    prevHighBidderRef.current = highBidder;
    prevLogLenRef.current = logLen;
  }, [auctionState?.nomination?.playerId, auctionState?.nomination?.highBidderTeamId, auctionState?.log?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (auctionPrefs.sounds && isMyTurnToNominate && !prevIsMyTurnRef.current) sounds.playYourTurn();
    prevIsMyTurnRef.current = !!isMyTurnToNominate;
  }, [isMyTurnToNominate]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSound = () => {
    if (soundOn) {
      updatePref('sounds', false);
    } else {
      updatePref('sounds', true);
      if (sounds.isMuted) sounds.toggleMute(); // also unlocks audio on this tap
    }
  };

  const startAuction = async () => {
    if (!activeLeagueId) return;
    try {
      await actions.initAuction(activeLeagueId);
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Could not start the auction', 'error');
    }
  };

  // Out of the draft phase: the read-only board
  if (!gating.canAuction) return <AuctionResults />;

  if (initLoading || (activeLeagueId && !auctionState)) {
    return <PlainCard><p className="la-sub" style={{ margin: 0 }}>Loading the auction…</p></PlainCard>;
  }

  if (activeLeagueId && auctionState && auctionState.status === 'not_started' && !isCommissioner) {
    return (
      <PlainCard>
        <h1 className="la-title">Auction</h1>
        <p className="la-sub" style={{ margin: 0 }}>Waiting for the commissioner to start the auction.</p>
      </PlainCard>
    );
  }

  if (needsInit) {
    return (
      <PlainCard>
        <h1 className="la-title">Start the auction</h1>
        <p className="la-sub" style={{ margin: 0 }}>Once it starts, owners can put players up and bid live.</p>
        <button type="button" className="la-btn primary" onClick={startAuction}>Start auction</button>
      </PlainCard>
    );
  }

  if (auctionState && auctionState.status === 'completed') return <AuctionResults />;

  if (!activeLeagueId || !auctionState) {
    return <PlainCard><p className="la-sub" style={{ margin: 0 }}>Pick a league to join its auction.</p></PlainCard>;
  }

  return (
    <LiveAuction
      state={auctionState}
      actions={actions}
      leagueId={activeLeagueId}
      myTeamId={myTeamId}
      players={players}
      isCommissioner={isCommissioner}
      connectionStatus={connectionStatus}
      prefs={{
        sound: soundOn,
        notifications: auctionPrefs.notifications,
        onToggleSound: toggleSound,
        onToggleNotifications: () => updatePref('notifications', !auctionPrefs.notifications),
      }}
    />
  );
}
