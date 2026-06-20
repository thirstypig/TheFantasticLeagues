import { AmbientBg, Glass, SectionLabel } from "../../../components/aurora/atoms";
import "../../../components/aurora/aurora.css";

export default function NFLDashboard() {
  // Standings data
  const standings = [
    { rank: 1, team: "Chiefs", w: 3, l: 1, pf: "134", pa: "98", streak: "W3", leader: true },
    { rank: 2, team: "Eagles", w: 3, l: 1, pf: "128", pa: "106", streak: "W2", leader: false },
    { rank: 3, team: "Bills", w: 3, l: 1, pf: "125", pa: "109", streak: "W1", leader: false },
    { rank: 4, team: "49ers", w: 2, l: 2, pf: "119", pa: "112", streak: "W1", leader: false },
    { rank: 5, team: "Ravens", w: 2, l: 2, pf: "117", pa: "115", streak: "L1", leader: false },
    { rank: 6, team: "Cowboys", w: 2, l: 2, pf: "116", pa: "121", streak: "L1", leader: false },
    { rank: 7, team: "Lions", w: 2, l: 2, pf: "122", pa: "118", streak: "W1", leader: false },
    { rank: 8, team: "Texans", w: 2, l: 2, pf: "114", pa: "119", streak: "L2", leader: false },
    { rank: 9, team: "Chargers", w: 1, l: 3, pf: "108", pa: "127", streak: "L3", leader: false },
    { rank: 10, team: "Broncos", w: 1, l: 3, pf: "101", pa: "128", streak: "L2", leader: false },
  ];

  // This week's matchups
  const matchups = [
    { home: "Chiefs", away: "Bills", homeScore: 21, awayScore: 17, projected: "24-20", live: true },
    { home: "Eagles", away: "Cowboys", homeScore: 28, awayScore: 23, projected: "26-24", live: false },
    { home: "49ers", away: "Ravens", homeScore: null, awayScore: null, projected: "22-19", live: false },
    { home: "Lions", away: "Texans", homeScore: null, awayScore: null, projected: "27-24", live: false },
    { home: "Chargers", away: "Broncos", homeScore: null, awayScore: null, projected: "20-17", live: false },
  ];

  // Top performers
  const performers = [
    { player: "Patrick Mahomes", pos: "QB", team: "KC", pts: 34 },
    { player: "Travis Kelce", pos: "TE", team: "KC", pts: 18 },
    { player: "Jalen Hurts", pos: "QB", team: "PHI", pts: 29 },
    { player: "A.J. Brown", pos: "WR", team: "PHI", pts: 22 },
    { player: "Josh Allen", pos: "QB", team: "BUF", pts: 26 },
    { player: "Stefon Diggs", pos: "WR", team: "BUF", pts: 19 },
    { player: "Christian McCaffrey", pos: "RB", team: "SF", pts: 24 },
    { player: "Brandon Aiyuk", pos: "WR", team: "SF", pts: 16 },
  ];

  return (
    <div className="aurora-theme sport-nfl" style={{ position: "relative", minHeight: "100vh", color: "var(--am-text)" }}>
      <style>{`
        .sport-nfl { --am-accent: #854d0e; }
        @keyframes amPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>

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
        {/* Header */}
        <div style={{ gridColumn: "span 12" }}>
          <Glass strong>
            <SectionLabel>NFL Dashboard</SectionLabel>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: "12px" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "30px", fontWeight: 800, letterSpacing: "-0.015em" }}>Gridiron Glory</h2>
                <p style={{ margin: "7px 0 0", fontSize: "14px", color: "var(--am-text-muted)" }}>2026 NFL Season · Week 4 of 18</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", color: "#fff", background: "var(--am-accent)", padding: "6px 13px", borderRadius: "6px" }}>
                  NFL
                </span>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--am-text)", background: "var(--am-surface)", border: "1px solid var(--am-border)", padding: "6px 13px", borderRadius: "6px" }}>
                  Owner
                </span>
              </div>
            </div>
          </Glass>
        </div>

        {/* Standings */}
        <div style={{ gridColumn: "span 12" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--am-text-muted)", marginBottom: "9px" }}>
            Standings
          </div>
          <Glass padded={false}>
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", color: "var(--am-text)" }}>
                <thead>
                  <tr style={{ background: "var(--am-surface-alt)" }}>
                    <th style={{ textAlign: "center", padding: "11px 14px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--am-text-muted)", borderBottom: "1px solid var(--am-border)", width: "54px" }}>
                      Rank
                    </th>
                    <th style={{ textAlign: "left", padding: "11px 14px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--am-text-muted)", borderBottom: "1px solid var(--am-border)" }}>
                      Team
                    </th>
                    <th style={{ textAlign: "right", padding: "11px 14px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--am-text-muted)", borderBottom: "1px solid var(--am-border)", width: "48px" }}>
                      W
                    </th>
                    <th style={{ textAlign: "right", padding: "11px 14px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--am-text-muted)", borderBottom: "1px solid var(--am-border)", width: "48px" }}>
                      L
                    </th>
                    <th style={{ textAlign: "right", padding: "11px 14px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--am-text-muted)", borderBottom: "1px solid var(--am-border)", width: "72px" }}>
                      PF
                    </th>
                    <th style={{ textAlign: "right", padding: "11px 14px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--am-text-muted)", borderBottom: "1px solid var(--am-border)", width: "72px" }}>
                      PA
                    </th>
                    <th style={{ textAlign: "left", padding: "11px 14px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--am-text-muted)", borderBottom: "1px solid var(--am-border)", width: "88px" }}>
                      Streak
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row) => (
                    <tr
                      key={row.rank}
                      style={
                        row.leader
                          ? { background: "color-mix(in srgb, var(--am-accent) 10%, transparent)" }
                          : {}
                      }
                    >
                      <td style={{ textAlign: "center", padding: "11px 14px", borderBottom: "1px solid var(--am-border)", fontWeight: 700, color: "var(--am-text-muted)", fontVariantNumeric: "tabular-nums", borderLeft: row.leader ? "3px solid var(--am-accent)" : undefined }}>
                        {row.rank}
                      </td>
                      <td style={{ textAlign: "left", padding: "11px 14px", borderBottom: "1px solid var(--am-border)", fontWeight: 600 }}>
                        {row.team}
                      </td>
                      <td style={{ textAlign: "right", padding: "11px 14px", borderBottom: "1px solid var(--am-border)", fontVariantNumeric: "tabular-nums" }}>
                        {row.w}
                      </td>
                      <td style={{ textAlign: "right", padding: "11px 14px", borderBottom: "1px solid var(--am-border)", fontVariantNumeric: "tabular-nums", color: "var(--am-text-muted)" }}>
                        {row.l}
                      </td>
                      <td style={{ textAlign: "right", padding: "11px 14px", borderBottom: "1px solid var(--am-border)", fontVariantNumeric: "tabular-nums" }}>
                        {row.pf}
                      </td>
                      <td style={{ textAlign: "right", padding: "11px 14px", borderBottom: "1px solid var(--am-border)", fontVariantNumeric: "tabular-nums", color: "var(--am-text-muted)" }}>
                        {row.pa}
                      </td>
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--am-border)", fontSize: "12px", fontWeight: 600, color: row.streak.startsWith("W") ? "var(--am-positive)" : "var(--am-negative)" }}>
                        {row.streak}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Glass>
        </div>

        {/* This Week's Matchups */}
        <div style={{ gridColumn: "span 12" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--am-text-muted)", marginBottom: "9px" }}>
            This Week's Matchups
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
            {matchups.map((m, i) => (
              <Glass key={i} padded={false}>
                <div style={{ padding: "16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--am-text)" }}>{m.home}</div>
                      <div style={{ fontSize: "12px", color: "var(--am-text-muted)" }}>Home</div>
                    </div>
                    {m.live ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                        <span style={{ fontSize: "20px", fontWeight: 800, color: "var(--am-accent)", fontVariantNumeric: "tabular-nums" }}>
                          {m.homeScore}
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.07em", color: "var(--am-accent)" }}>
                          <span
                            style={{
                              width: "6px",
                              height: "6px",
                              borderRadius: "50%",
                              background: "var(--am-accent)",
                              animation: "amPulse 1.4s ease-in-out infinite",
                            }}
                          />
                          LIVE
                        </span>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                        <span style={{ fontSize: "12px", color: "var(--am-text-muted)" }}>{m.projected}</span>
                        <span style={{ fontSize: "10px", color: "var(--am-text-faint)" }}>Projected</span>
                      </div>
                    )}
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--am-text)" }}>{m.away}</div>
                      <div style={{ fontSize: "12px", color: "var(--am-text-muted)" }}>Away</div>
                    </div>
                  </div>
                  {m.live && (
                    <div style={{ display: "flex", justifyContent: "center", fontSize: "16px", fontWeight: 700, color: "var(--am-accent)" }}>
                      {m.awayScore}
                    </div>
                  )}
                </div>
              </Glass>
            ))}
          </div>
        </div>

        {/* Top Performers */}
        <div style={{ gridColumn: "span 12" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--am-text-muted)", marginBottom: "9px" }}>
            Top Performers
          </div>
          <Glass padded={false}>
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", color: "var(--am-text)" }}>
                <thead>
                  <tr style={{ background: "var(--am-surface-alt)" }}>
                    <th style={{ textAlign: "left", padding: "7px 14px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--am-text-muted)", borderBottom: "1px solid var(--am-border)" }}>
                      Player
                    </th>
                    <th style={{ textAlign: "left", padding: "7px 14px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--am-text-muted)", borderBottom: "1px solid var(--am-border)", width: "72px" }}>
                      Pos
                    </th>
                    <th style={{ textAlign: "center", padding: "7px 14px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--am-text-muted)", borderBottom: "1px solid var(--am-border)", width: "96px" }}>
                      Team
                    </th>
                    <th style={{ textAlign: "right", padding: "7px 14px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--am-text-muted)", borderBottom: "1px solid var(--am-border)", width: "72px" }}>
                      Pts
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {performers.map((p, i) => (
                    <tr key={i}>
                      <td style={{ textAlign: "left", padding: "7px 14px", borderBottom: "1px solid var(--am-border)", fontWeight: 600 }}>
                        {p.player}
                      </td>
                      <td style={{ textAlign: "left", padding: "7px 14px", borderBottom: "1px solid var(--am-border)", color: "var(--am-text-muted)" }}>
                        {p.pos}
                      </td>
                      <td style={{ textAlign: "center", padding: "7px 14px", borderBottom: "1px solid var(--am-border)", fontWeight: 600, color: "var(--am-accent)" }}>
                        {p.team}
                      </td>
                      <td style={{ textAlign: "right", padding: "7px 14px", borderBottom: "1px solid var(--am-border)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {p.pts}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Glass>
        </div>
      </div>
    </div>
  );
}
