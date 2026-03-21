// client/src/pages/Commissioner.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useToast } from "../../../contexts/ToastContext";

import { getLeagues, getMe, type LeagueListItem } from "../../../api";
import {
  getCommissionerOverview,
  getAvailableUsers,
  getPriorTeams,
  createTeam as apiCreateTeam,
  deleteTeam as apiDeleteTeam,
  inviteMember as apiInviteMember,
  assignTeamOwner as apiAssignTeamOwner,
  removeTeamOwner as apiRemoveTeamOwner,
  updateLeague as apiUpdateLeague,
  getInvites as apiGetInvites,
  cancelInvite as apiCancelInvite,
  changeMemberRole as apiChangeMemberRole,
  removeMember as apiRemoveMember,
} from "../api";
import type { PendingInvite } from "../api";
import { getInviteCode, regenerateInviteCode } from "../../leagues/api";
import CommissionerRosterTool from "../components/CommissionerRosterTool";
import CommissionerControls from "../components/CommissionerControls";
import CommissionerTradeTool from "../components/CommissionerTradeTool";
import KeeperPrepDashboard from "../../keeper-prep/components/KeeperPrepDashboard";
import SeasonManager from "../components/SeasonManager";
import PageHeader from "../../../components/ui/PageHeader";
import { useSeasonGating } from "../../../hooks/useSeasonGating";
import { useLeague } from "../../../contexts/LeagueContext";

// Local types for normalizeOverview (server response has more fields than the api.ts types)
type CommissionerOverviewResponse = {
  league: any;
  teams?: any[];
  memberships?: any[];
};

type CommissionerUser = {
  id: number;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  isAdmin?: boolean;
};

type CommissionerMembership = {
  id: number;
  leagueId: number;
  userId: number;
  role: "COMMISSIONER" | "OWNER";
  user: CommissionerUser;
};

type CommissionerTeam = {
  id: number;
  leagueId: number;
  name: string;
  code?: string | null;
  owner?: string | null;
  budget?: number | null;
  ownerUserId?: number | null;
  ownerUser?: CommissionerUser | null;
  ownerships: any[];
};

type CommissionerLeague = {
  id: number;
  name: string;
  season: number;
  draftMode: "AUCTION" | "DRAFT";
  draftOrder?: "SNAKE" | "LINEAR" | null;
  isPublic: boolean;
  publicSlug?: string | null;
};

function cls(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}


function normalizeOverview(resp: CommissionerOverviewResponse): {
  league: CommissionerLeague;
  teams: CommissionerTeam[];
  memberships: CommissionerMembership[];
} {
  const leagueRaw = resp?.league ?? {};
  const teamsRaw = (resp as any)?.teams ?? leagueRaw?.teams ?? [];
  const membershipsRaw = (resp as any)?.memberships ?? leagueRaw?.memberships ?? [];

  const league: CommissionerLeague = {
    id: Number(leagueRaw.id),
    name: String(leagueRaw.name ?? ""),
    season: Number(leagueRaw.season ?? 0),
    draftMode: leagueRaw.draftMode === "DRAFT" ? "DRAFT" : "AUCTION",
    draftOrder: leagueRaw.draftOrder ?? null,
    isPublic: Boolean(leagueRaw.isPublic),
    publicSlug: leagueRaw.publicSlug ?? null,
  };

  const teams: CommissionerTeam[] = (teamsRaw ?? []).map((t: any) => ({
    id: Number(t.id),
    leagueId: Number(t.leagueId),
    name: String(t.name ?? ""),
    code: t.code ?? null,
    owner: t.owner ?? null,
    budget: t.budget ?? null,
    ownerUserId: t.ownerUserId ?? null,
    ownerUser: t.ownerUser ?? null,
    ownerships: t.ownerships ?? [],
  }));

  const memberships: CommissionerMembership[] = (membershipsRaw ?? []).map((m: any) => ({
    id: Number(m.id),
    leagueId: Number(m.leagueId),
    userId: Number(m.userId),
    role: m.role,
    user: m.user,
  }));

  return { league, teams, memberships };
}

function teamExists(teams: CommissionerTeam[], teamId: number) {
  return teams.some((t) => t.id === teamId);
}

