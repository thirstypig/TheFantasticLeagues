
import { fetchJsonApi, API_BASE } from '../../api/base';

export interface TransactionEvent {
  id: number;
  leagueId: number;
  teamId: number | null;
  playerId: number | null;
  type: string; // ADD, DROP, TRADE, COMMISSIONER
  amount: number | null;
  relatedTransactionId: number | null;
  submittedAt: string;
  processedAt: string | null;
  status: string; // PENDING, APPROVED, REJECTED
  team?: { name: string };
  player?: { name: string };
  
  // Legacy / Raw fields
  effDate?: string;
  effDateRaw?: string;
  ogbaTeamName?: string;
  playerAliasRaw?: string;
  transactionRaw?: string;
}

export async function getTransactions(params?: { leagueId?: number; teamId?: number; skip?: number; take?: number }): Promise<{ transactions: TransactionEvent[], total: number }> {
    const q = new URLSearchParams();
    if (params?.leagueId) q.set('leagueId', String(params.leagueId));
    if (params?.teamId) q.set('teamId', String(params.teamId));
    if (params?.skip) q.set('skip', String(params.skip));
    if (params?.take) q.set('take', String(params.take));

    return fetchJsonApi(`${API_BASE}/transactions?${q.toString()}`);
}

export interface IlStashParams {
    leagueId: number;
    teamId: number;
    stashPlayerId: number;
    addPlayerId?: number;
    addMlbId?: number;
    effectiveDate?: string;
    reason?: string;
}

export async function ilStash(params: IlStashParams): Promise<{ success: boolean; stashPlayerId: number; addPlayerId: number }> {
    return fetchJsonApi(`${API_BASE}/transactions/il-stash`, {
        method: 'POST',
        body: JSON.stringify(params),
    });
}

export interface IlActivateParams {
    leagueId: number;
    teamId: number;
    activatePlayerId: number;
    dropPlayerId: number;
    effectiveDate?: string;
    reason?: string;
}

export async function ilActivate(params: IlActivateParams): Promise<{ success: boolean; activatePlayerId: number; dropPlayerId: number }> {
    return fetchJsonApi(`${API_BASE}/transactions/il-activate`, {
        method: 'POST',
        body: JSON.stringify(params),
    });
}
