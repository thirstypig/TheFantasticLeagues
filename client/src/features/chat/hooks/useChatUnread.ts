import { useCallback, useEffect, useRef, useState } from "react";
import { fetchUnreadCount, markChatAsRead } from "../api";

interface UseChatUnreadOptions {
  leagueId: number | null;
  pollIntervalMs?: number;
}

interface UseChatUnreadReturn {
  unreadCount: number;
  markAsRead: () => Promise<void>;
  refresh: () => void;
}

export function useChatUnread({ leagueId, pollIntervalMs = 30_000 }: UseChatUnreadOptions): UseChatUnreadReturn {
  const [unreadCount, setUnreadCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchCount = useCallback(async () => {
    if (!leagueId) {
      setUnreadCount(0);
      return;
    }
    try {
      const { unreadCount: count } = await fetchUnreadCount(leagueId);
      setUnreadCount(count);
    } catch {
      // Silently fail polling
    }
  }, [leagueId]);

  useEffect(() => {
    fetchCount();
    intervalRef.current = setInterval(fetchCount, pollIntervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchCount, pollIntervalMs]);

  const markAsRead = useCallback(async () => {
    if (!leagueId) return;
    try {
      await markChatAsRead(leagueId);
      setUnreadCount(0);
    } catch {
      // Silently fail
    }
  }, [leagueId]);

  return { unreadCount, markAsRead, refresh: fetchCount };
}
