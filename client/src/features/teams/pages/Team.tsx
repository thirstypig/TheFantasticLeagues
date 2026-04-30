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
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useMatch, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  AmbientBg, Glass, IridText, Chip, SectionLabel,
} from "../../../components/aurora/atoms";
import "../../../components/aurora/aurora.css";
import { useAuth } from "../../../auth/AuthProvider";
import { useLeague } from "../../../contexts/LeagueContext";
import { getTeams, getTeamDetails, getTeamAiInsights, getPlayerSeasonStats, getSeasonStandings } from "../../../api";
import type { TeamInsightsResult, PlayerSeasonStat } from "../../../api";
import { getTeamPeriodRoster, type PeriodRosterEntry } from "../api";
import {
  RosterHubV3,
  SubrouteContainer,
  type RosterHubPlayer,
} from "../components/RosterHub";
import type { RowAction } from "../components/RosterHub/RowActionMenu";
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
// drive (eligibility highlights + pending changes). Defining at module
// scope avoids React.memo cache busts on every render.
const EMPTY_ID_SET: ReadonlySet<number> = new Set();
const NOOP = () => {};

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

  // ── RosterHubV3 plumbing ───────────────────────────────────────
  // Map our internal RosterPlayer shape to the RosterHubPlayer shape the
  // v3 components consume. Stat fields are role-aware (hitterStats vs
  // pitcherStats); posList carries the full eligibility list so the
  // PositionEligibilityCell can render multi-chip ("OF · 2B · MI") for
  // multi-position players. gamesByPos drives the Yahoo-style GP suffixes
  // ("OF (12) · 2B (3) · MI") — synthetic distribution today, real per-
  // position GP from MLB Stats API ships when Player.posGames lands.
  const toHubPlayer = useCallback((p: RosterPlayer): RosterHubPlayer => {
    const slot = (p.assignedPosition || p.posPrimary || "BN").toUpperCase();
    return {
      rosterId: p.rosterId,
      // RosterHubPlayer.playerId is the DB id; we don't surface it on
      // RosterPlayer yet, so reuse rosterId as a stable React key. A future
      // mutation slice will plumb the real playerId when we wire optimistic
      // updates.
      playerId: p.rosterId,
      name: p.playerName,
      posList: p.posList || p.posPrimary || "",
      posPrimary: p.posPrimary || "",
      assignedSlot: (slot === "IL" ? "IL" : slot) as RosterHubPlayer["assignedSlot"],
      mlbTeam: p.mlbTeam,
      isKeeper: p.isKeeper,
      isPitcher: !!p.isPitcher,
      gamesPlayedByPosition: p.gamesByPos as RosterHubPlayer["gamesPlayedByPosition"],
      hitterStats: p.isPitcher
        ? undefined
        : { R: p.R, HR: p.HR, RBI: p.RBI, SB: p.SB, AVG: p.AVG },
      pitcherStats: p.isPitcher
        ? { W: p.W, SV: p.SV, K: p.K, ERA: p.ERA, WHIP: p.WHIP }
        : undefined,
    };
  }, []);

  const hubHitters = useMemo(() => hitters.map(toHubPlayer), [hitters, toHubPlayer]);
  const hubPitchers = useMemo(() => pitchers.map(toHubPlayer), [pitchers, toHubPlayer]);
  const hubIl = useMemo(() => ilPlayers.map(toHubPlayer), [ilPlayers, toHubPlayer]);

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
  // (the action menu is the mutation entry point until drag-to-mutate
  // and pending-changes save land in a follow-up).
  const onPillClick = useCallback((rosterId: number) => {
    setSelectedRosterId(prev => (prev === rosterId ? null : rosterId));
  }, []);

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
              <RosterHubV3
                hitters={hubHitters}
                pitchers={hubPitchers}
                ilPlayers={hubIl}
                selectedRosterId={selectedRosterId}
                eligibleRosterIds={EMPTY_ID_SET}
                pendingRosterIds={EMPTY_ID_SET}
                pendingCount={0}
                showSelectionBanner={false}
                onPillClick={onPillClick}
                buildActions={buildActions}
                onRevertAll={NOOP}
                onSave={NOOP}
              />
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
