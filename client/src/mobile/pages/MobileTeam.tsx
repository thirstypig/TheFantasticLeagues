/*
 * MobileTeam — Aurora mobile twin for `/teams/:teamCode` (read-only slice).
 *
 * Wires the roster hub to the desktop's `getTeamRosterHub(teamId)`
 * endpoint — same shape, same partitioning (hitters / pitchers / IL).
 * The team-code → teamId resolution mirrors how desktop does it: load
 * `getTeams(leagueId)` to find the team whose `code` matches the URL
 * param, then fetch the hub against the resolved id.
 *
 * This slice is read-only. Lineup edit (drag-to-bench → long-press
 * menu per spec), claim/drop, IL stash/activate — all follow as a
 * separate PR. Tap row → `/players/:mlbId` for the desktop player
 * detail page (same as MobilePlayers).
 *
 * Hero strip: team initials avatar + name + budget · FAAB · MV · PTS
 * compact stat strip per the design canvas. PTS comes from the
 * standings query (same data the desktop hero card uses).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { useLeague } from "../../contexts/LeagueContext";
import { getTeams, getTeamRosterHub, updateRosterPosition } from "../../features/teams/api";
import { getSeasonStandings } from "../../api";
import { reportError } from "../../lib/errorBus";
import type { RosterHubResponse } from "@shared/api/teams";
import type { LeagueTeam } from "../../api/types";
import type { RosterHubRow } from "@shared/api/teams";
import { MobileTopbar } from "../MobileTopbar";
import { MCard, MIridRing, MIridText } from "../atoms/MCard";
import { MSegmented } from "../atoms/MSegmented";
import { Glyph } from "../atoms/Glyph";
import { MobileTeamMoveSheet } from "./MobileTeamMoveSheet";

type Tab = "Hitters" | "Pitchers" | "IL";

function teamInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "—"
  );
}

function fmtAvg(v?: number): string {
  if (v == null) return "—";
  return v.toFixed(3).replace(/^0/, "");
}

function fmtRate(v: number | undefined, digits: number): string {
  if (v == null) return "—";
  return v.toFixed(digits);
}

function fmtInt(v?: number): string {
  if (v == null || v === 0) return v === 0 ? "0" : "—";
  return String(v);
}

function rosterTeamCode(t: LeagueTeam): string | null {
  return typeof t.code === "string" ? t.code : null;
}

interface MobileTeamProps {
  /** Resolved by MobileShell from the URL pathname. */
  teamCode: string;
}

