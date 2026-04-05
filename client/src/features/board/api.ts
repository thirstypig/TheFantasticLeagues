import { fetchJsonApi, API_BASE } from "../../api/base";

/* ── Types ──────────────────────────────────────────────────────── */

export interface BoardCardUser {
  id: number;
  name: string | null;
  avatarUrl: string | null;
}

export interface BoardReply {
  id: number;
  cardId: number;
  userId: number;
  body: string;
  createdAt: string;
  user: BoardCardUser;
}

export interface BoardCard {
  id: number;
  leagueId: number;
  userId: number | null;
  column: string;
  title: string;
  body: string | null;
  type: string;
  metadata: any;
  pinned: boolean;
  periodId: number | null;
  expiresAt: string | null;
  thumbsUp: number;
  thumbsDown: number;
  createdAt: string;
  deletedAt: string | null;
  user: BoardCardUser | null;
  replies: BoardReply[];
  myVote: "up" | "down" | null;
  replyCount: number;
}

export interface BoardListResponse {
  items: BoardCard[];
  total: number;
  limit: number;
  offset: number;
}

/* ── API Functions ──────────────────────────────────────────────── */

export async function getBoardCards(params: {
  leagueId: number;
  column?: string;
  periodId?: number;
  limit?: number;
  offset?: number;
}): Promise<BoardListResponse> {
  const sp = new URLSearchParams();
  sp.set("leagueId", String(params.leagueId));
  if (params.column) sp.set("column", params.column);
  if (params.periodId) sp.set("periodId", String(params.periodId));
  if (params.limit) sp.set("limit", String(params.limit));
  if (params.offset) sp.set("offset", String(params.offset));
  return fetchJsonApi(`${API_BASE}/board?${sp.toString()}`);
}

export async function createBoardCard(data: {
  leagueId: number;
  column: string;
  title: string;
  body?: string;
  type?: string;
  metadata?: any;
  periodId?: number;
  expiresAt?: string;
}): Promise<BoardCard> {
  return fetchJsonApi(`${API_BASE}/board`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function voteBoardCard(
  cardId: number,
  vote: "up" | "down"
): Promise<{ myVote: "up" | "down" | null }> {
  return fetchJsonApi(`${API_BASE}/board/${cardId}/vote`, {
    method: "POST",
    body: JSON.stringify({ vote }),
  });
}

export async function replyToBoardCard(
  cardId: number,
  body: string
): Promise<BoardReply> {
  return fetchJsonApi(`${API_BASE}/board/${cardId}/reply`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export async function togglePinBoardCard(cardId: number): Promise<BoardCard> {
  return fetchJsonApi(`${API_BASE}/board/${cardId}/pin`, {
    method: "PATCH",
  });
}

export async function deleteBoardCard(cardId: number): Promise<{ success: boolean }> {
  return fetchJsonApi(`${API_BASE}/board/${cardId}`, {
    method: "DELETE",
  });
}
