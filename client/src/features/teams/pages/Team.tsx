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
import { Link, useMatch, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DndContext } from "@dnd-kit/core";
import { useSensor, useSensors, PointerSensor, TouchSensor, KeyboardSensor } from "@dnd-kit/core";
import {
  AmbientBg, Glass, IridText, Chip, SectionLabel,
} from "../../../components/aurora/atoms";
import "../../../components/aurora/aurora.css";
import { useAuth } from "../../../auth/AuthProvider";
import { useLeague } from "../../../contexts/LeagueContext";
import { getTeams, getTeamAiInsights, getTeamRosterHub, getSeasonStandings } from "../../../api";
import { fetchJsonApi, API_BASE } from "../../../api/base";
import { DataFreshness } from "../../../components/shared/DataFreshness";
import WatchlistPanel from "../../watchlist/components/WatchlistPanel";
import TradingBlockPanel from "../../trading-block/components/TradingBlockPanel";
import { getTeamAiInsightsHistory, type WeeklyInsightEntry } from "../api";
import type { TeamInsightsResult } from "../../../api";
import { getTeamPeriodRoster, type PeriodRosterEntry, updateRosterPosition } from "../api";
import {
  usePendingChanges,
  readPersistedChanges,
  clearPersistedChanges,
  kindBreakdown,
  describeKindBreakdown,
  type PendingChange,
} from "../hooks/usePendingChanges";
import { useRosterHubDrag, isMlbIlStatusUi } from "../hooks/useRosterHubDrag";
import { ilStash, ilActivate, syncIlStatus } from "../../transactions/api";
import {
  RosterHubV3,
  SubrouteContainer,
  type RosterHubPlayer,
  FreeAgentPanel,
  DropPool,
  SaveDiffPreviewModal,
  type DiffRow,
} from "../components/RosterHub";
import { useFreeAgents } from "../hooks/useFreeAgents";
import type { RowAction } from "../components/RosterHub/RowActionMenu";
import { toHubPlayer, hubPlayerCacheKey } from "../lib/toHubPlayer";
// Cross-feature import: roster mutations live in the transactions feature.
// Per CLAUDE.md "Cross-Feature Dependencies", this is documented in the
// project root. The v3 hub remounts these existing panels as inline sub-routes
// (per plan §0.5 refinement #2 "no modals") rather than rewriting them.
import AddDropPanel from "../../transactions/components/RosterMovesTab/AddDropPanel";
import PlaceOnIlPanel from "../../transactions/components/RosterMovesTab/PlaceOnIlPanel";
import ActivateFromIlPanel from "../../transactions/components/RosterMovesTab/ActivateFromIlPanel";
import type { RosterMovesPlayer } from "../../transactions/components/RosterMovesTab/types";
import { loadRosterMovePlayers } from "../../transactions/lib/loadRosterMovePlayers";
import type { RosterHubRow } from "@shared/api/teams";

interface PeriodOption {
  id: number;
  name: string;
}

type PeriodMode = "season" | number; // "season" = cumulative; number = periodId

/**
 * The Team page composes its row shape from `getTeamDetails` +
 * `getPlayerSeasonStats` joined client-side, but the resulting object is the
 * same shape that `TeamService.getTeamRosterHub` emits server-side. Per
 * todo #160 the row type lives in `shared/api/teams.ts` so any drift between
 * the page's local composer and the server endpoint becomes a compile error
 * (rather than an under-declared local interface that masks missing fields).
 *
 * We extend the shared row with display-only fields that exist only on the
 * page side: `mlbId` for player-detail-modal lookups, `mlbStatusDaysAgo` for
 * the ghost-IL chip body (computed page-side from the freshness signal), and
 * the loose `string | undefined` shape for rate stats so legacy formatters
 * that emit pre-formatted strings still typecheck.
 */
type RosterPlayer = Omit<
  RosterHubRow,
  "posPrimary" | "posList" | "position" | "assignedPosition" | "mlbStatus" | "isKeeper" | "isPitcher"
  | "AVG" | "ERA" | "WHIP" | "IP"
> & {
  /** Stable MLB API id when present; null for filler/synthetic players. */
  mlbId?: number | null;
  posPrimary?: string;
  posList?: string;
  position?: string;
  assignedPosition?: string;
  /** Optional on the page side — getTeamDetails may not pre-classify. */
  isPitcher?: boolean;
  isKeeper?: boolean;
  /** Raw MLB statsapi status; verbatim per direction-lock IL #1. */
  mlbStatus?: string | null;
  /** Days since `mlbStatus` was observed — drives ghost-IL chip body. */
  mlbStatusDaysAgo?: number;
  /** Rate stats may already be pre-formatted strings from legacy paths. */
  AVG?: number | string;
  IP?: number | string;
  ERA?: number | string;
  WHIP?: number | string;
};

type HubPlayerCacheEntry = {
  key: string;
  player: RosterHubPlayer;
};

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

// Per todo #162.2 — `hubPlayerCacheKey` now lives in `../lib/toHubPlayer.ts`,
// derived from `HUB_PLAYER_CACHE_KEY_FIELDS` so the key automatically widens
// when the mapper reads a new input field. Previously a duplicate
// implementation lived here and could silently go stale.

function useHubPlayers(rows: RosterPlayer[]): RosterHubPlayer[] {
  const cacheRef = useRef<Map<number, HubPlayerCacheEntry>>(new Map());

  return useMemo(() => {
    const seen = new Set<number>();
    const next = rows.map((row) => {
      seen.add(row.rosterId);
      const key = hubPlayerCacheKey(row);
      const cached = cacheRef.current.get(row.rosterId);
      if (cached?.key === key) return cached.player;

      const player = toHubPlayer(row);
      cacheRef.current.set(row.rosterId, { key, player });
      return player;
    });

    for (const rosterId of cacheRef.current.keys()) {
      if (!seen.has(rosterId)) cacheRef.current.delete(rosterId);
    }

    return next;
  }, [rows]);
}