export function MobileTeam({ teamCode }: MobileTeamProps) {
  const nav = useNavigate();
  const { user } = useAuth();
  const { leagueId, myTeamId } = useLeague();

  const [teamId, setTeamId] = useState<number | null>(null);
  const [hub, setHub] = useState<RosterHubResponse | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Hitters");
  // Roster row currently selected for a move — drives MobileTeamMoveSheet.
  const [moveSheetRow, setMoveSheetRow] = useState<RosterHubRow | null>(null);
  // rosterId set is the player's row id; tracks rows with an in-flight
  // updateRosterPosition call to disable repeat moves while pending.
  const [movePending, setMovePending] = useState<Set<number>>(new Set());
  const [moveError, setMoveError] = useState<string | null>(null);

  // Resolve teamCode → teamId using the league's teams list, then fan
  // out to the roster hub + standings. This is the same join the
  // desktop Team page does in its outer fetch.
  useEffect(() => {
    if (!leagueId || !teamCode) return;
    let canceled = false;
    setLoading(true);
    setError(null);
    setTeamId(null);
    setHub(null);
    setPoints(null);
    setRank(null);

    (async () => {
      try {
        const teams = await getTeams(leagueId);
        if (canceled) return;
        const match = teams.find((t) => rosterTeamCode(t) === teamCode);
        if (!match) {
          setError(`Team "${teamCode}" not found in this league.`);
          return;
        }
        setTeamId(match.id);
        const [hubRes, standingsRes] = await Promise.allSettled([
          getTeamRosterHub(match.id),
          getSeasonStandings(leagueId),
        ]);
        if (canceled) return;
        if (hubRes.status === "fulfilled") {
          setHub(hubRes.value);
        } else {
          setError("Failed to load roster.");
        }
        if (standingsRes.status === "fulfilled") {
          const rows = standingsRes.value.rows ?? [];
          const ranked = rows
            .map((row) => {
              const r = row as Record<string, unknown>;
              const pp = Array.isArray(r.periodPoints) ? (r.periodPoints as unknown[]) : [];
              const total = pp.reduce<number>(
                (s, v) => s + (Number.isFinite(Number(v)) ? Number(v) : 0),
                0,
              );
              return {
                teamCode: typeof r.teamCode === "string" ? r.teamCode : null,
                total,
              };
            })
            .sort((a, b) => b.total - a.total);
          const myIdx = ranked.findIndex((row) => row.teamCode === teamCode);
          if (myIdx >= 0) {
            setRank(myIdx + 1);
            setPoints(ranked[myIdx].total > 0 ? ranked[myIdx].total : null);
          }
        }
      } catch (err: unknown) {
        if (canceled) return;
        setError(err instanceof Error ? err.message : "Failed to load team");
      } finally {
        if (!canceled) setLoading(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [leagueId, teamCode]);

  const isMyTeam = !!myTeamId && teamId === myTeamId;
  // Mutations are allowed only on the user's own team (or by admins).
  const canEdit = isMyTeam || Boolean(user?.isAdmin);

  /**
   * Apply a lineup change. Optimistically updates the in-memory hub so
   * the row visually moves immediately; on failure, refetches the hub
   * to restore truth from the server.
   */
  const applyMove = useCallback(
    async (row: RosterHubRow, nextSlot: string) => {
      if (teamId == null) return;
      setMoveSheetRow(null);
      setMoveError(null);
      setMovePending((prev) => new Set(prev).add(row.rosterId));

      // Snapshot the previous slot so we can roll back on failure.
      const prevSlot = row.assignedPosition ?? row.posPrimary ?? null;

      // Optimistic update — clone the hub and re-partition the row so
      // hitters/pitchers/IL stays consistent with the new assignedPosition.
      setHub((prev) => {
        if (!prev) return prev;
        const allRows = [...prev.hitters, ...prev.pitchers, ...prev.ilPlayers];
        const next = allRows.map((r) =>
          r.rosterId === row.rosterId ? { ...r, assignedPosition: nextSlot } : r,
        );
        return {
          ...prev,
          hitters: next.filter((r) => !r.isPitcher && r.assignedPosition !== "IL"),
          pitchers: next.filter((r) => r.isPitcher && r.assignedPosition !== "IL"),
          ilPlayers: next.filter((r) => r.assignedPosition === "IL"),
        };
      });

      try {
        await updateRosterPosition(teamId, row.rosterId, nextSlot);
      } catch (err: unknown) {
        reportError(err, { source: "mobile-team-move" });
        setMoveError(err instanceof Error ? err.message : "Failed to move player");
        // Rollback by restoring the previous slot on the row.
        setHub((prev) => {
          if (!prev) return prev;
          const allRows = [...prev.hitters, ...prev.pitchers, ...prev.ilPlayers];
          const next = allRows.map((r) =>
            r.rosterId === row.rosterId ? { ...r, assignedPosition: prevSlot } : r,
          );
          return {
            ...prev,
            hitters: next.filter((r) => !r.isPitcher && r.assignedPosition !== "IL"),
            pitchers: next.filter((r) => r.isPitcher && r.assignedPosition !== "IL"),
            ilPlayers: next.filter((r) => r.assignedPosition === "IL"),
          };
        });
      } finally {
        setMovePending((prev) => {
          const next = new Set(prev);
          next.delete(row.rosterId);
          return next;
        });
      }
    },
    [teamId],
  );
  const teamName = hub?.team.name ?? teamCode ?? "Team";
  const budget = hub?.team.budget;

  const tabs = useMemo<Tab[]>(() => {
    if (!hub) return ["Hitters", "Pitchers"] as Tab[];
    return hub.ilPlayers.length > 0
      ? (["Hitters", "Pitchers", "IL"] as Tab[])
      : (["Hitters", "Pitchers"] as Tab[]);
  }, [hub]);

  const list: RosterHubRow[] = useMemo(() => {
    if (!hub) return [];
    if (tab === "Hitters") return hub.hitters;
    if (tab === "Pitchers") return hub.pitchers;
    return hub.ilPlayers;
  }, [hub, tab]);

  const isHit = tab !== "Pitchers";
  // Add a trailing 26px move-button column when the user can edit and
  // the active tab isn't IL (IL stash/activate is a separate flow).
  const showMoveCol = canEdit && tab !== "IL";
  const cols = showMoveCol
    ? "32px minmax(0,1fr) 36px 36px 36px 36px 26px"
    : "32px minmax(0,1fr) 36px 36px 36px 36px";
  const hitterStatHeaders = ["AVG", "HR", "RBI", "SB"];
  const pitcherStatHeaders = ["W", "K", "ERA", "WHIP"];
  const statHeaders = isHit ? hitterStatHeaders : pitcherStatHeaders;

  return (
    <div data-testid="mobile-team">
      <MobileTopbar
        title={teamName}
        subtitle={
          rank != null && points != null
            ? `${ordinal(rank)} place · ${points.toFixed(1)} pts`
            : isMyTeam
              ? "Your team"
              : "Roster"
        }
        leading={<Glyph kind="back" size={20} />}
        onLeadingClick={() => nav(-1)}
        trailing={<Glyph kind="moreDots" size={20} />}
      />

      {/* HERO STRIP */}
      <div style={{ padding: "0 14px 10px" }}>
        <MIridRing>
          <div
            style={{
              padding: 12,
              display: "grid",
              gridTemplateColumns: "auto 1fr auto auto auto",
              gap: 10,
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "var(--am-irid)",
                display: "grid",
                placeItems: "center",
                fontFamily: "var(--am-display)",
                fontSize: 16,
                color: "#fff",
              }}
            >
              {teamInitials(teamName)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "var(--am-display)",
                  fontSize: 15,
                  lineHeight: 1.05,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {teamName}
              </div>
              <div style={{ fontSize: 10, color: "var(--am-text-muted)", marginTop: 2 }}>
                {hub?.team.owner ?? (isMyTeam ? "You" : "Manager")}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: 0.5,
                  color: "var(--am-text-faint)",
                  fontWeight: 600,
                }}
              >
                BUDGET
              </div>
              <div style={{ fontFamily: "var(--am-display)", fontSize: 14 }}>
                {budget != null ? `$${budget}` : "—"}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: 0.5,
                  color: "var(--am-text-faint)",
                  fontWeight: 600,
                }}
              >
                IL
              </div>
              <div style={{ fontFamily: "var(--am-display)", fontSize: 14 }}>
                {hub?.ilPlayers.length ?? 0}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: 0.5,
                  color: "var(--am-text-faint)",
                  fontWeight: 600,
                }}
              >
                PTS
              </div>
              <div>
                <MIridText size={16}>
                  {points != null ? points.toFixed(0) : "—"}
                </MIridText>
              </div>
            </div>
          </div>
        </MIridRing>
      </div>

      {/* TABS */}
      <div style={{ padding: "0 14px 8px" }}>
        <MSegmented<Tab>
          options={tabs}
          active={tab}
          onChange={setTab}
          ariaLabel="Roster section"
        />
      </div>

      {error && (
        <div style={{ padding: "12px 18px", color: "var(--am-negative)", fontSize: 12 }}>{error}</div>
      )}

      {/* COLUMN HEADER STRIP */}
      <div
        style={{
          padding: "0 16px 4px",
          display: "grid",
          gridTemplateColumns: cols,
          gap: 6,
          alignItems: "center",
        }}
      >
        <div />
        <div
          style={{
            fontSize: 9,
            letterSpacing: 0.6,
            color: "var(--am-text-faint)",
            fontWeight: 700,
          }}
        >
          PLAYER
        </div>
        {statHeaders.map((s) => (
          <div
            key={s}
            style={{
              fontSize: 9,
              letterSpacing: 0.6,
              color: "var(--am-text-faint)",
              fontWeight: 700,
              textAlign: "right",
            }}
          >
            {s}
          </div>
        ))}
        {showMoveCol && <div aria-hidden="true" />}
      </div>

      {/* DENSE ROWS */}
      <div style={{ padding: "0 14px 12px" }}>
        <MCard padded={false}>
          {loading && !hub ? (
            <div style={{ padding: "16px 14px", color: "var(--am-text-muted)", fontSize: 12 }}>
              Loading roster…
            </div>
          ) : list.length === 0 ? (
            <div style={{ padding: "16px 14px", color: "var(--am-text-muted)", fontSize: 12 }}>
              No {tab.toLowerCase()} on this roster.
            </div>
          ) : (
            list.map((p, i) => (
              <div
                key={p.rosterId}
                data-testid="mobile-team-row"
                data-mlb-id={p.mlbId ?? ""}
                onClick={() => p.mlbId && nav(`/players/${p.mlbId}`)}
                style={{
                  display: "grid",
                  gridTemplateColumns: cols,
                  gap: 6,
                  alignItems: "center",
                  padding: "7px 14px",
                  borderTop: i > 0 ? "1px solid var(--am-border)" : "none",
                  cursor: p.mlbId ? "pointer" : "default",
                }}
              >
                <div
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    color: "var(--am-text)",
                    background: "var(--am-chip-strong)",
                    padding: "3px 0",
                    borderRadius: 5,
                    textAlign: "center",
                    border: "1px solid var(--am-border)",
                  }}
                >
                  {p.assignedPosition ?? p.posPrimary ?? "—"}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--am-text)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      lineHeight: 1.2,
                    }}
                  >
                    {p.playerName}
                  </div>
                  <div style={{ fontSize: 9.5, color: "var(--am-text-faint)" }}>
                    {(p.mlbTeam ?? "—")} · {p.posPrimary ?? p.position ?? "—"}
                  </div>
                </div>
                {isHit ? (
                  <>
                    <StatCell value={fmtAvg(p.AVG)} />
                    <StatCell value={fmtInt(p.HR)} />
                    <StatCell value={fmtInt(p.RBI)} />
                    <StatCell value={fmtInt(p.SB)} />
                  </>
                ) : (
                  <>
                    <StatCell value={fmtInt(p.W)} />
                    <StatCell value={fmtInt(p.K)} />
                    <StatCell value={fmtRate(p.ERA, 2)} />
                    <StatCell value={fmtRate(p.WHIP, 2)} />
                  </>
                )}
                {showMoveCol && (
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      ev.preventDefault();
                      setMoveSheetRow(p);
                    }}
                    disabled={movePending.has(p.rosterId)}
                    aria-label={`Move ${p.playerName}`}
                    data-testid="mobile-team-move-btn"
                    data-roster-id={p.rosterId}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: movePending.has(p.rosterId) ? "wait" : "pointer",
                      color: "var(--am-text-muted)",
                      opacity: movePending.has(p.rosterId) ? 0.5 : 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 26,
                      height: 26,
                    }}
                  >
                    <Glyph kind="moreDots" size={16} />
                  </button>
                )}
              </div>
            ))
          )}
        </MCard>
      </div>

      {moveError && (
        <div
          data-testid="mobile-team-move-error"
          style={{
            position: "fixed",
            left: 14,
            right: 14,
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
            padding: "10px 14px",
            background: "var(--am-surface-strong)",
            border: "1px solid var(--am-negative)",
            borderRadius: 10,
            color: "var(--am-negative)",
            fontSize: 12,
            zIndex: 35,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <span>{moveError}</span>
          <button
            type="button"
            onClick={() => setMoveError(null)}
            aria-label="Dismiss error"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--am-text-muted)",
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
            }}
          >
            <Glyph kind="x" size={14} />
          </button>
        </div>
      )}

      {moveSheetRow && (
        <MobileTeamMoveSheet
          player={moveSheetRow}
          onPick={(slot) => applyMove(moveSheetRow, slot)}
          onDismiss={() => setMoveSheetRow(null)}
        />
      )}
    </div>
  );
}

function StatCell({ value }: { value: string }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: "var(--am-text)",
        textAlign: "right",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {value}
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
