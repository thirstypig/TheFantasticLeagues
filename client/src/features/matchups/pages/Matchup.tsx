/*
 * Matchup — Aurora port (Aurora screen #6 of 8).
 *
 * Aurora bento layout for head-to-head matchups + H2H standings.
 * Mirrors the legacy MatchupPage's behavior 1:1 (week navigator,
 * scoreboard, category breakdown, standings table) under AmbientBg
 * with Glass cards and iridescent treatment for the leading score.
 *
 * The legacy 163-LOC page is preserved at /matchup-classic via
 * `MatchupLegacy.tsx`. Per the Aurora rollout pattern, point users
 * there from the footer escape link if they hit a feature gap here.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";

import {
  AmbientBg, Glass, IridText, Chip, SectionLabel,
} from "../../../components/aurora/atoms";
import "../../../components/aurora/aurora.css";
import { useLeague } from "../../../contexts/LeagueContext";
import {
  getMyMatchup,
  getH2HStandings,
  type MatchupEntry,
  type StandingEntry,
} from "../api";
import { EmptyState } from "../../../components/ui/EmptyState";

type TabId = "matchup" | "standings";

function isRateStat(s: string): boolean {
  return s === "AVG" || s === "ERA" || s === "WHIP";
}

function formatStat(val: number | string | undefined, stat: string): string {
  if (typeof val !== "number") return "—";
  if (isRateStat(stat)) return val.toFixed(3);
  return String(val);
}

function teamScore(side: { totalPoints: number; catWins: number; catLosses: number; catTies: number } | undefined): string {
  if (!side) return "—";
  if (side.totalPoints > 0) return String(side.totalPoints);
  return `${side.catWins}-${side.catLosses}-${side.catTies}`;
}

export default function Matchup() {
  const { leagueId, myTeamId: contextMyTeamId } = useLeague();
  const [week, setWeek] = useState(1);
  const [matchup, setMatchup] = useState<MatchupEntry | null>(null);
  const [resolvedMyTeamId, setResolvedMyTeamId] = useState<number | null>(contextMyTeamId ?? null);
  const [standings, setStandings] = useState<StandingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("matchup");

  useEffect(() => {
    if (!leagueId) return;
    setLoading(true);
    Promise.all([
      getMyMatchup(leagueId, week).catch(() => ({ matchup: null, myTeamId: 0 })),
      getH2HStandings(leagueId).catch(() => ({ standings: [] })),
    ]).then(([m, s]) => {
      setMatchup(m.matchup);
      if (m.myTeamId) setResolvedMyTeamId(m.myTeamId);
      setStandings(s.standings);
    }).finally(() => setLoading(false));
  }, [leagueId, week]);

  // Determine which side is "mine" so the scoreboard can highlight it.
  const myTeamSide: "A" | "B" | null = useMemo(() => {
    if (!matchup || !resolvedMyTeamId) return null;
    if (matchup.teamA.id === resolvedMyTeamId) return "A";
    if (matchup.teamB.id === resolvedMyTeamId) return "B";
    return null;
  }, [matchup, resolvedMyTeamId]);

  // Determine winner (if scored) so the leading score gets iridescent.
  const winnerSide: "A" | "B" | "tie" | null = useMemo(() => {
    const r = matchup?.result;
    if (!r) return null;
    if (r.teamA.totalPoints > 0 || r.teamB.totalPoints > 0) {
      if (r.teamA.totalPoints > r.teamB.totalPoints) return "A";
      if (r.teamB.totalPoints > r.teamA.totalPoints) return "B";
      return "tie";
    }
    if (r.teamA.catWins > r.teamB.catWins) return "A";
    if (r.teamB.catWins > r.teamA.catWins) return "B";
    return "tie";
  }, [matchup]);

  return (
    <div className="aurora-theme" style={{ position: "relative", minHeight: "100svh" }}>
      <AmbientBg />
      <div style={{ position: "relative", zIndex: 1, padding: "24px 16px 48px", maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <SectionLabel>✦ Head-to-Head</SectionLabel>
            <h1 style={{ fontFamily: "var(--am-display)", fontSize: 32, fontWeight: 300, color: "var(--am-text)", margin: 0, lineHeight: 1.1 }}>
              {tab === "matchup" ? "This week's matchup." : "League standings."}
            </h1>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => setTab("matchup")} style={tabBtnStyle(tab === "matchup")}>
              My Matchup
            </button>
            <button type="button" onClick={() => setTab("standings")} style={tabBtnStyle(tab === "standings")}>
              Standings
            </button>
          </div>
        </div>

        {loading ? (
          <Glass>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 16px" }}>
              <div
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  border: "3px solid var(--am-border)",
                  borderTopColor: "var(--am-cardinal)",
                  animation: "spin 0.8s linear infinite",
                  marginBottom: 12,
                }}
              />
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--am-text-faint)" }}>
                Loading…
              </div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          </Glass>
        ) : tab === "matchup" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 16 }}>
            {/* Week Navigator */}
            <div style={{ gridColumn: "span 12" }}>
              <Glass padded={false}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, padding: "12px 16px" }}>
                  <button
                    type="button"
                    onClick={() => setWeek(w => Math.max(1, w - 1))}
                    aria-label="Previous week"
                    style={navBtnStyle()}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <Chip strong>Week {week}</Chip>
                  <button
                    type="button"
                    onClick={() => setWeek(w => w + 1)}
                    aria-label="Next week"
                    style={navBtnStyle()}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </Glass>
            </div>

            {!matchup ? (
              <div style={{ gridColumn: "span 12" }}>
                <Glass>
                  <EmptyState
                    icon={Trophy}
                    title="No matchup this week"
                    description="Schedule may not be generated yet, or you're on a bye week."
                  />
                </Glass>
              </div>
            ) : (
              <>
                {/* Scoreboard */}
                <div style={{ gridColumn: "span 12" }}>
                  <Glass strong>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 16, padding: "8px 4px" }}>
                      <ScoreboardSide
                        teamName={matchup.teamA.name}
                        scoreText={matchup.result ? teamScore(matchup.result.teamA) : null}
                        isMine={myTeamSide === "A"}
                        isWinner={winnerSide === "A"}
                        align="right"
                      />
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <SectionLabel style={{ marginBottom: 0 }}>VS</SectionLabel>
                        {(winnerSide === "tie") && <Chip>Tied</Chip>}
                      </div>
                      <ScoreboardSide
                        teamName={matchup.teamB.name}
                        scoreText={matchup.result ? teamScore(matchup.result.teamB) : null}
                        isMine={myTeamSide === "B"}
                        isWinner={winnerSide === "B"}
                        align="left"
                      />
                    </div>
                  </Glass>
                </div>

                {/* Category Breakdown */}
                {matchup.result?.categories && matchup.result.categories.length > 0 && (
                  <div style={{ gridColumn: "span 12" }}>
                    <Glass padded={false}>
                      <div style={{ padding: "12px 16px 4px" }}>
                        <SectionLabel style={{ marginBottom: 0 }}>Category Breakdown</SectionLabel>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", padding: "8px 16px 16px", gap: 4 }}>
                        {matchup.result.categories.map(cat => (
                          <CategoryRow key={cat.stat} cat={cat} />
                        ))}
                      </div>
                    </Glass>
                  </div>
                )}

                {!matchup.result && (
                  <div style={{ gridColumn: "span 12" }}>
                    <Glass>
                      <div style={{ textAlign: "center", padding: 8, fontSize: 12, color: "var(--am-text-muted)" }}>
                        Results pending — week hasn't been scored yet.
                      </div>
                    </Glass>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 16 }}>
            <div style={{ gridColumn: "span 12" }}>
              {standings.length === 0 ? (
                <Glass>
                  <EmptyState icon={Trophy} title="No standings yet" description="Standings appear after matchups are scored." />
                </Glass>
              ) : (
                <Glass padded={false}>
                  <div style={{ padding: "12px 16px 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <SectionLabel style={{ marginBottom: 0 }}>H2H Standings</SectionLabel>
                    <span style={{ fontSize: 11, color: "var(--am-text-faint)" }}>Top 4 advance</span>
                  </div>
                  <div style={{ overflowX: "auto", padding: "8px 8px 12px" }}>
                    <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontVariantNumeric: "tabular-nums" }}>
                      <thead>
                        <tr style={{ fontSize: 10, color: "var(--am-text-faint)", textTransform: "uppercase", letterSpacing: 1.2 }}>
                          <th style={thStyle("center", 32)}>#</th>
                          <th style={thStyle("left")}>Team</th>
                          <th style={thStyle("center", 44)}>W</th>
                          <th style={thStyle("center", 44)}>L</th>
                          <th style={thStyle("center", 44)}>T</th>
                          <th style={thStyle("center", 56)}>PCT</th>
                          <th style={thStyle("center", 44)}>GB</th>
                        </tr>
                      </thead>
                      <tbody>
                        {standings.map((s) => {
                          const isMine = !!resolvedMyTeamId && s.teamId === resolvedMyTeamId;
                          const isPlayoffSeed = s.rank <= 4;
                          return (
                            <tr key={s.teamId} style={{ background: isMine ? "var(--am-chip)" : undefined }}>
                              <td style={tdStyle("center")}>
                                <span style={{ fontSize: 11, color: "var(--am-text-faint)" }}>{s.rank}</span>
                              </td>
                              <td style={tdStyle("left")}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--am-text)" }}>{s.teamName}</span>
                                {isMine && <Chip strong style={{ marginLeft: 8 }}>You</Chip>}
                                {isPlayoffSeed && <Chip color="var(--am-accent)" style={{ marginLeft: 8 }}>Playoff</Chip>}
                              </td>
                              <td style={tdStyle("center")}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--am-text)" }}>{s.wins}</span>
                              </td>
                              <td style={tdStyle("center")}>{s.losses}</td>
                              <td style={tdStyle("center")}>
                                <span style={{ color: "var(--am-text-muted)" }}>{s.ties}</span>
                              </td>
                              <td style={tdStyle("center")}>
                                <span style={{ fontWeight: 600, color: "var(--am-text)" }}>{s.pct.toFixed(3)}</span>
                              </td>
                              <td style={tdStyle("center")}>
                                <span style={{ color: "var(--am-text-muted)" }}>{s.gb === 0 ? "—" : s.gb}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Glass>
              )}
            </div>
          </div>
        )}

        {/* Footer escape link */}
        <div style={{ marginTop: 16, textAlign: "center", fontSize: 11, color: "var(--am-text-faint)" }}>
          Need a feature you can't find? <Link to="/matchup-classic" style={{ color: "var(--am-text-muted)", textDecoration: "underline" }}>View classic Matchup →</Link>
        </div>
      </div>
    </div>
  );
}

