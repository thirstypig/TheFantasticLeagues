// client/src/features/players/pages/InjuredListPage.tsx
//
// League-wide IL view: every roster across the league filtered to just IL
// players. Sortable by AL/NL (player's MLB team) and by fantasy team.
//
// Data sourcing strategy:
// - The shared `/api/mlb/roster-status` endpoint is per-fantasy-team
//   (`teamId` query param). There is currently no league-wide aggregator,
//   so we enumerate teams via `getLeague(leagueId)` and fan out per-team
//   fetches in parallel. If a league-wide endpoint ships later, swap this
//   block for a single fetch and drop the per-team plumbing.
//   TODO(server): consider adding `GET /api/mlb/roster-status?leagueId=X&allTeams=true`
//   to coalesce these fan-out reads.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useLeague } from "../../../contexts/LeagueContext";
import { getLeague } from "../../../api";
import type { LeagueTeam } from "../../../api/types";
import { fetchJsonApi, API_BASE } from "../../../api/base";
import { Glass, SectionLabel, IridText, Chip, Dot } from "../../../components/aurora/atoms";
import type { RosterAlertPlayer } from "../../../components/shared/RosterAlertAccordion";
import { AL_TEAMS, NL_TEAMS } from "../../../lib/sports/baseball";
import { getOgbaTeamName } from "../../../lib/ogbaTeams";

type ViewMode = "ALL" | "BY_LEAGUE" | "BY_TEAM";

interface IlEntry extends RosterAlertPlayer {
  fantasyTeamId: number;
  fantasyTeamCode: string;
  fantasyTeamName: string;
}

