import { fetchJsonApi, API_BASE, ApiError } from "../../api/base";
import type { TeamBalanceRow, LeagueBalancesResponse } from "@shared/api/commissioner";

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
  ownerUserId?: number | null;
  ownerUser?: CommissionerUser | null;
  ownerships?: Array<{ id: number; userId: number; user: CommissionerUser }>;
}

export interface CommissionerLeague {
  id: number;
  name: string;
  season: number;
  draftMode?: string;
  entryFee?: number | null;
  entryFeeNote?: string | null;
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
  assignedPosition?: string | null;
  /** ISO timestamp the player joined this roster (Roster.acquiredAt). */
  acquiredAt: string;
  player: {
    id: number;
    name: string;
    posPrimary: string;
    posList?: string;
    mlbId?: number;
    mlbTeam?: string | null;
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

/**
 * Net FinanceLedger balance per team. Every team appears, at 0 when it has no
 * ledger rows. The server sums voided rows on purpose (todo #311) — the
 * balance here is already the correct net; do not post-process it.
 */
export async function getLeagueBalances(leagueId: number): Promise<TeamBalanceRow[]> {
  const resp = await fetchJsonApi<LeagueBalancesResponse>(`${API_BASE}/commissioner/${leagueId}/balances`);
  return resp.balances;
}

export async function getPriorTeams(leagueId: number): Promise<PriorTeam[]> {
  const resp = await fetchJsonApi<{ priorTeams: PriorTeam[] }>(`${API_BASE}/commissioner/${leagueId}/prior-teams`);
  return resp.priorTeams ?? [];
}

export async function getCommissionerRosters(leagueId: number): Promise<RosterItem[]> {
  const resp = await fetchJsonApi<{ rosters: RosterItem[] }>(`${API_BASE}/commissioner/${leagueId}/rosters`);
  return resp.rosters ?? [];
}

export async function updateLeague(leagueId: number, data: {
  name?: string;
  scoringFormat?: string;
  pointsConfig?: Record<string, number>;
  playoffWeeks?: number;
  playoffTeams?: number;
  regularSeasonWeeks?: number;
  // Waiver configuration
  waiverType?: string;
  faabBudget?: number;
  faabMinBid?: number;
  waiverPeriodDays?: number;
  processingFreq?: string;
  faabTiebreaker?: string;
  acquisitionLimit?: number | null;
  conditionalClaims?: boolean;
  tradeDeadline?: string | null;
  rosterLockTime?: string | null;
  // League discovery
  visibility?: string;
  maxTeams?: number;
  description?: string | null;
  entryFee?: number | null;
  entryFeeNote?: string | null;
  // Trade settings
  tradeReviewPolicy?: string;
  vetoThreshold?: number;
}): Promise<{ league: CommissionerLeague }> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function getLockedFields(leagueId: number): Promise<{ seasonStatus: string | null; lockedFields: string[] }> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/locked-fields`);
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

export async function getLeagueInviteCode(leagueId: number): Promise<string | null> {
  const resp = await fetchJsonApi<{ inviteCode: string | null }>(`${API_BASE}/leagues/${leagueId}/invite-code`);
  return resp.inviteCode ?? null;
}

export async function regenerateLeagueInviteCode(leagueId: number): Promise<string> {
  const resp = await fetchJsonApi<{ inviteCode: string }>(`${API_BASE}/leagues/${leagueId}/invite-code/regenerate`, { method: "POST" });
  return resp.inviteCode;
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
  assetType: "PLAYER" | "BUDGET" | "PICK" | "FUTURE_BUDGET" | "WAIVER_PRIORITY";
  playerId?: number;
  amount?: number;
  pickRound?: number;
  season?: number;
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


export interface GhostIlTeam {
  teamId: number;
  teamName: string;
  teamCode: string;
  ghosts: Array<{ rosterId: number; playerId: number; playerName: string; currentMlbStatus: string }>;
}

export interface GhostIlSummary {
  teams: GhostIlTeam[];
  totalTeamsWithGhosts: number;
  totalGhosts: number;
}

export async function getGhostIlSummary(leagueId: number): Promise<GhostIlSummary> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/ghost-il`);
}

