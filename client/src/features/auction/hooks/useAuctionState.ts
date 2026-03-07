import { useState, useEffect, useRef } from 'react';
import { fetchJsonApi } from '../../../api/base';

// Types redefined locally to avoid build issues importing from server
export type AuctionStatus = "not_started" | "nominating" | "bidding" | "paused" | "completed";

export interface AuctionTeam {
  id: number;
  name: string;
  code: string;
  budget: number;
  maxBid: number;
  rosterCount: number;
  spotsLeft: number;
  roster: { id: number; playerId: number; price: number; assignedPosition?: string | null }[];
}

export interface NominationState {
  playerId: string;
  playerName: string;
  playerTeam: string;
  positions: string;
  isPitcher: boolean;
  nominatorTeamId: number;
  currentBid: number;
  highBidderTeamId: number;
  endTime: string;
  timerDuration: number;
  status: 'running' | 'paused' | 'ended';
  pausedRemainingMs?: number;
}

export interface ClientNominationState {
  playerId: string;
  playerName: string;
  playerTeam: string;
  positions: string;
  isPitcher: boolean;
  nominatorTeamId: number;
  currentBid: number;
  highBidderTeamId: number;
  endTime: string;
  timerDuration: number;
  status: 'running' | 'paused' | 'ended';
  pausedRemainingMs?: number;
}

export interface ClientAuctionState {
  leagueId: number | null;
  status: AuctionStatus;
  nomination: ClientNominationState | null;
  teams: any[]; // Using any to avoid strict type duplication for now
  queue: number[];
  queueIndex: number;
  config: {
    bidTimer: number;
    nominationTimer: number;
  };
  log: AuctionLogEvent[];
  lastUpdate: number;
}

export interface AuctionLogEvent {
  type: 'NOMINATION' | 'BID' | 'WIN' | 'PAUSE' | 'RESUME';
  teamId?: number;
  teamName?: string;
  playerId?: string;
  playerName?: string;
  amount?: number;
  timestamp: number;
  message: string;
}

export function useAuctionState(leagueId?: number | null) {
    const [state, setState] = useState<ClientAuctionState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const leagueIdRef = useRef(leagueId);
    leagueIdRef.current = leagueId;

    const fetchState = async () => {
        try {
            const lid = leagueIdRef.current;
            if (!lid) return;
            const data = await fetchJsonApi<ClientAuctionState>(`/api/auction/state?leagueId=${lid}`);
            setState(data);
            setError(null);
        } catch (e: any) {
            console.error(e);
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!leagueId) return;
        fetchState();
        pollRef.current = setInterval(fetchState, 1000);

        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [leagueId]);

    // Actions — all include leagueId in the body
    const withLeagueId = (payload: Record<string, unknown> = {}) => {
        const lid = leagueIdRef.current;
        return JSON.stringify({ ...payload, leagueId: lid });
    };

    const nominate = async (payload: { nominatorTeamId: number, playerId: string, playerName: string, startBid: number, positions: string, team: string, isPitcher: boolean }) => {
        await fetchJsonApi('/api/auction/nominate', {
            method: 'POST',
            body: withLeagueId(payload)
        });
        fetchState();
    };

    const bid = async (payload: { bidderTeamId: number, amount: number }) => {
        await fetchJsonApi('/api/auction/bid', {
            method: 'POST',
            body: withLeagueId(payload)
        });
        fetchState();
    };

    const initAuction = async (leagueIdOverride: number) => {
        await fetchJsonApi('/api/auction/init', {
             method: 'POST',
             body: JSON.stringify({ leagueId: leagueIdOverride })
        });
        fetchState();
    };

    const finishAuction = async () => {
        await fetchJsonApi('/api/auction/finish', { method: 'POST', body: withLeagueId() });
        fetchState();
    };

    return {
        state,
        loading,
        error,
        actions: {
            nominate,
            bid,
            initAuction,
            finishAuction,
            pause: async () => { await fetchJsonApi('/api/auction/pause', { method: 'POST', body: withLeagueId() }); fetchState(); },
            resume: async () => { await fetchJsonApi('/api/auction/resume', { method: 'POST', body: withLeagueId() }); fetchState(); },
            reset: async () => { await fetchJsonApi('/api/auction/reset', { method: 'POST', body: withLeagueId() }); fetchState(); }
        }
    };
}