const MLB_HEADSHOT = (mlbId: number | null | undefined) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${mlbId}/headshot/67/current`;

function ilStatusLabel(mlbStatus: string): string {
  const m = (mlbStatus || "").match(/(\d+)/);
  return m ? `${m[1]}-Day IL` : "IL";
}

function mlbLeagueOf(mlbTeam: string | null | undefined): "AL" | "NL" | "—" {
  const code = String(mlbTeam ?? "").trim().toUpperCase();
  if (AL_TEAMS.has(code)) return "AL";
  if (NL_TEAMS.has(code)) return "NL";
  return "—";
}

function formatShortDate(yyyyMmDd: string | null | undefined): string | null {
  if (!yyyyMmDd) return null;
  const d = new Date(yyyyMmDd + "T12:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function InjuredListPage() {
  const { leagueId, currentLeagueName } = useLeague();
  const [teams, setTeams] = useState<LeagueTeam[]>([]);
  const [entries, setEntries] = useState<IlEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("ALL");

  // Load teams + per-team roster status in parallel.
  useEffect(() => {
    if (!leagueId) return;
    let canceled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { league } = await getLeague(leagueId);
        if (canceled) return;
        const ts = league.teams ?? [];
        setTeams(ts);

        if (ts.length === 0) {
          setEntries([]);
          return;
        }

        const settled = await Promise.allSettled(
          ts.map((t) =>
            fetchJsonApi<{ players: RosterAlertPlayer[] }>(
              `${API_BASE}/mlb/roster-status?leagueId=${leagueId}&teamId=${t.id}`,
            ).then((res) => ({ team: t, players: res.players ?? [] })),
          ),
        );
        if (canceled) return;

        const all: IlEntry[] = [];
        for (const r of settled) {
          if (r.status !== "fulfilled") continue;
          const { team, players } = r.value;
          for (const p of players) {
            if (!p.isInjured) continue;
            all.push({
              ...p,
              fantasyTeamId: team.id,
              fantasyTeamCode: team.code,
              fantasyTeamName: team.name || getOgbaTeamName(team.code),
            });
          }
        }

        // Stable default sort: by fantasy team name, then player name.
        all.sort(
          (a, b) =>
            a.fantasyTeamName.localeCompare(b.fantasyTeamName) ||
            a.playerName.localeCompare(b.playerName),
        );

        setEntries(all);
      } catch (err) {
        if (canceled) return;
        setError(err instanceof Error ? err.message : "Failed to load IL data");
      } finally {
        if (!canceled) setLoading(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [leagueId]);

  const total = entries.length;

  const byLeague = useMemo(() => {
    const al: IlEntry[] = [];
    const nl: IlEntry[] = [];
    const other: IlEntry[] = [];
    for (const e of entries) {
      const lg = mlbLeagueOf(e.mlbTeam);
      if (lg === "AL") al.push(e);
      else if (lg === "NL") nl.push(e);
      else other.push(e);
    }
    return { al, nl, other };
  }, [entries]);

  const byTeam = useMemo(() => {
    const map = new Map<number, { team: { id: number; code: string; name: string }; players: IlEntry[] }>();
    for (const e of entries) {
      const slot = map.get(e.fantasyTeamId) ?? {
        team: { id: e.fantasyTeamId, code: e.fantasyTeamCode, name: e.fantasyTeamName },
        players: [] as IlEntry[],
      };
      slot.players.push(e);
      map.set(e.fantasyTeamId, slot);
    }
    // Include teams with no IL players too (handy when "By Team" view is active)
    for (const t of teams) {
      if (!map.has(t.id)) {
        map.set(t.id, {
          team: { id: t.id, code: t.code, name: t.name || getOgbaTeamName(t.code) },
          players: [],
        });
      }
    }
    const arr = [...map.values()];
    arr.sort((a, b) => a.team.name.localeCompare(b.team.name));
    return arr;
  }, [entries, teams]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Hero */}
      <Glass strong>
        <SectionLabel>✦ Injured List</SectionLabel>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontFamily: "var(--am-display)",
                fontSize: 30,
                fontWeight: 300,
                color: "var(--am-text)",
                margin: 0,
                lineHeight: 1.1,
              }}
            >
              Injured List
            </h1>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)" }}>
              Every IL player across the league, by team and league.
            </div>
            {currentLeagueName && (
              <div style={{ marginTop: 4, fontSize: 11, color: "var(--am-text-faint)" }}>{currentLeagueName}</div>
            )}
          </div>
          {total > 0 && (
            <div style={{ textAlign: "right" }}>
              <IridText size={48}>{total}</IridText>
              <div style={{ fontSize: 11, color: "var(--am-text-faint)", marginTop: 4, letterSpacing: 1.2, textTransform: "uppercase" }}>
                On the IL
              </div>
            </div>
          )}
        </div>
      </Glass>

      {/* View toggle */}
      <Glass>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <SectionLabel style={{ marginBottom: 0, marginRight: 4 }}>View</SectionLabel>
          <ViewPill active={view === "ALL"} onClick={() => setView("ALL")}>All Teams</ViewPill>
          <ViewPill active={view === "BY_LEAGUE"} onClick={() => setView("BY_LEAGUE")}>By League (AL/NL)</ViewPill>
          <ViewPill active={view === "BY_TEAM"} onClick={() => setView("BY_TEAM")}>By Team</ViewPill>
        </div>
      </Glass>

      {/* Body states */}
      {loading ? (
        <Glass>
          <div style={{ padding: 32, textAlign: "center", color: "var(--am-text-muted)", fontSize: 13 }}>
            Loading league-wide IL data…
          </div>
        </Glass>
      ) : error ? (
        <Glass>
          <div style={{ padding: 16, color: "rgb(248, 113, 113)", fontSize: 13, textAlign: "center" }}>
            Failed to load IL data – {error}
          </div>
        </Glass>
      ) : total === 0 ? (
        <Glass>
          <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <Chip strong color="rgb(134, 239, 172)">
              <Dot color="rgb(74, 222, 128)" /> Healthy
            </Chip>
            <div style={{ fontSize: 14, color: "var(--am-text)" }}>
              No players currently on IL across the league. ✓
            </div>
          </div>
        </Glass>
      ) : view === "ALL" ? (
        <Glass padded>
          <SectionLabel>All teams · {total} player{total === 1 ? "" : "s"}</SectionLabel>
          <PlayerList entries={entries} showFantasyTeam />
        </Glass>
      ) : view === "BY_LEAGUE" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
          <LeagueColumn label="American League" tone="rgb(248, 180, 217)" entries={byLeague.al} />
          <LeagueColumn label="National League" tone="rgb(180, 198, 252)" entries={byLeague.nl} />
          {byLeague.other.length > 0 && (
            <LeagueColumn label="Unaffiliated / Other" tone="var(--am-text-muted)" entries={byLeague.other} />
          )}
        </div>
      ) : (
        // BY_TEAM
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {byTeam.map((g) => (
            <Glass key={g.team.id}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span
                    style={{
                      fontFamily: "var(--am-display)",
                      fontSize: 18,
                      color: "var(--am-text)",
                      fontWeight: 400,
                    }}
                  >
                    {g.team.name}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--am-text-faint)", letterSpacing: 0.5 }}>{g.team.code}</span>
                </div>
                <Chip>{g.players.length} on IL</Chip>
              </div>
              {g.players.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--am-text-faint)", padding: "4px 0" }}>
                  No players on IL.
                </div>
              ) : (
                <PlayerList entries={g.players} showFantasyTeam={false} />
              )}
            </Glass>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── helper components ───

function ViewPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 99,
        fontSize: 12,
        fontWeight: 500,
        background: active ? "var(--am-chip-strong)" : "var(--am-chip)",
        color: active ? "var(--am-text)" : "var(--am-text-muted)",
        border: "1px solid " + (active ? "var(--am-border-strong)" : "var(--am-border)"),
        cursor: "pointer",
        letterSpacing: 0.2,
      }}
    >
      {children}
    </button>
  );
}

function LeagueColumn({
  label,
  tone,
  entries,
}: {
  label: string;
  tone: string;
  entries: IlEntry[];
}) {
  return (
    <Glass>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <SectionLabel style={{ marginBottom: 0, color: tone }}>{label}</SectionLabel>
        <Chip>{entries.length}</Chip>
      </div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--am-text-faint)", padding: "8px 0" }}>
          No players on IL.
        </div>
      ) : (
        <PlayerList entries={entries} showFantasyTeam />
      )}
    </Glass>
  );
}

function PlayerList({ entries, showFantasyTeam }: { entries: IlEntry[]; showFantasyTeam: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {entries.map((p, i) => (
        <PlayerRow key={`${p.fantasyTeamId}-${p.mlbId ?? p.playerName}-${i}`} player={p} showFantasyTeam={showFantasyTeam} />
      ))}
    </div>
  );
}

function PlayerRow({ player, showFantasyTeam }: { player: IlEntry; showFantasyTeam: boolean }) {
  const status = ilStatusLabel(player.mlbStatus);
  const eligStr = formatShortDate(player.ilEligibleReturn);
  const placedStr = formatShortDate(player.ilPlacedDate);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 12,
        background: "var(--am-surface-faint)",
        border: "1px solid var(--am-border)",
      }}
    >
      {player.mlbId ? (
        <img
          src={MLB_HEADSHOT(player.mlbId)}
          alt={player.playerName}
          style={{
            width: 28,
            height: 28,
            borderRadius: 99,
            objectFit: "cover",
            flexShrink: 0,
            background: "var(--am-surface)",
            opacity: 0.85,
          }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: 99,
            background: "var(--am-surface)",
            border: "1px solid var(--am-border)",
            flexShrink: 0,
          }}
        />
      )}

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--am-text)" }}>{player.playerName}</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.6,
              color: "rgb(248, 113, 113)",
              padding: "2px 6px",
              borderRadius: 99,
              background: "rgba(248,113,113,0.10)",
              border: "1px solid rgba(248,113,113,0.25)",
              textTransform: "uppercase",
            }}
          >
            {status}
          </span>
          <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>
            {player.mlbTeam || "—"} · {player.position || "—"}
          </span>
        </div>
        <div style={{ marginTop: 2, fontSize: 11, color: "var(--am-text-faint)", display: "flex", flexWrap: "wrap", gap: 8 }}>
          {showFantasyTeam && <span>Stash: {player.fantasyTeamName}</span>}
          {placedStr && <span>Placed {placedStr}</span>}
          {player.ilDays != null && <span>{player.ilDays}d on IL</span>}
          {eligStr && <span>Returns ~{eligStr}</span>}
          {player.ilInjury && <span style={{ color: "rgb(252, 165, 165)" }}>{player.ilInjury}</span>}
        </div>
      </div>

      {player.mlbId ? (
        <Link
          to={`/players/${player.mlbId}`}
          style={{
            fontSize: 11,
            color: "var(--am-text-muted)",
            textDecoration: "none",
            padding: "4px 8px",
            borderRadius: 8,
            border: "1px solid var(--am-border)",
            whiteSpace: "nowrap",
          }}
        >
          View profile →
        </Link>
      ) : null}
    </div>
  );
}
