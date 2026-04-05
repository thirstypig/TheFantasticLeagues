import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import type { ChatMessageItem } from "../api";

const WS_BASE = (() => {
  const apiBase = import.meta.env.VITE_API_BASE ?? import.meta.env.VITE_API_BASE_URL ?? "";
  if (apiBase) {
    // Convert http(s)://host:port/api to ws(s)://host:port
    const url = new URL(apiBase);
    const protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${url.host}`;
  }
  // Dev mode: same host, port 4010
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:4010`;
})();

interface UseChatWebSocketOptions {
  leagueId: number | null;
  enabled?: boolean;
}

interface UseChatWebSocketReturn {
  messages: ChatMessageItem[];
  sendMessage: (text: string) => void;
  loadMore: () => void;
  hasMore: boolean;
  isConnected: boolean;
  isLoadingHistory: boolean;
}

export function useChatWebSocket({ leagueId, enabled = true }: UseChatWebSocketOptions): UseChatWebSocketReturn {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const reconnectAttemptRef = useRef(0);
  const mountedRef = useRef(true);

  // Connect
  useEffect(() => {
    mountedRef.current = true;
    if (!leagueId || !enabled) return;

    let ws: WebSocket | null = null;

    async function connect() {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token || !mountedRef.current) return;

      const url = `${WS_BASE}/ws/chat?token=${encodeURIComponent(token)}&leagueId=${leagueId}`;
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setIsConnected(true);
        reconnectAttemptRef.current = 0;

        // Request history on connect
        setIsLoadingHistory(true);
        ws?.send(JSON.stringify({ type: "CHAT_HISTORY", limit: 50 }));
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case "CHAT_HISTORY":
              setMessages(data.messages);
              setHasMore(data.hasMore);
              setIsLoadingHistory(false);
              break;

            case "CHAT_MESSAGE":
              setMessages(prev => [...prev, {
                id: data.id,
                userId: data.userId,
                userName: data.userName,
                avatarUrl: data.avatarUrl,
                text: data.text,
                msgType: data.msgType,
                metadata: data.metadata,
                createdAt: data.createdAt,
              }]);
              break;

            case "CHAT_DELETED":
              setMessages(prev => prev.filter(m => m.id !== data.messageId));
              break;

            case "CHAT_ERROR":
              console.warn("Chat error:", data.error);
              break;
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setIsConnected(false);
        wsRef.current = null;

        // Exponential backoff reconnect
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
        reconnectAttemptRef.current++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
      wsRef.current = null;
      setMessages([]);
      setIsConnected(false);
    };
  }, [leagueId, enabled]);

  const sendMessage = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "CHAT_SEND", text }));
    }
  }, []);

  const loadMore = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !hasMore || isLoadingHistory) return;
    setIsLoadingHistory(true);
    const oldest = messages[0];
    if (oldest) {
      wsRef.current.send(JSON.stringify({ type: "CHAT_HISTORY", limit: 50, before: oldest.id }));
      // Handle the response — it will prepend to existing messages
      const handler = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "CHAT_HISTORY") {
            setMessages(prev => [...data.messages, ...prev]);
            setHasMore(data.hasMore);
            setIsLoadingHistory(false);
            wsRef.current?.removeEventListener("message", handler);
          }
        } catch { /* ignore */ }
      };
      wsRef.current.addEventListener("message", handler);
    }
  }, [hasMore, isLoadingHistory, messages]);

  return { messages, sendMessage, loadMore, hasMore, isConnected, isLoadingHistory };
}
