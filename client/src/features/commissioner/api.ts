import { fetchJsonApi, API_BASE } from "../../api/base";

// --- Types ---

export interface CommissionerUser {
  id: number;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  isAdmin?: boolean;
}

export interface CommissionerMembership {
  id: number;
  leagueId: number;
  userId: number;
  role: "COMMISSIONER" | "OWNER";
  user: CommissionerUser;
}

export interface CommissionerTeam {
  id: number;
  name: string;
  code?: string | null;
  budget?: number | null;
  owner?: string | null;
  owners?: Array<{ userId: number; user: CommissionerUser }>;
}

export interface CommissionerLeague {
  id: number;
  name: string;
  season: number;
  draftMode?: string;
}

export interface CommissionerOverviewResponse {
  league: CommissionerLeague;
  teams?: CommissionerTeam[];
  memberships?: CommissionerMembership[];
}

export interface AvailableUser {
  id: number;
  email: string;
  name: string | null;
}

export interface PriorTeam {
  id: number;
  name: string;
  code: string | null;
}

export interface RosterItem {
  id: number;
  teamId: number;
  player: {
    id: number;
    name: string;
    posPrimary: string;
    mlbId?: number;
  };
  price: number;
  source?: string;
}

// --- API Functions ---

export async function getCommissionerOverview(leagueId: number): Promise<CommissionerOverviewResponse> {
  return fetchJsonApi<CommissionerOverviewResponse>(`${API_BASE}/commissioner/${leagueId}`);
}

export async function getAvailableUsers(leagueId: number): Promise<AvailableUser[]> {
  const resp = await fetchJsonApi<{ users: AvailableUser[] }>(`${API_BASE}/commissioner/${leagueId}/available-users`);
  return resp.users ?? [];
}

export async function getPriorTeams(leagueId: number): Promise<PriorTeam[]> {
  const resp = await fetchJsonApi<{ priorTeams: PriorTeam[] }>(`${API_BASE}/commissioner/${leagueId}/prior-teams`);
  return resp.priorTeams ?? [];
}

export async function getCommissionerRosters(leagueId: number): Promise<RosterItem[]> {
  const resp = await fetchJsonApi<{ rosters: RosterItem[] }>(`${API_BASE}/commissioner/${leagueId}/rosters`);
  return resp.rosters ?? [];
}

export async function updateLeague(leagueId: number, data: { name?: string }): Promise<{ league: CommissionerLeague }> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function createTeam(leagueId: number, payload: {
  name: string;
  code?: string;
  budget: number;
  priorTeamId?: string | number;
}): Promise<void> {
  await fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/teams`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteTeam(leagueId: number, teamId: number): Promise<void> {
  await fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/teams/${teamId}`, { method: "DELETE" });
}

export interface InviteMemberResult {
  status: "added" | "invited";
  membership?: CommissionerMembership;
  invite?: PendingInvite;
}

export interface PendingInvite {
  id: number;
  leagueId: number;
  email: string;
  role: "COMMISSIONER" | "OWNER";
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "CANCELLED";
  createdAt: string;
  expiresAt: string;
}

export async function inviteMember(leagueId: number, email: string, role: string): Promise<InviteMemberResult> {
  return fetchJsonApi<InviteMemberResult>(`${API_BASE}/commissioner/${leagueId}/members`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

export async function getInvites(leagueId: number): Promise<PendingInvite[]> {
  const resp = await fetchJsonApi<{ invites: PendingInvite[] }>(`${API_BASE}/commissioner/${leagueId}/invites`);
  return resp.invites ?? [];
}

export async function cancelInvite(leagueId: number, inviteId: number): Promise<void> {
  await fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/invites/${inviteId}`, { method: "DELETE" });
}

export async function changeMemberRole(leagueId: number, membershipId: number, role: "COMMISSIONER" | "OWNER"): Promise<CommissionerMembership> {
  const resp = await fetchJsonApi<{ membership: CommissionerMembership }>(`${API_BASE}/commissioner/${leagueId}/members/${membershipId}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
  return resp.membership;
}

export async function removeMember(leagueId: number, membershipId: number): Promise<void> {
  await fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/members/${membershipId}`, { method: "DELETE" });
}

export async function assignTeamOwner(leagueId: number, teamId: number, userId: number, ownerName?: string): Promise<void> {
  await fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/teams/${teamId}/owner`, {
    method: "POST",
    body: JSON.stringify({ userId, ownerName: ownerName || undefined }),
  });
}

export async function removeTeamOwner(leagueId: number, teamId: number, userId: number): Promise<void> {
  await fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/teams/${teamId}/owner/${userId}`, { method: "DELETE" });
}

export async function assignRosterKeeper(leagueId: number, data: {
  teamId: number;
  mlbId?: number;
  name: string;
  posPrimary: string;
  price: number;
  source: string;
}): Promise<void> {
  await fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/roster/assign`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function releaseRosterEntry(leagueId: number, rosterId: number): Promise<void> {
  await fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/roster/release`, {
    method: "POST",
    body: JSON.stringify({ rosterId }),
  });
}

export interface ExecuteTradeItem {
  senderId: number;
  recipientId: number;
  assetType: "PLAYER" | "BUDGET" | "PICK";
  playerId?: number;
  amount?: number;
  pickRound?: number;
}

export async function executeCommissionerTrade(
  leagueId: number,
  payload: { items: ExecuteTradeItem[]; note?: string }
): Promise<{ success: boolean; trade: any }> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/execute-trade`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createLeagueSeason(input: {
  name: string;
  season: number;
  draftMode?: "AUCTION" | "DRAFT";
  isPublic?: boolean;
  copyFromLeagueId?: number;
}): Promise<{ league: CommissionerLeague }> {
  return fetchJsonApi(`${API_BASE}/commissioner/create-season`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