// ── Bulk operations: League IL audit + Roster cleanup ────────────────

export interface IlAuditRow {
  teamId: number;
  teamName: string;
  teamCode: string | null;
  playerId: number;
  playerName: string;
  mlbId: number | null;
  mlbStatus: string;
  assignedPosition: string | null;
}

export interface IlAuditResponse {
  rows: IlAuditRow[];
  totalRows: number;
  totalTeams: number;
  fetchedAt: string;
}

export async function getIlAudit(leagueId: number): Promise<IlAuditResponse> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/il-audit`);
}

export interface BulkIlStashEntry {
  teamId: number;
  playerId: number;
}

export interface BulkIlStashSucceeded {
  teamId: number;
  playerId: number;
  outcome: "stashed" | "noop";
}

export interface BulkIlStashFailed {
  teamId: number;
  playerId: number;
  reason: string;
  code?: string;
}

export interface BulkIlStashResponse {
  succeeded: BulkIlStashSucceeded[];
  failed: BulkIlStashFailed[];
}

export async function postBulkIlStash(
  leagueId: number,
  entries: BulkIlStashEntry[],
): Promise<BulkIlStashResponse> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/bulk-il-stash`, {
    method: "POST",
    body: JSON.stringify({ entries }),
  });
}

export interface CleanupDroppedResponse {
  deletedCount: number;
  cutoff: string;
}

export async function postCleanupDropped(
  leagueId: number,
  olderThanDays: number,
): Promise<CleanupDroppedResponse> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/cleanup-dropped`, {
    method: "POST",
    body: JSON.stringify({ olderThanDays }),
  });
}

export async function commissionerForceDrop(
  leagueId: number,
  teamId: number,
  playerId: number,
  effectiveDate?: string,
): Promise<{ success: boolean; playerId: number; teamId: number }> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/teams/${teamId}/force-drop`, {
    method: "POST",
    body: JSON.stringify({ playerId, effectiveDate }),
  });
}

// ── Commissioner hub (Phase 1) ───────────────────────────────────────

export interface HubPeriod {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: "pending" | "active" | "completed" | string;
}

export async function getLeaguePeriods(leagueId: number): Promise<HubPeriod[]> {
  const resp = await fetchJsonApi<{ data: HubPeriod[] }>(`${API_BASE}/periods?leagueId=${leagueId}`);
  return resp.data;
}

export async function setPeriodStatus(
  periodId: number,
  body: { status: "active" | "completed"; billFees?: boolean },
): Promise<HubPeriod> {
  const resp = await fetchJsonApi<{ data: HubPeriod }>(`${API_BASE}/periods/${periodId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return resp.data;
}

export interface RosterCheck {
  cap: number;
  teams: Array<{ teamId: number; teamName: string; activeCount: number; over: boolean }>;
}

export async function getRosterCheck(leagueId: number): Promise<RosterCheck> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/roster-check`);
}

export interface CloseReadiness {
  periodId: number;
  name: string;
  status: string;
  endDate: string;
  lastStatDate: string | null;
  ready: boolean;
}

