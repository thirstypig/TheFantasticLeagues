import { useState, useEffect, useCallback, useRef } from "react";
import { getDraftState, makePick, pauseDraft, resumeDraft, undoPick, skipPick, startDraft, toggleAutoPick, completeDraft, resetDraft, type DraftState } from "../api";
import { useAuth } from "../../../auth/AuthProvider";

const WS_BASE = import.meta.env.VITE_WS_BASE || (
  window.location.protocol === "https:" ? "wss://" : "ws://"
) + window.location.host;

export interface ChatMessage {
  type: "CHAT";
  userId: number;
  userName: string;
  text: string;
  timestamp: number;
}

export function useDraftState(leagueId: number | null) {
  const { session } = useAuth();
  const [state, setState] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "connecting" | "disconnected">("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchState = useCallback(async () => {
    if (!leagueId) return;
    try {
      const data = await getDraftState(leagueId);
      setState(data);
      setError(null);
    } catch (err) {
      // 404 = no draft session yet, not an error
      if ((err as any)?.message?.includes("404") || (err as any)?.status === 404) {
        setState(null);
        setError(null);
      } else {
        setError((err as Error)?.message || "Failed to load draft");
      }
    }
  }, [leagueId]);

  // WebSocket connection
  useEffect(() => {
    if (!leagueId || !session?.access_token) return;

    setConnectionStatus("connecting");

    const wsUrl = `${WS_BASE}/ws/draft?leagueId=${leagueId}&token=${session.access_token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus("connected");
      // Clear polling since WS is connected
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "DRAFT_STATE") {
          setState(msg.data);
        } else if (msg.type === "DRAFT_PICK") {
          // Incremental pick update — will be followed by full state
        } else if (msg.type === "CHAT") {
          setChatMessages(prev => [...prev, msg]);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnectionStatus("disconnected");
      wsRef.current = null;
      // Fall back to polling when WS disconnects
      if (!pollRef.current && leagueId) {
        pollRef.current = setInterval(fetchState, 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [leagueId, session?.access_token, fetchState]);

  // Initial load + fallback polling
  useEffect(() => {
    if (!leagueId) return;
    setLoading(true);
    fetchState().finally(() => setLoading(false));

    // Start polling — will be stopped if WS connects
    pollRef.current = setInterval(fetchState, 3000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [leagueId, fetchState]);

  const sendChat = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "CHAT", text }));
    }
  }, []);

  const pick = useCallback(async (teamId: number, playerId: number) => {
    if (!leagueId) return;
    const result = await makePick(leagueId, teamId, playerId);
    // WS will push the update, but fetch as fallback
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      await fetchState();
    }
    return result;
  }, [leagueId, fetchState]);

  const pause = useCallback(async () => {
    if (!leagueId) return;
    await pauseDraft(leagueId);
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) await fetchState();
  }, [leagueId, fetchState]);

  const resume = useCallback(async () => {
    if (!leagueId) return;
    await resumeDraft(leagueId);
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) await fetchState();
  }, [leagueId, fetchState]);

  const undo = useCallback(async () => {
    if (!leagueId) return;
    await undoPick(leagueId);
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) await fetchState();
  }, [leagueId, fetchState]);

  const skip = useCallback(async () => {
    if (!leagueId) return;
    await skipPick(leagueId);
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) await fetchState();
  }, [leagueId, fetchState]);

  const start = useCallback(async () => {
    if (!leagueId) return;
    await startDraft(leagueId);
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) await fetchState();
  }, [leagueId, fetchState]);

  const setAutoPick = useCallback(async (teamId: number, enabled: boolean) => {
    if (!leagueId) return;
    await toggleAutoPick(leagueId, teamId, enabled);
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) await fetchState();
  }, [leagueId, fetchState]);

  const complete = useCallback(async () => {
    if (!leagueId) return;
    await completeDraft(leagueId);
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) await fetchState();
  }, [leagueId, fetchState]);

  const reset = useCallback(async () => {
    if (!leagueId) return;
    await resetDraft(leagueId);
    setState(null);
  }, [leagueId]);

  return {
    state, loading, error, connectionStatus,
    chatMessages, sendChat,
    pick, pause, resume, undo, skip, start, setAutoPick, complete, reset,
    refresh: fetchState,
  };
}