function ScoreboardSide({
  teamName, scoreText, isMine, isWinner, align,
}: {
  teamName: string;
  scoreText: string | null;
  isMine: boolean;
  isWinner: boolean;
  align: "left" | "right";
}) {
  return (
    <div style={{ textAlign: align, padding: "12px 8px" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--am-text)", marginBottom: 6, display: "flex", alignItems: "center", gap: 6, justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
        {isMine && align === "left" ? <Chip strong>You</Chip> : null}
        <span>{teamName}</span>
        {isMine && align === "right" ? <Chip strong>You</Chip> : null}
      </div>
      <div>
        {scoreText == null ? (
          <span style={{ fontSize: 28, fontWeight: 300, color: "var(--am-text-faint)", fontFamily: "var(--am-display)" }}>—</span>
        ) : isWinner ? (
          <IridText size={36} weight={300}>{scoreText}</IridText>
        ) : (
          <span style={{ fontSize: 36, fontWeight: 300, color: "var(--am-text-muted)", fontFamily: "var(--am-display)", fontVariantNumeric: "tabular-nums" }}>{scoreText}</span>
        )}
      </div>
    </div>
  );
}

function CategoryRow({ cat }: { cat: { stat: string; teamAVal?: number | string; teamBVal?: number | string; winner?: string } }) {
  const w = cat.winner;
  const aColor = w === "A" ? "var(--am-cardinal)" : w === "B" ? "var(--am-text-faint)" : "var(--am-text)";
  const bColor = w === "B" ? "var(--am-cardinal)" : w === "A" ? "var(--am-text-faint)" : "var(--am-text)";
  return (
    <>
      <div style={{ textAlign: "right", padding: "6px 12px", fontVariantNumeric: "tabular-nums", fontSize: 13, fontWeight: 600, color: aColor }}>
        {formatStat(cat.teamAVal, cat.stat)}
      </div>
      <div style={{ textAlign: "center", padding: "6px 16px" }}>
        <Chip>{cat.stat}</Chip>
      </div>
      <div style={{ textAlign: "left", padding: "6px 12px", fontVariantNumeric: "tabular-nums", fontSize: 13, fontWeight: 600, color: bColor }}>
        {formatStat(cat.teamBVal, cat.stat)}
      </div>
    </>
  );
}

function tabBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: "8px 16px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    border: active ? "1px solid var(--am-border-strong)" : "1px solid var(--am-border)",
    background: active ? "var(--am-irid)" : "var(--am-chip)",
    color: active ? "#fff" : "var(--am-text-muted)",
    cursor: "pointer",
    transition: "all 200ms ease",
  };
}

function navBtnStyle(): React.CSSProperties {
  return {
    width: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 99,
    border: "1px solid var(--am-border)",
    background: "var(--am-surface-faint)",
    color: "var(--am-text-muted)",
    cursor: "pointer",
  };
}

function thStyle(align: "left" | "center" | "right", width?: number): React.CSSProperties {
  return {
    textAlign: align,
    padding: "8px 10px",
    fontWeight: 600,
    width,
    borderBottom: "1px solid var(--am-border)",
  };
}

function tdStyle(align: "left" | "center" | "right"): React.CSSProperties {
  return {
    textAlign: align,
    padding: "10px",
    fontSize: 13,
    color: "var(--am-text)",
    borderBottom: "1px solid var(--am-border)",
  };
}