export async function getCloseReadiness(leagueId: number, periodId: number): Promise<CloseReadiness> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/periods/${periodId}/close-readiness`);
}

export interface MoveSinceStart {
  id: number;
  teamName: string | null;
  playerName: string | null;
  transactionType: string | null;
  effDate: string;
}

export async function getMovesSinceStart(leagueId: number, periodId: number): Promise<MoveSinceStart[]> {
  const resp = await fetchJsonApi<{ moves: MoveSinceStart[] }>(
    `${API_BASE}/commissioner/${leagueId}/periods/${periodId}/moves-since-start`,
  );
  return resp.moves;
}

export interface RecentChange {
  id: number;
  action: string;
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
  userName: string | null;
  metadata: Record<string, unknown> | null;
}

export async function getRecentChanges(leagueId: number, limit?: number): Promise<RecentChange[]> {
  const qs = limit !== undefined ? `?limit=${limit}` : "";
  const resp = await fetchJsonApi<{ changes: RecentChange[] }>(
    `${API_BASE}/commissioner/${leagueId}/recent-changes${qs}`,
  );
  return resp.changes;
}

export interface UnbilledPeriod {
  periodId: number;
  closedAt: string;
}

export async function getUnbilledPeriods(leagueId: number): Promise<UnbilledPeriod[]> {
  const resp = await fetchJsonApi<{ periods: UnbilledPeriod[] }>(
    `${API_BASE}/commissioner/${leagueId}/unbilled-periods`,
  );
  return resp.periods;
}

/** Mirrors server ReconcilePreviewRow (ilFeeService.ts). */
export interface IlFeeReconcilePreviewRow {
  action: "add" | "void";
  teamId: number;
  playerId: number | null;
  playerName?: string;
  rank?: 1 | 2;
  amount: number; // positive for an add, negative for a void/reversal
}

/** Mirrors server ReconcileResult (ilFeeService.ts). */
export interface IlFeeReconcileResult {
  leagueId: number;
  periodId: number;
  added: number;
  voided: number;
  unchanged: number;
  dryRun: boolean;
  preview?: IlFeeReconcilePreviewRow[];
}

/** Dry run through the one existing fee calculation; writes nothing. */
export async function previewIlFees(leagueId: number, periodId: number): Promise<IlFeeReconcileResult> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/reconcile-il-fees/${periodId}?dryRun=true`, {
    method: "POST",
  });
}

