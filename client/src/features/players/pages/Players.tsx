/*
 * Players — the league-wide player table (UX step E).
 *
 * One responsive page: a table on desktop, a two-line row list on phones.
 * Tapping a name opens the player card (the card also owns the watchlist
 * star). Filters: availability, position, range, name search, and the
 * Hitters / Pitchers tabs. Sort, tab, search and filters persist in the URL.
 *
 * League scoping (NL-only free agents for an NL league) is applied by the
 * server through the league's stats_source, so every row here is in scope.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { AmbientBg } from "../../../components/aurora/atoms";
import "../../../components/aurora/aurora.css";
import { getPlayerSeasonStatsMeta, getPlayerPeriodStatsMeta, type PlayerSeasonStat, type PeriodStatRow } from "../../../api";
import { ApiError } from "../../../api/base";
import { EmptyState } from "../../../components/ui/EmptyState";
import { PageSkeleton } from "../../../components/ui/Skeleton";
import { StatsUpdated } from "../../../components/shared/StatsTables";
import { POS_ORDER, getPrimaryPosition, getLastName, isCMEligible, isMIEligible } from "../../../lib/baseballUtils";
import { mapPosition } from "../../../lib/sportConfig";
import { useLeague } from "../../../contexts/LeagueContext";
import { useMediaQuery } from "../../../hooks/useMediaQuery";
import { reportError } from "../../../lib/errorBus";
import { PlayersTable } from "../components/PlayersTable";
import { addToWireList, getPendingWirePeriodId } from "../api";
import "../components/players-table.css";

type Avail = "free" | "all" | "taken";
type Range = "season" | "period";
type Group = "hitters" | "pitchers";

const HITTER_SORTS = [["R", "R"], ["HR", "HR"], ["RBI", "RBI"], ["SB", "SB"], ["AVG", "AVG"]];
const PITCHER_SORTS = [["W", "W"], ["SV", "SV"], ["K", "K"], ["ERA", "ERA"], ["WHIP", "WHIP"]];
const ASC_KEYS = new Set(["name", "mlb_team", "fantasy", "pos", "ERA", "WHIP"]);

function normalizedPositions(p: PlayerSeasonStat): string[] {
  return (p.positions || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .map((pos) => (pos === "SP" || pos === "RP" ? "P" : pos));
}

export default function Players() {
  const { leagueId, outfieldMode, myTeamId, myTeamCode } = useLeague();
  const phone = useMediaQuery("(max-width: 767px)");
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<PlayerSeasonStat[]>([]);
  const [periodStats, setPeriodStats] = useState<PeriodStatRow[]>([]);
  const [computedAt, setComputedAt] = useState<string | null>(null);
  const [pendingPeriodId, setPendingPeriodId] = useState<number | null>(null);
  const [listedIds, setListedIds] = useState<Set<number>>(new Set());

  const [searchParams, setSearchParams] = useSearchParams();
  const group: Group = searchParams.get("group") === "pitchers" ? "pitchers" : "hitters";
  const avail: Avail = searchParams.get("avail") === "all" ? "all" : searchParams.get("avail") === "taken" ? "taken" : "free";
  const range: Range = searchParams.get("range") === "period" ? "period" : "season";
  const filterPos = searchParams.get("pos") || "ALL";
  const searchQuery = searchParams.get("q") || "";
  const sortKey = searchParams.get("sort") || "name";
  const sortDesc = searchParams.get("desc") === "1";

  const setParam = useCallback((key: string, value: string, def = "") => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === def) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handleSort = (key: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (sortKey === key) {
        next.set("desc", sortDesc ? "0" : "1");
      } else {
        next.set("sort", key);
        next.set("desc", ASC_KEYS.has(key) ? "0" : "1");
      }
      return next;
    }, { replace: true });
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const [pMeta, perMeta] = await Promise.all([
          getPlayerSeasonStatsMeta(leagueId),
          getPlayerPeriodStatsMeta(leagueId),
        ]);
        if (!alive) return;
        setPlayers(pMeta.stats);
        setPeriodStats(perMeta.stats);
        setComputedAt(pMeta.computedAt ?? perMeta.computedAt ?? null);
      } catch (err: unknown) {
        reportError(err, { source: "players-load" });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [leagueId]);

  useEffect(() => {
    setListedIds(new Set());
    if (myTeamId == null) { setPendingPeriodId(null); return; }
    let alive = true;
    getPendingWirePeriodId(leagueId).then(
      (id) => alive && setPendingPeriodId(id),
      () => alive && setPendingPeriodId(null),
    );
    return () => { alive = false; };
  }, [leagueId, myTeamId]);

  const onWireListAdd = useCallback(async (row: PlayerSeasonStat) => {
    if (pendingPeriodId == null || myTeamId == null) return;
    try {
      await addToWireList(pendingPeriodId, row.id, myTeamId);
    } catch (err) {
      // 409: the player is already on this Wire List.
      if (!(err instanceof ApiError && err.status === 409)) {
        reportError(err, { source: "players-wire-list-add" });
        throw err;
      }
    }
    setListedIds((prev) => new Set(prev).add(row.id));
  }, [pendingPeriodId, myTeamId]);

  const groupRows = useMemo(
    () => players.filter((p) => (group === "pitchers" ? !!p.is_pitcher : !p.is_pitcher)),
    [players, group],
  );

  const positionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of groupRows) normalizedPositions(p).forEach((x) => set.add(x));
    const base = POS_ORDER.filter((x) => set.has(x));
    const rest = Array.from(set).filter((x) => !POS_ORDER.includes(x)).sort();
    const extra: string[] = [];
    if (group === "hitters") {
      if (groupRows.some((p) => isCMEligible(p.positions))) extra.push("CM");
      if (groupRows.some((p) => isMIEligible(p.positions))) extra.push("MI");
    }
    return [...base, ...rest, ...extra];
  }, [groupRows, group]);

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let statMap: Map<string, PeriodStatRow> | null = null;
    if (range === "period") {
      statMap = new Map();
      for (const ps of periodStats) statMap.set(String(ps.mlb_id ?? ps.mlbId ?? ""), ps);
    }

    const filtered = groupRows.filter((p) => {
      const owned = !!p.ogba_team_code;
      if (avail === "free" && owned) return false;
      if (avail === "taken" && !owned) return false;
      if (q && !(p.player_name || "").toLowerCase().includes(q) && !(p.mlb_full_name || "").toLowerCase().includes(q)) return false;
      if (!q && !owned && Number(p.G ?? 0) === 0) return false;
      if (filterPos !== "ALL") {
        if (filterPos === "CM") return isCMEligible(p.positions);
        if (filterPos === "MI") return isMIEligible(p.positions);
        if (!normalizedPositions(p).includes(filterPos)) return false;
      }
      return true;
    });

    const display = filtered.map((p) => {
      if (!statMap) return p;
      const s = statMap.get(String(p.mlb_id)) as Record<string, unknown> | undefined;
      const n = (k: string) => Number(s?.[k] ?? 0);
      return { ...p, R: n("R"), HR: n("HR"), RBI: n("RBI"), SB: n("SB"), AVG: n("AVG"), W: n("W"), SV: n("SV"), K: n("K"), ERA: n("ERA"), WHIP: n("WHIP") } as PlayerSeasonStat;
    });

    const dir = sortDesc ? -1 : 1;
    const text = (a: string, b: string) => dir * a.localeCompare(b);
    return display.sort((a, b) => {
      if (sortKey === "pos") {
        const idx = (p: PlayerSeasonStat) => {
          const pos = mapPosition(getPrimaryPosition(p.positions), outfieldMode).split("/")[0];
          const i = POS_ORDER.indexOf(pos);
          return i === -1 ? 99 : i;
        };
        return dir * (idx(a) - idx(b));
      }
      if (sortKey === "name") return text(getLastName(a.mlb_full_name || a.player_name || ""), getLastName(b.mlb_full_name || b.player_name || ""));
      if (sortKey === "mlb_team") return text(a.mlb_team || a.mlbTeam || "ZZZ", b.mlb_team || b.mlbTeam || "ZZZ");
      if (sortKey === "fantasy") return text(a.ogba_team_code || "ZZZ", b.ogba_team_code || "ZZZ");
      const get = (p: PlayerSeasonStat) => Number((p as unknown as Record<string, unknown>)[sortKey] ?? -999);
      return dir * (get(a) - get(b));
    });
  }, [groupRows, periodStats, range, avail, searchQuery, filterPos, sortKey, sortDesc, outfieldMode]);

  if (loading) return <PageSkeleton />;

  const sortOptions = [["name", "Name"], ...(group === "hitters" ? HITTER_SORTS : PITCHER_SORTS)];

  return (
    <div className="aurora-theme" style={{ position: "relative", minHeight: "100svh" }}>
      <AmbientBg />
      <div style={{ position: "relative", zIndex: 1, padding: "16px 16px 48px", maxWidth: 1280, margin: "0 auto", color: "var(--am-text)" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 12px" }}>Players</h1>

        <div className="pt-filters">
          <div className="pt-tabs" role="group" aria-label="Player type">
            {(["hitters", "pitchers"] as const).map((g) => (
              <button
                key={g}
                type="button"
                className="pt-tab"
                aria-pressed={group === g}
                onClick={() => setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  if (g === "hitters") next.delete("group"); else next.set("group", g);
                  next.delete("pos");
                  return next;
                }, { replace: true })}
              >
                {g === "hitters" ? "Hitters" : "Pitchers"}
              </button>
            ))}
          </div>
          <input
            className="pt-field pt-search"
            type="search"
            aria-label="Search players"
            placeholder="Search players"
            value={searchQuery}
            onChange={(e) => setParam("q", e.target.value)}
          />
          <select className="pt-field" aria-label="Availability" value={avail} onChange={(e) => setParam("avail", e.target.value, "free")}>
            <option value="free">Free agents</option>
            <option value="all">All players</option>
            <option value="taken">On a team</option>
          </select>
          <select className="pt-field" aria-label="Position" value={filterPos} onChange={(e) => setParam("pos", e.target.value, "ALL")}>
            <option value="ALL">All positions</option>
            {positionOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="pt-field" aria-label="Range" value={range} onChange={(e) => setParam("range", e.target.value, "season")}>
            <option value="season">Season</option>
            <option value="period">This period</option>
          </select>
          {phone && (
            <select
              className="pt-field"
              aria-label="Sort by"
              value={sortOptions.some(([k]) => k === sortKey) ? sortKey : "name"}
              onChange={(e) => {
                const key = e.target.value;
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set("sort", key);
                  next.set("desc", ASC_KEYS.has(key) ? "0" : "1");
                  return next;
                }, { replace: true });
              }}
            >
              {sortOptions.map(([k, label]) => <option key={k} value={k}>{`Sort: ${label}`}</option>)}
            </select>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", margin: "8px 0" }}>
          <StatsUpdated source="synced" timestamp={computedAt} className="text-xs" />
        </div>

        {visible.length === 0 ? (
          <EmptyState icon={Search} title="No players found" description="Try adjusting your search or filters." />
        ) : (
          <PlayersTable
            rows={visible}
            group={group}
            mode="season"
            myTeamId={myTeamId ?? null}
            myTeamCode={myTeamCode ?? null}
            pendingPeriodId={pendingPeriodId}
            listedIds={listedIds}
            onWireListAdd={onWireListAdd}
            sortKey={sortKey}
            sortDesc={sortDesc}
            onSort={handleSort}
          />
        )}
      </div>
    </div>
  );
}
