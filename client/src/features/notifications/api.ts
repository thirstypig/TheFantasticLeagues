import { fetchJsonApi, API_BASE } from "../../api/base";

export async function getVapidKey(): Promise<{ publicKey: string }> {
  return fetchJsonApi<{ publicKey: string }>(`${API_BASE}/notifications/vapid-key`);
}

export async function subscribePush(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}): Promise<{ success: boolean }> {
  return fetchJsonApi<{ success: boolean }>(`${API_BASE}/notifications/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription),
  });
}

export async function unsubscribePush(endpoint: string): Promise<{ success: boolean }> {
  return fetchJsonApi<{ success: boolean }>(`${API_BASE}/notifications/unsubscribe`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

export interface NotificationPreferences {
  tradeProposal: boolean;
  tradeResult: boolean;
  waiverResult: boolean;
  lineupReminder: boolean;
  commissionerAnnounce: boolean;
  boardReply: boolean;
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  return fetchJsonApi<NotificationPreferences>(`${API_BASE}/notifications/preferences`);
}

export async function updateNotificationPreferences(
  prefs: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  return fetchJsonApi<NotificationPreferences>(`${API_BASE}/notifications/preferences`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prefs),
  });
}
