import { fetchJsonApi, API_BASE } from '../../../api/base';

/** Server cap on a team's list (myListSchema `.max(50)`); it 400s above this BEFORE deduping. */
export const MY_LIST_MAX = 50;

interface MyListResponse { teamId: number; mlbIds: number[] }

/** GET /api/auction/my-list?leagueId&teamId, owner only. Returns ordered mlbIds. */
export async function fetchMyList(leagueId: number, teamId: number): Promise<number[]> {
    const data = await fetchJsonApi<MyListResponse>(
        `${API_BASE}/auction/my-list?leagueId=${leagueId}&teamId=${teamId}`
    );
    return data.mlbIds;
}

/** Dedupe (keeping first occurrence) and cap at the server limit. Always call before PUT. */
export function normalizeMyList(mlbIds: number[]): number[] {
    return [...new Set(mlbIds)].slice(0, MY_LIST_MAX);
}

/** PUT /api/auction/my-list?leagueId, body {teamId, mlbIds}. Returns what the server stored. */
export async function saveMyList(leagueId: number, teamId: number, mlbIds: number[]): Promise<number[]> {
    const data = await fetchJsonApi<MyListResponse>(
        `${API_BASE}/auction/my-list?leagueId=${leagueId}`,
        { method: 'PUT', body: JSON.stringify({ teamId, mlbIds: normalizeMyList(mlbIds) }) }
    );
    return data.mlbIds;
}