export async function billIlFees(leagueId: number, periodId: number): Promise<IlFeeReconcileResult> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/reconcile-il-fees/${periodId}`, {
    method: "POST",
  });
}

export async function getAcceptedTradeCount(leagueId: number): Promise<number> {
  const resp = await fetchJsonApi<{ trades: unknown[] }>(
    `${API_BASE}/trades?leagueId=${leagueId}&status=ACCEPTED`,
  );
  return resp.trades.length;
}

/** Shape of GET /period-category-standings (standings/routes.ts res.json; mounted at /api). */
export interface PeriodStandingsPreviewResponse {
  periodId: number;
  categories: Array<{
    key: string;
    label: string;
    lowerIsBetter?: boolean;
    group?: string;
    rows: Array<{ teamId: number; teamName: string; teamCode?: string; value?: number; rank?: number; points: number }>;
  }>;
  teamCount: number;
  totalDelta: Record<string, number>;
  /** Period innings per team (true decimal, e.g. 46.333...). Absent on older servers. */
  teamInnings?: Array<{ teamId: number; teamName: string; ip: number }>;
  /** The league's scoring.min_innings rule; null when unset. */
  minInnings?: number | null;
  computedAt: string;
}

export async function getPeriodStandingsPreview(
  leagueId: number,
  periodId: number,
): Promise<PeriodStandingsPreviewResponse> {
  return fetchJsonApi(`${API_BASE}/period-category-standings?leagueId=${leagueId}&periodId=${periodId}`);
}

/** Sum each team's category points; highest first. */
export function toTeamTotals(resp: PeriodStandingsPreviewResponse): { teamName: string; points: number }[] {
  const totals = new Map<number, { teamName: string; points: number }>();
  for (const cat of resp.categories) {
    for (const row of cat.rows) {
      const t = totals.get(row.teamId) ?? { teamName: row.teamName, points: 0 };
      t.points += row.points;
      totals.set(row.teamId, t);
    }
  }
  return [...totals.values()].sort((a, b) => b.points - a.points);
}

/**
 * Teams below the league's innings minimum. Compared in whole outs so float
 * sums (49.99999) don't flag a team at exactly 50. Informational only.
 */
export function teamsUnderInnings(
  resp: Pick<PeriodStandingsPreviewResponse, "teamInnings" | "minInnings">,
): Array<{ teamName: string; ip: number; min: number }> {
  const min = resp.minInnings;
  if (min == null) return [];
  return (resp.teamInnings ?? [])
    .filter((t) => Math.round(t.ip * 3) < min * 3)
    .map((t) => ({ teamName: t.teamName, ip: t.ip, min }));
}

/** Innings in thirds: 46.333 -> "46⅓", 49.667 -> "49⅔", 50 -> "50". */
export function formatInnings(ip: number): string {
  const outs = Math.round(ip * 3);
  const whole = Math.floor(outs / 3);
  const rem = outs % 3;
  return rem === 0 ? String(whole) : `${whole}${rem === 1 ? "⅓" : "⅔"}`;
}

// --- League rules (Rules screen) ---

export interface CommissionerRuleRow {
  id: number;
  category: string;
  key: string;
  value: string;
  label: string;
  isLocked: boolean;
}

export async function getCommissionerRules(leagueId: number): Promise<CommissionerRuleRow[]> {
  const resp = await fetchJsonApi<CommissionerRuleRow[] | { rules: CommissionerRuleRow[] }>(`${API_BASE}/leagues/${leagueId}/rules`);
  return Array.isArray(resp) ? resp : resp.rules ?? [];
}

export async function saveCommissionerRules(leagueId: number, updates: Array<{ id: number; value: string }>): Promise<void> {
  await fetchJsonApi(`${API_BASE}/leagues/${leagueId}/rules`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates }),
  });
}

// --- Season and periods ---

export interface SeasonPeriodRow {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface CurrentSeason {
  id: number;
  leagueId: number;
  year: number;
  status: string;
  periods: SeasonPeriodRow[];
}

export async function getCommissionerSeason(leagueId: number): Promise<CurrentSeason | null> {
  const resp = await fetchJsonApi<{ data: CurrentSeason | null }>(`${API_BASE}/seasons/current?leagueId=${leagueId}`);
  return resp.data ?? null;
}

export async function createSeasonPeriod(data: {
  leagueId: number;
  seasonId: number;
  name: string;
  startDate: string;
  endDate: string;
}): Promise<SeasonPeriodRow> {
  const resp = await fetchJsonApi<{ data: SeasonPeriodRow }>(`${API_BASE}/periods`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return resp.data;
}

export async function updateSeasonPeriod(
  periodId: number,
  data: { name: string; startDate: string; endDate: string },
): Promise<SeasonPeriodRow> {
  const resp = await fetchJsonApi<{ data: SeasonPeriodRow }>(`${API_BASE}/periods/${periodId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return resp.data;
}

export async function deleteSeasonPeriod(periodId: number): Promise<void> {
  await fetchJsonApi(`${API_BASE}/periods/${periodId}`, { method: "DELETE" });
}

// --- Step C: roster moves + meeting ---
// Local wrappers over the existing transactions endpoints (no import from
// features/transactions, ADR-015). Previews never throw on rule failures.

export interface PreviewResult { ok: boolean; error?: string; code?: string }
export interface FreeAgent {
  playerId: number;
  name: string;
  pos: string;
  mlbTeam: string | null;
  mlbId: number | null;
}

const PREVIEW_GENERIC_ERROR = "Couldn't check this move. Try again.";

function errorBody(e: unknown): { error?: string; code?: string } | null {
  if (e instanceof ApiError && e.body && typeof e.body === "object") {
    return e.body as { error?: string; code?: string };
  }
  return null;
}

