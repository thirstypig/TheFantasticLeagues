/*
 * Team — Aurora port (PR #139).
 *
 * Aurora bento layout for the team detail page. Mirrors the design's
 * TeamPageAmbient screen from the Aurora System.html bundle:
 *   - Hero card (full-width): team identity + points + cap + IL count
 *   - Hitters table (span 8): sorted by slot order
 *   - AI sidebar (span 4): weekly insights from the existing endpoint
 *   - Pitchers table (full-width)
 *
 * Data sources (all real, no mocks):
 *   - getTeams(leagueId): resolve teamCode → team metadata
 *   - getTeamDetails(teamId): roster + budget + IL slots
 *   - getTeamAiInsights(leagueId, teamId): AI weekly insights
 *
 * The legacy Team.tsx (1062 LOC of trade asset selector, watchlist
 * stars, news feeds, depth charts, weekly insights history tabs,
 * period roster viewer) is preserved at /teams/:teamCode/classic.
 * Port the deferred features into Aurora when the pilot expands.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useMatch, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DndContext } from "@dnd-kit/core";
import { useSensor, useSensors, PointerSensor, TouchSensor, KeyboardSensor } from "@dnd-kit/core";
import {
  AmbientBg, Glass, IridText, Chip, SectionLabel,
} from "../../../components/aurora/atoms";
import "../../../components/aurora/aurora.css";
import { useAuth } from "../../../auth/AuthProvider";
import { useLeague } from "../../../contexts/LeagueContext";
import { getTeams, getTeamDetails, getTeamAiInsights, getPlayerSeasonStats, getSeasonStandings } from "../../../api";
import { fetchJsonApi, API_BASE } from "../../../api/base";
import type { TeamInsightsResult, PlayerSeasonStat } from "../../../api";
import { getTeamPeriodRoster, type PeriodRosterEntry, updateRosterPosition } from "../api";
import { usePendingChanges, readPersistedChanges, clearPersistedChanges, type PendingChange } from "../hooks/usePendingChanges";
import { useRosterHubDrag } from "../hooks/useRosterHubDrag";
import {
  RosterHubV3,
  SubrouteContainer,
  type RosterHubPlayer,
  FreeAgentPanel,
  DropPool,
} from "../components/RosterHub";
import { useFreeAgents } from "../hooks/useFreeAgents";
import type { RowAction } from "../components/RosterHub/RowActionMenu";
import { toHubPlayer } from "../lib/toHubPlayer";
// Cross-feature import: roster mutations live in the transactions feature.
// Per CLAUDE.md "Cross-Feature Dependencies", this is documented in the
// project root. The v3 hub remounts these existing panels as inline sub-routes
// (per plan §0.5 refinement #2 "no modals") rather than rewriting them.
import AddDropPanel from "../../transactions/components/RosterMovesTab/AddDropPanel";
import PlaceOnIlPanel from "../../transactions/components/RosterMovesTab/PlaceOnIlPanel";
import ActivateFromIlPanel from "../../transactions/components/RosterMovesTab/ActivateFromIlPanel";
import type { RosterMovesPlayer } from "../../transactions/components/RosterMovesTab/types";

interface PeriodOption {
  id: number;
  name: string;
}

type PeriodMode = "season" | number; // "season" = cumulative; number = periodId

interface RosterPlayer {
  rosterId: number;
  /**
   * Prisma Player.id — stable DB identifier across roster mutations
   * (acquiring + dropping the same player produces a new rosterId but
   * the same playerId). Used as the key for /api/players/:id/* calls.
   */
  playerId: number;
  playerName: string;
  posPrimary?: string;
  /** Comma-separated full eligibility list ("OF,2B"). Drives multi-chip render. */
  posList?: string;
  position?: string;
  assignedPosition?: string;
  isPitcher?: boolean;
  price?: number;
  mlbTeam?: string;
  isKeeper?: boolean;
  /** Per-position GP — synthetic today, real when Player.posGames lands. */
  gamesByPos?: Record<string, number>;
  // Hitter stats (when available)
  AVG?: number | string;
  HR?: number;
  R?: number;
  RBI?: number;
  SB?: number;
  // Pitcher stats
  W?: number;
  SV?: number;
  K?: number;
  ERA?: number | string;
  WHIP?: number | string;
}

const POS_ORDER = ["C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH", "P", "SP", "RP", "IL"];
const PITCHER_POS = new Set(["P", "SP", "RP"]);

// Stable empty primitives for RosterHubV3 props that this slice doesn't
// drive (eligibility highlights). Defining at module scope avoids
// React.memo cache busts on every render.
const EMPTY_ID_SET: ReadonlySet<number> = new Set();

function posScore(p?: string) {
  if (!p) return 99;
  const i = POS_ORDER.indexOf(p);
  return i < 0 ? 50 : i;
}

function normCode(c: unknown): string {
  return String(c ?? "").trim().toUpperCase();
}

