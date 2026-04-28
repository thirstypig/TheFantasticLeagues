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
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AmbientBg, Glass, IridText, Chip, SectionLabel,
} from "../../../components/aurora/atoms";
import "../../../components/aurora/aurora.css";
import { useLeague } from "../../../contexts/LeagueContext";
import { getTeams, getTeamDetails, getTeamAiInsights, getPlayerSeasonStats } from "../../../api";
import type { TeamInsightsResult, PlayerSeasonStat } from "../../../api";

interface RosterPlayer {
  rosterId: number;
  playerName: string;
  posPrimary?: string;
  position?: string;
  assignedPosition?: string;
  isPitcher?: boolean;
  price?: number;
  mlbTeam?: string;
  isKeeper?: boolean;
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
  const { leagueId, currentLeagueName, myTeamId } = useLeague();

  const [teamMeta, setTeamMeta] = useState<{
    id: number;
    name: string;
    code: string;
    budget?: number | null;
    ownerName?: string | null;
  } | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [aiInsights, setAiInsights] = useState<TeamInsightsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
              position: row.posPrimary,
              assignedPosition: assigned,
              isPitcher: PITCHER_POS.has(assigned || row.posPrimary || ""),
              price: row.price,
              mlbTeam: (stat as any)?.mlb_team ?? (stat as any)?.mlbTeam,
              isKeeper: (stat as any)?.isKeeper,
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
  }, [leagueId, code]);

  const hitters = useMemo(() =>
    roster.filter(p => !p.isPitcher && p.assignedPosition !== "IL")
      .sort((a, b) => {
        const da = posScore(a.assignedPosition || a.posPrimary);
        const db = posScore(b.assignedPosition || b.posPrimary);
        if (da !== db) return da - db;
        return (b.price ?? 0) - (a.price ?? 0);
      }),
    [roster]);

  const pitchers = useMemo(() =>
    roster.filter(p => p.isPitcher && p.assignedPosition !== "IL")
      .sort((a, b) => {
        // SP before RP, then price desc
        const ap = a.assignedPosition || a.posPrimary || "";
        const bp = b.assignedPosition || b.posPrimary || "";
        if (ap !== bp) return ap.localeCompare(bp);
        return (b.price ?? 0) - (a.price ?? 0);
      }),
    [roster]);

  const ilCount = useMemo(() =>
    roster.filter(p => p.assignedPosition === "IL").length,
    [roster]);

  const totalSpent = useMemo(() =>
    roster.reduce((s, p) => s + (p.price ?? 0), 0),
    [roster]);

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
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 22 }}>
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
                  </div>
                </div>
              </div>
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

          {/* HITTERS */}
          <div style={{ gridColumn: "span 8" }}>
            <Glass padded={false}>
              <div style={{ padding: "16px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <SectionLabel style={{ marginBottom: 0 }}>Hitters · {hitters.length}</SectionLabel>
                <div style={{ display: "flex", gap: 6 }}>
                  <Chip>R · HR · RBI · SB · AVG</Chip>
                </div>
              </div>
              <RosterTable
                rows={hitters}
                columns={[
                  { key: "AVG", label: "AVG", fmt: v => fmtAvg(v) },
                  { key: "HR", label: "HR" },
                  { key: "R", label: "R" },
                  { key: "RBI", label: "RBI" },
                  { key: "SB", label: "SB" },
                ]}
                emptyMessage={loading ? "Loading…" : "No hitters on this roster."}
              />
            </Glass>
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

          {/* PITCHERS */}
          <div style={{ gridColumn: "span 12" }}>
            <Glass padded={false}>
              <div style={{ padding: "16px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <SectionLabel style={{ marginBottom: 0 }}>Pitchers · {pitchers.length}</SectionLabel>
                <div style={{ display: "flex", gap: 6 }}>
                  <Chip>W · SV · K · ERA · WHIP</Chip>
                </div>
              </div>
              <RosterTable
                rows={pitchers}
                columns={[
                  { key: "W", label: "W" },
                  { key: "SV", label: "SV" },
                  { key: "K", label: "K" },
                  { key: "ERA", label: "ERA", fmt: v => fmtRate(v) },
                  { key: "WHIP", label: "WHIP", fmt: v => fmtRate(v) },
                ]}
                emptyMessage={loading ? "Loading…" : "No pitchers on this roster."}
              />
            </Glass>
          </div>

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

// ─── helpers ───

interface RosterTableColumn {
  key: keyof RosterPlayer;
  label: string;
  fmt?: (v: unknown) => string;
}

function RosterTable({
  rows, columns, emptyMessage,
}: {
  rows: RosterPlayer[];
  columns: RosterTableColumn[];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return (
      <div style={{ padding: 24, color: "var(--am-text-faint)", fontSize: 12, textAlign: "center" }}>
        {emptyMessage}
      </div>
    );
  }
  return (
    <div style={{ overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr style={{ fontSize: 10, color: "var(--am-text-faint)", letterSpacing: 1, fontWeight: 600 }}>
            <th style={{ padding: "10px 14px", textAlign: "left", width: 50 }}>SLOT</th>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>PLAYER</th>
            {columns.map(c => (
              <th key={String(c.key)} style={{ padding: "10px 12px", textAlign: "right", width: 70 }}>{c.label}</th>
            ))}
            <th style={{ padding: "10px 14px", textAlign: "right", width: 50 }}>$</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.rosterId} style={{ borderTop: "1px solid var(--am-border)" }}>
              <td style={{ padding: "9px 14px" }}>
                <span
                  style={{
                    fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, color: "var(--am-text-muted)",
                    background: "var(--am-chip)", padding: "3px 6px", borderRadius: 5,
                    display: "inline-block",
                  }}
                >
                  {p.assignedPosition || p.posPrimary || "—"}
                </span>
              </td>
              <td style={{ padding: "9px 14px" }}>
                <div style={{ fontSize: 13, color: "var(--am-text)", display: "flex", alignItems: "center", gap: 6 }}>
                  {p.playerName}
                  {p.isKeeper && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: "var(--am-accent)", letterSpacing: 0.5 }}>KEEPER</span>
                  )}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--am-text-faint)" }}>
                  {p.mlbTeam || "—"} · {p.posPrimary || "—"}
                </div>
              </td>
              {columns.map(c => {
                const raw = p[c.key];
                const display = c.fmt ? c.fmt(raw) : (raw == null ? "—" : String(raw));
                return (
                  <td key={String(c.key)} style={{ padding: "9px 12px", textAlign: "right", fontSize: 12.5, color: "var(--am-text-muted)" }}>
                    {display}
                  </td>
                );
              })}
              <td style={{ padding: "9px 14px", textAlign: "right", fontSize: 12.5, color: "var(--am-text-muted)" }}>
                {p.price != null ? `$${p.price}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmtAvg(v: unknown): string {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(3).replace(/^0\./, ".");
}

function fmtRate(v: unknown): string {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}
