import { AmbientBg, Glass, SectionLabel } from "../../../components/aurora/atoms";
import "../../../components/aurora/aurora.css";

export default function NBADashboard() {
  // Standings data
  const standings = [
    { rank: 1, team: "Splash Brothers", w: 10, l: 2, pf: "1284.6", pa: "1142.1", last5: "WWWLW", leader: true },
    { rank: 2, team: "Rim Reapers", w: 9, l: 3, pf: "1261.3", pa: "1158.8", last5: "WLWWW", leader: false },
    { rank: 3, team: "Pick & Rollers", w: 8, l: 4, pf: "1233.9", pa: "1180.2", last5: "WWLWL", leader: false },
    { rank: 4, team: "Triple Doubles", w: 8, l: 4, pf: "1228.4", pa: "1175.6", last5: "LWWWL", leader: false },
    { rank: 5, team: "Buzzer Beaters", w: 7, l: 5, pf: "1201.7", pa: "1199.3", last5: "WLWLW", leader: false },
    { rank: 6, team: "Fast Break Kings", w: 6, l: 6, pf: "1188.2", pa: "1190.5", last5: "LWLWL", leader: false },
    { rank: 7, team: "Paint Patrol", w: 5, l: 7, pf: "1166.0", pa: "1210.4", last5: "LLWLW", leader: false },
    { rank: 8, team: "Alley Oops", w: 5, l: 7, pf: "1159.8", pa: "1218.7", last5: "WLLWL", leader: false },
    { rank: 9, team: "Bench Mob", w: 4, l: 8, pf: "1140.3", pa: "1241.2", last5: "LLWLL", leader: false },
    { rank: 10, team: "Air Ballers", w: 2, l: 10, pf: "1098.5", pa: "1288.9", last5: "LLLWL", leader: false },
  ];

  // Matchups data
  const CATS = ["PTS", "REB", "AST", "STL", "BLK", "3PM", "FG%"];
  const matchups = [
    {
      a: "Splash Brothers", aRec: "10-2", av: ["118", "41", "28", "7", "6", "15", "47.1"],
      b: "Rim Reapers", bRec: "9-3", bv: ["112", "45", "25", "9", "4", "13", "49.0"],
      live: true,
    },
    {
      a: "Pick & Rollers", aRec: "8-4", av: ["121", "52", "30", "8", "3", "12", "51.2"],
      b: "Triple Doubles", bRec: "8-4", bv: ["119", "49", "33", "6", "5", "14", "49.8"],
      live: false,
    },
    {
      a: "Buzzer Beaters", aRec: "7-5", av: ["88", "33", "19", "5", "2", "9", "45.0"],
      b: "Fast Break Kings", bRec: "6-6", bv: ["92", "30", "21", "6", "4", "11", "47.5"],
      live: true,
    },
    {
      a: "Paint Patrol", aRec: "5-7", av: ["109", "46", "24", "7", "5", "10", "46.0"],
      b: "Alley Oops", bRec: "5-7", bv: ["114", "43", "22", "8", "6", "13", "48.1"],
      live: false,
    },
    {
      a: "Bench Mob", aRec: "4-8", av: ["101", "38", "20", "6", "3", "8", "44.2"],
      b: "Air Ballers", bRec: "2-10", bv: ["97", "41", "18", "5", "4", "12", "45.0"],
      live: false,
    },
  ];

  // Category leaders
  const leaders = [
    { cat: "PTS", player: "Luka Dončić", team: "DAL", value: "33.8" },
    { cat: "REB", player: "Nikola Jokić", team: "DEN", value: "12.6" },
    { cat: "AST", player: "Trae Young", team: "ATL", value: "11.2" },
    { cat: "STL", player: "Shai Gilgeous-Alexander", team: "OKC", value: "2.3" },
    { cat: "BLK", player: "Victor Wembanyama", team: "SAS", value: "3.7" },
    { cat: "3PM", player: "Stephen Curry", team: "GSW", value: "5.1" },
  ];

  // Calculate matchup tally
  const matchupTally = (av: string[], bv: string[]) => {
    let aWins = 0;
    av.forEach((val, i) => {
      if (parseFloat(val) > parseFloat(bv[i])) aWins++;
    });
    return `${aWins} — ${7 - aWins}`;
  };

  return (
    <div className="aurora-theme sport-nba" style={{ position: "relative", minHeight: "100vh", color: "var(--am-text)" }}>
      <style>{`
        .sport-nba { --am-accent: #4c1d95; }
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
            <SectionLabel>NBA Dashboard</SectionLabel>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: "12px" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "30px", fontWeight: 800, letterSpacing: "-0.015em" }}>Hardwood Heroes</h2>
                <p style={{ margin: "7px 0 0", fontSize: "14px", color: "var(--am-text-muted)" }}>2026-27 NBA Season · Week 12 of 24</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", color: "#fff", background: "var(--am-accent)", padding: "6px 13px", borderRadius: "6px" }}>
                  NBA
                </span>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--am-text)", background: "var(--am-surface)", border: "1px solid var(--am-border)", padding: "6px 13px", borderRadius: "6px" }}>
                  Commissioner
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
                    <th style={{ textAlign: "right", padding: "11px 14px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--am-text-muted)", borderBottom: "1px solid var(--am-border)", width: "88px" }}>
                      PF
                    </th>
                    <th style={{ textAlign: "right", padding: "11px 14px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--am-text-muted)", borderBottom: "1px solid var(--am-border)", width: "88px" }}>
                      PA
                    </th>
                    <th style={{ textAlign: "center", padding: "11px 14px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--am-text-muted)", borderBottom: "1px solid var(--am-border)", width: "120px" }}>
                      Last 5
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
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--am-border)" }}>
                        <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                          {row.last5.split("").map((result, i) => (
                            <span
                              key={i}
                              style={{
                                width: "14px",
                                height: "14px",
                                borderRadius: "3px",
                                display: "inline-block",
                                background: result === "W" ? "var(--am-positive)" : "var(--am-negative)",
                              }}
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Glass>
        </div>

        {/* Weekly Matchups */}
        <div style={{ gridColumn: "span 12" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--am-text-muted)", marginBottom: "9px" }}>
            Weekly Matchups · Category Scoring
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {matchups.map((m, i) => {
              const tally = matchupTally(m.av, m.bv);
              return (
                <div key={i} style={{ background: "var(--am-surface)", border: "1px solid var(--am-border)", borderRadius: "10px", padding: "15px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "13px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                      <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--am-text)" }}>{m.a}</span>
                      <span style={{ fontSize: "12px", color: "var(--am-text-faint)" }}>{m.aRec}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "20px", fontWeight: 800, color: "var(--am-text)", fontVariantNumeric: "tabular-nums" }}>
                        {tally}
                      </span>
                      {m.live ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.07em", color: "var(--am-accent)" }}>
                          <span
                            style={{
                              width: "7px",
                              height: "7px",
                              borderRadius: "50%",
                              background: "var(--am-accent)",
                              animation: "amPulse 1.4s ease-in-out infinite",
                            }}
                          />
                          LIVE
                        </span>
                      ) : (
                        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.07em", color: "var(--am-text-faint)" }}>
                          FINAL
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                      <span style={{ fontSize: "12px", color: "var(--am-text-faint)" }}>{m.bRec}</span>
                      <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--am-text)" }}>{m.b}</span>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "1px", background: "var(--am-border)", border: "1px solid var(--am-border)", borderRadius: "8px", overflow: "hidden" }}>
                    {CATS.map((cat, catIdx) => {
                      const aVal = parseFloat(m.av[catIdx]);
                      const bVal = parseFloat(m.bv[catIdx]);
                      const aWins = aVal > bVal;
                      return (
                        <div key={cat} style={{ background: "var(--am-surface-alt)", padding: "7px 4px", textAlign: "center" }}>
                          <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.04em", color: "var(--am-text-faint)", marginBottom: "4px" }}>
                            {cat}
                          </div>
                          <div style={{ fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>
                            <span style={{ color: aWins ? "var(--am-accent)" : "var(--am-text-muted)", fontWeight: aWins ? 700 : 500 }}>
                              {m.av[catIdx]}
                            </span>
                            <span style={{ color: "var(--am-text-faint)", fontSize: "11px", margin: "0 2px" }}>·</span>
                            <span style={{ color: !aWins ? "var(--am-accent)" : "var(--am-text-muted)", fontWeight: !aWins ? 700 : 500 }}>
                              {m.bv[catIdx]}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category Leaders */}
        <div style={{ gridColumn: "span 12" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--am-text-muted)", marginBottom: "9px" }}>
            Category Leaders
          </div>
          <Glass padded={false}>
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", color: "var(--am-text)" }}>
                <thead>
                  <tr style={{ background: "var(--am-surface-alt)" }}>
                    <th style={{ textAlign: "left", padding: "7px 14px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--am-text-muted)", borderBottom: "1px solid var(--am-border)", width: "90px" }}>
                      Category
                    </th>
                    <th style={{ textAlign: "left", padding: "7px 14px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--am-text-muted)", borderBottom: "1px solid var(--am-border)" }}>
                      Player
                    </th>
                    <th style={{ textAlign: "left", padding: "7px 14px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--am-text-muted)", borderBottom: "1px solid var(--am-border)", width: "96px" }}>
                      Team
                    </th>
                    <th style={{ textAlign: "right", padding: "7px 14px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--am-text-muted)", borderBottom: "1px solid var(--am-border)", width: "90px" }}>
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaders.map((ld, i) => (
                    <tr key={i}>
                      <td style={{ textAlign: "left", padding: "7px 14px", borderBottom: "1px solid var(--am-border)" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--am-accent)", background: "color-mix(in srgb, var(--am-accent) 12%, transparent)", padding: "2px 8px", borderRadius: "5px" }}>
                          {ld.cat}
                        </span>
                      </td>
                      <td style={{ textAlign: "left", padding: "7px 14px", borderBottom: "1px solid var(--am-border)", fontWeight: 600 }}>
                        {ld.player}
                      </td>
                      <td style={{ textAlign: "left", padding: "7px 14px", borderBottom: "1px solid var(--am-border)", color: "var(--am-text-muted)" }}>
                        {ld.team}
                      </td>
                      <td style={{ textAlign: "right", padding: "7px 14px", borderBottom: "1px solid var(--am-border)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {ld.value}
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
