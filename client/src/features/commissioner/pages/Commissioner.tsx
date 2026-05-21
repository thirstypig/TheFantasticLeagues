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
  getLockedFields as apiGetLockedFields,
} from "../api";
import type { PendingInvite } from "../api";
import { getGhostIlSummary, type GhostIlSummary } from "../api";
import { getInviteCode, regenerateInviteCode } from "../../leagues/api";
import { getTransactions, type TransactionEvent } from "../../transactions/api";
import CommissionerRosterTool from "../components/CommissionerRosterTool";
import CommissionerControls from "../components/CommissionerControls";
import CommissionerTradeTool from "../components/CommissionerTradeTool";
import RosterControls from "../../roster/components/RosterControls";
import LeagueHealthTab from "../components/LeagueHealthTab";
import BulkOpsPanel from "../components/BulkOpsPanel";
import KeeperPrepDashboard from "../../keeper-prep/components/KeeperPrepDashboard";
import SeasonManager from "../components/SeasonManager";
import { useSeasonGating } from "../../../hooks/useSeasonGating";
import { useLeague } from "../../../contexts/LeagueContext";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";
import "../commissioner.css";

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

// ─── Padlock Icon SVG ───
function PadlockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 shrink-0">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

// ─── SettingsSection — renders a card of settings fields with lock indicators ───
type SettingsFieldDef = {
  key: string;
  label: string;
  type: "readonly" | "select" | "number" | "text" | "toggle" | "date";
  options?: Array<{ value: string | number; label: string }>;
  format?: (v: any) => string;
  min?: number;
  max?: number;
  nullable?: boolean;
};

