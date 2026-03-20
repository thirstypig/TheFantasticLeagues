import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchJsonApi } from '../../../api/base';
import { supabase } from '../../../lib/supabase';
import { track } from '../../../lib/posthog';

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
    pitcherCount?: number;
    batterCount?: number;
    positionLimits?: Record<string, number> | null;
  };
  log: AuctionLogEvent[];
  lastUpdate: number;
}

export interface AuctionLogEvent {
  type: 'NOMINATION' | 'BID' | 'WIN' | 'PAUSE' | 'RESUME' | 'UNDO';
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
    const wsRef = useRef<WebSocket | null>(null);
    const leagueIdRef = useRef(leagueId);
    leagueIdRef.current = leagueId;

    const fetchState = useCallback(async () => {
        try {
            const lid = leagueIdRef.current;
            if (!lid) return;
            const data = await fetchJsonApi<ClientAuctionState>(`/api/auction/state?leagueId=${lid}`);
            setState(data);
            setError(null);
        } catch (err: unknown) {
            console.error(err);
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, []);

    // Start polling as fallback
    const startPolling = useCallback(() => {
        if (pollRef.current) return; // already polling
        pollRef.current = setInterval(fetchState, 1000);
    }, [fetchState]);

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!leagueId) return;

        // Initial fetch
        fetchState();

        // Try WebSocket connection
        let cancelled = false;

        async function connectWs() {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const token = session?.access_token;
                if (!token || cancelled) {
                    startPolling();
                    return;
                }

                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const host = window.location.host;
                const wsUrl = `${protocol}//${host}/ws/auction?leagueId=${leagueId}&token=${encodeURIComponent(token)}`;

                const ws = new WebSocket(wsUrl);
                wsRef.current = ws;

                ws.onopen = () => {
                    // WebSocket connected — stop polling
                    stopPolling();
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data) as ClientAuctionState;
                        setState(data);
                        setError(null);
                        setLoading(false);
                    } catch {
                        // Ignore malformed messages
                    }
                };

                ws.onclose = () => {
                    wsRef.current = null;
                    if (!cancelled) {
                        // Fallback to polling
                        startPolling();
                    }
                };

                ws.onerror = () => {
                    ws.close();
                };
            } catch {
                // WebSocket setup failed — use polling
                if (!cancelled) startPolling();
            }
        }

        connectWs();

        return () => {
            cancelled = true;
            stopPolling();
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [leagueId, fetchState, startPolling, stopPolling]);

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
        track("auction_nominate", { player_name: payload.playerName, start_bid: payload.startBid, is_pitcher: payload.isPitcher });
        // State will arrive via WebSocket broadcast; fetch as backup
        if (!wsRef.current) fetchState();
    };

    const bid = async (payload: { bidderTeamId: number, amount: number }) => {
        await fetchJsonApi('/api/auction/bid', {
            method: 'POST',
            body: withLeagueId(payload)
        });
        track("auction_bid", { amount: payload.amount });
        if (!wsRef.current) fetchState();
    };

    const setProxyBid = async (payload: { bidderTeamId: number, maxBid: number }) => {
        await fetchJsonApi('/api/auction/proxy-bid', {
            method: 'POST',
            body: withLeagueId(payload)
        });
        track("auction_proxy_bid", { max_bid: payload.maxBid });
        if (!wsRef.current) fetchState();
    };

    const getMyProxyBid = async (teamId: number): Promise<number | null> => {
        const lid = leagueIdRef.current;
        if (!lid) return null;
        const data = await fetchJsonApi<{ maxBid: number | null }>(`/api/auction/my-proxy-bid?leagueId=${lid}&teamId=${teamId}`);
        return data.maxBid;
    };

    const forceAssign = async (payload: { teamId: number, playerId: string, playerName: string, price: number, positions: string, isPitcher: boolean }) => {
        await fetchJsonApi('/api/auction/force-assign', {
            method: 'POST',
            body: withLeagueId(payload)
        });
        track("auction_force_assign", { player_name: payload.playerName, price: payload.price });
        if (!wsRef.current) fetchState();
    };

    const cancelProxyBid = async (teamId: number) => {
        const lid = leagueIdRef.current;
        if (!lid) return;
        await fetchJsonApi(`/api/auction/proxy-bid?leagueId=${lid}&teamId=${teamId}`, { method: 'DELETE' });
    };

    const initAuction = async (leagueIdOverride: number) => {
        await fetchJsonApi('/api/auction/init', {
             method: 'POST',
             body: JSON.stringify({ leagueId: leagueIdOverride })
        });
        if (!wsRef.current) fetchState();
    };

    const finishAuction = async () => {
        await fetchJsonApi('/api/auction/finish', { method: 'POST', body: withLeagueId() });
        track("auction_finish");
        if (!wsRef.current) fetchState();
    };

    return {
        state,
        loading,
        error,
        actions: {
            nominate,
            bid,
            setProxyBid,
            getMyProxyBid,
            cancelProxyBid,
            forceAssign,
            initAuction,
            finishAuction,
            pause: async () => { await fetchJsonApi('/api/auction/pause', { method: 'POST', body: withLeagueId() }); if (!wsRef.current) fetchState(); },
            resume: async () => { await fetchJsonApi('/api/auction/resume', { method: 'POST', body: withLeagueId() }); if (!wsRef.current) fetchState(); },
            reset: async () => { await fetchJsonApi('/api/auction/reset', { method: 'POST', body: withLeagueId() }); if (!wsRef.current) fetchState(); },
            undoFinish: async () => { await fetchJsonApi('/api/auction/undo-finish', { method: 'POST', body: withLeagueId() }); if (!wsRef.current) fetchState(); }
        }
    };
}
