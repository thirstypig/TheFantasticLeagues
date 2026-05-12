/*
 * MobilePlayers — Aurora mobile twin for `/players`.
 *
 * Reads from the same `getPlayerSeasonStatsMeta(leagueId)` cache the
 * desktop Players page uses — no parallel fetch, no duplicate state.
 * URL params (`group`, `q`, `team`, `pos`, `sort`, `desc`) round-trip
 * to the desktop URL keys so a desktop ↔ mobile handoff preserves
 * filter state.
 *
 * What ships in this slice:
 *   - Hitters / Pitchers toggle (drives stat columns + position chip set)
 *   - League filter chips (All / NL / AL → URL `team` ALL / ALL_NL / ALL_AL)
 *   - Position chips (uses isCMEligible / isMIEligible per design spec)
 *   - Search box (URL `q`)
 *   - Sortable 4-stat table (AVG/HR/RBI/SB hitters · W/K/ERA/WHIP pitchers)
 *   - Tap row → /players/:mlbId (desktop's existing detail page)
 *
 * Deferred to a follow-up:
 *   - Inline expanded row (career table + L15 splits) — shares
 *     PlayerExpandedRow with desktop; needs vertical-layout port
 *   - Watchlist star toggle — needs `getWatchlist` integration
 *   - Stats-mode toggle (season vs per-period)
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLeague } from "../../contexts/LeagueContext";
import { getPlayerSeasonStatsMeta, type PlayerSeasonStat } from "../../api";
import { isCMEligible, isMIEligible } from "../../lib/baseballUtils";
import { NL_TEAMS } from "../../lib/sports/baseball";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "../../features/watchlist/api";
import { getActivePeriod } from "../../features/wire-list/api";
import { reportError } from "../../lib/errorBus";
import { MobileTopbar } from "../MobileTopbar";
import { MCard, MIridText } from "../atoms/MCard";
import { MSegmented } from "../atoms/MSegmented";
import { MSortHeader, type SortDir } from "../atoms/MSortHeader";
import { Glyph } from "../atoms/Glyph";
import { MobilePlayerExpand } from "./MobilePlayerExpand";

type GroupKey = "Hitters" | "Pitchers";
type LeagueChip = "All" | "NL" | "AL";

const HIT_POSITIONS = ["All", "C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH"] as const;
const PITCH_POSITIONS = ["All", "P", "SP", "RP"] as const;

const HIT_SORT_KEYS = ["AVG", "HR", "RBI", "SB"] as const;
const PITCH_SORT_KEYS = ["W", "K", "ERA", "WHIP"] as const;

type HitSortKey = (typeof HIT_SORT_KEYS)[number] | "name";
type PitchSortKey = (typeof PITCH_SORT_KEYS)[number] | "name";
type SortKey = HitSortKey | PitchSortKey;

function teamAbbr(p: PlayerSeasonStat): string {
  return p.mlb_team_abbr ?? p.mlb_team ?? p.mlbTeam ?? p.team ?? "—";
}

function displayName(p: PlayerSeasonStat): string {
  return p.player_name ?? p.mlb_full_name ?? p.name ?? "Unknown";
}

function positionFor(p: PlayerSeasonStat): string {
  return p.posPrimary ?? p.pos ?? "";
}

function matchesPosition(p: PlayerSeasonStat, pos: string): boolean {
  if (pos === "All") return true;
  const positions = p.positions ?? p.posPrimary ?? p.pos ?? "";
  if (pos === "MI") return isMIEligible(positions);
  if (pos === "CM") return isCMEligible(positions);
  if (pos === "P") {
    // Generic pitcher chip: accept SP and RP.
    const list = positions.split(",").map((s) => s.trim());
    return list.includes("SP") || list.includes("RP") || list.includes("P");
  }
  const list = positions.split(",").map((s) => s.trim());
  return list.includes(pos);
}

function statValue(p: PlayerSeasonStat, key: SortKey): number {
  if (key === "name") return 0;
  const v = (p as unknown as Record<string, unknown>)[key];
  return typeof v === "number" ? v : 0;
}

function statText(p: PlayerSeasonStat, key: Exclude<SortKey, "name">): string {
  if (key === "AVG") return (p.AVG ?? 0).toFixed(3).replace(/^0/, "");
  if (key === "ERA") return (p.ERA ?? 0).toFixed(2);
  if (key === "WHIP") return (p.WHIP ?? 0).toFixed(2);
  return String(statValue(p, key));
}

export function MobilePlayers() {
  const nav = useNavigate();
  const { leagueId, myTeamId } = useLeague();
  const [allPlayers, setAllPlayers] = useState<PlayerSeasonStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watchedIds, setWatchedIds] = useState<Set<number>>(new Set());
  const [watchPending, setWatchPending] = useState<Set<number>>(new Set());
  const canWatch = myTeamId != null;
  // Player.id of the currently expanded inline panel; null = none open.
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [activePeriodId, setActivePeriodId] = useState<number | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const group: GroupKey = searchParams.get("group") === "pitchers" ? "Pitchers" : "Hitters";
  const isHit = group === "Hitters";
  const teamParam = searchParams.get("team") ?? "ALL_NL";
  const leagueChip: LeagueChip =
    teamParam === "ALL_NL" ? "NL" : teamParam === "ALL_AL" ? "AL" : "All";
  const pos = searchParams.get("pos") ?? "All";
  const q = searchParams.get("q") ?? "";
  const sortKeyRaw = searchParams.get("sort") ?? (isHit ? "HR" : "K");
  const sortDir: SortDir = (searchParams.get("desc") ?? "1") === "1" ? "desc" : "asc";

  const sortKey = (() => {
    const valid = isHit ? [...HIT_SORT_KEYS, "name"] : [...PITCH_SORT_KEYS, "name"];
    return (valid as readonly string[]).includes(sortKeyRaw) ? (sortKeyRaw as SortKey) : (isHit ? "HR" : "K");
  })();

  function setUrlParam(key: string, value: string | null, defaults: Record<string, string>) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value == null || value === (defaults[key] ?? "")) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  }

  const setGroup = (g: GroupKey) => {
    // Reset group, sort, and position in a single URL update so we don't
    // race three batched updates against each other (each functional
    // updater chains off the previous state, but multiple separate calls
    // can still be reordered under React 18 transitions).
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (g === "Pitchers") next.set("group", "pitchers");
        else next.delete("group");
        next.delete("sort");
        next.delete("desc");
        next.delete("pos");
        return next;
      },
      { replace: true },
    );
  };
  const setLeagueChip = (l: LeagueChip) => {
    setUrlParam("team", l === "NL" ? "ALL_NL" : l === "AL" ? "ALL_AL" : "ALL", { team: "ALL_NL" });
  };
  const setPos = (p: string) => setUrlParam("pos", p, { pos: "All" });
  const setQ = (s: string) => setUrlParam("q", s, { q: "" });
  const onSort = (k: SortKey) => {
    if (sortKey === k) {
      setUrlParam("desc", sortDir === "desc" ? "0" : "1", { desc: "1" });
    } else {
      setUrlParam("sort", k, { sort: isHit ? "HR" : "K" });
      setUrlParam("desc", "1", { desc: "1" });
    }
  };

  useEffect(() => {
    if (!leagueId) return;
    let canceled = false;
    setLoading(true);
    setError(null);
    getPlayerSeasonStatsMeta(leagueId)
      .then((resp) => {
        if (canceled) return;
        setAllPlayers(resp.stats ?? []);
      })
      .catch((err: unknown) => {
        if (canceled) return;
        setError(err instanceof Error ? err.message : "Failed to load players");
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId) return;
    let canceled = false;
    getActivePeriod(leagueId)
      .then(({ period }) => {
        if (canceled) return;
        // Only surface the period id when it's still editable
        setActivePeriodId(period?.status === "PENDING" ? period.id : null);
      })
      .catch(() => {});
    return () => { canceled = true; };
  }, [leagueId]);

  // Watchlist hydration — same shape desktop Players.tsx uses.
  useEffect(() => {
    if (myTeamId == null) {
      setWatchedIds(new Set());
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await getWatchlist(myTeamId);
        if (!alive) return;
        setWatchedIds(new Set(res.items.map((w) => w.player.id)));
      } catch (err) {
        reportError(err, { source: "mobile-watchlist-load" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [myTeamId]);

  const toggleWatch = useCallback(
    async (playerId: number, isCurrentlyWatched: boolean, ev?: React.MouseEvent) => {
      ev?.stopPropagation();
      ev?.preventDefault();
      if (myTeamId == null) return;
      setWatchPending((prev) => new Set(prev).add(playerId));
      // Optimistic flip — desktop pattern.
      setWatchedIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlyWatched) next.delete(playerId);
        else next.add(playerId);
        return next;
      });
      try {
        if (isCurrentlyWatched) {
          await removeFromWatchlist(playerId, myTeamId);
        } else {
          await addToWatchlist({ teamId: myTeamId, playerId });
        }
      } catch (err) {
        // Rollback on failure.
        setWatchedIds((prev) => {
          const next = new Set(prev);
          if (isCurrentlyWatched) next.add(playerId);
          else next.delete(playerId);
          return next;
        });
        reportError(err, {
          source: isCurrentlyWatched ? "mobile-watchlist-remove" : "mobile-watchlist-add",
        });
      } finally {
        setWatchPending((prev) => {
          const next = new Set(prev);
          next.delete(playerId);
          return next;
        });
      }
    },
    [myTeamId],
  );

  const positions = isHit ? HIT_POSITIONS : PITCH_POSITIONS;
  const sortKeys: readonly Exclude<SortKey, "name">[] = isHit ? HIT_SORT_KEYS : PITCH_SORT_KEYS;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return allPlayers.filter((p) => {
      // Group filter
      const pitcher = p.is_pitcher ?? p.isPitcher ?? false;
      if (isHit && pitcher) return false;
      if (!isHit && !pitcher) return false;
      // League filter
      const abbr = teamAbbr(p);
      if (leagueChip === "NL" && !NL_TEAMS.has(abbr)) return false;
      if (leagueChip === "AL" && NL_TEAMS.has(abbr)) return false;
      // Position
      if (!matchesPosition(p, pos)) return false;
      // Search
      if (needle) {
        const name = displayName(p).toLowerCase();
        const team = abbr.toLowerCase();
        const position = positionFor(p).toLowerCase();
        if (!name.includes(needle) && !team.includes(needle) && !position.includes(needle)) {
          return false;
        }
      }
      return true;
    });
  }, [allPlayers, isHit, leagueChip, pos, q]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (sortKey === "name") {
        const na = displayName(a);
        const nb = displayName(b);
        return sortDir === "desc" ? nb.localeCompare(na) : na.localeCompare(nb);
      }
      const av = statValue(a, sortKey);
      const bv = statValue(b, sortKey);
      // ERA / WHIP are inverse — lower is better. Treat "desc" as
      // best-first regardless of axis direction.
      if (sortKey === "ERA" || sortKey === "WHIP") {
        return sortDir === "desc" ? av - bv : bv - av;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const visible = useMemo(() => sorted.slice(0, 200), [sorted]);

  const cols = canWatch
    ? "20px minmax(0,1fr) 36px 36px 40px 40px"
    : "minmax(0,1fr) 36px 36px 40px 40px";

  return (
    <div data-testid="mobile-players">
      <MobileTopbar
        title="Players"
        subtitle={
          loading
            ? "Loading…"
            : `${filtered.length.toLocaleString()} ${isHit ? "hitters" : "pitchers"}`
        }
        leading={<Glyph kind="filter" size={20} />}
        trailing={<Glyph kind="moreDots" size={20} />}
      />

      {/* SEARCH */}
      <div style={{ padding: "0 14px 10px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 14px",
            borderRadius: 12,
            background: "var(--am-surface-strong)",
            border: "1px solid var(--am-border)",
          }}
        >
          <span style={{ color: "var(--am-text-faint)" }}>
            <Glyph kind="search" size={16} />
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search players, teams, positions…"
            data-testid="mobile-players-search"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 13,
              color: "var(--am-text)",
              fontFamily: "inherit",
            }}
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear search"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--am-text-faint)",
                cursor: "pointer",
                padding: 0,
                display: "flex",
              }}
            >
              <Glyph kind="x" size={14} />
            </button>
          )}
        </div>
      </div>

      {/* HITTERS / PITCHERS */}
      <div style={{ padding: "0 14px 8px" }}>
        <MSegmented<GroupKey>
          options={["Hitters", "Pitchers"]}
          active={group}
          onChange={setGroup}
          ariaLabel="Player group"
        />
      </div>

      {/* LEAGUE chips */}
      <div style={{ padding: "0 14px 6px", display: "flex", gap: 5, alignItems: "center" }}>
        <span
          style={{
            fontSize: 9.5,
            letterSpacing: 0.6,
            fontWeight: 700,
            color: "var(--am-text-faint)",
            marginRight: 4,
          }}
        >
          LG
        </span>
        {(["All", "NL", "AL"] as const).map((l) => {
          const on = leagueChip === l;
          return (
            <button
              key={l}
              type="button"
              onClick={() => setLeagueChip(l)}
              data-league-chip={l}
              style={{
                padding: "4px 10px",
                borderRadius: 99,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                background: on ? "var(--am-irid)" : "var(--am-chip)",
                color: on ? "#fff" : "var(--am-text-muted)",
                border: "1px solid " + (on ? "transparent" : "var(--am-border)"),
                fontFamily: "inherit",
                minHeight: 28,
              }}
            >
              {l}
            </button>
          );
        })}
      </div>

      {/* POSITION CHIPS */}
      <div style={{ padding: "4px 14px 8px", display: "flex", gap: 5, flexWrap: "wrap" }}>
        {positions.map((p) => {
          const on = pos === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPos(p)}
              data-pos-chip={p}
              style={{
                padding: "5px 11px",
                borderRadius: 99,
                fontSize: 11.5,
                fontWeight: 600,
                cursor: "pointer",
                background: on ? "var(--am-irid)" : "var(--am-chip)",
                color: on ? "#fff" : "var(--am-text-muted)",
                border: "1px solid " + (on ? "transparent" : "var(--am-border)"),
                fontFamily: "inherit",
                minHeight: 28,
              }}
            >
              {p}
            </button>
          );
        })}
      </div>

      {/* PLAYER TABLE */}
      <div style={{ padding: "0 14px 12px" }}>
        <MCard padded={false}>
          <div
            role="row"
            style={{
              display: "grid",
              gridTemplateColumns: cols,
              alignItems: "center",
              gap: 4,
              padding: "2px 12px",
              borderBottom: "1px solid var(--am-border-strong)",
              background: "var(--am-surface-faint)",
            }}
          >
            {canWatch && <div aria-hidden="true" />}
            <MSortHeader<SortKey>
              k="name"
              label="PLAYER"
              active={sortKey}
              dir={sortDir}
              onSort={onSort}
              align="left"
            />
            {sortKeys.map((k) => (
              <MSortHeader<SortKey>
                key={k}
                k={k}
                label={k}
                active={sortKey}
                dir={sortDir}
                onSort={onSort}
                align="right"
              />
            ))}
          </div>

          {error && (
            <div style={{ padding: "12px 14px", color: "var(--am-negative)", fontSize: 12 }}>{error}</div>
          )}

          {loading && !allPlayers.length ? (
            <div style={{ padding: "16px 14px", color: "var(--am-text-muted)", fontSize: 12 }}>
              Loading players…
            </div>
          ) : visible.length === 0 ? (
            <div style={{ padding: "16px 14px", color: "var(--am-text-muted)", fontSize: 12 }}>
              No players match these filters.
            </div>
          ) : (
            visible.map((p, i) => {
              const isWatched = watchedIds.has(p.id);
              const pending = watchPending.has(p.id);
              const isOpen = expandedId === p.id;
              return (
              <React.Fragment key={p.id}>
              <div
                role="row"
                data-testid="mobile-players-row"
                data-mlb-id={p.mlb_id}
                data-expanded={isOpen ? "1" : "0"}
                onClick={() => setExpandedId(isOpen ? null : p.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: cols,
                  alignItems: "center",
                  gap: 4,
                  padding: "8px 12px",
                  borderTop: i > 0 ? "1px solid var(--am-border)" : "none",
                  cursor: "pointer",
                  background: isOpen ? "var(--am-chip-strong)" : "transparent",
                }}
              >
                {canWatch && (
                  <button
                    type="button"
                    onClick={(ev) => toggleWatch(p.id, isWatched, ev)}
                    disabled={pending}
                    aria-label={isWatched ? "Remove from watchlist" : "Add to watchlist"}
                    aria-pressed={isWatched}
                    data-testid="mobile-players-watch-toggle"
                    data-watched={isWatched ? "1" : "0"}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: pending ? "wait" : "pointer",
                      color: isWatched ? "var(--am-accent)" : "var(--am-text-faint)",
                      opacity: pending ? 0.5 : 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 20,
                      height: 20,
                    }}
                  >
                    <Glyph kind={isWatched ? "starOn" : "star"} size={14} />
                  </button>
                )}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--am-text)",
                      fontWeight: 600,
                      lineHeight: 1.2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {displayName(p)}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--am-text-faint)", marginTop: 2 }}>
                    {teamAbbr(p)} · {positionFor(p)}
                  </div>
                </div>
                {sortKeys.map((k, idx) => {
                  const isLast = idx === sortKeys.length - 1;
                  return (
                    <div
                      key={k}
                      style={{
                        textAlign: "right",
                        fontSize: 12.5,
                        fontWeight: isLast ? 700 : 500,
                        fontVariantNumeric: "tabular-nums",
                        color: "var(--am-text)",
                      }}
                    >
                      {isLast ? <MIridText size={13} weight={700}>{statText(p, k)}</MIridText> : statText(p, k)}
                    </div>
                  );
                })}
              </div>
              {isOpen && (
                <MobilePlayerExpand
                  player={p}
                  isWatched={isWatched}
                  watchPending={pending}
                  onToggleWatch={() => toggleWatch(p.id, isWatched)}
                  activePeriodId={activePeriodId ?? undefined}
                  myTeamId={myTeamId ?? undefined}
                />
              )}
              </React.Fragment>
              );
            })
          )}
        </MCard>
      </div>

      <div style={{ padding: "0 14px 16px" }}>
        <div style={{ fontSize: 10, color: "var(--am-text-faint)", padding: "0 4px" }}>
          {visible.length < sorted.length
            ? `Showing top ${visible.length} of ${sorted.length}. Tighten filters to narrow.`
            : "Tap any column header to sort. Tap a row to expand career stats."}
        </div>
      </div>
    </div>
  );
}