function SettingsSection({
  title,
  league,
  lockedFields,
  busy,
  onUpdate,
  fields,
}: {
  title: string;
  league: Record<string, any>;
  lockedFields: string[];
  busy: boolean;
  onUpdate: (field: string, value: any) => Promise<void>;
  fields: SettingsFieldDef[];
}) {
  return (
    <div className="cm-card flush">
      <div className="cm-section-head">
        <div className="cm-h2">{title}</div>
      </div>
      {fields.map((f) => {
        const locked = lockedFields.includes(f.key);
        const value = league[f.key];

        return (
          <div key={f.key} className={cls("cm-field", locked && "locked")}>
            <div className="cm-field-label">
              {locked && (
                <span title="Locked — cannot be changed during the current season phase">
                  <PadlockIcon />
                </span>
              )}
              {f.label}
            </div>
            <div className="cm-field-ctrl">
              {f.type === "readonly" ? (
                <span className="cm-num" style={{ fontSize: 12, fontWeight: 600, color: "var(--am-text)" }}>
                  {f.format ? f.format(value) : String(value ?? "—")}
                </span>
              ) : f.type === "select" ? (
                <select
                  value={value ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const isNumOpt = f.options?.some(o => typeof o.value === "number");
                    onUpdate(f.key, isNumOpt ? Number(raw) : raw);
                  }}
                  disabled={locked || busy}
                  className="cm-select"
                >
                  {f.options?.map((o) => (
                    <option key={String(o.value)} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : f.type === "number" ? (
                <input
                  type="number"
                  defaultValue={value ?? ""}
                  min={f.min}
                  max={f.max}
                  disabled={locked || busy}
                  onBlur={(e) => {
                    const num = e.target.value === "" ? (f.nullable ? null : undefined) : Number(e.target.value);
                    if (num === undefined) return;
                    if (num !== value) onUpdate(f.key, num);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  className="cm-input"
                  style={{ width: 80, textAlign: "right" }}
                />
              ) : f.type === "text" ? (
                <input
                  type="text"
                  defaultValue={value ?? ""}
                  disabled={locked || busy}
                  onBlur={(e) => {
                    const v = e.target.value.trim() || null;
                    if (v !== (value ?? null)) onUpdate(f.key, v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  className="cm-input"
                  style={{ flex: 1, maxWidth: 260 }}
                />
              ) : f.type === "toggle" ? (
                <button
                  onClick={() => onUpdate(f.key, !value)}
                  disabled={locked || busy}
                  className={cls("cm-btn sm", value ? "primary" : "")}
                >
                  {value ? "Enabled" : "Disabled"}
                </button>
              ) : f.type === "date" ? (
                <input
                  type="date"
                  defaultValue={value ? new Date(value).toISOString().split("T")[0] : ""}
                  disabled={locked || busy}
                  onBlur={(e) => {
                    const v = e.target.value || null;
                    onUpdate(f.key, v);
                  }}
                  className="cm-input"
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Avatar initials helper ───
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
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

  // Rule lock fields
  const [lockedFields, setLockedFields] = useState<string[]>([]);

  // Season gating
  const gating = useSeasonGating();

  type TabKey = 'overview' | 'people' | 'settings' | 'ops' | 'finances' | 'archive';
  const TABS: { key: TabKey; label: string; icon: string; enabled: boolean; reason?: string }[] = [
    { key: 'overview',  label: 'Overview',       icon: 'activity', enabled: true },
    { key: 'people',    label: 'Teams & People', icon: 'users',    enabled: true },
    { key: 'settings',  label: 'Settings',       icon: 'gear',     enabled: true },
    { key: 'ops',       label: 'Operations',     icon: 'wrench',   enabled: true },
    { key: 'finances',  label: 'Finances',       icon: 'dollar',   enabled: true },
    { key: 'archive',   label: 'Archive',        icon: 'archive',  enabled: true },
  ];

  // Tabs
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // ghost-IL summary — lazy-loaded when Operations tab is first opened
  const [ghostIl, setGhostIl] = useState<GhostIlSummary | null>(null);
  const [recentActivity, setRecentActivity] = useState<TransactionEvent[] | null>(null);

  // Operations sub-tab
  type OpsSubTab = 'roster' | 'trades' | 'ghost-il' | 'bulk';
  const [opsSubTab, setOpsSubTab] = useState<OpsSubTab>('roster');

  // Teams & People sub-tab
  type PeopleSubTab = 'teams' | 'members' | 'invites' | 'invite-code';
  const [peopleSubTab, setPeopleSubTab] = useState<PeopleSubTab>('teams');

  // Settings sub-nav
  type SettingsNavKey = 'league' | 'waiver' | 'trade' | 'auction';
  const [settingsNav, setSettingsNav] = useState<SettingsNavKey>('league');

  // Finances sub-tab
  type FinancesSubTab = 'entry-fees' | 'ledger' | 'payouts' | 'balances';
  const [financesSubTab, setFinancesSubTab] = useState<FinancesSubTab>('entry-fees');

  // Archive sub-tab
  type ArchiveSubTab = 'prior-seasons' | 'champions' | 'lifecycle' | 'finalize';
  const [archiveSubTab, setArchiveSubTab] = useState<ArchiveSubTab>('finalize');

  // Hash listener — handles tab nav AND legacy redirects from old tab names.
  useEffect(() => {
     const raw = window.location.hash.replace('#', '');
     const LEGACY_REDIRECTS: Record<string, TabKey> = {
       league:            'settings',
       members:           'people',
       season:            'archive',
       'manage-rosters':  'ops',
       health:            'overview',
       teams:             'ops',
       trades:            'ops',
     };
     if (raw in LEGACY_REDIRECTS) {
       const target = LEGACY_REDIRECTS[raw];
       window.history.replaceState(null, '', `#${target}`);
       setActiveTab(target);
       return;
     }
     const hash = raw as TabKey;
     const tab = TABS.find(t => t.key === hash);
     if (tab?.enabled) {
         setActiveTab(hash);
     }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gating.seasonStatus]);

  // Load ghost-IL summary when Operations tab is first opened.
  useEffect(() => {
    if (activeTab !== 'ops' || !lid) return;
    if (ghostIl !== null) return;
    let ok = true;
    getGhostIlSummary(lid)
      .then(res => { if (ok) setGhostIl(res); })
      .catch(() => { if (ok) setGhostIl({ teams: [], totalTeamsWithGhosts: 0, totalGhosts: 0 }); });
    return () => { ok = false; };
  }, [activeTab, lid, ghostIl]);

  // Lazy-load recent activity when Overview tab is first opened.
  useEffect(() => {
    if (activeTab !== 'overview' || !lid) return;
    if (recentActivity !== null) return;
    let ok = true;
    getTransactions({ leagueId: lid, take: 25 })
      .then(res => { if (ok) setRecentActivity(res.transactions); })
      .catch(() => { if (ok) setRecentActivity([]); });
    return () => { ok = false; };
  }, [activeTab, lid, recentActivity]);

  const leagueFromList = useMemo(() => (leagues ?? []).find((x) => x.id === lid) ?? null, [leagues, lid]);

  const accessRole =
    (leagueFromList as any)?.access?.type === "MEMBER" ? (leagueFromList as any).access.role : null;

  const canCommissioner = accessRole === "COMMISSIONER" || Boolean(me?.isAdmin);

  function reconcileTeamSelections(nextTeams: CommissionerTeam[]) {
    if (!nextTeams.length) {
      setOwnerTeamId("");
      return;
    }
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

      const resp = await getCommissionerOverview(lid);
      const norm = normalizeOverview(resp);

      setOverview({ league: norm.league, teams: norm.teams, memberships: norm.memberships });
      reconcileTeamSelections(norm.teams);

      const users = await getAvailableUsers(lid);
      setAvailableUsers(users);

      const priorTeamsList = await getPriorTeams(lid);
      setPriorTeams(priorTeamsList);

      try {
        const ic = await getInviteCode(lid);
        setInviteCodeValue(ic.inviteCode);
      } catch { /* ignore if no permission */ }
      try {
        const invites = await apiGetInvites(lid);
        setPendingInvites(invites.filter(i => i.status === "PENDING"));
      } catch { /* ignore if no permission */ }
      try {
        const lf = await apiGetLockedFields(lid);
        setLockedFields(lf.lockedFields ?? []);
      } catch { /* ignore */ }
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
      if (team.ownerUserId && !(team.ownerships?.length)) {
        const names = map.get(team.ownerUserId) ?? [];
        names.push(team.name);
        map.set(team.ownerUserId, names);
      }
    }
    return map;
  }, [overview.teams]);

  const league = overview.league;

  // Tab badge counts
  const tabBadges = {
    ops: ghostIl?.totalGhosts ?? 0,
    people: pendingInvites.length,
  };

  // Season status chip variant
  function statusChipClass(s: string | null | undefined): string {
    if (s === "IN_SEASON") return "cm-chip accent";
    if (s === "DRAFT") return "cm-chip warn";
    if (s === "SETUP") return "cm-chip";
    return "cm-chip";
  }

  // Ownerless teams count
  const ownerlessTeams = overview.teams.filter(t => !t.ownerships?.length && !t.ownerUserId);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <Glass strong>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <SectionLabel>✦ League Tools</SectionLabel>
            <h1 style={{ fontFamily: "var(--am-display)", fontSize: 30, fontWeight: 300, color: "var(--am-text)", margin: 0, lineHeight: 1.1 }}>
              Commissioner
            </h1>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)" }}>
              Season setup, members, rosters, and league health — all in one place.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Link to="/" style={{ fontSize: 12, color: "var(--am-text-muted)", textDecoration: "none" }}>
              ← Back to Home
            </Link>
            <button
              type="button"
              onClick={loadAll}
              disabled={busy}
              className="cm-btn sm"
            >
              Refresh
            </button>
          </div>
        </div>
      </Glass>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {loading ? (
          <Glass>
            <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--am-text-muted)", fontSize: 13 }}>
              Loading…
            </div>
          </Glass>
        ) : error ? (
          <Glass>
            <div style={{ padding: 8, color: "rgb(248, 113, 113)", fontSize: 13, textAlign: "center" }}>
              {error}
            </div>
          </Glass>
        ) : !me ? (
          <Glass>
            <div style={{ padding: 8, color: "var(--am-text-muted)", fontSize: 13, textAlign: "center" }}>
              You are not logged in.
            </div>
          </Glass>
        ) : !leagueFromList ? (
          <Glass>
            <div style={{ padding: 8, color: "var(--am-text-muted)", fontSize: 13, textAlign: "center" }}>
              League not found.
            </div>
          </Glass>
        ) : !canCommissioner ? (
          <Glass>
            <div style={{ padding: 8, color: "var(--am-text-muted)", fontSize: 13, textAlign: "center" }}>
              You are not a commissioner for this league.
            </div>
          </Glass>
        ) : !league ? (
          <Glass>
            <div style={{ padding: 8, color: "var(--am-text-muted)", fontSize: 13, textAlign: "center" }}>
              Commissioner data not available.
            </div>
          </Glass>
        ) : (
          <>
            {/* League header banner */}
            <div className="cm-card">
              <div className="cm-row" style={{ flexWrap: "wrap", gap: 12 }}>
                <div className="cm-grow">
                  <div className="cm-row" style={{ gap: 8, marginBottom: 4 }}>
                    {editingName ? (
                      <input
                        autoFocus
                        className="cm-input"
                        style={{ fontSize: 16, fontWeight: 700, maxWidth: 260 }}
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
                        <span className="cm-h2" style={{ fontSize: 16 }}>{league.name}</span>
                        <button
                          onClick={() => { setDraftName(league.name); setEditingName(true); }}
                          className="cm-btn ghost sm"
                          title="Edit league name"
                          style={{ padding: "2px 4px" }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                            <path d="m15 5 4 4"/>
                          </svg>
                        </button>
                      </>
                    )}
                    <span className={statusChipClass(gating.seasonStatus)}>
                      {gating.seasonStatus?.replace("_", " ") ?? "No Season"}
                    </span>
                  </div>
                  <div className="cm-row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <span className="cm-faint" style={{ fontSize: 12 }}>{league.season} Season · {league.draftMode}{league.draftMode === "DRAFT" ? ` (${league.draftOrder ?? "—"})` : ""}</span>
                    <span className="cm-chip">{accessRole ?? "—"}</span>
                    {me.isAdmin && <span className="cm-chip accent">Admin</span>}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--am-text-faint)", textAlign: "right" }}>
                  <div>Public: {league.isPublic ? "Yes" : "No"}</div>
                  <div>Slug: {league.publicSlug ?? "—"}</div>
                </div>
              </div>
            </div>

            {/* Phase guidance */}
            <div className="cm-alert info">
              <span className="cm-faint" style={{ fontSize: 12 }}>Phase:</span>
              <span style={{ fontSize: 12, color: "var(--am-text)" }}>{gating.phaseGuidance}</span>
            </div>

            {/* Tab strip */}
            <div className="cm-tabs">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.key && tab.enabled;
                const badge = tab.key === 'ops' ? tabBadges.ops : tab.key === 'people' ? tabBadges.people : 0;
                return (
                  <button
                    key={tab.key}
                    onClick={() => {
                      if (!tab.enabled) return;
                      window.history.replaceState(null, '', `#${tab.key}`);
                      setActiveTab(tab.key);
                    }}
                    className={cls("cm-tab", isActive && "active")}
                    title={tab.enabled ? undefined : tab.reason}
                    disabled={!tab.enabled}
                    style={{ opacity: tab.enabled ? 1 : 0.4 }}
                  >
                    {tab.icon === 'activity' && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>
                    )}
                    {tab.icon === 'users' && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    )}
                    {tab.icon === 'gear' && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                    {tab.icon === 'wrench' && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                    )}
                    {tab.icon === 'dollar' && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    )}
                    {tab.icon === 'archive' && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
                    )}
                    {tab.label}
                    {badge > 0 && <span className="cm-count">{badge}</span>}
                  </button>
                );
              })}
            </div>

            {/* ══════════════════════════════════════════════════ */}
            {/* Tab: Overview */}
            {/* ══════════════════════════════════════════════════ */}
            {activeTab === 'overview' && (
              <div className="cm-col cm-fade-in">
                {/* 4 KPI cards */}
                <div className="cm-grid-4">
                  {/* Season status */}
                  <div className="cm-card">
                    <div className="cm-stat">
                      <div className="cm-stat-lbl">Season</div>
                      <div style={{ marginTop: 4 }}>
                        <span className={statusChipClass(gating.seasonStatus)}>
                          {gating.seasonStatus?.replace("_", " ") ?? "No Season"}
                        </span>
                      </div>
                      <div className="cm-stat-delta" style={{ color: "var(--am-text-faint)" }}>
                        {(league as any).tradeDeadline
                          ? `Deadline ${new Date((league as any).tradeDeadline).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                          : "No deadline set"}
                      </div>
                    </div>
                  </div>

                  {/* Teams */}
                  <div className="cm-card">
                    <div className="cm-stat">
                      <div className="cm-stat-lbl">Teams</div>
                      <div className="cm-stat-val cm-num">{overview.teams.length}</div>
                      <div className={cls("cm-stat-delta", ownerlessTeams.length > 0 ? "neg" : "pos")}>
                        {ownerlessTeams.length > 0 ? `${ownerlessTeams.length} unowned` : "all owned"}
                      </div>
                    </div>
                  </div>

                  {/* Members */}
                  <div className="cm-card">
                    <div className="cm-stat">
                      <div className="cm-stat-lbl">Members</div>
                      <div className="cm-stat-val cm-num">{overview.memberships.length}</div>
                      <div className="cm-stat-delta" style={{ color: "var(--am-text-faint)" }}>
                        {overview.memberships.filter(m => m.role === "COMMISSIONER").length} commissioner{overview.memberships.filter(m => m.role === "COMMISSIONER").length !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>

                  {/* Ghost-IL */}
                  <div className="cm-card">
                    <div className="cm-stat">
                      <div className="cm-stat-lbl">IL Alerts</div>
                      <div className={cls("cm-stat-val cm-num", (ghostIl?.totalGhosts ?? 0) > 0 ? "" : "")}
                        style={{ color: (ghostIl?.totalGhosts ?? 0) > 0 ? "var(--am-negative)" : "var(--am-text)" }}>
                        {ghostIl?.totalGhosts ?? "—"}
                      </div>
                      <div className={cls("cm-stat-delta", (ghostIl?.totalGhosts ?? 0) > 0 ? "neg" : "")}>
                        {ghostIl === null ? "load ops tab" : (ghostIl.totalGhosts > 0 ? "ghost-IL players" : "clean")}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2-column main content */}
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "2fr 1fr" }}>
                  {/* Left: Needs attention + Health */}
                  <div className="cm-col">
                    {/* Needs attention */}
                    <div className="cm-card flush">
                      <div className="cm-section-head">
                        <div className="cm-h2">Needs your attention</div>
                      </div>
                      {ownerlessTeams.length === 0 && (ghostIl?.totalGhosts ?? 0) === 0 && pendingInvites.length === 0 ? (
                        <div style={{ padding: "14px", fontSize: 12, color: "var(--am-text-faint)" }}>
                          Everything looks good.
                        </div>
                      ) : (
                        <div>
                          {ownerlessTeams.length > 0 && (
                            <div className="cm-row" style={{ padding: "10px 14px", borderBottom: "1px solid var(--am-border)", gap: 10 }}>
                              <div style={{ width: 28, height: 28, borderRadius: 4, background: "color-mix(in srgb, var(--am-warning) 18%, var(--am-surface))", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--am-warning)" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                              </div>
                              <div className="cm-grow">
                                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--am-text)" }}>{ownerlessTeams.length} unowned team{ownerlessTeams.length !== 1 ? "s" : ""}</div>
                                <div style={{ fontSize: 11, color: "var(--am-text-muted)" }}>{ownerlessTeams.map(t => t.name).join(", ")}</div>
                              </div>
                              <button className="cm-btn sm warn" onClick={() => { setActiveTab("people"); setPeopleSubTab("teams"); }}>Assign</button>
                            </div>
                          )}
                          {(ghostIl?.totalGhosts ?? 0) > 0 && (
                            <div className="cm-row" style={{ padding: "10px 14px", borderBottom: "1px solid var(--am-border)", gap: 10 }}>
                              <div style={{ width: 28, height: 28, borderRadius: 4, background: "color-mix(in srgb, var(--am-negative) 14%, var(--am-surface))", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--am-negative)" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                              </div>
                              <div className="cm-grow">
                                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--am-text)" }}>{ghostIl!.totalGhosts} ghost-IL player{ghostIl!.totalGhosts !== 1 ? "s" : ""}</div>
                                <div style={{ fontSize: 11, color: "var(--am-text-muted)" }}>MLB activated — still in fantasy IL slot</div>
                              </div>
                              <button className="cm-btn sm danger" onClick={() => { setActiveTab("ops"); setOpsSubTab("ghost-il"); }}>Fix</button>
                            </div>
                          )}
                          {pendingInvites.length > 0 && (
                            <div className="cm-row" style={{ padding: "10px 14px", gap: 10 }}>
                              <div style={{ width: 28, height: 28, borderRadius: 4, background: "color-mix(in srgb, var(--am-accent) 14%, var(--am-surface))", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--am-accent)" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                              </div>
                              <div className="cm-grow">
                                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--am-text)" }}>{pendingInvites.length} pending invite{pendingInvites.length !== 1 ? "s" : ""}</div>
                                <div style={{ fontSize: 11, color: "var(--am-text-muted)" }}>Awaiting acceptance</div>
                              </div>
                              <button className="cm-btn sm" onClick={() => { setActiveTab("people"); setPeopleSubTab("invites"); }}>View</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* League health bars */}
                    <div className="cm-card flush">
                      <div className="cm-section-head">
                        <div className="cm-h2">League health</div>
                      </div>
                      <LeagueHealthTab leagueId={lid} />
                    </div>
                  </div>

                  {/* Right column */}
                  <div className="cm-col">
                    {/* Quick actions */}
                    <div className="cm-card flush">
                      <div className="cm-section-head">
                        <div className="cm-h2">Quick actions</div>
                      </div>
                      <div className="cm-col" style={{ padding: 10, gap: 6 }}>
                        <button className="cm-btn" style={{ justifyContent: "flex-start", width: "100%" }} onClick={() => { setActiveTab("people"); setPeopleSubTab("teams"); }}>
                          + Create team
                        </button>
                        <button className="cm-btn" style={{ justifyContent: "flex-start", width: "100%" }} onClick={() => { setActiveTab("people"); setPeopleSubTab("members"); }}>
                          + Invite member
                        </button>
                        <button className="cm-btn" style={{ justifyContent: "flex-start", width: "100%" }} onClick={() => { setActiveTab("ops"); setOpsSubTab("roster"); }}>
                          Manage rosters
                        </button>
                        <button className="cm-btn" style={{ justifyContent: "flex-start", width: "100%" }} onClick={() => { setActiveTab("settings"); }}>
                          League settings
                        </button>
                        <Link to={`/commissioner/${lid}/activity`} className="cm-btn" style={{ justifyContent: "flex-start", width: "100%", textDecoration: "none", color: "var(--am-text)" }}>
                          View all activity →
                        </Link>
                      </div>
                    </div>

                    {/* Recent activity */}
                    <div className="cm-card flush">
                      <div className="cm-section-head">
                        <div className="cm-h2">Recent activity</div>
                      </div>
                      <div style={{ padding: "0 0 4px" }}>
                        {recentActivity === null ? (
                          <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--am-text-faint)" }}>Loading…</div>
                        ) : recentActivity.length === 0 ? (
                          <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--am-text-faint)" }}>No activity yet.</div>
                        ) : (
                          recentActivity.slice(0, 12).map(ev => {
                            const txType = (ev.transactionType || ev.type || "").toUpperCase();
                            const typeLabel =
                              txType === 'CLAIM' ? 'ADD' :
                              txType === 'IL_STASH' ? 'IL+' :
                              txType === 'IL_ACTIVATE' ? 'IL−' :
                              txType || '—';
                            const chipClass =
                              txType === 'ADD' || txType === 'CLAIM' || txType === 'IL_ACTIVATE' ? "cm-chip accent" :
                              txType === 'DROP' || txType === 'IL_STASH' ? "cm-chip warn" :
                              "cm-chip";
                            const ts = ev.submittedAt || ev.effDate || '';
                            const relTime = ts ? (() => {
                              const diff = Date.now() - new Date(ts).getTime();
                              const h = Math.floor(diff / 3_600_000);
                              const d = Math.floor(diff / 86_400_000);
                              if (h < 1) return 'just now';
                              if (h < 24) return `${h}h ago`;
                              if (d < 7) return `${d}d ago`;
                              return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                            })() : '';
                            return (
                              <div key={ev.id} className="cm-row" style={{ padding: "7px 14px", borderBottom: "1px solid var(--am-border)", gap: 8, alignItems: "flex-start" }}>
                                <span className={chipClass} style={{ fontSize: 10, padding: "2px 6px", flexShrink: 0 }}>{typeLabel}</span>
                                <div className="cm-grow" style={{ fontSize: 12, minWidth: 0 }}>
                                  {ev.team?.name && <span style={{ fontWeight: 600 }}>{ev.team.name}</span>}
                                  {ev.player?.name && <span className="cm-muted"> · {ev.player.name}</span>}
                                  {!ev.team?.name && !ev.player?.name && <span className="cm-faint">{ev.transactionRaw || ev.ogbaTeamName || '—'}</span>}
                                </div>
                                <span className="cm-faint" style={{ fontSize: 10, flexShrink: 0 }}>{relTime}</span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════ */}
            {/* Tab: Teams & People */}
            {/* ══════════════════════════════════════════════════ */}
            {activeTab === 'people' && (
              <div className="cm-col cm-fade-in">
                {/* Sub-tab strip */}
                <div className="cm-subtabs">
                  {([
                    { key: 'teams'       as PeopleSubTab, label: 'Teams',       badge: overview.teams.length },
                    { key: 'members'     as PeopleSubTab, label: 'Members',     badge: overview.memberships.length },
                    { key: 'invites'     as PeopleSubTab, label: 'Pending Invites', badge: pendingInvites.length },
                    { key: 'invite-code' as PeopleSubTab, label: 'Invite Code' },
                  ] as { key: PeopleSubTab; label: string; badge?: number }[])
                    .map(t => {
                      const isActive = peopleSubTab === t.key;
                      return (
                        <button key={t.key} onClick={() => setPeopleSubTab(t.key)} className={cls("cm-tab", isActive && "active")}>
                          {t.label}
                          {t.badge != null && t.badge > 0 && <span className="cm-count">{t.badge}</span>}
                        </button>
                      );
                    })}
                </div>

                {/* Sub-tab: Teams */}
                {peopleSubTab === 'teams' && (
                  <div className="cm-card flush">
                    <div className="cm-section-head">
                      <div className="cm-h2">Teams</div>
                      <div className="cm-spacer" />
                      <button className="cm-btn primary sm" onClick={() => {
                        // scroll to create form
                        document.getElementById('cm-create-team-form')?.scrollIntoView({ behavior: 'smooth' });
                      }}>+ Create team</button>
                    </div>
                    <table className="cm-table">
                      <thead>
                        <tr>
                          <th>Team</th>
                          <th>Code</th>
                          <th>Owner</th>
                          <th>Budget</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.teams.map((t) => {
                          const hasOwner = (t.ownerships && t.ownerships.length > 0) || t.ownerUserId;
                          return (
                            <tr key={t.id}>
                              <td>
                                <div className="cm-row" style={{ gap: 8 }}>
                                  <div className="cm-avatar">{initials(t.name)}</div>
                                  <span style={{ fontWeight: 600 }}>{t.name}</span>
                                </div>
                              </td>
                              <td><span className="cm-mono" style={{ fontSize: 11 }}>{t.code ?? "—"}</span></td>
                              <td>
                                {t.ownerships && t.ownerships.length > 0 ? (
                                  t.ownerships.map((o: any) => (
                                    <div key={o.id} className="cm-row" style={{ gap: 6, marginBottom: 2 }}>
                                      <span style={{ fontSize: 12 }}>{o.user?.name || o.user?.email || `User ${o.userId}`}</span>
                                      <button className="cm-btn ghost sm" style={{ padding: "1px 5px", fontSize: 10, color: "var(--am-negative)" }} onClick={() => onRemoveOwner(t.id, o.userId)} disabled={busy} title="Remove owner">×</button>
                                    </div>
                                  ))
                                ) : !hasOwner ? (
                                  <span className="cm-chip warn">unassigned</span>
                                ) : (
                                  <span className="cm-muted" style={{ fontSize: 12 }}>{t.owner ?? `User ${t.ownerUserId}`}</span>
                                )}
                              </td>
                              <td><span className="cm-num" style={{ fontSize: 12 }}>{t.budget != null ? `$${t.budget}` : "—"}</span></td>
                              <td>
                                <button className="cm-btn sm danger" onClick={() => onDeleteTeam(t.id)} disabled={busy} title="Delete team">Delete</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Create team form */}
                    <div id="cm-create-team-form" style={{ padding: 14, borderTop: "1px solid var(--am-border)" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: "var(--am-text)" }}>Create team</div>
                      <form onSubmit={onCreateTeam} className="cm-col" style={{ gap: 8 }}>
                        {priorTeams.length > 0 && (
                          <div>
                            <div style={{ fontSize: 11, color: "var(--am-text-faint)", marginBottom: 4 }}>Link to prior year team (optional)</div>
                            <select className="cm-select full" value={selectedPriorTeamId} onChange={(e) => { const id = e.target.value ? Number(e.target.value) : ""; setSelectedPriorTeamId(id); if (id) { const pt = priorTeams.find((t) => t.id === id); if (pt) { setTeamName(pt.name); setTeamCode(pt.code || ""); } } }}>
                              <option value="">Create new team…</option>
                              {priorTeams.map((pt) => (<option key={pt.id} value={pt.id}>{pt.name} — from last year</option>))}
                            </select>
                          </div>
                        )}
                        <div className="cm-row" style={{ gap: 8 }}>
                          <input className="cm-input cm-grow" placeholder="Team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
                          <input className="cm-input" style={{ width: 100 }} placeholder="Code" value={teamCode} onChange={(e) => setTeamCode(e.target.value)} />
                          <input className="cm-input" type="number" style={{ width: 80 }} placeholder="Budget" value={teamBudget} onChange={(e) => setTeamBudget(Number(e.target.value))} />
                          <button type="submit" className="cm-btn primary" disabled={busy}>Create</button>
                        </div>
                      </form>
                    </div>

                    {/* Assign owner form */}
                    <div style={{ padding: 14, borderTop: "1px solid var(--am-border)" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: "var(--am-text)" }}>Assign team owner</div>
                      <form onSubmit={onAssignOwner} className="cm-row" style={{ gap: 8, flexWrap: "wrap" }}>
                        <select className="cm-select" value={ownerTeamId} onChange={(e) => setOwnerTeamId(e.target.value ? Number(e.target.value) : "")}>
                          <option value="">Select team…</option>
                          {overview.teams.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
                        </select>
                        <select className="cm-select" value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value ? Number(e.target.value) : "")}>
                          <option value="">Select owner…</option>
                          {availableUsers.map((u) => (<option key={u.id} value={u.id}>{u.name || u.email}</option>))}
                        </select>
                        <input className="cm-input" placeholder="Display name (optional)" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
                        <button type="submit" className="cm-btn primary" disabled={busy}>Assign</button>
                      </form>
                      <div style={{ fontSize: 11, color: "var(--am-text-faint)", marginTop: 6 }}>Teams can have up to 2 owners.</div>
                    </div>
                  </div>
                )}

                {/* Sub-tab: Members */}
                {peopleSubTab === 'members' && (
                  <div className="cm-col">
                    <div className="cm-card flush">
                      <div className="cm-section-head">
                        <div className="cm-h2">Members</div>
                        <div className="cm-spacer" />
                        <span className="cm-faint" style={{ fontSize: 12 }}>{overview.memberships.length} total</span>
                      </div>
                      <table className="cm-table">
                        <thead>
                          <tr>
                            <th>Member</th>
                            <th>Role</th>
                            <th>Team</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {overview.memberships.map((m) => {
                            const isMe = m.userId === me?.id;
                            const memberName = m.user?.name || m.user?.email || `User ${m.userId}`;
                            const teamNames = userTeamMap.get(m.userId) ?? [];
                            return (
                              <tr key={m.id}>
                                <td>
                                  <div className="cm-row" style={{ gap: 8 }}>
                                    <div className="cm-avatar sm">{initials(memberName)}</div>
                                    <div>
                                      <div style={{ fontSize: 12, fontWeight: 600 }}>{memberName}</div>
                                      <div style={{ fontSize: 11, color: "var(--am-text-faint)" }}>{m.user?.email}</div>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <button
                                    onClick={() => onChangeMemberRole(m.id, m.role)}
                                    className={cls("cm-chip", m.role === "COMMISSIONER" ? "accent" : "")}
                                    disabled={busy || isMe}
                                    style={{ cursor: isMe ? "default" : "pointer", border: "none", fontFamily: "inherit" }}
                                    title={isMe ? undefined : `Change to ${m.role === "COMMISSIONER" ? "OWNER" : "COMMISSIONER"}`}
                                  >
                                    {m.role}
                                  </button>
                                </td>
                                <td>
                                  {teamNames.length > 0 ? (
                                    <div className="cm-row" style={{ gap: 4, flexWrap: "wrap" }}>
                                      {teamNames.map(n => <span key={n} className="cm-chip" style={{ fontSize: 10 }}>{n}</span>)}
                                    </div>
                                  ) : <span className="cm-faint" style={{ fontSize: 12 }}>—</span>}
                                </td>
                                <td>
                                  {!isMe && (
                                    <button className="cm-btn sm danger" onClick={() => onRemoveMember(m.id, memberName)} disabled={busy}>Remove</button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Add member form */}
                    <div className="cm-card flush">
                      <div className="cm-section-head">
                        <div className="cm-h2">Add member by email</div>
                      </div>
                      <div style={{ padding: 14 }}>
                        <form onSubmit={onInvite} className="cm-row" style={{ gap: 8, flexWrap: "wrap" }}>
                          <input className="cm-input cm-grow" placeholder="owner@email.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} type="email" />
                          <select className="cm-select" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as any)}>
                            <option value="OWNER">OWNER</option>
                            <option value="COMMISSIONER">COMMISSIONER</option>
                          </select>
                          <button type="submit" className="cm-btn primary" disabled={busy}>Add</button>
                        </form>
                        <div style={{ fontSize: 11, color: "var(--am-text-faint)", marginTop: 6 }}>If not yet signed up, they'll receive a pending invite and be auto-added on login.</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sub-tab: Pending Invites */}
                {peopleSubTab === 'invites' && (
                  pendingInvites.length === 0 ? (
                    <div className="cm-card" style={{ textAlign: "center", color: "var(--am-text-muted)", fontSize: 13, padding: 32 }}>
                      No pending invites.
                    </div>
                  ) : (
                    <div className="cm-card flush">
                      <div className="cm-section-head">
                        <div className="cm-h2">Pending Invites</div>
                        <span className="cm-faint" style={{ fontSize: 12 }}>{pendingInvites.length}</span>
                      </div>
                      <table className="cm-table">
                        <thead>
                          <tr>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Sent</th>
                            <th>Expires</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingInvites.map((inv) => (
                            <tr key={inv.id}>
                              <td style={{ fontSize: 12 }}>{inv.email}</td>
                              <td><span className="cm-chip" style={{ fontSize: 10 }}>{inv.role}</span></td>
                              <td className="cm-faint cm-num" style={{ fontSize: 11 }}>{new Date(inv.createdAt).toLocaleDateString()}</td>
                              <td className="cm-faint cm-num" style={{ fontSize: 11 }}>{inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : "—"}</td>
                              <td>
                                <button className="cm-btn sm danger" onClick={() => onCancelInvite(inv.id)} disabled={busy}>Cancel</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}

                {/* Sub-tab: Invite Code */}
                {peopleSubTab === 'invite-code' && (
                  <div className="cm-card flush">
                    <div className="cm-section-head">
                      <div className="cm-h2">Invite Code</div>
                    </div>
                    <div style={{ padding: 14 }}>
                      {inviteCodeValue ? (
                        <div className="cm-row" style={{ gap: 8 }}>
                          <code className="cm-mono" style={{ flex: 1, fontSize: 16, letterSpacing: "0.2em", padding: "10px 14px", background: "var(--am-surface-alt, var(--am-chip))", border: "1px solid var(--am-border)", borderRadius: 4 }}>{inviteCodeValue}</code>
                          <button className="cm-btn" onClick={() => { navigator.clipboard.writeText(inviteCodeValue); toast("Invite code copied!", "success"); }}>Copy</button>
                          <button className="cm-btn" onClick={async () => { setInviteCodeLoading(true); try { const res = await regenerateInviteCode(lid); setInviteCodeValue(res.inviteCode); toast("Invite code regenerated", "success"); } catch { toast("Failed to regenerate code", "error"); } finally { setInviteCodeLoading(false); } }} disabled={inviteCodeLoading}>{inviteCodeLoading ? "..." : "Regenerate"}</button>
                        </div>
                      ) : (
                        <div className="cm-row" style={{ gap: 8 }}>
                          <span className="cm-muted" style={{ fontSize: 13 }}>No invite code set.</span>
                          <button className="cm-btn primary" onClick={async () => { setInviteCodeLoading(true); try { const res = await regenerateInviteCode(lid); setInviteCodeValue(res.inviteCode); toast("Invite code generated!", "success"); } catch { toast("Failed to generate code", "error"); } finally { setInviteCodeLoading(false); } }} disabled={inviteCodeLoading}>{inviteCodeLoading ? "Generating..." : "Generate Code"}</button>
                        </div>
                      )}
                      <p style={{ fontSize: 11, color: "var(--am-text-faint)", marginTop: 8 }}>Share this code with users so they can join your league.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════ */}
            {/* Tab: Settings */}
            {/* ══════════════════════════════════════════════════ */}
            {activeTab === 'settings' && (
              <div className="cm-fade-in" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                {/* Sidebar nav */}
                <div className="cm-col" style={{ width: 172, flexShrink: 0, gap: 2 }}>
                  {([
                    { key: 'league' as SettingsNavKey, label: 'League Basics' },
                    { key: 'waiver' as SettingsNavKey, label: 'Waivers' },
                    { key: 'trade'  as SettingsNavKey, label: 'Trades' },
                    { key: 'auction' as SettingsNavKey, label: 'Auction / Draft' },
                  ]).map(item => (
                    <button
                      key={item.key}
                      className={cls("cm-side-item", settingsNav === item.key && "active")}
                      onClick={() => setSettingsNav(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Settings content */}
                <div className="cm-col cm-grow" style={{ gap: 12 }}>
                  {settingsNav === 'league' && (
                    <SettingsSection
                      title="League Basics"
                      league={league as any}
                      lockedFields={lockedFields}
                      busy={busy}
                      onUpdate={async (field, value) => { try { await apiUpdateLeague(lid, { [field]: value }); toast(`${field} updated.`, "success"); await refreshOverviewOnly(); } catch (err: any) { toast(err?.message || `Failed to update ${field}`, "error"); } }}
                      fields={[
                        { key: "draftMode", label: "Draft Mode", type: "readonly", format: (v: any) => `${v}${(league as any).draftOrder ? ` (${(league as any).draftOrder})` : ""}` },
                        { key: "scoringFormat", label: "Scoring Format", type: "select", options: [{ value: "ROTO", label: "Roto" }, { value: "H2H_CATEGORIES", label: "H2H Categories" }, { value: "H2H_POINTS", label: "H2H Points" }] },
                        { key: "maxTeams", label: "Max Teams", type: "number", min: 4, max: 30 },
                        { key: "playoffWeeks", label: "Playoff Weeks", type: "number", min: 0, max: 10 },
                        { key: "playoffTeams", label: "Playoff Teams", type: "number", min: 2, max: 16 },
                        { key: "regularSeasonWeeks", label: "Regular Season Weeks", type: "number", min: 1, max: 30 },
                        { key: "visibility", label: "Visibility", type: "select", options: [{ value: "PRIVATE", label: "Private" }, { value: "PUBLIC", label: "Public" }, { value: "OPEN", label: "Open" }] },
                        { key: "description", label: "Description", type: "text" },
                      ]}
                    />
                  )}
                  {settingsNav === 'waiver' && (
                    <SettingsSection
                      title="Waiver Configuration"
                      league={league as any}
                      lockedFields={lockedFields}
                      busy={busy}
                      onUpdate={async (field, value) => { try { await apiUpdateLeague(lid, { [field]: value }); toast(`${field} updated.`, "success"); await refreshOverviewOnly(); } catch (err: any) { toast(err?.message || `Failed to update ${field}`, "error"); } }}
                      fields={[
                        { key: "waiverType", label: "Waiver Type", type: "select", options: [{ value: "FAAB", label: "FAAB" }, { value: "ROLLING_PRIORITY", label: "Rolling Priority" }, { value: "REVERSE_STANDINGS", label: "Reverse Standings" }, { value: "FREE_AGENT", label: "Free Agent" }] },
                        { key: "faabBudget", label: "FAAB Budget ($)", type: "number", min: 50, max: 1000 },
                        { key: "faabMinBid", label: "FAAB Min Bid ($)", type: "select", options: [{ value: 0, label: "$0" }, { value: 1, label: "$1" }] },
                        { key: "waiverPeriodDays", label: "Waiver Period (days)", type: "number", min: 0, max: 7 },
                        { key: "processingFreq", label: "Processing Frequency", type: "select", options: [{ value: "DAILY", label: "Daily" }, { value: "WEEKLY_MON", label: "Weekly (Mon)" }, { value: "WEEKLY_WED", label: "Weekly (Wed)" }, { value: "WEEKLY_FRI", label: "Weekly (Fri)" }, { value: "WEEKLY_SUN", label: "Weekly (Sun)" }] },
                        { key: "faabTiebreaker", label: "FAAB Tiebreaker", type: "select", options: [{ value: "ROLLING_PRIORITY", label: "Rolling Priority" }, { value: "REVERSE_STANDINGS", label: "Reverse Standings" }, { value: "RANDOM", label: "Random" }] },
                        { key: "acquisitionLimit", label: "Acquisition Limit", type: "number", min: 0, max: 999, nullable: true },
                        { key: "conditionalClaims", label: "Conditional Claims", type: "toggle" },
                      ]}
                    />
                  )}
                  {settingsNav === 'trade' && (
                    <SettingsSection
                      title="Trade Settings"
                      league={league as any}
                      lockedFields={lockedFields}
                      busy={busy}
                      onUpdate={async (field, value) => { try { await apiUpdateLeague(lid, { [field]: value }); toast(`${field} updated.`, "success"); await refreshOverviewOnly(); } catch (err: any) { toast(err?.message || `Failed to update ${field}`, "error"); } }}
                      fields={[
                        { key: "tradeReviewPolicy", label: "Trade Review", type: "select", options: [{ value: "COMMISSIONER", label: "Commissioner Review" }, { value: "LEAGUE_VOTE", label: "League Vote" }] },
                        { key: "vetoThreshold", label: "Veto Threshold", type: "number", min: 1, max: 20 },
                        { key: "tradeDeadline", label: "Trade Deadline", type: "date" },
                        { key: "rosterLockTime", label: "Roster Lock Time", type: "select", options: [{ value: "", label: "None" }, { value: "GAME_TIME", label: "Game Time" }, { value: "DAILY_LOCK", label: "Daily Lock" }] },
                      ]}
                    />
                  )}
                  {settingsNav === 'auction' && (
                    <div className="cm-col" style={{ gap: 12 }}>
                      {(gating.canKeepers || gating.canAuction) && (
                        <div className="cm-card flush">
                          <div className="cm-section-head">
                            <div className="cm-h2">Live Auction Draft</div>
                          </div>
                          <div style={{ padding: 14 }}>
                            <p className="cm-muted" style={{ fontSize: 12, marginBottom: 10 }}>Start and manage the live auction draft from the Auction page.</p>
                            <Link to={`/leagues/${lid}/auction`} className="cm-btn primary" style={{ textDecoration: "none", display: "inline-flex" }}>Go to Auction Draft</Link>
                          </div>
                        </div>
                      )}
                      <CommissionerControls leagueId={lid} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════ */}
            {/* Tab: Operations */}
            {/* ══════════════════════════════════════════════════ */}
            {activeTab === 'ops' && (
              <div className="cm-col cm-fade-in">
                {/* Ghost-IL urgent alert */}
                {ghostIl && ghostIl.totalTeamsWithGhosts > 0 && opsSubTab !== 'ghost-il' && (
                  <div className="cm-alert warn cm-row" style={{ justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12 }}>
                      <strong>{ghostIl.totalTeamsWithGhosts} team{ghostIl.totalTeamsWithGhosts === 1 ? "" : "s"}</strong>{" "}
                      {ghostIl.totalTeamsWithGhosts === 1 ? "has" : "have"} ghost-IL player{ghostIl.totalGhosts === 1 ? "" : "s"} — MLB has activated them but they're still in a fantasy IL slot.
                    </span>
                    <button className="cm-btn sm danger" onClick={() => setOpsSubTab('ghost-il')}>Fix now</button>
                  </div>
                )}

                {/* Sub-tab strip */}
                <div className="cm-subtabs">
                  {([
                    { key: 'roster'   as OpsSubTab, label: 'Manual Roster' },
                    { key: 'trades'   as OpsSubTab, label: 'Trade Review' },
                    { key: 'ghost-il' as OpsSubTab, label: 'IL & Ghost-IL', badge: ghostIl?.totalGhosts ?? 0 },
                    { key: 'bulk'     as OpsSubTab, label: 'Bulk',
                      hidden: !gating.canKeepers && !gating.canAuction && gating.isReadOnly },
                  ] as { key: OpsSubTab; label: string; badge?: number; hidden?: boolean }[])
                    .filter(t => !t.hidden)
                    .map(t => {
                      const isActive = opsSubTab === t.key;
                      return (
                        <button key={t.key} onClick={() => setOpsSubTab(t.key)} className={cls("cm-tab", isActive && "active")}>
                          {t.label}
                          {(t.badge ?? 0) > 0 && <span className="cm-count">{t.badge}</span>}
                        </button>
                      );
                    })}
                </div>

                {/* Sub-tab: Manual Roster */}
                {opsSubTab === 'roster' && !gating.isReadOnly && (
                  <div className="cm-card" style={{ padding: 0 }}>
                    <CommissionerRosterTool
                      leagueId={lid}
                      teams={overview.teams}
                      onUpdate={() => { /* no-op */ }}
                      showTrades={false}
                    />
                  </div>
                )}
                {opsSubTab === 'roster' && gating.isReadOnly && (
                  <div className="cm-card" style={{ textAlign: "center", color: "var(--am-text-muted)", fontSize: 13, padding: 32 }}>
                    Roster edits are not available in the current season phase.
                  </div>
                )}

                {/* Sub-tab: Trade Review */}
                {opsSubTab === 'trades' && (
                  <div className="cm-card flush">
                    <div className="cm-section-head">
                      <div className="cm-h2">Record Retroactive Trade</div>
                    </div>
                    <div style={{ padding: 14 }}>
                      <CommissionerTradeTool leagueId={lid} teams={overview.teams} />
                    </div>
                  </div>
                )}

                {/* Sub-tab: IL & Ghost-IL */}
                {opsSubTab === 'ghost-il' && (
                  <div className="cm-col">
                    {ghostIl === null ? (
                      <div className="cm-card" style={{ textAlign: "center", color: "var(--am-text-muted)", fontSize: 13, padding: 32 }}>
                        Loading ghost-IL status…
                      </div>
                    ) : ghostIl.totalTeamsWithGhosts === 0 ? (
                      <div className="cm-card" style={{ textAlign: "center", color: "var(--am-text-muted)", fontSize: 13, padding: 32 }}>
                        No ghost-IL players detected. All IL slots look clean.
                      </div>
                    ) : (
                      <div className="cm-card flush">
                        <div className="cm-section-head">
                          <div className="cm-h2" style={{ color: "var(--am-negative)" }}>
                            {ghostIl.totalGhosts} ghost-IL player{ghostIl.totalGhosts === 1 ? "" : "s"} across {ghostIl.totalTeamsWithGhosts} team{ghostIl.totalTeamsWithGhosts === 1 ? "" : "s"}
                          </div>
                          <div className="cm-spacer" />
                          <button className="cm-btn sm" onClick={() => setOpsSubTab('roster')}>Fix in Roster tab →</button>
                        </div>
                        <div style={{ padding: "6px 0" }}>
                          <p style={{ padding: "0 14px 8px", fontSize: 12, color: "var(--am-text-muted)" }}>
                            These players are in fantasy IL slots but their MLB status no longer qualifies them. New IL stashes are blocked until resolved.
                          </p>
                          <table className="cm-table">
                            <thead>
                              <tr>
                                <th>Team</th>
                                <th>Player</th>
                                <th>MLB Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ghostIl.teams.flatMap(t =>
                                t.ghosts.map(g => (
                                  <tr key={`${t.teamId}-${g.playerId}`}>
                                    <td style={{ fontWeight: 600 }}>{t.teamName}</td>
                                    <td>{g.playerName}</td>
                                    <td><span className="cm-chip neg" style={{ fontSize: 10 }}>{g.currentMlbStatus}</span></td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Sub-tab: Bulk */}
                {opsSubTab === 'bulk' && (
                  <div className="cm-col">
                    {gating.canKeepers && (
                      <div className="cm-card flush">
                        <div className="cm-section-head">
                          <div className="cm-h2">Keeper Selection Agent</div>
                        </div>
                        <div style={{ padding: 14 }}>
                          <KeeperPrepDashboard leagueId={lid} />
                        </div>
                      </div>
                    )}
                    {(gating.canKeepers || gating.canAuction) && (
                      <div className="cm-card flush">
                        <div className="cm-section-head">
                          <div className="cm-h2">Roster Setup</div>
                        </div>
                        <div style={{ padding: 14 }}>
                          <p className="cm-muted" style={{ fontSize: 12, marginBottom: 10 }}>Bulk import rosters via CSV or add a single player by name.</p>
                          <RosterControls leagueId={lid} teams={overview.teams} onUpdate={refreshOverviewOnly} />
                        </div>
                      </div>
                    )}
                    {!gating.isReadOnly && (
                      <div className="cm-card flush">
                        <div className="cm-section-head">
                          <div className="cm-h2">Bulk Operations</div>
                        </div>
                        <div style={{ padding: 14 }}>
                          <BulkOpsPanel leagueId={lid} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════ */}
            {/* Tab: Finances */}
            {/* ══════════════════════════════════════════════════ */}
            {activeTab === 'finances' && (
              <div className="cm-col cm-fade-in">
                {/* 4 KPI cards */}
                <div className="cm-grid-4">
                  <div className="cm-card">
                    <div className="cm-stat">
                      <div className="cm-stat-lbl">Prize Pool</div>
                      <div className="cm-stat-val cm-num">
                        {(league as any).entryFee != null
                          ? `$${((league as any).entryFee * overview.teams.length).toLocaleString()}`
                          : "—"}
                      </div>
                      <div className="cm-stat-delta" style={{ color: "var(--am-text-faint)" }}>
                        {overview.teams.length} teams
                      </div>
                    </div>
                  </div>
                  <div className="cm-card">
                    <div className="cm-stat">
                      <div className="cm-stat-lbl">Collected</div>
                      <div className="cm-stat-val cm-num">—</div>
                      <div className="cm-stat-delta" style={{ color: "var(--am-text-faint)" }}>coming soon</div>
                    </div>
                  </div>
                  <div className="cm-card">
                    <div className="cm-stat">
                      <div className="cm-stat-lbl">Outstanding</div>
                      <div className="cm-stat-val cm-num">—</div>
                      <div className="cm-stat-delta" style={{ color: "var(--am-text-faint)" }}>coming soon</div>
                    </div>
                  </div>
                  <div className="cm-card">
                    <div className="cm-stat">
                      <div className="cm-stat-lbl">Entry Fee</div>
                      <div className="cm-stat-val cm-num">
                        {(league as any).entryFee != null ? `$${(league as any).entryFee}` : "—"}
                      </div>
                      <div className="cm-stat-delta" style={{ color: "var(--am-text-faint)" }}>per team</div>
                    </div>
                  </div>
                </div>

                {/* Sub-tab strip */}
                <div className="cm-subtabs">
                  {([
                    { key: 'entry-fees' as FinancesSubTab, label: 'Entry Fees' },
                    { key: 'ledger'     as FinancesSubTab, label: 'Ledger' },
                    { key: 'payouts'    as FinancesSubTab, label: 'Payouts' },
                    { key: 'balances'   as FinancesSubTab, label: 'Balances' },
                  ]).map(t => (
                    <button key={t.key} onClick={() => setFinancesSubTab(t.key)} className={cls("cm-tab", financesSubTab === t.key && "active")}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {financesSubTab === 'entry-fees' && (
                  <SettingsSection
                    title="Entry Fees"
                    league={league as any}
                    lockedFields={lockedFields}
                    busy={busy}
                    onUpdate={async (field, value) => { try { await apiUpdateLeague(lid, { [field]: value }); toast(`${field} updated.`, "success"); await refreshOverviewOnly(); } catch (err: any) { toast(err?.message || `Failed to update ${field}`, "error"); } }}
                    fields={[
                      { key: "entryFee", label: "Entry Fee ($)", type: "number", min: 0, max: 10000 },
                      { key: "entryFeeNote", label: "Entry Fee Note", type: "text" },
                    ]}
                  />
                )}
                {(financesSubTab === 'ledger' || financesSubTab === 'payouts' || financesSubTab === 'balances') && (
                  <div className="cm-card" style={{ textAlign: "center", color: "var(--am-text-muted)", fontSize: 13, padding: 32 }}>
                    Financial ledger, payout calculator, and balance tracking — coming soon.
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════ */}
            {/* Tab: Archive */}
            {/* ══════════════════════════════════════════════════ */}
            {activeTab === 'archive' && (
              <div className="cm-col cm-fade-in">
                {/* Sub-tab strip */}
                <div className="cm-subtabs">
                  {([
                    { key: 'prior-seasons' as ArchiveSubTab, label: 'Prior Seasons' },
                    { key: 'champions'     as ArchiveSubTab, label: 'Champions' },
                    { key: 'lifecycle'     as ArchiveSubTab, label: 'Lifecycle' },
                    { key: 'finalize'      as ArchiveSubTab, label: 'Finalize 2026' },
                  ]).map(t => (
                    <button key={t.key} onClick={() => setArchiveSubTab(t.key)} className={cls("cm-tab", archiveSubTab === t.key && "active")}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {archiveSubTab === 'prior-seasons' && (
                  <div className="cm-card flush">
                    <div className="cm-section-head">
                      <div className="cm-h2">Prior Seasons</div>
                    </div>
                    <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--am-text-faint)" }}>
                      Prior season archive data will appear here. Use the Archive section of the Admin panel to import historical data.
                    </div>
                  </div>
                )}

                {archiveSubTab === 'champions' && (
                  <div className="cm-col">
                    <div className="cm-section-head" style={{ borderRadius: 6, border: "1px solid var(--am-border)", marginBottom: 0 }}>
                      <div className="cm-h2">Champions</div>
                    </div>
                    <div className="cm-grid-3">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="cm-card alt" style={{ textAlign: "center", padding: 20 }}>
                          <div className="cm-cap" style={{ marginBottom: 8 }}>Season {league.season - (3 - i)}</div>
                          <div style={{ fontSize: 28, marginBottom: 4 }}>{i === 1 ? "🏆" : i === 2 ? "🥈" : "🥉"}</div>
                          <div style={{ fontSize: 12, color: "var(--am-text-faint)" }}>—</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {archiveSubTab === 'lifecycle' && (
                  <div className="cm-card">
                    <div className="cm-h2" style={{ marginBottom: 16 }}>Season Lifecycle</div>
                    <div className="cm-row" style={{ gap: 0, overflowX: "auto" }}>
                      {(["SETUP", "DRAFT", "IN_SEASON", "PLAYOFFS", "FINALIZE", "ARCHIVED"] as const).map((phase, i, arr) => {
                        const isCurrent = gating.seasonStatus === phase || (phase === "IN_SEASON" && gating.seasonStatus === "IN_SEASON");
                        return (
                          <React.Fragment key={phase}>
                            <div style={{
                              padding: "8px 14px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                              background: isCurrent ? "color-mix(in srgb, var(--am-accent) 14%, var(--am-surface))" : "var(--am-surface-alt, var(--am-chip))",
                              color: isCurrent ? "var(--am-accent)" : "var(--am-text-faint)",
                              border: isCurrent ? "1px solid color-mix(in srgb, var(--am-accent) 35%, var(--am-border))" : "1px solid var(--am-border)",
                              whiteSpace: "nowrap",
                            }}>
                              {phase.replace("_", " ")}
                            </div>
                            {i < arr.length - 1 && (
                              <div style={{ width: 20, height: 1, background: "var(--am-border)", margin: "auto 0", flexShrink: 0 }} />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--am-text-faint)", marginTop: 12 }}>
                      Current phase: <strong style={{ color: "var(--am-text)" }}>{gating.seasonStatus ?? "No season"}</strong>
                    </div>
                  </div>
                )}

                {archiveSubTab === 'finalize' && (
                  <div className="cm-card flush">
                    <div className="cm-section-head">
                      <div className="cm-h2">Finalize {league.season}</div>
                    </div>
                    <div style={{ padding: 14 }}>
                      <SeasonManager leagueId={lid} draftMode={overview.league?.draftMode} />
                    </div>
                  </div>
                )}
              </div>
            )}

          </>
        )}
      </div>
    </div>
  );
}
