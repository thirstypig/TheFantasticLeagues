
import { fetchJsonApi, API_BASE } from '../../api/base';

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
  proposingTeam?: { id: number; name: string; code: string; ownerUserId?: number };
  acceptingTeam?: { id: number; name: string; code: string; ownerUserId?: number };
  votes?: { userId: number; vote: string }[];
}

export async function getTrades(leagueId: number, _view?: "all" | "my"): Promise<{ trades: TradeProposal[] }> {
    return fetchJsonApi<{ trades: TradeProposal[] }>(`${API_BASE}/trades?leagueId=${leagueId}`);
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
    return fetchJsonApi(`${API_BASE}/trades`, {
        method: 'POST',
        body: JSON.stringify(serverPayload)
    });
}

export async function respondToTrade(tradeId: number, action: "ACCEPT" | "REJECT"): Promise<TradeProposal> {
    const endpoint = action === "ACCEPT" ? "accept" : "reject";
    return fetchJsonApi(`${API_BASE}/trades/${tradeId}/${endpoint}`, {
        method: 'POST',
    });
}

export async function acceptTrade(tradeId: number): Promise<TradeProposal> {
    return respondToTrade(tradeId, "ACCEPT");
}

export async function rejectTrade(tradeId: number): Promise<TradeProposal> {
    return respondToTrade(tradeId, "REJECT");
}

export async function cancelTrade(_tradeId: number): Promise<{ success: boolean }> {
    throw new Error("Cancel trade is not yet available");
}

export async function voteOnTrade(_tradeId: number, _vote: "APPROVE" | "VETO", _reason?: string): Promise<{ success: boolean }> {
    throw new Error("Trade voting is not yet available");
}

export async function processTrade(tradeId: number, _action?: "PROCESS" | "VETO"): Promise<{ success: boolean }> {
    return fetchJsonApi(`${API_BASE}/trades/${tradeId}/process`, {
        method: 'POST',
    });
}