async function postPreview(path: string, body: Record<string, unknown>): Promise<PreviewResult> {
  try {
    const res = await fetchJsonApi<{ ok?: boolean }>(`${API_BASE}${path}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { ...res, ok: res?.ok !== false };
  } catch (e) {
    if (e instanceof ApiError && (e.status === 400 || e.status === 404)) {
      const b = errorBody(e);
      if (b?.error) return { ok: false, error: b.error, code: b.code };
    }
    return { ok: false, error: PREVIEW_GENERIC_ERROR };
  }
}

async function postMutation(path: string, body: Record<string, unknown>): Promise<void> {
  try {
    await fetchJsonApi(`${API_BASE}${path}`, { method: "POST", body: JSON.stringify(body) });
  } catch (e) {
    throw new Error(errorBody(e)?.error ?? "Save failed");
  }
}

interface FreeAgentRow {
  id: number;
  mlb_id?: string | null;
  player_name: string;
  positions?: string | null;
  mlb_team?: string | null;
}

export async function searchFreeAgents(leagueId: number, q: string): Promise<FreeAgent[]> {
  const text = q.trim();
  if (!text) return [];
  const params = new URLSearchParams({ leagueId: String(leagueId), freeAgentsOnly: "true", q: text, take: "20" });
  const res = await fetchJsonApi<{ stats: FreeAgentRow[] }>(`${API_BASE}/player-season-stats?${params}`);
  const seen = new Set<number>();
  const out: FreeAgent[] = [];
  for (const r of res.stats ?? []) {
    if (seen.has(r.id)) continue; // two-way players come back as two rows
    seen.add(r.id);
    const mlbId = Number(r.mlb_id);
    out.push({
      playerId: r.id,
      name: r.player_name,
      pos: r.positions ?? "",
      mlbTeam: r.mlb_team || null,
      mlbId: Number.isFinite(mlbId) && r.mlb_id ? mlbId : null,
    });
  }
  return out;
}

const claimBody = (leagueId: number, teamId: number, addId: number, dropId: number) =>
  ({ leagueId, teamId, playerId: addId, dropPlayerId: dropId });

export function previewMove(leagueId: number, teamId: number, addId: number, dropId: number): Promise<PreviewResult> {
  return postPreview("/transactions/claim/preview", claimBody(leagueId, teamId, addId, dropId));
}

/** Meeting save: always carries effectiveDate. Callers must preview first. */
export function saveMove(leagueId: number, teamId: number, addId: number, dropId: number, effectiveDate: string): Promise<void> {
  return postMutation("/transactions/claim", { ...claimBody(leagueId, teamId, addId, dropId), effectiveDate });
}

export function previewCommissionerIlStash(leagueId: number, teamId: number, stashPlayerId: number, addPlayerId: number): Promise<PreviewResult> {
  return postPreview("/transactions/il-stash/preview", { leagueId, teamId, stashPlayerId, addPlayerId });
}

export function commissionerIlStash(leagueId: number, teamId: number, stashPlayerId: number, addPlayerId: number): Promise<void> {
  return postMutation("/transactions/il-stash", { leagueId, teamId, stashPlayerId, addPlayerId });
}

export function previewCommissionerIlActivate(leagueId: number, teamId: number, activatePlayerId: number, dropPlayerId: number): Promise<PreviewResult> {
  return postPreview("/transactions/il-activate/preview", { leagueId, teamId, activatePlayerId, dropPlayerId });
}

export function commissionerIlActivate(leagueId: number, teamId: number, activatePlayerId: number, dropPlayerId: number): Promise<void> {
  return postMutation("/transactions/il-activate", { leagueId, teamId, activatePlayerId, dropPlayerId });
}

export const previewOneOffSwap = previewMove;

/** One-off swap from the roster screen: claim WITHOUT effectiveDate. */
export function oneOffSwap(leagueId: number, teamId: number, addId: number, dropId: number): Promise<void> {
  return postMutation("/transactions/claim", claimBody(leagueId, teamId, addId, dropId));
}