export default function Team() {
  const { teamCode } = useParams();
  const code = normCode(teamCode);
  const navigate = useNavigate();
  const { me } = useAuth();
  const authUser = me?.user;
  const { leagueId, currentLeagueName, myTeamId, leagueRules } = useLeague();

  // Sub-route detection for the manage flows. Each match flips the table
  // surface to a SubrouteContainer wrapping the existing transactions panel.
  const claimMatch = useMatch("/teams/:teamCode/manage/claim");
  const ilStashMatch = useMatch("/teams/:teamCode/manage/il-stash");
  const ilActivateMatch = useMatch("/teams/:teamCode/manage/il-activate");
  const manageMode: "claim" | "il-stash" | "il-activate" | null = claimMatch
    ? "claim"
    : ilStashMatch
    ? "il-stash"
    : ilActivateMatch
    ? "il-activate"
    : null;

  const [teamMeta, setTeamMeta] = useState<{
    id: number;
    name: string;
    code: string;
    budget?: number | null;
    ownerName?: string | null;
  } | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  // Full league player pool — fed to the transactions panels as `players`.
  // Same data the existing RosterMovesTab consumes from ActivityPage.
  const [players, setPlayers] = useState<PlayerSeasonStat[]>([]);
  const [aiInsights, setAiInsights] = useState<TeamInsightsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Selection state for the position-pill highlight. No-op for mutation in
  // this slice — the action menu drives the actual moves via sub-routes.
  const [selectedRosterId, setSelectedRosterId] = useState<number | null>(null);
  // Bumped after a panel completes successfully — re-runs the data-load
  // effect to refresh roster and stats after a mutation. Mirrors
  // ActivityPage's `loadData()` callback pattern.
  const [reloadKey, setReloadKey] = useState(0);

  // Team navigator: list of teams in the league for prev/next nav
  const [allTeams, setAllTeams] = useState<{ id: number; name: string; code: string }[]>([]);

  // Period selector: "season" = cumulative season stats (current behavior);
  // number = a specific periodId, fetched via /teams/:id/period-roster.
  const [periodMode, setPeriodMode] = useState<PeriodMode>("season");
  const [periodOptions, setPeriodOptions] = useState<PeriodOption[]>([]);
  const [periodRoster, setPeriodRoster] = useState<PeriodRosterEntry[] | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);

  // Resolve teamCode → team metadata + DB id, then load roster + AI.
  useEffect(() => {
    if (!leagueId || !code) return;
    let canceled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // getTeams returns the teams array directly (unwrapped from
        // the response envelope). Don't `.teams` on it.
        const teamsList = await getTeams(leagueId);
        if (canceled) return;
        // Cache the team list for the navigator
        setAllTeams(
          (teamsList ?? [])
            .map((t: any) => ({ id: t.id, name: t.name, code: t.code ?? "" }))
            .filter(t => t.code)
        );
        const team = (teamsList ?? []).find((t: any) => normCode(t.code) === code);
        if (!team) {
          setError(`Team "${code}" not found in league.`);
          setLoading(false);
          return;
        }
        setTeamMeta({
          id: team.id,
          name: team.name,
          code: team.code ?? code,
          budget: team.budget,
          ownerName: team.ownerUser?.name || team.ownerUser?.email || team.owner || null,
        });

        // Roster comes from getTeamDetails (currentRoster: [{id, playerId,
        // name, posPrimary, price}]). We then enrich with stats from
        // getPlayerSeasonStats which carries the league pool with
        // assignedPosition + per-stat numbers. Match by mlb_id where
        // possible, fallback to playerId joined against (id) field.
        const [detailsRes, aiRes, statsRes] = await Promise.allSettled([
          getTeamDetails(team.id),
          getTeamAiInsights(leagueId, team.id),
          getPlayerSeasonStats(leagueId),
        ]);
        if (canceled) return;

        if (detailsRes.status === "fulfilled") {
          const raw = detailsRes.value.currentRoster ?? [];
          const stats = statsRes.status === "fulfilled" ? statsRes.value : ([] as PlayerSeasonStat[]);
          // Cache the full league pool for the transactions panels — same
          // shape ActivityPage hands to RosterMovesTab.
          setPlayers(stats);
          // Index stats by Prisma player id (the integer foreign key on
          // the Roster row) — the only stable identifier available on
          // both sides without going through mlb_id casting.
          const statsByPid = new Map<number, PlayerSeasonStat>();
          for (const s of stats) {
            const pid = (s as unknown as { id?: number }).id;
            if (pid) statsByPid.set(pid, s);
          }

          const players: RosterPlayer[] = raw.map((row) => {
            const stat = statsByPid.get(row.playerId);
            // assignedPosition is only present on stat rows enriched
            // by the league pool's roster join; fall back to posPrimary
            // when missing (free-agent or stat sync hasn't run yet).
            const assigned = (stat as any)?.assignedPosition || row.posPrimary;
            return {
              rosterId: row.id,
              playerId: row.playerId,
              playerName: row.name,
              posPrimary: row.posPrimary,
              // posList is the full eligibility list (e.g. "OF,2B"). Server
              // started exposing it on TeamDetailResponse alongside posPrimary
              // — falling back to posPrimary keeps single-position players
              // rendering cleanly when posList is null.
              posList: row.posList || row.posPrimary,
              position: row.posPrimary,
              assignedPosition: assigned,
              isPitcher: PITCHER_POS.has(assigned || row.posPrimary || ""),
              price: row.price,
              mlbTeam: row.mlbTeam || (stat as any)?.mlb_team || (stat as any)?.mlbTeam || undefined,
              isKeeper: row.isKeeper ?? (stat as any)?.isKeeper,
              gamesByPos: row.gamesByPos,
              AVG: (stat as any)?.AVG,
              HR: (stat as any)?.HR,
              R: (stat as any)?.R,
              RBI: (stat as any)?.RBI,
              SB: (stat as any)?.SB,
              W: (stat as any)?.W,
              SV: (stat as any)?.SV,
              K: (stat as any)?.K,
              ERA: (stat as any)?.ERA,
              WHIP: (stat as any)?.WHIP,
            };
          });
          setRoster(players);
        }

        if (aiRes.status === "fulfilled") {
          setAiInsights(aiRes.value);
        }
      } catch (err) {
        if (canceled) return;
        setError(err instanceof Error ? err.message : "Failed to load team");
      } finally {
        if (!canceled) setLoading(false);
      }
    })();

    return () => { canceled = true; };
  }, [leagueId, code, reloadKey]);

  // Fetch period list for the league (one-shot per league change)
  useEffect(() => {
    if (!leagueId) return;
    let canceled = false;
    getSeasonStandings(leagueId)
      .then(s => {
        if (canceled) return;
        const ids = s.periodIds ?? [];
        const names = s.periodNames ?? [];
        const opts: PeriodOption[] = ids.map((id, i) => ({ id, name: names[i] || `Period ${i + 1}` }));
        setPeriodOptions(opts);
      })
      .catch(() => { /* non-fatal: period selector won't show */ });
    return () => { canceled = true; };
  }, [leagueId]);

  // Fetch period-specific roster when a period is selected
  useEffect(() => {
    if (periodMode === "season" || !teamMeta?.id) {
      setPeriodRoster(null);
      return;
    }
    let canceled = false;
    setPeriodLoading(true);
    getTeamPeriodRoster(teamMeta.id, periodMode)
      .then(res => { if (!canceled) setPeriodRoster(res.roster); })
      .catch(() => { if (!canceled) setPeriodRoster([]); })
      .finally(() => { if (!canceled) setPeriodLoading(false); });
    return () => { canceled = true; };
  }, [periodMode, teamMeta?.id]);

  // Map periodRoster (when in period mode) onto the same RosterPlayer shape
  // as the season roster — so hitters/pitchers memos work uniformly.
  const displayRoster: RosterPlayer[] = useMemo(() => {
    if (periodMode === "season" || !periodRoster) return roster;
    return periodRoster.map(r => {
      const ps = r.periodStats || {};
      const isPitcher = PITCHER_POS.has((r.assignedPosition || r.posPrimary || "").toUpperCase());
      // Compute derived stats client-side (route returns raw counts)
      const ab = Number(ps.AB) || 0;
      const h = Number(ps.H) || 0;
      const ip = Number(ps.IP) || 0;
      const er = Number(ps.ER) || 0;
      const bbH = Number(ps.BB_H) || 0;
      const avg = ab > 0 ? h / ab : 0;
      const era = ip > 0 ? (er / ip) * 9 : 0;
      const whip = ip > 0 ? bbH / ip : 0;
      return {
        rosterId: r.id,
        playerId: r.playerId,
        playerName: r.name,
        posPrimary: r.posPrimary,
        position: r.posPrimary,
        assignedPosition: r.assignedPosition || r.posPrimary,
        isPitcher,
        price: r.price,
        mlbTeam: r.mlbTeam ?? undefined,
        AVG: avg,
        HR: Number(ps.HR) || 0,
        R: Number(ps.R) || 0,
        RBI: Number(ps.RBI) || 0,
        SB: Number(ps.SB) || 0,
        W: Number(ps.W) || 0,
        SV: Number(ps.SV) || 0,
        K: Number(ps.K) || 0,
        ERA: era,
        WHIP: whip,
      };
    });
  }, [periodMode, periodRoster, roster]);

  // Team navigator helpers — sort allTeams by name; resolve prev/next.
  const sortedTeams = useMemo(
    () => [...allTeams].sort((a, b) => a.name.localeCompare(b.name)),
    [allTeams]
  );
  const currentIdx = sortedTeams.findIndex(t => normCode(t.code) === code);
  const prevTeam = currentIdx > 0 ? sortedTeams[currentIdx - 1] : null;
  const nextTeam = currentIdx >= 0 && currentIdx < sortedTeams.length - 1 ? sortedTeams[currentIdx + 1] : null;

  const hitters = useMemo(() =>
    displayRoster.filter(p => !p.isPitcher && p.assignedPosition !== "IL")
      .sort((a, b) => {
        const da = posScore(a.assignedPosition || a.posPrimary);
        const db = posScore(b.assignedPosition || b.posPrimary);
        if (da !== db) return da - db;
        return (b.price ?? 0) - (a.price ?? 0);
      }),
    [displayRoster]);

  const pitchers = useMemo(() =>
    displayRoster.filter(p => p.isPitcher && p.assignedPosition !== "IL")
      .sort((a, b) => {
        // SP before RP, then price desc
        const ap = a.assignedPosition || a.posPrimary || "";
        const bp = b.assignedPosition || b.posPrimary || "";
        if (ap !== bp) return ap.localeCompare(bp);
        return (b.price ?? 0) - (a.price ?? 0);
      }),
    [displayRoster]);

  const ilPlayers = useMemo(() =>
    displayRoster.filter(p => p.assignedPosition === "IL"),
    [displayRoster]);

  const ilCount = ilPlayers.length;

  // RosterHubV3 plumbing — toHubPlayer is extracted to ../lib/toHubPlayer
  // so the mapping is unit-testable in isolation. See its docblock for
  // the contracts it pins down (playerId stability, posList fallback,
  // assignedSlot canonicalization, role-aware stats).
  const baselineHubHitters = useMemo(() => hitters.map(toHubPlayer), [hitters]);
  const baselineHubPitchers = useMemo(() => pitchers.map(toHubPlayer), [pitchers]);
  const hubIl = useMemo(() => ilPlayers.map(toHubPlayer), [ilPlayers]);

  // Permission gating mirrors ActivityPage — owner OR commissioner OR admin
  // can mutate; everyone else gets a view-only hub (no action menus).
  const isCommissioner = !!(authUser?.isAdmin ||
    authUser?.memberships?.some(
      (m: { leagueId: string | number; role: string }) =>
        Number(m.leagueId) === leagueId && m.role === "COMMISSIONER",
    ));
  const isOwnerSelfServe =
    leagueRules?.transactions?.owner_self_serve === "true";
  const canManage =
    !!authUser?.isAdmin ||
    isCommissioner ||
    (isOwnerSelfServe && teamMeta?.id === myTeamId);

  // Build the row action menu. Empty array = no "..." trigger renders
  // (RosterRowV3/MobileRowV3 hide it when actions.length === 0). Drop is
  // commissioner-only IL drop and is deferred per design preview note.
  const buildActions = useCallback((p: RosterHubPlayer): RowAction[] => {
    if (!canManage) return [];
    const onIl = p.assignedSlot === "IL";
    if (onIl) {
      return [{
        key: "activate-il",
        label: "Activate from IL",
        glyph: "→",
        onSelect: () => navigate(`/teams/${code}/manage/il-activate`),
      }];
    }
    return [
      {
        key: "claim",
        label: "Add free agent (drop this)",
        glyph: "+",
        onSelect: () => navigate(`/teams/${code}/manage/claim`),
      },
      {
        key: "il-stash",
        label: "Place on IL",
        glyph: "✚",
        onSelect: () => navigate(`/teams/${code}/manage/il-stash`),
      },
    ];
  }, [canManage, navigate, code]);

  // Pill-click selection is display-only in this slice — the visual
  // highlight signals "this row is the focus" but no mutation is queued
  // (drag-to-mutate is the new mutation entry point for swaps).
  const onPillClick = useCallback((rosterId: number) => {
    setSelectedRosterId(prev => (prev === rosterId ? null : rosterId));
  }, []);

  /* ── Pending changes (Hub scenario: swap only) ────────────────────── */

  // Save fn: serialize pending swaps to PATCH /api/teams/:teamId/roster/:rosterId
  // calls. Atomicity per direction-lock #4: if any single mutation fails,
  // we fail the whole batch and keep the queue in place so the user can
  // retry. We don't rollback successful mutations — the server-side
  // matcher handles that on the next save attempt by reading current
  // assignedPosition values.
  const saveFn = useCallback(async (changes: PendingChange[]) => {
    if (!teamMeta?.id) throw new Error("Team not loaded");
    if (!leagueId) throw new Error("League not loaded");
    const tid = teamMeta.id;
    // Atomic-on-failure (FA-#4 inherits from Hub-#4): each entry runs
    // sequentially; first failure throws and aborts the rest. Earlier
    // successful mutations are NOT rolled back — server matcher reads
    // current state on the next save attempt, so a retry resumes safely.
    for (const change of changes) {
      if (change.kind === "swap") {
        try {
          await updateRosterPosition(tid, change.from.rosterId, change.to.slot);
          await updateRosterPosition(tid, change.to.rosterId, change.from.slot);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Save failed";
          throw new Error(`Save failed on ${change.from.slot} ↔ ${change.to.slot}: ${msg}`);
        }
        continue;
      }
      if (change.kind === "fa_add") {
        // FA scenario save: dispatch to the existing /transactions/claim
        // endpoint. Server's bipartite matcher resolves slots; we only
        // need to send mlbId + dropPlayerId (the displaced roster
        // player's playerId). Mirrors AddDropPanel's wire shape.
        try {
          await fetchJsonApi(`${API_BASE}/transactions/claim`, {
            method: "POST",
            body: JSON.stringify({
              leagueId,
              teamId: tid,
              mlbId: String(change.mlbId),
              ...(change.playerId ? { playerId: change.playerId } : {}),
              dropPlayerId: change.displaced.playerId,
            }),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Save failed";
          throw new Error(`Save failed on add ${change.faName} · drop ${change.displaced.name}: ${msg}`);
        }
        continue;
      }
    }
    // Refresh the roster on success so the UI snaps to the canonical
    // server state (and any matcher-driven cascades show up).
    setReloadKey(k => k + 1);
  }, [teamMeta?.id, leagueId]);

  const pending = usePendingChanges({
    teamId: teamMeta?.id ?? null,
    saveFn,
  });

  // Apply pending swaps to the displayed hub roster optimistically.
  // The baseline hub arrays come from the server roster; we walk the
  // pending changes and swap assignedSlot / slotInstance pairs.
  const { hubHitters, hubPitchers } = useMemo(() => {
    if (pending.state.changes.length === 0) {
      return { hubHitters: baselineHubHitters, hubPitchers: baselineHubPitchers };
    }
    const all = [...baselineHubHitters, ...baselineHubPitchers];
    type MutableHubPlayer = {
      -readonly [K in keyof RosterHubPlayer]: RosterHubPlayer[K];
    };
    const byId = new Map<number, MutableHubPlayer>(
      all.map((p) => [p.rosterId, { ...p } as MutableHubPlayer]),
    );
    for (const c of pending.state.changes) {
      if (c.kind !== "swap") continue;
      const a = byId.get(c.from.rosterId);
      const b = byId.get(c.to.rosterId);
      if (!a || !b) continue;
      const aSlot = a.assignedSlot;
      const aInst = a.slotInstance;
      a.assignedSlot = b.assignedSlot;
      a.slotInstance = b.slotInstance;
      b.assignedSlot = aSlot;
      b.slotInstance = aInst;
    }
    const next: RosterHubPlayer[] = Array.from(byId.values());
    return {
      hubHitters: next.filter((p) => !p.isPitcher),
      hubPitchers: next.filter((p) => p.isPitcher),
    };
  }, [pending.state.changes, baselineHubHitters, baselineHubPitchers]);

  // Set of rosterIds that have a pending change targeting them.
  const pendingRosterIds = useMemo<ReadonlySet<number>>(() => {
    const out = new Set<number>();
    for (const c of pending.state.changes) {
      if (c.kind !== "swap") continue;
      out.add(c.from.rosterId);
      out.add(c.to.rosterId);
    }
    return out;
  }, [pending.state.changes]);

  // Drag wiring — feed it the FULL active roster (hitters+pitchers, not IL)
  // so eligibility checks see all candidate slots.
  const dragPlayers = useMemo(() => [...hubHitters, ...hubPitchers], [hubHitters, hubPitchers]);

  // Tiny ephemeral toast for illegal drops. Kept inline (not the global
  // error bus) because it's purely a UX nudge, not a real error.
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 2200);
  }, []);
  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  /* ── FA panel (FA scenario) ────────────────────────────────────── */

  const [faPanelOpen, setFaPanelOpen] = useState(false);
  // Only fetch when both: panel is open AND user can manage. Read-only
  // visitors don't need the FA pool fetched against their session.
  const faFetchEnabled = faPanelOpen && canManage && !!leagueId;
  const fa = useFreeAgents(faFetchEnabled ? leagueId : null);

  const drag = useRosterHubDrag({
    players: dragPlayers,
    freeAgents: fa.data ?? undefined,
    onSwap: (change) => pending.addChange(change),
    onFaAdd: (change) => pending.addChange(change),
    onToast: showToast,
  });

  // Per-row revert: drop the change(s) referencing this rosterId.
  // Both swap and fa_add can reference a roster row (swap on either
  // endpoint, fa_add on its `displaced` rosterId).
  const onRowRevert = useCallback(
    (rosterId: number) => {
      const ids = pending.state.changes
        .filter((c) => {
          if (c.kind === "swap") {
            return c.from.rosterId === rosterId || c.to.rosterId === rosterId;
          }
          if (c.kind === "fa_add") {
            return c.displaced.rosterId === rosterId;
          }
          return false;
        })
        .map((c) => c.id);
      for (const id of ids) pending.revertChange(id);
    },
    [pending],
  );

  // Drop pool rows — one per fa_add change. Hidden when no fa_adds
  // are queued (DropPool returns null on empty).
  const dropPoolRows = useMemo(() => {
    return pending.state.changes
      .filter((c): c is Extract<PendingChange, { kind: "fa_add" }> => c.kind === "fa_add")
      .map((c) => ({
        changeId: c.id,
        rosterId: c.displaced.rosterId,
        playerId: c.displaced.playerId,
        name: c.displaced.name,
        faName: c.faName,
        slot: String(c.displaced.slot),
      }));
  }, [pending.state.changes]);

  // PendingChangeBar items list — one row per change with kind-specific
  // badge (FA scenario: extends the bar from count-only to itemized).
  const pendingItems = useMemo(() => {
    return pending.state.changes.map((c) => {
      if (c.kind === "swap") {
        return { id: c.id, kind: "swap" as const, text: `${c.from.slot} ↔ ${c.to.slot}` };
      }
      return {
        id: c.id,
        kind: "fa_add" as const,
        text: `Add ${c.faName} · drop ${c.displaced.name}`,
      };
    });
  }, [pending.state.changes]);

  /* ── localStorage restore prompt ──────────────────────────────────── */

  const [restorePrompt, setRestorePrompt] = useState<{
    teamId: number;
    changes: PendingChange[];
  } | null>(null);
  const restoreCheckedRef = useRef<number | null>(null);
  useEffect(() => {
    const tid = teamMeta?.id;
    if (!tid || restoreCheckedRef.current === tid) return;
    // Only check once per team load.
    restoreCheckedRef.current = tid;
    const persisted = readPersistedChanges(tid);
    if (persisted && persisted.length > 0) {
      setRestorePrompt({ teamId: tid, changes: persisted });
    }
  }, [teamMeta?.id]);

  const onRestorePending = useCallback(() => {
    if (!restorePrompt) return;
    for (const c of restorePrompt.changes) pending.addChange(c);
    setRestorePrompt(null);
  }, [restorePrompt, pending]);

  const onDiscardPersisted = useCallback(() => {
    if (restorePrompt) clearPersistedChanges(restorePrompt.teamId);
    setRestorePrompt(null);
  }, [restorePrompt]);

  /* ── Navigate-away guard ──────────────────────────────────────────── */

  // Browser-level: beforeunload prompt when the queue isn't empty AND not saving.
  useEffect(() => {
    if (pending.state.changes.length === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore the message string; setting returnValue
      // is what triggers the native confirm dialog.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [pending.state.changes.length]);

  // dnd-kit sensor setup for the DndContext wrapping the hub.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // Sub-route exit — return to the Team page top-level URL.
  const onBackToRoster = useCallback(() => {
    navigate(`/teams/${code}`);
  }, [navigate, code]);

  // Panel `onComplete` — bump reloadKey to refetch roster + stats. Then
  // navigate back to the table so the user sees the new state immediately.
  const onPanelComplete = useCallback(() => {
    setReloadKey(k => k + 1);
    navigate(`/teams/${code}`);
  }, [navigate, code]);

  const totalSpent = useMemo(() =>
    displayRoster.reduce((s, p) => s + (p.price ?? 0), 0),
    [displayRoster]);
  void totalSpent; // displayed cap was removed; keep computed for forward-compat

  const isMyTeam = teamMeta?.id === myTeamId;

  return (
    <div className="aurora-theme">
      <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden", color: "var(--am-text)" }}>
        <AmbientBg />

        <div
          style={{
            position: "relative",
            zIndex: 10,
            padding: "32px 28px 80px",
            display: "grid",
            gridTemplateColumns: "repeat(12, 1fr)",
            gridAutoRows: "minmax(0, auto)",
            gap: 14,
            maxWidth: 1400,
            margin: "0 auto",
          }}
        >
          {/* HERO */}
          <div style={{ gridColumn: "span 12" }}>
            <Glass strong style={{ borderRadius: 25, padding: 22 }}>
              <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr auto auto", alignItems: "center", gap: 14 }}>
                {/* Team navigator: prev chevron */}
                <button
                  type="button"
                  onClick={() => prevTeam && navigate(`/teams/${prevTeam.code}`)}
                  disabled={!prevTeam}
                  aria-label={prevTeam ? `Previous team: ${prevTeam.name}` : "Previous team (none)"}
                  title={prevTeam ? `← ${prevTeam.name}` : undefined}
                  style={{
                    width: 36, height: 36, borderRadius: 99,
                    background: "var(--am-chip)", border: "1px solid var(--am-border)",
                    color: "var(--am-text)", cursor: prevTeam ? "pointer" : "not-allowed",
                    opacity: prevTeam ? 1 : 0.4,
                    display: "grid", placeItems: "center", padding: 0,
                  }}
                >
                  <ChevronLeft size={16} />
                </button>
                <div
                  style={{
                    width: 76, height: 76, borderRadius: 18,
                    background: "var(--am-irid)",
                    display: "grid", placeItems: "center",
                    fontFamily: "var(--am-display)", fontSize: 28, fontWeight: 600, color: "#fff",
                    boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
                  }}
                >
                  {teamMeta?.name
                    ? teamMeta.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase()
                    : "—"}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <SectionLabel style={{ marginBottom: 0 }}>
                      {currentLeagueName || "League"}
                    </SectionLabel>
                    {isMyTeam && <Chip strong>Your team</Chip>}
                    {teamMeta?.ownerName && <Chip>{teamMeta.ownerName}</Chip>}
                  </div>
                  <div style={{ fontFamily: "var(--am-display)", fontSize: 38, lineHeight: 1, letterSpacing: -0.4 }}>
                    {teamMeta?.name ?? (loading ? "Loading…" : "Team not found")}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: "var(--am-text-muted)" }}>
                    {hitters.length} hitter{hitters.length === 1 ? "" : "s"} · {pitchers.length} pitcher{pitchers.length === 1 ? "" : "s"} · {ilCount} IL
                    {periodMode !== "season" && (
                      <> · <span style={{ color: "var(--am-accent)" }}>{periodOptions.find(p => p.id === periodMode)?.name ?? "Period"}</span></>
                    )}
                  </div>
                </div>
                <Link
                  to="/teams"
                  style={{
                    fontSize: 11, color: "var(--am-text-muted)", textDecoration: "none",
                    padding: "6px 10px", borderRadius: 99,
                    border: "1px solid var(--am-border)", background: "var(--am-chip)",
                  }}
                >
                  All teams →
                </Link>
                {/* Team navigator: next chevron */}
                <button
                  type="button"
                  onClick={() => nextTeam && navigate(`/teams/${nextTeam.code}`)}
                  disabled={!nextTeam}
                  aria-label={nextTeam ? `Next team: ${nextTeam.name}` : "Next team (none)"}
                  title={nextTeam ? `${nextTeam.name} →` : undefined}
                  style={{
                    width: 36, height: 36, borderRadius: 99,
                    background: "var(--am-chip)", border: "1px solid var(--am-border)",
                    color: "var(--am-text)", cursor: nextTeam ? "pointer" : "not-allowed",
                    opacity: nextTeam ? 1 : 0.4,
                    display: "grid", placeItems: "center", padding: 0,
                  }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Period selector pills — Cumulative season + each period */}
              {periodOptions.length > 0 && (
                <div style={{ marginTop: 14, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--am-text-faint)", marginRight: 4 }}>
                    View
                  </span>
                  {[{ key: "season" as const, label: "Cumulative" }, ...periodOptions.map(p => ({ key: p.id, label: p.name }))].map((opt) => {
                    const isActive = periodMode === opt.key;
                    return (
                      <button
                        key={String(opt.key)}
                        type="button"
                        onClick={() => setPeriodMode(opt.key)}
                        style={{
                          padding: "5px 12px", borderRadius: 99,
                          fontSize: 11, fontWeight: 600, letterSpacing: 0.2,
                          background: isActive ? "var(--am-chip-strong)" : "var(--am-chip)",
                          color: isActive ? "var(--am-text)" : "var(--am-text-muted)",
                          border: "1px solid " + (isActive ? "var(--am-border-strong)" : "var(--am-border)"),
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                  {periodLoading && (
                    <span style={{ fontSize: 11, color: "var(--am-text-faint)", marginLeft: 6 }}>loading…</span>
                  )}
                </div>
              )}
            </Glass>
          </div>

          {error && (
            <div style={{ gridColumn: "span 12" }}>
              <Glass>
                <div style={{ padding: 16, color: "var(--am-negative)", fontSize: 12 }}>
                  {error}
                </div>
              </Glass>
            </div>
          )}

          {/* ROSTER — v3 hub with merged hitter/pitcher table OR sub-route
              container when a manage flow is active. Span 8 keeps the
              AI sidebar at span 4 alongside (matches the legacy layout). */}
          <div style={{ gridColumn: "span 8" }}>
            {manageMode ? (
              <SubrouteContainer
                title={
                  manageMode === "claim"
                    ? "Add free agent"
                    : manageMode === "il-stash"
                    ? "Place on IL"
                    : "Activate from IL"
                }
                blurb={
                  manageMode === "claim"
                    ? "Pick a free agent and the player on your roster they'll replace. Auto-resolve handles slot conflicts."
                    : manageMode === "il-stash"
                    ? "Move an injured player to your IL slot and bring in a replacement at their vacated position."
                    : "Return a player from IL and pick an active-roster player to drop in their place."
                }
                onBack={onBackToRoster}
              >
                {!canManage ? (
                  <div style={{ padding: 16, color: "var(--am-text-muted)", fontSize: 12 }}>
                    Roster transactions on this team are not available to you.
                  </div>
                ) : !leagueId || !teamMeta ? (
                  <div style={{ padding: 16, color: "var(--am-text-faint)", fontSize: 12 }}>Loading…</div>
                ) : manageMode === "claim" ? (
                  <AddDropPanel
                    leagueId={leagueId}
                    teamId={teamMeta.id}
                    players={players as unknown as RosterMovesPlayer[]}
                    onComplete={onPanelComplete}
                  />
                ) : manageMode === "il-stash" ? (
                  <PlaceOnIlPanel
                    leagueId={leagueId}
                    teamId={teamMeta.id}
                    players={players as unknown as RosterMovesPlayer[]}
                    onComplete={onPanelComplete}
                  />
                ) : (
                  <ActivateFromIlPanel
                    leagueId={leagueId}
                    teamId={teamMeta.id}
                    players={players as unknown as RosterMovesPlayer[]}
                    onComplete={onPanelComplete}
                  />
                )}
              </SubrouteContainer>
            ) : (
              <DndContext
                sensors={dndSensors}
                onDragStart={drag.handleDragStart}
                onDragEnd={drag.handleDragEnd}
                onDragCancel={drag.handleDragCancel}
              >
                {/* FA scenario "+ Add free agent" affordance. Disabled
                    while a save is in flight; same hub action surface,
                    so the FA panel slides in alongside the roster
                    rather than navigating away from it. */}
                {canManage && (
                  <div style={{ marginBottom: 10, display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => setFaPanelOpen((v) => !v)}
                      disabled={pending.state.saving}
                      aria-pressed={faPanelOpen}
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "8px 14px",
                        borderRadius: 10,
                        border: "1px solid var(--am-border-strong)",
                        background: faPanelOpen ? "var(--am-chip-strong)" : "var(--am-chip)",
                        color: "var(--am-text)",
                        cursor: pending.state.saving ? "not-allowed" : "pointer",
                        opacity: pending.state.saving ? 0.5 : 1,
                        minHeight: 36,
                      }}
                    >
                      {faPanelOpen ? "Close free agents" : "+ Add free agent"}
                    </button>
                  </div>
                )}
                <RosterHubV3
                  hitters={hubHitters}
                  pitchers={hubPitchers}
                  ilPlayers={hubIl}
                  selectedRosterId={selectedRosterId}
                  eligibleRosterIds={drag.dropTargetIds}
                  pendingRosterIds={pendingRosterIds}
                  pendingCount={pending.state.changes.length}
                  dimSection={drag.dimSection}
                  showSelectionBanner={false}
                  onPillClick={onPillClick}
                  buildActions={buildActions}
                  onRevert={onRowRevert}
                  onRevertAll={pending.revertAll}
                  onSave={pending.save}
                  saving={pending.state.saving}
                  saveError={pending.state.error}
                  onDismissError={pending.clearError}
                  pendingItems={pendingItems}
                  onRevertItem={pending.revertChange}
                  dropPoolSlot={
                    <DropPool rows={dropPoolRows} onRestore={pending.revertChange} />
                  }
                  dndEnabled={canManage}
                  shakeRowId={drag.shakeRowId}
                />
                {faPanelOpen && leagueId && teamMeta && (
                  <FreeAgentPanel
                    leagueId={leagueId}
                    teamId={teamMeta.id}
                    isOpen={faPanelOpen}
                    onClose={() => setFaPanelOpen(false)}
                  />
                )}
              </DndContext>
            )}

            {/* Drag toast — illegal drops + restore prompt notifications. */}
            {toastMsg && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  position: "fixed",
                  bottom: 24,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "var(--am-surface-strong)",
                  border: "1px solid var(--am-border-strong)",
                  borderRadius: 12,
                  padding: "10px 16px",
                  fontSize: 13,
                  color: "var(--am-text)",
                  backdropFilter: "blur(20px) saturate(160%)",
                  WebkitBackdropFilter: "blur(20px) saturate(160%)",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                  zIndex: 100,
                }}
              >
                {toastMsg}
              </div>
            )}

            {/* localStorage restore prompt — appears once per team load
                when persisted pending changes are within the 1hr TTL. */}
            {restorePrompt && (
              <Glass strong style={{ marginTop: 12, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13, color: "var(--am-text)" }}>
                    Restore {restorePrompt.changes.length} pending change{restorePrompt.changes.length === 1 ? "" : "s"} from earlier?
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={onDiscardPersisted}
                      style={{
                        fontSize: 12, fontWeight: 600, padding: "6px 12px",
                        borderRadius: 8, border: "1px solid var(--am-border)",
                        background: "transparent", color: "var(--am-text-muted)", cursor: "pointer",
                      }}
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      onClick={onRestorePending}
                      style={{
                        fontSize: 12, fontWeight: 600, padding: "6px 14px",
                        borderRadius: 8, border: "1px solid transparent",
                        background: "var(--am-irid)", color: "#fff", cursor: "pointer",
                      }}
                    >
                      Restore
                    </button>
                  </div>
                </div>
              </Glass>
            )}
          </div>

          {/* AI SIDEBAR */}
          <div style={{ gridColumn: "span 4" }}>
            <Glass strong>
              <SectionLabel>✦ Lineup intelligence</SectionLabel>
              {aiInsights?.insights?.length ? (
                <>
                  {aiInsights.overallGrade && (
                    <div style={{ marginTop: 4, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>Overall grade</span>
                      <IridText size={20}>{aiInsights.overallGrade}</IridText>
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {aiInsights.insights.slice(0, 4).map((r, i) => (
                      <div
                        key={i}
                        style={{
                          padding: 10,
                          borderRadius: 12,
                          background: "var(--am-surface-faint)",
                          border: "1px solid var(--am-border)",
                        }}
                      >
                        <div style={{ fontSize: 10, color: "var(--am-text-faint)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 2 }}>
                          {r.category}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--am-text)" }}>{r.title}</div>
                        {r.detail && (
                          <div style={{ fontSize: 11, color: "var(--am-text-muted)", marginTop: 2, lineHeight: 1.45 }}>
                            {r.detail}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ marginTop: 4, fontSize: 12, color: "var(--am-text-faint)", lineHeight: 1.5 }}>
                  AI insights for this team haven't been generated this week. Check the AI Hub for league-wide recommendations.
                </div>
              )}
              <div style={{ marginTop: 14 }}>
                <Link to="/ai" style={{ textDecoration: "none" }}>
                  <Chip strong>Open AI Hub →</Chip>
                </Link>
              </div>
            </Glass>
          </div>

          {/* Pitchers section is now inside RosterHubV3 (consolidated table)
              per plan §0.5 refinement #1. The separate Glass block was
              removed when the v3 hub took over the roster surface. */}

          {/* Legacy escape hatch */}
          <div style={{ gridColumn: "span 12", textAlign: "center", marginTop: 4 }}>
            <Link
              to={`/teams/${code}/classic`}
              style={{ fontSize: 11, color: "var(--am-text-faint)", textDecoration: "none", letterSpacing: 0.5 }}
            >
              Need watchlist, trade asset selector, or weekly insights history? View classic Team page →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// Old `RosterTable`, `fmtAvg`, `fmtRate` helpers were removed when v3
// took over the roster surface — `RosterRowV3` owns its own formatting.
