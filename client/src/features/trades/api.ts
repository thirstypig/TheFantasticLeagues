
import { fetchJsonApi, API_BASE } from '../../api/base';
import { track } from '../../lib/posthog';

export type TradeAssetType = "PLAYER" | "BUDGET" | "PICK";

export interface TradeItem {
  id?: number;
  senderId: number;
  recipientId: number;
  assetType: TradeAssetType;
  playerId?: number;
  amount?: number;
  pickRound?: number;
  player?: { id: number; name: string; posPrimary?: string };
  sender?: { id: number; name: string; code: string };
  recipient?: { id: number; name: string; code: string };
  // Compat aliases used by TradesPage
  senderTeamId?: number;
}

export interface TradeProposal {
  id: number;
  leagueId: number;
  proposerId: number;
  status: "PROPOSED" | "ACCEPTED" | "REJECTED" | "PROCESSED" | "PENDING" | "CANCELLED" | "VETOED";
  items: TradeItem[];
  createdAt: string;
  proposer?: { id: number; name: string; code: string; ownerUserId?: number };
  // Compat fields used by TradesPage (mapped from proposer/items)
  proposingTeamId?: number;
  acceptingTeamId?: number;
  proposingTeam?: { id: number; name: string; code: string; ownerUserId?: number; ownerships?: { userId: number }[] };
  acceptingTeam?: { id: number; name: string; code: string; ownerUserId?: number; ownerships?: { userId: number }[] };
}

export async function getTrades(leagueId: number, _view?: "all" | "my"): Promise<{ trades: TradeProposal[] }> {
    const raw = await fetchJsonApi<{ trades: any[] }>(`${API_BASE}/trades?leagueId=${leagueId}`);
    const trades: TradeProposal[] = (raw.trades || []).map((t: any) => {
      // Derive accepting team from items: find the first item where recipientId !== proposerId
      const acceptingItem = t.items?.find((i: any) => i.recipientId !== t.proposerId);
      const acceptingTeam = acceptingItem?.recipient ?? null;
      const acceptingTeamId = acceptingItem?.recipientId ?? null;

      // Map senderTeamId on items for UI compat
      const items = (t.items || []).map((i: any) => ({
        ...i,
        senderTeamId: i.senderId,
      }));

      return {
        ...t,
        proposingTeamId: t.proposerId,
        proposingTeam: t.proposer ?? null,
        acceptingTeamId,
        acceptingTeam,
        items,
      };
    });
    return { trades };
}

export async function proposeTrade(payload: {
  leagueId?: number;
  proposerTeamId?: number;
  proposingTeamId?: number;
  acceptingTeamId?: number;
  items: Partial<TradeItem>[];
}): Promise<TradeProposal> {
    // Map old field names to server expectations
    const serverPayload = {
      leagueId: payload.leagueId,
      proposerTeamId: payload.proposerTeamId ?? payload.proposingTeamId,
      items: payload.items.map((i) => ({
        senderId: i.senderId ?? i.senderTeamId,
        recipientId: i.recipientId ?? payload.acceptingTeamId ?? 0,
        assetType: i.assetType,
        playerId: i.playerId,
        amount: i.amount,
        pickRound: i.pickRound,
      })),
    };
    const result = await fetchJsonApi<TradeProposal>(`${API_BASE}/trades`, {
        method: 'POST',
        body: JSON.stringify(serverPayload)
    });
    track("trade_propose", { item_count: serverPayload.items.length });
    return result;
}

export async function respondToTrade(tradeId: number, action: "ACCEPT" | "REJECT"): Promise<TradeProposal> {
    const endpoint = action === "ACCEPT" ? "accept" : "reject";
    const result = await fetchJsonApi<TradeProposal>(`${API_BASE}/trades/${tradeId}/${endpoint}`, {
        method: 'POST',
    });
    track("trade_respond", { action: action.toLowerCase(), trade_id: tradeId });
    return result;
}

export async function acceptTrade(tradeId: number): Promise<TradeProposal> {
    return respondToTrade(tradeId, "ACCEPT");
}

export async function rejectTrade(tradeId: number): Promise<TradeProposal> {
    return respondToTrade(tradeId, "REJECT");
}

export async function cancelTrade(tradeId: number): Promise<{ success: boolean }> {
    return fetchJsonApi(`${API_BASE}/trades/${tradeId}/cancel`, {
        method: 'POST',
    });
}

export async function vetoTrade(tradeId: number): Promise<{ success: boolean }> {
    return fetchJsonApi(`${API_BASE}/trades/${tradeId}/veto`, {
        method: 'POST',
    });
}

export async function processTrade(tradeId: number): Promise<{ success: boolean }> {
    return fetchJsonApi(`${API_BASE}/trades/${tradeId}/process`, {
        method: 'POST',
    });
}
