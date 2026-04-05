import { fetchJsonApi, API_BASE } from "../../api/base";

export interface ChatMessageItem {
  id: number;
  userId: number;
  userName: string;
  avatarUrl?: string | null;
  text: string;
  msgType: "user" | "system";
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ChatHistoryResponse {
  messages: ChatMessageItem[];
  hasMore: boolean;
}

export async function fetchChatMessages(leagueId: number, limit = 50, before?: number): Promise<ChatHistoryResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", String(before));
  return fetchJsonApi<ChatHistoryResponse>(`${API_BASE}/chat/${leagueId}/messages?${params}`);
}

export async function fetchUnreadCount(leagueId: number): Promise<{ unreadCount: number }> {
  return fetchJsonApi<{ unreadCount: number }>(`${API_BASE}/chat/${leagueId}/unread-count`);
}

export async function markChatAsRead(leagueId: number): Promise<void> {
  await fetchJsonApi(`${API_BASE}/chat/${leagueId}/read`, { method: "POST" });
}

export async function deleteChatMessage(leagueId: number, messageId: number): Promise<void> {
  await fetchJsonApi(`${API_BASE}/chat/${leagueId}/messages/${messageId}`, { method: "DELETE" });
}