export default function Team() {
  const { teamCode } = useParams();
  const code = normCode(teamCode);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { me } = useAuth();
  const authUser = me?.user;
  const { leagueId, currentLeagueName, myTeamId, myTeamCode, leagueRules, seasonStatus } = useLeague();

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
  const queryEffectiveDate = searchParams.get("effectiveDate");
  const queryPlayerIdRaw = searchParams.get("playerId");
  const queryPlayerId = queryPlayerIdRaw ? Number(queryPlayerIdRaw) : null;
  const initialManagePlayerId = Number.isFinite(queryPlayerId) && queryPlayerId! > 0 ? queryPlayerId : null;

  const [teamMeta, setTeamMeta] = useState<{
    id: number;
    name: string;
    code: string;
    budget?: number | null;
    ownerName?: string | null;
  } | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  // Full league player pool — fed to the transactions panels as `players`,
  // enriched by `loadRosterMovePlayers` so own-team rows carry the
  // `_dbPlayerId` / `_dbTeamId` / `assignedPosition` the panel filters
  // require. See todo #116 for why this can't be the raw stats payload.
  const [players, setPlayers] = useState<RosterMovesPlayer[]>([]);
  const [aiInsights, setAiInsights] = useState<TeamInsightsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [computedAt, setComputedAt] = useState<string | null>(null);
  const [insightHistory, setInsightHistory] = useState<WeeklyInsightEntry[]>([]);
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);
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
          // `GET /api/teams` only selects `owner` (legacy string column),
          // not the User relation — todo #121 caught the previously-silent
          // `team.ownerUser?.name || team.ownerUser?.email` fallback chain
          // that always evaluated to `undefined`. If we ever need the User
          // relation here, add `include: { ownerUser: ... }` to the server
          // select and extend `LeagueTeam` accordingly.
          ownerName: team.owner ?? null,
        });

        // Roster comes from the server-shaped hub-roster endpoint
        // (`GET /api/teams/:id/roster-hub`). The server already partitions
        // hitters / pitchers / IL and pre-joins per-row stats — todo #140
        // collapsed the legacy two-call client join (getTeamDetails ×
        // getPlayerSeasonStatsMeta) into one network call.
        const [hubRes, aiRes, panelPlayersRes] = await Promise.allSettled([
          getTeamRosterHub(team.id),
          getTeamAiInsights(leagueId, team.id),
          // Shared loader produces the enriched RosterMovesPlayer shape
          // (_dbPlayerId / _dbTeamId / assignedPosition populated for the
          // active team) that the transactions panels need. Separate
          // concern from the team's own roster — covers the FA pool too.
          loadRosterMovePlayers(leagueId, team.id),
        ]);
        if (canceled) return;

        if (hubRes.status === "fulfilled") {
          const hub = hubRes.value;
          setComputedAt(hub.computedAt);
          // Cache the enriched player pool for the transactions panels.
          setPlayers(
            panelPlayersRes.status === "fulfilled" ? panelPlayersRes.value : [],
          );
          // Server emits one row shape (RosterHubRow); concatenate the
          // partitions into the page's RosterPlayer[] state. Each row
          // already carries pre-joined stats — no client-side join.
          const allRows = [...hub.hitters, ...hub.pitchers, ...hub.ilPlayers];
          const players: RosterPlayer[] = allRows.map((row) => ({
            rosterId: row.rosterId,
            playerId: row.playerId,
            mlbId: row.mlbId ?? null,
            playerName: row.playerName,
            posPrimary: row.posPrimary ?? undefined,
            posList: row.posList ?? row.posPrimary ?? undefined,
            position: row.position ?? row.posPrimary ?? undefined,
            assignedPosition: row.assignedPosition ?? undefined,
            isPitcher: row.isPitcher,
            price: row.price ?? null,
            mlbTeam: row.mlbTeam,
            isKeeper: row.isKeeper ?? undefined,
            gamesByPos: row.gamesByPos,
            mlbStatus: row.mlbStatus ?? undefined,
            // Hitter stats
            AB: row.AB,
            H: row.H,
            AVG: row.AVG,
            HR: row.HR,
            R: row.R,
            RBI: row.RBI,
            SB: row.SB,
            // Pitcher stats
            IP: row.IP,
            BB_H: row.BB_H,
            ER: row.ER,
            W: row.W,
            SV: row.SV,
            K: row.K,
            ERA: row.ERA,
            WHIP: row.WHIP,
          }));
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

  // Load weekly-insights history when team identified — powers the
  // "View past weeks" tabs that the legacy page exposed. One read
  // per team mount; result is small (one row per past week).
  useEffect(() => {
    if (!leagueId || !teamMeta?.id) return;
    let canceled = false;
    getTeamAiInsightsHistory(leagueId, teamMeta.id)
      .then(res => {
        if (canceled) return;
        setInsightHistory(res.weeks);
        if (res.weeks.length > 0) setSelectedWeekKey(res.weeks[0].weekKey);
      })
      .catch(() => { /* history is optional */ });
    return () => { canceled = true; };
  }, [leagueId, teamMeta?.id]);

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
      // Use Partial because the row may have no period-stats yet (synthetic
      // rows, mid-period sync gap). Each Number(...) call below tolerates
      // undefined fields by falling back to 0.
      const ps: Partial<NonNullable<typeof r.periodStats>> = r.periodStats ?? {};
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
        mlbId: r.mlbId,
        playerName: r.name,
        posPrimary: r.posPrimary,
        position: r.posPrimary,
        assignedPosition: r.assignedPosition || r.posPrimary,
        isPitcher,
        price: r.price,
        mlbTeam: r.mlbTeam ?? undefined,
        // Hitter cols (session 89: AB/H added for AVG verification).
        AB: ab,
        H: h,
        AVG: avg,
        HR: Number(ps.HR) || 0,
        R: Number(ps.R) || 0,
        RBI: Number(ps.RBI) || 0,
        SB: Number(ps.SB) || 0,
        // Pitcher cols (session 89: IP/BB_H/ER added for ERA/WHIP verification).
        IP: ip,
        BB_H: bbH,
        ER: er,
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
  const baselineHubHitters = useHubPlayers(hitters);
  const baselineHubPitchers = useHubPlayers(pitchers);
  const hubIl = useHubPlayers(ilPlayers);

  // Permission gating mirrors ActivityPage — owner OR commissioner OR admin
  // can mutate; everyone else gets a view-only hub (no action menus).
  //
  // Rule-gate matrix (rolled up under `canManage`):
  //   admin                  → always ✓
  //   league commissioner    → always ✓
  //   team owner viewing OWN → ✓ when `transactions.owner_self_serve === "true"`
  //   anyone else            → ✗ (view-only)
  //
  // Drives:
  //   - "+ Add free agent" button visibility
  //   - RosterHubV3.dndEnabled (drag handles inert when false)
  //   - PendingChangeBar Save button (defensive — should never appear if
  //     pending was empty, but a no-op if commissioner mode lands without
  //     permission and somehow queued a change)
  const isAdmin = !!authUser?.isAdmin;
  const isCommissioner = !!(isAdmin ||
    authUser?.memberships?.some(
      (m: { leagueId: string | number; role: string }) =>
        Number(m.leagueId) === leagueId && m.role === "COMMISSIONER",
    ));
  const isOwnerSelfServe =
    leagueRules?.transactions?.owner_self_serve === "true";
  const isOwnTeam = teamMeta?.id != null && teamMeta.id === myTeamId;
  const canManage =
    isAdmin ||
    isCommissioner ||
    (isOwnerSelfServe && isOwnTeam);

  // Commissioner mode = "I can manage this team but it isn't mine". The
  // banner + effectiveDate picker are the two affordances tied to this
  // flag. An admin/commissioner viewing their OWN team is treated as a
  // regular owner — no banner, no date picker — so the everyday flow
  // doesn't gain extra chrome.
  const isCommissionerMode = canManage && !isOwnTeam && !!teamMeta?.id;

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
  const saveFn = useCallback(async (
    changes: PendingChange[],
    ctx: { effectiveDate: string | null },
  ) => {
    if (!teamMeta?.id) throw new Error("Team not loaded");
    if (!leagueId) throw new Error("League not loaded");
    const tid = teamMeta.id;
    // Commissioner-mode backdate (null in owner mode). Forwarded as
    // `effectiveDate` on every per-change mutation so the server-side
    // audit trail reflects the chosen date. Per the PR description the
    // swap mutation accepts the date as advisory only (no period
    // recompute) — claim/il-stash/il-activate use it for real.
    const effectiveDate = ctx.effectiveDate ?? undefined;
    // Atomic-on-failure (FA-#4 inherits from Hub-#4): each entry runs
    // sequentially; first failure throws and aborts the rest. Earlier
    // successful mutations are NOT rolled back — server matcher reads
    // current state on the next save attempt, so a retry resumes safely.
    for (const change of changes) {
      if (change.kind === "swap") {
        try {
          await updateRosterPosition(tid, change.from.rosterId, change.to.slot, effectiveDate);
          await updateRosterPosition(tid, change.to.rosterId, change.from.slot, effectiveDate);
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
              ...(effectiveDate ? { effectiveDate } : {}),
            }),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Save failed";
          throw new Error(`Save failed on add ${change.faName} · drop ${change.displaced.name}: ${msg}`);
        }
        continue;
      }
      if (change.kind === "il_stash") {
        // IL scenario save: dispatch to /transactions/il-stash in
        // stash-only mode (no addPlayerId). The server moves the player
        // to IL and the bipartite matcher reshuffles the rest of the
        // active roster — the freed slot may stay empty if no
        // position-eligible bench replacement exists. Per IL #6 the UI
        // surfaces a "Add a FA to fill this slot" chip post-save.
        try {
          await ilStash({
            leagueId,
            teamId: tid,
            stashPlayerId: change.playerId,
            // stashOnly mode — addPlayerId omitted intentionally.
            ...(effectiveDate ? { effectiveDate } : {}),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Save failed";
          throw new Error(`Save failed on stash ${change.name}: ${msg}`);
        }
        continue;
      }
      if (change.kind === "il_activate") {
        // IL scenario save: dispatch to /transactions/il-activate. Per
        // IL #4, when bench has space the server matcher handles
        // displacement; in v1 the hub always carries a `displaced` row
        // via the drag (UI requires the user to pick a target slot
        // occupant). Pass through to the server.
        if (!change.displaced) {
          throw new Error(
            `Activation for ${change.name} can't be saved alone — drop on an active roster row to pick a displaced player.`,
          );
        }
        try {
          await ilActivate({
            leagueId,
            teamId: tid,
            activatePlayerId: change.playerId,
            dropPlayerId: change.displaced.playerId,
            ...(effectiveDate ? { effectiveDate } : {}),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Save failed";
          throw new Error(`Save failed on activate ${change.name}: ${msg}`);
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
    // Per-(user, team) localStorage scoping so a commissioner bouncing
    // between teams doesn't see one team's pending batch on another
    // team's hub. Falls back to legacy team-only key when authUser is
    // null (auth-resolve flicker on first paint).
    userId: authUser?.id ?? null,
    saveFn,
  });
  // Per todo #162.1 — `pending.setEffectiveDate` is the setter from
  // `usePendingChanges`; setters are not guaranteed identity-stable across
  // renders, and re-firing this effect on a setter swap would re-seed past
  // a user's manual clear. We deliberately omit it from the dep array (the
  // ref-guard ensures a single seed per (teamId, queryEffectiveDate) pair).
  // When the user clears the `?effectiveDate` querystring (queryEffectiveDate
  // becomes null), we reset the ref so re-applying the SAME date later still
  // re-seeds — closing the bug where a second apply was silently dropped.
  const seededEffectiveDateRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isCommissionerMode || !queryEffectiveDate || !/^\d{4}-\d{2}-\d{2}($|T)/.test(queryEffectiveDate)) {
      // User cleared the querystring (or it never matched) — drop the
      // seed marker so re-applying re-seeds.
      seededEffectiveDateRef.current = null;
      return;
    }
    const key = `${teamMeta?.id ?? ""}:${queryEffectiveDate}`;
    if (seededEffectiveDateRef.current === key) return;
    seededEffectiveDateRef.current = key;
    pending.setEffectiveDate(queryEffectiveDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pending.setEffectiveDate intentionally omitted; see comment above.
  }, [isCommissionerMode, queryEffectiveDate, teamMeta?.id]);

  // Apply pending swaps to the displayed hub roster optimistically.
  // Optimistic preview is best-effort — only swap is fully reflected;
  // il_stash / il_activate preview is left to the badge in the pending
  // bar (the row stays visible in its current section, marked as pending,
  // until save reshuffles the server-side state on reload).
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
      if (c.kind === "swap") {
        out.add(c.from.rosterId);
        out.add(c.to.rosterId);
      } else if (c.kind === "fa_add") {
        out.add(c.displaced.rosterId);
      } else if (c.kind === "il_stash") {
        out.add(c.rosterId);
      } else if (c.kind === "il_activate") {
        out.add(c.rosterId);
        if (c.displaced) out.add(c.displaced.rosterId);
      }
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
    ilPlayers: hubIl,
    freeAgents: fa.data ?? undefined,
    onSwap: (change) => pending.addChange(change),
    onFaAdd: (change) => pending.addChange(change),
    onIlStash: (change) => pending.addChange(change),
    onIlActivate: (change) => pending.addChange(change),
    onToast: showToast,
  });

  // Per-row revert: drop the change(s) referencing this rosterId.
  // swap touches both endpoints, fa_add touches the displaced rosterId,
  // il_stash touches the stashed player's rosterId, il_activate touches
  // the IL row + the displaced active row (when present).
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
          if (c.kind === "il_stash") {
            return c.rosterId === rosterId;
          }
          if (c.kind === "il_activate") {
            return c.rosterId === rosterId || c.displaced?.rosterId === rosterId;
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

  // Cascade preview helper (IL #5): for an il_stash, count bench/active
  // players who could fill the freed slot. ≥3 → render explicit text;
  // ≤2 relies on the shimmy animation. The cascade calculation is
  // best-effort client-side — server confirms at save and may apply a
  // different shuffle (we don't try to mirror the bipartite matcher
  // exactly, just flag the "this will move N players" magnitude).
  const cascadeTextFor = useCallback(
    (freed: string): string | undefined => {
      // Count active hitters/pitchers whose current assignment matches
      // the freed slot OR who could be reassigned to fill it. Simplest
      // heuristic: count players in the same section whose posList
      // includes `freed` and whose current slot is BN or matches `freed`.
      const isFreedPitcherSlot = ["P", "SP", "RP"].includes(freed);
      const pool = isFreedPitcherSlot ? baselineHubPitchers : baselineHubHitters;
      const candidates = pool.filter(
        (p) =>
          p.assignedSlot !== "IL" &&
          (p.posList ?? "").split(/[,/| ]+/).map((s) => s.trim().toUpperCase()).includes(freed),
      );
      if (candidates.length < 3) return undefined;
      const sample = candidates.slice(0, 3).map((p) => p.name).join(", ");
      return `Auto-resolved: ${sample}${candidates.length > 3 ? ", …" : ""} may shuffle to fill ${freed}`;
    },
    [baselineHubHitters, baselineHubPitchers],
  );

  // PendingChangeBar items list — one row per change with kind-specific
  // badge. FA scenario extended the bar from count-only to itemized;
  // IL scenario adds two more badges (IL STASH amber, IL ACTIVATE cyan)
  // and an optional `secondary` line for ≥3-player auto-resolve cascades
  // per direction-lock IL #5. Complex scenario adds:
  //   - `dependsOn` — rendered when the change is a child of an earlier
  //     change in the dependency graph (Complex-#2).
  //   - `errorReason` — the per-change failure reason from the most
  //     recent save attempt (Complex-#6).
  //
  // `humanLabelFor` converts a change to a "Drop #1"-style label that
  // dependency badges reference. Index is 1-based for user-facing.
  const humanLabelFor = useCallback(
    (change: PendingChange, idx1: number) => {
      switch (change.kind) {
        case "swap":
          return `Swap #${idx1}`;
        case "fa_add":
          return `FA add #${idx1}`;
        case "il_stash":
          return `IL stash #${idx1}`;
        case "il_activate":
          return `IL activate #${idx1}`;
      }
    },
    [],
  );

  const pendingItems = useMemo(() => {
    const failuresById = new Map<string, string>();
    for (const f of pending.state.failures) failuresById.set(f.changeId, f.reason);
    // Lookup parent label by id — used to render the dependsOn badge.
    const labelById = new Map<string, string>();
    pending.state.changes.forEach((c, i) => {
      labelById.set(c.id, humanLabelFor(c, i + 1));
    });
    const parentOf = new Map<string, string>();
    for (const e of pending.dependencies) {
      // For a child with multiple parents we keep the first; the badge is
      // a hint, not exhaustive.
      if (!parentOf.has(e.child)) parentOf.set(e.child, e.parent);
    }

    return pending.state.changes.map((c, i) => {
      const dependsOnId = parentOf.get(c.id);
      const dependsOn = dependsOnId ? labelById.get(dependsOnId) : undefined;
      const errorReason = failuresById.get(c.id);
      if (c.kind === "swap") {
        return {
          id: c.id,
          kind: "swap" as const,
          text: `${c.from.slot} ↔ ${c.to.slot}`,
          dependsOn,
          errorReason,
        };
      }
      if (c.kind === "fa_add") {
        return {
          id: c.id,
          kind: "fa_add" as const,
          text: `Add ${c.faName} · drop ${c.displaced.name}`,
          dependsOn,
          errorReason,
        };
      }
      if (c.kind === "il_stash") {
        return {
          id: c.id,
          kind: "il_stash" as const,
          text: `Stash ${c.name} · freed ${c.freed}`,
          secondary: cascadeTextFor(c.freed),
          dependsOn,
          errorReason,
        };
      }
      // c.kind === "il_activate"
      const dispText = c.displaced ? ` · drop ${c.displaced.name}` : "";
      void i;
      return {
        id: c.id,
        kind: "il_activate" as const,
        text: `Activate ${c.name} → ${c.targetSlot}${dispText}`,
        dependsOn,
        errorReason,
      };
    });
  }, [
    pending.state.changes,
    pending.state.failures,
    pending.dependencies,
    cascadeTextFor,
    humanLabelFor,
  ]);

  /* ── Save diff-preview modal (Complex-#3) ────────────────────────── */
  //
  // Threshold: ≤2 changes save directly via the bar; ≥3 surface the
  // confirm modal with diff preview. Per Complex-#4, atomic save is
  // already enforced by `usePendingChanges` — the modal renders any
  // resulting per-change failures inline so the user can revert the
  // offending row(s) and retry without re-typing the rest.

  const [diffPreviewOpen, setDiffPreviewOpen] = useState(false);
  const SAVE_CONFIRM_THRESHOLD = 3;

  const onSaveClick = useCallback(() => {
    if (pending.state.changes.length >= SAVE_CONFIRM_THRESHOLD) {
      setDiffPreviewOpen(true);
      return;
    }
    void pending.save();
  }, [pending]);

  // Confirm path: trigger the save and let the auto-close effect below
  // dismiss the modal on success. Failures keep the modal open so the
  // inline error banners stay visible.
  const onConfirmSave = useCallback(async () => {
    await pending.save();
  }, [pending]);

  // Auto-close on save success: when the queue empties and there's no
  // error, the modal isn't needed any more. This handles both the
  // direct ≥3 confirm path and any subsequent retry.
  useEffect(() => {
    if (
      diffPreviewOpen &&
      !pending.state.saving &&
      pending.state.changes.length === 0 &&
      pending.state.error == null
    ) {
      setDiffPreviewOpen(false);
    }
  }, [
    diffPreviewOpen,
    pending.state.saving,
    pending.state.changes.length,
    pending.state.error,
  ]);

  // Diff rows — one per queued change. Reuses the pendingItems labels
  // for consistency; the modal layout adds the per-row "1.", "2.", …
  // numbering and the inline failure banner.
  const diffRows = useMemo<DiffRow[]>(() => {
    return pending.state.changes.map((c, i) => {
      const dependsOnId = pending.dependencies.find((e) => e.child === c.id)?.parent;
      const dependsOnIdx = dependsOnId
        ? pending.state.changes.findIndex((x) => x.id === dependsOnId) + 1
        : null;
      const dependsOn = dependsOnIdx
        ? humanLabelFor(
            pending.state.changes[dependsOnIdx - 1],
            dependsOnIdx,
          )
        : undefined;
      // Build a more verbose text for the modal. The bar uses tighter
      // copy ("DROP Marcus Semien"); the modal can afford the projected
      // dollar amount and the explicit "drops X" suffix per the spec.
      let text: string;
      switch (c.kind) {
        case "swap": {
          text = `SWAP ${c.from.slot} ↔ ${c.to.slot}`;
          break;
        }
        case "fa_add": {
          text = `FA ADD ${c.faName} — drops ${c.displaced.name}`;
          break;
        }
        case "il_stash": {
          text = `IL STASH ${c.name} (${c.mlbStatus})`;
          break;
        }
        case "il_activate": {
          const drop = c.displaced ? ` — drops ${c.displaced.name}` : "";
          text = `IL ACTIVATE ${c.name} → ${c.targetSlot}${drop}`;
          break;
        }
      }
      void i;
      return { id: c.id, kind: c.kind, text, dependsOn };
    });
  }, [pending.state.changes, pending.dependencies, humanLabelFor]);

  /* ── Ghost-IL warnings (IL #3) ────────────────────────────────────── */
  //
  // Surface a warning chip for active-roster rows whose `mlbStatus` is
  // an Injured-Day designation but the daily sync hasn't auto-stashed
  // them yet. Per direction-lock IL #1 the status is rendered verbatim
  // ("Status missing — last known: Injured 10-Day · 5 days ago"). The
  // Resync button calls POST /api/transactions/sync-il-status to refetch
  // out of band; on success we bump reloadKey so the page re-renders
  // with the fresh status.

  const ghostIlSuspects = useMemo(() => {
    const out: { rosterId: number; playerId: number; name: string; status: string; daysAgo?: number }[] = [];
    for (const p of [...baselineHubHitters, ...baselineHubPitchers]) {
      if (p.assignedSlot === "IL") continue;
      if (!p.mlbStatus) continue;
      if (!isMlbIlStatusUi(p.mlbStatus)) continue;
      out.push({
        rosterId: p.rosterId,
        playerId: p.playerId,
        name: p.name,
        status: p.mlbStatus,
        daysAgo: p.mlbStatusDaysAgo,
      });
    }
    return out;
  }, [baselineHubHitters, baselineHubPitchers]);

  const [resyncing, setResyncing] = useState<number | null>(null);
  const onResync = useCallback(
    async (playerId: number) => {
      if (!leagueId || !teamMeta?.id) return;
      setResyncing(playerId);
      try {
        await syncIlStatus({ leagueId, teamId: teamMeta.id, playerId });
        // Refresh page state so the chip reflects the latest mlbStatus.
        // The team-detail payload now plumbs Player.mlbStatus end-to-end;
        // bumping reloadKey re-fetches the roster so the chip wakes up
        // (or disappears) without a hard refresh.
        setReloadKey((k) => k + 1);
        showToast(`MLB status refreshed for ${ghostIlSuspects.find((g) => g.playerId === playerId)?.name ?? "player"}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Resync failed";
        showToast(`Resync failed: ${msg}`);
      } finally {
        setResyncing(null);
      }
    },
    [leagueId, teamMeta?.id, showToast, ghostIlSuspects],
  );

  /* ── FA suggestion (IL #6) ────────────────────────────────────────── */
  //
  // Inline chip surfaced on the row freed by an il_stash change. Clicks
  // open the FA panel pre-filtered to the slot's eligibility. We don't
  // auto-open the panel (per direction-lock #6: "too aggressive").

  const ilStashFreedSlots = useMemo<Set<string>>(() => {
    const out = new Set<string>();
    for (const c of pending.state.changes) {
      if (c.kind === "il_stash") out.add(c.freed);
    }
    return out;
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

  // IL slot count from league rules. Mirrors the server-side
  // `loadLeagueIlSlotCount` fallback in `ilSlotGuard.ts` — both default
  // to 2 when the rule isn't seeded. OGBA's seed (server/src/lib/sports/
  // baseball.ts) now ships with `il.slot_count = 2`. Plumbed into
  // RosterHubV3.ilTotalSlots so the IL section renders the correct
  // number of empty drop targets and section header count.
  const ilSlotCount = useMemo(() => {
    const raw = leagueRules?.il?.slot_count;
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 2;
  }, [leagueRules]);

  // Lineup Intelligence card — rendered between active roster and IL
  // section via RosterHubV3's `intelSlot` prop. Was a right-rail sidebar
  // (span 4) before session 89's polish pass; moved into page flow so
  // the roster table can claim full horizontal real estate for the wider
  // stat column set (AB/H for hitters, BB+H/ER for pitchers).
  //
  // `activeInsight` mirrors the legacy `TeamLegacy.tsx` pattern (see lines
  // 436–441 there): when the user picks a historical week from the bottom
  // weekly-insights selector, surface that week's insights here. Otherwise
  // fall back to the live current-week `aiInsights`. `WeeklyInsightEntry`
  // extends `TeamInsightsResult`, so the structural shape (insights[],
  // overallGrade) is compatible — no narrowing needed in the JSX below.
  const activeInsight: TeamInsightsResult | WeeklyInsightEntry | null =
    selectedWeekKey
      ? insightHistory.find((w) => w.weekKey === selectedWeekKey) ?? aiInsights
      : aiInsights;
  const activeInsightWeekKey: string | null =
    activeInsight && "weekKey" in activeInsight
      ? (activeInsight as WeeklyInsightEntry).weekKey
      : null;
  const lineupIntelligenceCard = (
    <Glass strong>
      <SectionLabel>
        ✦ Lineup intelligence
        {activeInsightWeekKey && selectedWeekKey && (
          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 500, color: "var(--am-text-faint)", letterSpacing: 0.4 }}>
            · {activeInsightWeekKey}
          </span>
        )}
      </SectionLabel>
      {activeInsight?.insights?.length ? (
        <>
          {activeInsight.overallGrade && (
            <div style={{ marginTop: 4, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>Overall grade</span>
              <IridText size={20}>{activeInsight.overallGrade}</IridText>
            </div>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 8,
            }}
          >
            {activeInsight.insights.slice(0, 4).map((r, i) => (
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
  );

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
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", alignItems: "center", gap: 14 }}>
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
                    {computedAt && <> · <DataFreshness computedAt={computedAt} className="text-xs" /></>}
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
              container when a manage flow is active. Spans full width so
              the wider stat column set (AB/H for hitters, BB+H/ER for
              pitchers) has room to breathe; Lineup Intelligence moves
              below, also full-width, instead of sitting in a right rail. */}
          <div style={{ gridColumn: "span 12" }}>
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
	                    players={players}
	                    onComplete={onPanelComplete}
	                    effectiveDate={pending.state.effectiveDate ?? undefined}
	                  />
	                ) : manageMode === "il-stash" ? (
	                  <PlaceOnIlPanel
	                    leagueId={leagueId}
	                    teamId={teamMeta.id}
	                    players={players}
	                    onComplete={onPanelComplete}
	                    effectiveDate={pending.state.effectiveDate ?? undefined}
	                    initialStashPlayerId={initialManagePlayerId}
	                  />
	                ) : (
	                  <ActivateFromIlPanel
	                    leagueId={leagueId}
	                    teamId={teamMeta.id}
	                    players={players}
	                    onComplete={onPanelComplete}
	                    effectiveDate={pending.state.effectiveDate ?? undefined}
	                    initialActivatePlayerId={initialManagePlayerId}
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
                {/* Commissioner-mode banner — surfaces when an admin or
                    commissioner is operating on a team that isn't theirs.
                    Amber palette matches the IL section so the user reads
                    "elevated, careful" cues at a glance. The "Switch to my
                    team →" link lets them bail back to their own hub. */}
                {isCommissionerMode && (
                  <div
                    role="status"
                    aria-live="polite"
                    data-testid="commissioner-mode-banner"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "10px 14px",
                      marginBottom: 10,
                      borderRadius: 12,
                      background: "color-mix(in srgb, #f59e0b 10%, transparent)",
                      border: "1px solid color-mix(in srgb, #f59e0b 38%, transparent)",
                      fontSize: 12.5,
                      color: "var(--am-text)",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span aria-hidden style={{ fontSize: 14 }}>🛡️</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                        Commissioner mode — managing for{" "}
                        <strong>{teamMeta?.name ?? code}</strong>
                      </span>
                    </span>
                    {myTeamCode && myTeamCode !== code && (
                      <Link
                        to={`/teams/${myTeamCode}`}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#f59e0b",
                          textDecoration: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        (Switch to my team →)
                      </Link>
                    )}
                  </div>
                )}
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
                  onSave={onSaveClick}
                  saving={pending.state.saving}
                  saveError={pending.state.error}
                  onDismissError={pending.clearError}
                  pendingItems={pendingItems}
                  onRevertItem={pending.revertChange}
                  dropPoolSlot={
                    <DropPool rows={dropPoolRows} onRestore={pending.revertChange} />
                  }
                  effectiveDate={isCommissionerMode ? pending.state.effectiveDate : undefined}
                  onEffectiveDateChange={
                    isCommissionerMode ? pending.setEffectiveDate : undefined
                  }
                  intelSlot={lineupIntelligenceCard}
                  ilTotalSlots={ilSlotCount}
                  dndEnabled={canManage}
                  shakeRowId={drag.shakeRowId}
                  ilStashEligible={drag.ilStashEligible}
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

            {/* Ghost-IL warning chips (direction-lock IL #3) — surfaces
                active-roster rows whose mlbStatus is an "Injured …-Day"
                designation but the daily sync hasn't auto-stashed them.
                Each chip carries a Resync button that calls
                POST /api/transactions/sync-il-status. */}
            {ghostIlSuspects.length > 0 && !manageMode && (
              <Glass style={{ marginTop: 12, padding: 12 }}>
                <SectionLabel>✦ Status missing — possible IL stashes</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                  {ghostIlSuspects.map((g) => (
                    <div
                      key={g.rosterId}
                      data-testid="ghost-il-chip"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        borderRadius: 10,
                        background: "color-mix(in srgb, #f59e0b 8%, transparent)",
                        border: "1px solid color-mix(in srgb, #f59e0b 28%, transparent)",
                        fontSize: 12,
                        color: "var(--am-text)",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{g.name}</span>
                      <span style={{ color: "var(--am-text-muted)" }}>
                        Status missing — last known: <strong>{g.status}</strong>
                        {typeof g.daysAgo === "number" ? ` · ${g.daysAgo} day${g.daysAgo === 1 ? "" : "s"} ago` : ""}
                      </span>
                      <span style={{ flex: 1 }} />
                      <button
                        type="button"
                        onClick={() => onResync(g.playerId)}
                        disabled={resyncing === g.playerId}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "4px 10px",
                          borderRadius: 8,
                          border: "1px solid var(--am-border)",
                          background: "var(--am-chip)",
                          color: "var(--am-text)",
                          cursor: resyncing === g.playerId ? "not-allowed" : "pointer",
                          opacity: resyncing === g.playerId ? 0.5 : 1,
                          minHeight: 24,
                        }}
                      >
                        {resyncing === g.playerId ? "Resyncing…" : "Resync"}
                      </button>
                    </div>
                  ))}
                </div>
              </Glass>
            )}

            {/* FA suggestion chips (direction-lock IL #6) — for each
                il_stash queued, show "Add a FA to fill this slot →"
                opening the FA panel pre-filtered to the freed slot. */}
            {ilStashFreedSlots.size > 0 && !manageMode && canManage && (
              <Glass style={{ marginTop: 12, padding: 12 }}>
                <SectionLabel>✦ Freed slots — fill from FA?</SectionLabel>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  {Array.from(ilStashFreedSlots).map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      data-testid="fa-suggestion-chip"
                      onClick={() => setFaPanelOpen(true)}
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "6px 12px",
                        borderRadius: 99,
                        border: "1px solid var(--am-border-strong)",
                        background: "color-mix(in srgb, #22d3ee 10%, transparent)",
                        color: "var(--am-text)",
                        cursor: "pointer",
                      }}
                    >
                      Add a FA to fill {slot} →
                    </button>
                  ))}
                </div>
              </Glass>
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
                    <span
                      data-testid="restore-prompt-breakdown"
                      style={{
                        display: "block",
                        marginTop: 4,
                        fontSize: 11.5,
                        color: "var(--am-text-muted)",
                      }}
                    >
                      {describeKindBreakdown(kindBreakdown(restorePrompt.changes))}
                    </span>
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

          {/* Lineup Intelligence is now rendered INSIDE RosterHubV3 via
              the `intelSlot` render-prop (between active roster and IL
              section). Defined as `lineupIntelligenceCard` further up so
              both manage-mode and the regular hub render the same
              card. Session-89 polish moved it out of a right-rail
              sidebar (was span 4 alongside a span 8 roster) so the
              roster table can claim full horizontal real estate. */}

          {/* Pitchers section is now inside RosterHubV3 (consolidated table)
              per plan §0.5 refinement #1. The separate Glass block was
              removed when the v3 hub took over the roster surface. */}

          {/* Save diff preview modal (Complex-#3) — opens when ≥3 changes
              are queued and the user clicks Save. Confirms the batch
              before committing; renders inline per-row failure banners
              if the save attempt surfaced a PendingChangeBatchError. */}
          <SaveDiffPreviewModal
            open={diffPreviewOpen}
            rows={diffRows}
            failures={pending.state.failures}
            saving={pending.state.saving}
            onConfirm={onConfirmSave}
            onCancel={() => setDiffPreviewOpen(false)}
            onRevertItem={pending.revertChange}
          />

          {/* Watchlist + Trading Block + Wire List — restored from legacy
              Team page. Owner-only and only during DRAFT or IN_SEASON; the
              same gate the legacy page used. Wire List is a link card so
              owners can reach `/teams/:code/wire-list` without hunting in
              navigation. */}
          {teamMeta?.id && isOwnTeam && seasonStatus !== "SETUP" && seasonStatus !== "COMPLETED" && (
            <div style={{ gridColumn: "span 12", display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 16, marginTop: 8 }}>
              <div style={{ gridColumn: "span 4" }}>
                <Glass>
                  <SectionLabel>✦ Watchlist</SectionLabel>
                  <WatchlistPanel teamId={teamMeta.id} />
                </Glass>
              </div>
              <div style={{ gridColumn: "span 4" }}>
                <Glass>
                  <SectionLabel>✦ Trading Block</SectionLabel>
                  <TradingBlockPanel
                    teamId={teamMeta.id}
                    rosterPlayers={roster
                      .filter(p => Number(p.playerId) > 0)
                      .map(p => ({
                        id: Number(p.playerId),
                        name: p.playerName,
                        posPrimary: (p.posPrimary || "UT").split(/[/,]/)[0] || "UT",
                        mlbTeam: p.mlbTeam ?? null,
                      }))}
                  />
                </Glass>
              </div>
              <div style={{ gridColumn: "span 4" }}>
                <Glass>
                  <SectionLabel>✦ Waiver Wire List</SectionLabel>
                  <p style={{ fontSize: 13, color: "var(--am-text-muted)", margin: "8px 0 14px", lineHeight: 1.5 }}>
                    Rank your add and drop priorities for this period. Adds run top-down at the deadline; each successful add consumes the next pending drop.
                  </p>
                  <Link
                    to={`/teams/${code}/wire-list`}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "8px 14px", borderRadius: 99,
                      background: "var(--am-irid)", color: "#fff",
                      fontSize: 12, fontWeight: 600, textDecoration: "none",
                    }}
                  >
                    Open wire list →
                  </Link>
                </Glass>
              </div>
            </div>
          )}

          {/* Weekly insights history — week selector when ≥2 weeks exist.
              Mirrors the legacy week-tab UX. The selected week drives the
              `activeInsight` value above, which feeds the Lineup
              Intelligence card. Clicking the same pill toggles back to
              the current week's live insights. */}
          {insightHistory.length >= 2 && (
            <div style={{ gridColumn: "span 12", marginTop: 4 }}>
              <Glass>
                <SectionLabel>✦ Weekly insights · {insightHistory.length} weeks</SectionLabel>
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginTop: 8 }}>
                  {insightHistory.map((week) => {
                    const isActive = week.weekKey === selectedWeekKey;
                    return (
                      <button
                        key={week.weekKey}
                        type="button"
                        onClick={() => setSelectedWeekKey(isActive ? null : week.weekKey)}
                        style={{
                          flexShrink: 0,
                          padding: "6px 12px",
                          borderRadius: 99,
                          fontSize: 11, fontWeight: 600,
                          border: "1px solid " + (isActive ? "transparent" : "var(--am-border)"),
                          background: isActive ? "var(--am-irid)" : "var(--am-chip)",
                          color: isActive ? "#fff" : "var(--am-text-muted)",
                          cursor: "pointer",
                        }}
                      >
                        {week.weekKey}
                        {week.overallGrade ? ` · ${week.overallGrade}` : ""}
                      </button>
                    );
                  })}
                </div>
              </Glass>
            </div>
          )}

          {/* Legacy escape hatch — kept for parity items not yet ported */}
          <div style={{ gridColumn: "span 12", textAlign: "center", marginTop: 4 }}>
            <Link
              to={`/teams/${code}/classic`}
              style={{ fontSize: 11, color: "var(--am-text-faint)", textDecoration: "none", letterSpacing: 0.5 }}
            >
              View classic Team page →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// Old `RosterTable`, `fmtAvg`, `fmtRate` helpers were removed when v3
// took over the roster surface — `RosterRowV3` owns its own formatting.