export default function Commissioner() {
  const { leagueId } = useParams();
  const lid = Number(leagueId);
  const { toast, confirm } = useToast();
  const { setLeagueId: syncLeagueContext } = useLeague();

  // Sync LeagueContext to the URL league so gating matches the page
  useEffect(() => {
    if (lid && Number.isFinite(lid)) syncLeagueContext(lid);
  }, [lid, syncLeagueContext]);

  const [me, setMe] = useState<any>(null);
  const [leagues, setLeagues] = useState<LeagueListItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<{
    league: CommissionerLeague | null;
    teams: CommissionerTeam[];
    memberships: CommissionerMembership[];
  }>({ league: null, teams: [], memberships: [] });

  // Create team form
  const [teamName, setTeamName] = useState("");
  const [teamCode, setTeamCode] = useState("");
  const [teamBudget, setTeamBudget] = useState<number>(400);

  // Add member form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"OWNER" | "COMMISSIONER">("OWNER");

  // Assign owner form
  const [ownerTeamId, setOwnerTeamId] = useState<number | "">("");
  const [ownerUserId, setOwnerUserId] = useState<number | "">("");
  const [ownerName, setOwnerName] = useState("");

  // Available users for dropdown
  const [availableUsers, setAvailableUsers] = useState<Array<{ id: number; email: string; name: string | null }>>([]);

  // Prior teams for team creation
  const [priorTeams, setPriorTeams] = useState<Array<{ id: number; name: string; code: string | null }>>([]);
  const [selectedPriorTeamId, setSelectedPriorTeamId] = useState<number | "">("");

  // League name edit
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");

  // Invite code
  const [inviteCodeValue, setInviteCodeValue] = useState<string | null>(null);
  const [inviteCodeLoading, setInviteCodeLoading] = useState(false);

  // Pending invites
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);

  // Season gating
  const gating = useSeasonGating();

  // Tab definitions with season-aware gating
  type TabKey = 'league' | 'members' | 'teams' | 'season' | 'trades';
  const TABS: { key: TabKey; label: string; icon: string; enabled: boolean; reason?: string }[] = [
    { key: 'league', label: 'League', icon: 'building', enabled: true },
    { key: 'members', label: 'Members', icon: 'users', enabled: true },
    { key: 'teams', label: 'Teams', icon: 'trophy', enabled: true },
    { key: 'season', label: 'Season', icon: 'calendar', enabled: true },
    { key: 'trades', label: 'Trades', icon: 'arrows', enabled: !gating.isReadOnly, reason: 'Season is completed' },
  ];

  // Tabs
  const [activeTab, setActiveTab] = useState<TabKey>('league');

  // Hash listener — only navigate to enabled tabs
  useEffect(() => {
     const hash = window.location.hash.replace('#', '') as TabKey;
     const tab = TABS.find(t => t.key === hash);
     if (tab?.enabled) {
         setActiveTab(hash);
     }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gating.seasonStatus]);

  const leagueFromList = useMemo(() => (leagues ?? []).find((x) => x.id === lid) ?? null, [leagues, lid]);

  const accessRole =
    (leagueFromList as any)?.access?.type === "MEMBER" ? (leagueFromList as any).access.role : null;

  const canCommissioner = accessRole === "COMMISSIONER" || Boolean(me?.isAdmin);

  function reconcileTeamSelections(nextTeams: CommissionerTeam[]) {
    // If there are no teams, clear selections and roster display.
    if (!nextTeams.length) {
      setOwnerTeamId("");
      return;
    }

    // Ensure ownerTeamId is valid (or default to first team).
    if (ownerTeamId === "" || !Number.isFinite(Number(ownerTeamId)) || !teamExists(nextTeams, Number(ownerTeamId))) {
      setOwnerTeamId(nextTeams[0].id);
    }
  }

  async function loadAll() {
    if (!Number.isFinite(lid)) {
      setError("Invalid leagueId.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [meResp, leaguesResp] = await Promise.all([getMe(), getLeagues()]);
      setMe(meResp.user ?? null);
      setLeagues(leaguesResp.leagues ?? []);

      // commissioner overview (server enforces access)
      const resp = await getCommissionerOverview(lid);
      const norm = normalizeOverview(resp);

      setOverview({ league: norm.league, teams: norm.teams, memberships: norm.memberships });
      reconcileTeamSelections(norm.teams);

      // Fetch available users for dropdown
      const users = await getAvailableUsers(lid);
      setAvailableUsers(users);

      // Fetch prior teams for team creation
      const priorTeamsList = await getPriorTeams(lid);
      setPriorTeams(priorTeamsList);

      // Fetch invite code + pending invites
      try {
        const ic = await getInviteCode(lid);
        setInviteCodeValue(ic.inviteCode);
      } catch { /* ignore if no permission */ }
      try {
        const invites = await apiGetInvites(lid);
        setPendingInvites(invites.filter(i => i.status === "PENDING"));
      } catch { /* ignore if no permission */ }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load commissioner data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await loadAll();
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  async function refreshOverviewOnly() {
    const resp = await getCommissionerOverview(lid);
    const norm = normalizeOverview(resp);
    setOverview({ league: norm.league, teams: norm.teams, memberships: norm.memberships });
    reconcileTeamSelections(norm.teams);
    return norm;
  }

  async function onCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: String(teamName || "").trim(),
        code: String(teamCode || "").trim() || undefined,
        budget: Number(teamBudget),
        priorTeamId: selectedPriorTeamId || undefined,
      };
      if (!payload.name) throw new Error("Team name is required.");

      await apiCreateTeam(lid, payload);

      setTeamName("");
      setTeamCode("");
      setSelectedPriorTeamId("");
      await refreshOverviewOnly();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Create team failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const email = String(inviteEmail || "").trim().toLowerCase();
      if (!email) throw new Error("Email is required.");

      const result = await apiInviteMember(lid, email, inviteRole);

      setInviteEmail("");
      if (result.status === "invited") {
        toast(`Invite sent to ${email}. They'll be added when they sign up and log in.`, "success");
        // Refresh pending invites
        try {
          const invites = await apiGetInvites(lid);
          setPendingInvites(invites.filter(i => i.status === "PENDING"));
        } catch { /* ignore */ }
      } else {
        toast(`${email} added to the league.`, "success");
      }
      await refreshOverviewOnly();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Add member failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onCancelInvite(inviteId: number) {
    setBusy(true);
    try {
      await apiCancelInvite(lid, inviteId);
      setPendingInvites(prev => prev.filter(i => i.id !== inviteId));
      toast("Invite cancelled.", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to cancel invite.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onChangeMemberRole(membershipId: number, currentRole: string) {
    const newRole = currentRole === "COMMISSIONER" ? "OWNER" : "COMMISSIONER";
    if (newRole === "COMMISSIONER" && !(await confirm(`Promote this member to Commissioner? They will have full league management access.`))) {
      return;
    }
    setBusy(true);
    try {
      await apiChangeMemberRole(lid, membershipId, newRole as "COMMISSIONER" | "OWNER");
      toast(`Role changed to ${newRole}.`, "success");
      await refreshOverviewOnly();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to change role.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveMember(membershipId: number, memberName: string) {
    if (!(await confirm(`Remove ${memberName} from the league? Their team ownerships will also be removed.`))) {
      return;
    }
    setBusy(true);
    try {
      await apiRemoveMember(lid, membershipId);
      toast("Member removed.", "success");
      await refreshOverviewOnly();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to remove member.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onAssignOwner(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const teamId = Number(ownerTeamId);
      if (!Number.isFinite(teamId) || teamId <= 0) throw new Error("Select a team.");
      const userId = Number(ownerUserId);
      if (!Number.isFinite(userId) || userId <= 0) throw new Error("Select an owner.");

      await apiAssignTeamOwner(lid, teamId, userId, String(ownerName || "").trim() || undefined);

      setOwnerUserId("");
      setOwnerName("");
      await refreshOverviewOnly();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Assign owner failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveOwner(teamId: number, userId: number) {
    setBusy(true);
    setError(null);
    try {
      await apiRemoveTeamOwner(lid, teamId, userId);
      await refreshOverviewOnly();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Remove owner failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteTeam(teamId: number) {
    if (!(await confirm("Are you sure you want to delete this team? All associated data will be removed."))) {
      return;
    }

    setBusy(true);
    try {
      await apiDeleteTeam(lid, teamId);
      await refreshOverviewOnly();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to delete team.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveLeagueName() {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === overview.league?.name) {
      setEditingName(false);
      return;
    }
    setBusy(true);
    try {
      await apiUpdateLeague(lid, { name: trimmed });
      await refreshOverviewOnly();
      setEditingName(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update league name.");
    } finally {
      setBusy(false);
    }
  }

  // Build userId → team name(s) map from overview.teams ownerships
  const userTeamMap = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const team of overview.teams) {
      for (const o of team.ownerships ?? []) {
        const uid = o.userId ?? o.user?.id;
        if (uid) {
          const names = map.get(uid) ?? [];
          names.push(team.name);
          map.set(uid, names);
        }
      }
      // Also check legacy ownerUserId
      if (team.ownerUserId && !(team.ownerships?.length)) {
        const names = map.get(team.ownerUserId) ?? [];
        names.push(team.name);
        map.set(team.ownerUserId, names);
      }
    }
    return map;
  }, [overview.teams]);

  const league = overview.league;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <PageHeader
        title="Commissioner"
        subtitle="Season setup and management tools."
      />

      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-sm text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]">
            ← Back to Home
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={loadAll}
              className={cls(
                "rounded-xl border border-[var(--lg-border-subtle)] px-3 py-2 text-sm text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint)]",
                busy && "opacity-60 cursor-not-allowed"
              )}
              disabled={busy}
            >
              Refresh
            </button>
            {/* leagueId used internally only */}
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-6 text-center text-sm text-[var(--lg-text-muted)]">
            Loading…
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-6 text-center text-sm text-red-300">
            {error}
          </div>
        ) : !me ? (
          <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-6 text-center text-sm text-[var(--lg-text-primary)]/70">
            You are not logged in.
          </div>
        ) : !leagueFromList ? (
          <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-6 text-center text-sm text-[var(--lg-text-primary)]/70">
            League not found.
          </div>
        ) : !canCommissioner ? (
          <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-6 text-center text-sm text-[var(--lg-text-primary)]/70">
            You are not a commissioner for this league.
          </div>
        ) : !league ? (
          <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-6 text-center text-sm text-[var(--lg-text-primary)]/70">
            Commissioner data not available.
          </div>
        ) : (
          <>
            {/* League header */}
            <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold text-[var(--lg-text-heading)] flex items-center gap-2">
                    {editingName ? (
                      <input
                        autoFocus
                        className="bg-[var(--lg-bg-surface)] border border-[var(--lg-border-subtle)] rounded-lg px-2 py-0.5 text-lg font-semibold text-[var(--lg-text-heading)] outline-none focus:border-[var(--lg-accent)]"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") onSaveLeagueName();
                          if (e.key === "Escape") setEditingName(false);
                        }}
                        onBlur={() => onSaveLeagueName()}
                        disabled={busy}
                      />
                    ) : (
                      <>
                        {league.name}
                        <button
                          onClick={() => { setDraftName(league.name); setEditingName(true); }}
                          className="text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] transition-colors"
                          title="Edit league name"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                            <path d="m15 5 4 4"/>
                          </svg>
                        </button>
                      </>
                    )}
                    <span className="text-[var(--lg-text-muted)]">— {league.season} Season</span>
                  </div>
                  <div className="mt-1 text-sm text-[var(--lg-text-muted)]">
                    draftMode: {league.draftMode}
                    {league.draftMode === "DRAFT" ? ` · draftOrder: ${league.draftOrder ?? "—"}` : null}
                    <span className="ml-2 rounded-full bg-[var(--lg-tint-hover)] px-2 py-0.5 text-xs">role: {accessRole ?? "—"}</span>
                    {me.isAdmin ? <span className="ml-2 rounded-full bg-[var(--lg-tint-hover)] px-2 py-0.5 text-xs">Admin</span> : null}
                  </div>
                </div>

                <div className="text-right text-xs text-[var(--lg-text-muted)]">
                  <div>Public: {league.isPublic ? "Yes" : "No"}</div>
                  <div>Slug: {league.publicSlug ?? "—"}</div>
                </div>
              </div>
            </div>

            {/* Season Phase Guidance */}
            <div className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] px-4 py-3 flex items-center gap-3">
              <div className={cls(
                "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                gating.seasonStatus === "SETUP" && "bg-blue-500/15 text-blue-500",
                gating.seasonStatus === "DRAFT" && "bg-amber-500/15 text-amber-500",
                gating.seasonStatus === "IN_SEASON" && "bg-green-500/15 text-green-500",
                gating.seasonStatus === "COMPLETED" && "bg-[var(--lg-text-muted)]/15 text-[var(--lg-text-muted)]",
                !gating.seasonStatus && "bg-[var(--lg-text-muted)]/15 text-[var(--lg-text-muted)]",
              )}>
                {gating.seasonStatus?.replace("_", " ") ?? "No Season"}
              </div>
              <span className="text-sm text-[var(--lg-text-secondary)]">{gating.phaseGuidance}</span>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-2 border-b border-[var(--lg-border-subtle)] pb-4 mb-6 overflow-x-auto">
                {TABS.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => {
                             if (!tab.enabled) return;
                             window.history.replaceState(null, '', `#${tab.key}`);
                             setActiveTab(tab.key);
                        }}
                        className={cls(
                            "px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5",
                            !tab.enabled && "opacity-40 cursor-not-allowed",
                            activeTab === tab.key && tab.enabled
                                ? "bg-[var(--lg-accent)] text-white"
                                : tab.enabled
                                  ? "text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint)]"
                                  : "text-[var(--lg-text-muted)]"
                        )}
                        title={tab.enabled ? undefined : tab.reason}
                        disabled={!tab.enabled}
                    >
                        {tab.icon === 'building' && (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/></svg>
                        )}
                        {tab.icon === 'users' && (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        )}
                        {tab.icon === 'trophy' && (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                        )}
                        {tab.icon === 'calendar' && (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>
                        )}
                        {tab.icon === 'arrows' && (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>
                        )}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab: League */}
            {activeTab === 'league' && (
                <div className="space-y-5">
                  {/* Quick Stats */}
                  <div className="grid gap-4 grid-cols-3">
                    <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-4 text-center">
                      <div className="text-2xl font-semibold text-[var(--lg-text-heading)]">{overview.teams.length}</div>
                      <div className="text-xs text-[var(--lg-text-muted)]">Teams</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-4 text-center">
                      <div className="text-2xl font-semibold text-[var(--lg-text-heading)]">{overview.memberships.length}</div>
                      <div className="text-xs text-[var(--lg-text-muted)]">Members</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-4 text-center">
                      <div className={cls(
                        "text-sm font-semibold rounded-full inline-block px-3 py-1",
                        gating.seasonStatus === "SETUP" && "bg-blue-500/15 text-blue-500",
                        gating.seasonStatus === "DRAFT" && "bg-amber-500/15 text-amber-500",
                        gating.seasonStatus === "IN_SEASON" && "bg-green-500/15 text-green-500",
                        gating.seasonStatus === "COMPLETED" && "bg-[var(--lg-text-muted)]/15 text-[var(--lg-text-muted)]",
                        !gating.seasonStatus && "bg-[var(--lg-text-muted)]/15 text-[var(--lg-text-muted)]",
                      )}>
                        {gating.seasonStatus?.replace("_", " ") ?? "No Season"}
                      </div>
                      <div className="text-xs text-[var(--lg-text-muted)] mt-1">Season Status</div>
                    </div>
                  </div>

                  {/* League Settings */}
                  <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5">
                    <div className="mb-3 text-lg font-semibold text-[var(--lg-text-heading)]">League Settings</div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-4 py-3">
                        <div className="text-sm text-[var(--lg-text-muted)]">Draft Mode</div>
                        <div className="text-sm font-medium text-[var(--lg-text-primary)]">
                          {league.draftMode}
                          {league.draftMode === "DRAFT" ? ` (${league.draftOrder ?? "—"})` : null}
                        </div>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-4 py-3">
                        <div className="text-sm text-[var(--lg-text-muted)]">Public</div>
                        <div className="text-sm font-medium text-[var(--lg-text-primary)]">{league.isPublic ? "Yes" : "No"}</div>
                      </div>
                      {league.publicSlug && (
                        <div className="flex items-center justify-between rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-4 py-3">
                          <div className="text-sm text-[var(--lg-text-muted)]">Slug</div>
                          <div className="text-sm font-medium text-[var(--lg-text-primary)]">{league.publicSlug}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Invite Code */}
                  <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-lg font-semibold text-[var(--lg-text-heading)]">Invite Code</div>
                    </div>
                    {inviteCodeValue ? (
                      <div className="flex items-center gap-3">
                        <code className="flex-1 rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-4 py-2.5 text-sm font-mono tracking-widest text-[var(--lg-text-primary)]">
                          {inviteCodeValue}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(inviteCodeValue);
                            toast("Invite code copied!", "success");
                          }}
                          className="px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] text-[var(--lg-text-secondary)] hover:bg-[var(--lg-bg-surface)] transition-all"
                        >
                          Copy
                        </button>
                        <button
                          onClick={async () => {
                            setInviteCodeLoading(true);
                            try {
                              const res = await regenerateInviteCode(lid);
                              setInviteCodeValue(res.inviteCode);
                              toast("Invite code regenerated", "success");
                            } catch {
                              toast("Failed to regenerate code", "error");
                            } finally {
                              setInviteCodeLoading(false);
                            }
                          }}
                          disabled={inviteCodeLoading}
                          className="px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--lg-accent)]/10 border border-[var(--lg-accent)]/20 text-[var(--lg-accent)] hover:bg-[var(--lg-accent)]/20 transition-all disabled:opacity-50"
                        >
                          {inviteCodeLoading ? "..." : "Regenerate"}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-[var(--lg-text-muted)]">No invite code set.</span>
                        <button
                          onClick={async () => {
                            setInviteCodeLoading(true);
                            try {
                              const res = await regenerateInviteCode(lid);
                              setInviteCodeValue(res.inviteCode);
                              toast("Invite code generated!", "success");
                            } catch {
                              toast("Failed to generate code", "error");
                            } finally {
                              setInviteCodeLoading(false);
                            }
                          }}
                          disabled={inviteCodeLoading}
                          className="px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--lg-accent)] text-white hover:bg-[var(--lg-accent-hover)] transition-all disabled:opacity-50"
                        >
                          {inviteCodeLoading ? "Generating..." : "Generate Code"}
                        </button>
                      </div>
                    )}
                    <p className="mt-2 text-xs text-[var(--lg-text-muted)]">
                      Share this code with users so they can join your league.
                    </p>
                  </div>
                </div>
            )}

            {/* Tab: Members */}
            {activeTab === 'members' && (
                <div className="space-y-5">
                  {/* Member List */}
                  <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-lg font-semibold text-[var(--lg-text-heading)]">Members</div>
                      <div className="text-xs text-[var(--lg-text-muted)]">{overview.memberships.length} total</div>
                    </div>

                    <div className="space-y-2">
                      {overview.memberships.map((m) => {
                        const isMe = m.userId === me?.id;
                        const memberName = m.user?.name || m.user?.email || `User ${m.userId}`;
                        return (
                          <div
                            key={m.id}
                            className="flex items-center justify-between rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-3 py-2 group"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm text-[var(--lg-text-primary)]">
                                {memberName}
                              </div>
                              <div className="truncate text-xs text-[var(--lg-text-muted)]">{m.user?.email}</div>
                              {userTeamMap.get(m.userId)?.map((tName) => (
                                <span
                                  key={tName}
                                  className="inline-block mt-1 mr-1 rounded-full bg-[var(--lg-accent)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--lg-accent)]"
                                >
                                  {tName}
                                </span>
                              ))}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => onChangeMemberRole(m.id, m.role)}
                                className="rounded-full bg-[var(--lg-tint-hover)] px-2 py-0.5 text-xs text-[var(--lg-text-primary)] hover:bg-[var(--lg-accent)]/15 hover:text-[var(--lg-accent)] transition-colors"
                                title={`Change to ${m.role === "COMMISSIONER" ? "OWNER" : "COMMISSIONER"}`}
                                disabled={busy || isMe}
                              >
                                {m.role}
                              </button>
                              {!isMe && (
                                <button
                                  onClick={() => onRemoveMember(m.id, memberName)}
                                  className="text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                                  title="Remove member"
                                  disabled={busy}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Add Member */}
                  <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5">
                    <div className="mb-2 text-sm font-semibold text-[var(--lg-text-heading)]">Add member (by email)</div>
                    <form onSubmit={onInvite} className="grid gap-2 md:grid-cols-3">
                      <input
                        className="md:col-span-2 w-full rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-border-subtle)]"
                        placeholder="owner@email.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                      />
                      <select
                        className="w-full rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-border-subtle)]"
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as any)}
                        title="Select role"
                      >
                        <option value="OWNER">OWNER</option>
                        <option value="COMMISSIONER">COMMISSIONER</option>
                      </select>

                      <div className="md:col-span-3 flex justify-end">
                        <button
                          type="submit"
                          className={cls(
                            "rounded-xl bg-[var(--lg-tint-hover)] px-4 py-2 text-sm text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint-hover)]",
                            busy && "opacity-60 cursor-not-allowed"
                          )}
                          disabled={busy}
                        >
                          Add
                        </button>
                      </div>
                    </form>

                    <div className="mt-2 text-xs text-[var(--lg-text-muted)]">
                      If the user hasn't signed up yet, they'll receive a pending invite and be added automatically when they create an account.
                    </div>
                  </div>

                  {/* Pending Invites */}
                  {pendingInvites.length > 0 && (
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
                      <div className="mb-2 text-sm font-semibold text-[var(--lg-text-heading)]">
                        Pending Invites
                        <span className="ml-2 text-xs font-normal text-[var(--lg-text-muted)]">{pendingInvites.length}</span>
                      </div>
                      <div className="space-y-2">
                        {pendingInvites.map((inv) => (
                          <div
                            key={inv.id}
                            className="flex items-center justify-between rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm text-[var(--lg-text-primary)]">{inv.email}</div>
                              <div className="text-xs text-[var(--lg-text-muted)]">
                                {inv.role} · Invited {new Date(inv.createdAt).toLocaleDateString()}
                                {inv.expiresAt && ` · Expires ${new Date(inv.expiresAt).toLocaleDateString()}`}
                              </div>
                            </div>
                            <button
                              onClick={() => onCancelInvite(inv.id)}
                              className="shrink-0 text-xs text-red-400 hover:text-red-300"
                              disabled={busy}
                            >
                              Cancel
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
            )}

            {/* Tab: Teams */}
            {activeTab === 'teams' && (
                <div className="space-y-5">
                  {/* Team List */}
                  <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-lg font-semibold text-[var(--lg-text-heading)]">Teams</div>
                      <div className="text-xs text-[var(--lg-text-muted)]">{overview.teams.length} total</div>
                    </div>

                    <div className="space-y-2">
                      {overview.teams.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-3 py-2 group"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-[var(--lg-text-heading)]">
                              {t.name}{" "}
                              <span className="text-[var(--lg-text-muted)] font-normal">
                                {t.budget != null ? `$${t.budget}` : ""}
                              </span>
                            </div>
                            <div className="mt-1 space-y-1">
                              {t.ownerships && t.ownerships.length > 0 ? (
                                t.ownerships.map((o: any) => (
                                  <div key={o.id} className="flex items-center gap-2 text-xs text-[var(--lg-text-muted)] group/owner">
                                    <span className="truncate max-w-[150px]">{o.user?.email || `User ${o.userId}`}</span>
                                    <button
                                      onClick={() => onRemoveOwner(t.id, o.userId)}
                                      className="text-red-400 hover:text-red-300 opacity-0 group-hover/owner:opacity-100 transition-opacity"
                                      title="Remove Owner"
                                      disabled={busy}
                                    >
                                      (Remove)
                                    </button>
                                  </div>
                                ))
                              ) : (
                                <div className="text-xs text-[var(--lg-text-muted)] italic">No owners assigned</div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-xs text-[var(--lg-text-muted)]">id: {t.id}</div>
                            <button
                              onClick={() => onDeleteTeam(t.id)}
                              className="rounded-lg bg-red-500/10 p-1.5 text-red-500 hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Delete Team"
                              disabled={busy}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Create Team */}
                    <div className="mt-4 rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] p-4">
                      <div className="mb-2 text-sm font-semibold text-[var(--lg-text-heading)]">Create team</div>
                      <form onSubmit={onCreateTeam} className="grid gap-2 md:grid-cols-3">
                        {priorTeams.length > 0 && (
                          <div className="md:col-span-3 mb-2">
                            <label className="block text-xs text-[var(--lg-text-muted)] mb-1">Link to prior year team (optional)</label>
                            <select
                              className="w-full rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-border-subtle)]"
                              value={selectedPriorTeamId}
                              onChange={(e) => {
                                const id = e.target.value ? Number(e.target.value) : "";
                                setSelectedPriorTeamId(id);
                                if (id) {
                                  const pt = priorTeams.find((t) => t.id === id);
                                  if (pt) {
                                    setTeamName(pt.name);
                                    setTeamCode(pt.code || "");
                                  }
                                }
                              }}
                            >
                              <option value="">Create new team…</option>
                              {priorTeams.map((pt) => (
                                <option key={pt.id} value={pt.id}>
                                  {pt.name} — from last year
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <input
                          className="md:col-span-2 w-full rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-border-subtle)]"
                          placeholder="Team name"
                          value={teamName}
                          onChange={(e) => setTeamName(e.target.value)}
                        />
                        <input
                          className="w-full rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-border-subtle)]"
                          placeholder="Code (OGBA)"
                          value={teamCode}
                          onChange={(e) => setTeamCode(e.target.value)}
                        />

                        <div className="md:col-span-2">
                          <label className="block text-xs text-[var(--lg-text-muted)]">Budget</label>
                          <input
                            className="mt-1 w-full rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-border-subtle)]"
                            type="number"
                            value={teamBudget}
                            onChange={(e) => setTeamBudget(Number(e.target.value))}
                          />
                        </div>

                        <div className="md:col-span-1 flex items-end justify-end">
                          <button
                            type="submit"
                            className={cls(
                              "w-full rounded-xl bg-[var(--lg-tint-hover)] px-4 py-2 text-sm text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint-hover)]",
                              busy && "opacity-60 cursor-not-allowed"
                            )}
                            disabled={busy}
                          >
                            Create
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* Assign Owner */}
                    <div className="mt-4 rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] p-4">
                      <div className="mb-2 text-sm font-semibold text-[var(--lg-text-heading)]">Assign team owner</div>

                      <form onSubmit={onAssignOwner} className="grid gap-2 md:grid-cols-3">
                        <select
                          className="w-full rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-border-subtle)]"
                          value={ownerTeamId}
                          onChange={(e) => setOwnerTeamId(e.target.value ? Number(e.target.value) : "")}
                        >
                          <option value="">Select team…</option>
                          {overview.teams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>

                        <select
                          className="w-full rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-border-subtle)]"
                          value={ownerUserId}
                          onChange={(e) => setOwnerUserId(e.target.value ? Number(e.target.value) : "")}
                        >
                          <option value="">Select owner…</option>
                          {availableUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name || u.email} ({u.email})
                            </option>
                          ))}
                        </select>

                        <input
                          className="w-full rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-border-subtle)]"
                          placeholder="Owner display name (optional)"
                          value={ownerName}
                          onChange={(e) => setOwnerName(e.target.value)}
                        />

                        <div className="md:col-span-3 flex justify-end">
                          <button
                            type="submit"
                            className={cls(
                              "rounded-xl bg-[var(--lg-tint-hover)] px-4 py-2 text-sm text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint-hover)]",
                              busy && "opacity-60 cursor-not-allowed"
                            )}
                            disabled={busy}
                          >
                            Add owner (max 2)
                          </button>
                        </div>
                      </form>

                      <div className="mt-2 text-xs text-[var(--lg-text-muted)]">
                        Teams can have up to 2 owners. Select registered users from the dropdown.
                      </div>
                    </div>
                  </div>

                  {/* Roster Tool */}
                  {!gating.isReadOnly && (
                    <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5">
                       <h2 className="text-xl font-semibold mb-4 text-[var(--lg-text-heading)]">Manual Roster Management</h2>
                       <CommissionerRosterTool
                          leagueId={lid}
                          teams={overview.teams}
                          onUpdate={() => { /* no-op or refresh */ }}
                        />
                    </div>
                  )}
                </div>
            )}

            {/* Tab: Season */}
            {activeTab === 'season' && (
                <div className="space-y-6">
                    <SeasonManager leagueId={lid} draftMode={overview.league?.draftMode} />

                    {/* Keepers — only when canKeepers */}
                    {gating.canKeepers && (
                      <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5">
                           <h2 className="text-xl font-semibold mb-4 text-[var(--lg-text-heading)]">Keeper Selection Agent</h2>
                           <KeeperPrepDashboard leagueId={lid} />
                      </div>
                    )}

                    {/* Auction Controls — only when canAuction or canKeepers (Setup/Draft) */}
                    {(gating.canKeepers || gating.canAuction) && (
                      <div className="space-y-6">
                        <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5">
                          <h3 className="text-lg font-semibold text-[var(--lg-text-heading)] mb-2">Live Auction Draft</h3>
                          <p className="text-sm text-[var(--lg-text-muted)] mb-4">Start and manage the live auction draft from the Auction page.</p>
                          <Link
                            to={`/leagues/${lid}/auction`}
                            className="inline-block rounded-xl bg-sky-500 px-6 py-3 text-sm font-semibold text-white hover:bg-sky-600 transition-colors"
                          >
                            Go to Auction Draft
                          </Link>
                        </div>
                        <CommissionerControls leagueId={lid} />
                      </div>
                    )}
                </div>
            )}

            {/* Tab: Trades */}
            {activeTab === 'trades' && (
                <div className="space-y-6">
                    <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5">
                       <h2 className="text-xl font-semibold mb-4 text-[var(--lg-text-heading)]">Record Trade</h2>
                       <CommissionerTradeTool
                          leagueId={lid}
                          teams={overview.teams}
                        />
                    </div>
                </div>
            )}

          </>
        )}
      </div>
    </div>
  );
}
