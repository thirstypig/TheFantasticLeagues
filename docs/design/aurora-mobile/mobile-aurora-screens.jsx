/* Aurora Mobile v2 — addressed feedback:
   - No horizontal scroll for stats (toggles + sized columns)
   - Standings as proper sortable TABLE with hit/pitch/total toggle
   - Players: 4 sortable stats, tap row → inline expanded career stats
   - Team: denser, 4 stats per row, more rows visible
   - Bottom dock: solid + larger glyphs (in atoms)
   - Commissioner role: extra "Commish" tab + More sheet section */

const MD = window.MOCK;
const MD2 = window.MOCK2;
const {
  MCard, MIridRing, MChip, MDot, MLabel, MIridText, MSparkline,
  MTopbar, MTabBar, Glyph, MStat, MAICard, MSegmented, MSection,
} = window;

const { useState } = React;

function MScroll({ children }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "auto", paddingBottom: 96 }}>{children}</div>
  );
}

/* ============================================================
   Reusable: sortable column header
   ============================================================ */
function SortHdr({ k, label, active, dir, onSort, w = "auto", align = "right" }) {
  const on = active === k;
  return (
    <div onClick={() => onSort(k)} style={{
      width: w, padding: "8px 4px",
      textAlign: align,
      fontSize: 9.5, letterSpacing: 0.6, fontWeight: 700,
      color: on ? "var(--am-text)" : "var(--am-text-faint)",
      cursor: "pointer", userSelect: "none",
      display: "flex", alignItems: "center", justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start",
      gap: 2,
    }}>
      <span>{label}</span>
      {on && <Glyph kind={dir === "desc" ? "sortDn" : "sortUp"} size={9} />}
    </div>
  );
}

/* ============================================================
   1. HOME — slightly tighter than v1 (no significant changes)
   ============================================================ */
function MHome({ role = "manager" }) {
  return (
    <>
      <MScroll>
        <MTopbar
          title={MD.LEAGUE.name}
          subtitle={MD.LEAGUE.season + " · Week 17 · " + (role === "commish" ? "Commissioner" : "Manager")}
          leading={<Glyph kind="bell" size={20} />}
          trailing={<Glyph kind="moreDots" size={20} />}
        />

        <div style={{ padding: "0 14px 12px" }}>
          <MIridRing>
            <div style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <MLabel>Your team · 1st of 10</MLabel>
                  <div style={{ fontFamily: "var(--am-display)", fontSize: 24, lineHeight: 1.05, marginTop: 4, color: "var(--am-text)", letterSpacing: -0.4 }}>
                    {MD.FOCUS_TEAM.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--am-text-muted)", marginTop: 3 }}>
                    {MD.FOCUS_TEAM.owner} · {MD.FOCUS_TEAM.record}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <MIridText size={36} weight={500}>{MD.FOCUS_TEAM.points.toFixed(1)}</MIridText>
                  <div style={{ fontSize: 10, color: "var(--am-positive)", marginTop: 2, fontWeight: 600 }}>+10.0 pts ↑</div>
                </div>
              </div>
              <div style={{ marginTop: 10 }}><MSparkline data={MD.FOCUS_TEAM.trend} w={320} h={36} /></div>
            </div>
          </MIridRing>
        </div>

        <MSection title="Week 17 · matchup" action="Open" style={{ padding: "0 14px 12px" }}>
          <MCard strong>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8 }}>
              <div>
                <MLabel>Home · You</MLabel>
                <div style={{ fontFamily: "var(--am-display)", fontSize: 16, lineHeight: 1.1, marginTop: 3 }}>Shoeless Joes</div>
                <div style={{ marginTop: 6 }}><MIridText size={28}>6.5</MIridText></div>
              </div>
              <div style={{
                fontSize: 9, color: "var(--am-text-faint)", letterSpacing: 1.4, fontWeight: 700,
                padding: "4px 8px", border: "1px solid var(--am-border)", borderRadius: 99,
                background: "var(--am-chip-strong)",
              }}>VS</div>
              <div style={{ textAlign: "right" }}>
                <MLabel>Wrigley</MLabel>
                <div style={{ fontFamily: "var(--am-display)", fontSize: 16, lineHeight: 1.1, marginTop: 3, color: "var(--am-text-muted)" }}>Wrigley Goats</div>
                <div style={{ fontSize: 28, fontWeight: 300, marginTop: 6, color: "var(--am-text-muted)", fontFamily: "var(--am-display)", fontVariantNumeric: "tabular-nums" }}>5.5</div>
              </div>
            </div>
          </MCard>
        </MSection>

        <MSection title="✦ For you" action="See all" style={{ padding: "0 14px 12px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <MAICard icon="↺" title="Sell-high: Marcus Semien" body="BABIP-driven; consensus drops in 3 weeks." cta="Offer" />
            <MAICard icon="✦" title="Friday streamer · K. Hayes" body="Park-shift PIT @ COL · $0 FAAB." cta="Add" />
          </div>
        </MSection>

        <MSection title="Standings · top 5" action="Full board" style={{ padding: "0 14px 12px" }}>
          <MCard padded={false}>
            {MD.STANDINGS.slice(0, 5).map((t, i) => (
              <div key={t.rank} style={{
                display: "grid", gridTemplateColumns: "20px 26px 1fr auto auto",
                alignItems: "center", gap: 10, padding: "10px 14px",
                borderTop: i > 0 ? "1px solid var(--am-border)" : "none",
              }}>
                <div style={{ fontSize: 11, color: "var(--am-text-faint)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{t.rank}</div>
                <div style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: t.rank === 1 ? "var(--am-irid)" : "var(--am-chip-strong)",
                  display: "grid", placeItems: "center",
                  fontSize: 9, fontWeight: 700,
                  color: t.rank === 1 ? "#fff" : "var(--am-text)",
                  border: "1px solid var(--am-border)",
                }}>{t.logo}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: "var(--am-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.team}</div>
                  <div style={{ fontSize: 10, color: "var(--am-text-faint)" }}>{t.owner}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: "tabular-nums", color: "var(--am-text)" }}>{t.record}</div>
                <div style={{
                  fontSize: 10.5, fontWeight: 700, width: 36, textAlign: "right",
                  color: t.delta > 0 ? "var(--am-positive)" : t.delta < 0 ? "var(--am-negative)" : "var(--am-text-faint)",
                  fontVariantNumeric: "tabular-nums",
                }}>{t.delta > 0 ? "+" : ""}{t.delta.toFixed(1)}</div>
              </div>
            ))}
          </MCard>
        </MSection>

        <MSection title="League activity" style={{ padding: "0 14px 12px" }}>
          <MCard padded={false}>
            {MD.ACTIVITY.slice(0, 4).map((a, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "44px 1fr",
                gap: 10, padding: "10px 14px",
                borderTop: i > 0 ? "1px solid var(--am-border)" : "none",
              }}>
                <div style={{ fontSize: 10, color: "var(--am-text-faint)", fontWeight: 600, fontVariantNumeric: "tabular-nums", paddingTop: 1 }}>{a.when}</div>
                <div>
                  <div style={{ display: "inline-block", marginRight: 6 }}><MChip strong>{a.type}</MChip></div>
                  <span style={{ fontSize: 12, color: "var(--am-text-muted)", lineHeight: 1.4 }}>{a.text}</span>
                </div>
              </div>
            ))}
          </MCard>
        </MSection>
      </MScroll>
      <MTabBar active="Home" role={role} />
    </>
  );
}

/* ============================================================
   2. MATCHUP — vertical category bars (no horiz scroll)
   ============================================================ */
function MMatchup({ role = "manager" }) {
  const m = MD2.MATCHUP;
  return (
    <>
      <MScroll>
        <MTopbar
          title="Matchup"
          subtitle="Week 17 · 4d 11h left"
          leading={<Glyph kind="back" size={20} />}
          trailing={<Glyph kind="moreDots" size={20} />}
        />
        <div style={{ padding: "0 14px 12px" }}>
          <MIridRing>
            <div style={{ padding: 18 }}>
              <div style={{ textAlign: "center", marginBottom: 14 }}>
                <span style={{
                  fontSize: 9, letterSpacing: 1.4, fontWeight: 700, color: "var(--am-accent)",
                  padding: "4px 10px", borderRadius: 99,
                  background: "var(--am-chip-strong)", border: "1px solid var(--am-border-strong)",
                }}>● LIVE · WEEK 17</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 40px 1fr", alignItems: "center", gap: 10 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ width: 56, height: 56, borderRadius: 14, margin: "0 auto", background: "var(--am-irid)", display: "grid", placeItems: "center", fontFamily: "var(--am-display)", fontSize: 22, color: "#fff" }}>{m.home.initials}</div>
                  <div style={{ fontFamily: "var(--am-display)", fontSize: 14, marginTop: 8, lineHeight: 1.15 }}>{m.home.team}</div>
                  <div style={{ fontSize: 10, color: "var(--am-text-faint)", marginTop: 2 }}>{m.home.record}</div>
                  <div style={{ marginTop: 8 }}><MIridText size={42} weight={500}>{m.home.score}</MIridText></div>
                </div>
                <div style={{ fontSize: 10, color: "var(--am-text-faint)", letterSpacing: 1.4, fontWeight: 700, textAlign: "center" }}>VS</div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ width: 56, height: 56, borderRadius: 14, margin: "0 auto", background: "var(--am-chip-strong)", border: "1px solid var(--am-border-strong)", display: "grid", placeItems: "center", fontFamily: "var(--am-display)", fontSize: 22, color: "var(--am-text)" }}>{m.away.initials}</div>
                  <div style={{ fontFamily: "var(--am-display)", fontSize: 14, marginTop: 8, lineHeight: 1.15 }}>{m.away.team}</div>
                  <div style={{ fontSize: 10, color: "var(--am-text-faint)", marginTop: 2 }}>{m.away.record}</div>
                  <div style={{ marginTop: 8, fontFamily: "var(--am-display)", fontSize: 42, lineHeight: 1, color: "var(--am-text-muted)", fontVariantNumeric: "tabular-nums", fontWeight: 300 }}>{m.away.score}</div>
                </div>
              </div>
              <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 6 }}>
                <MChip strong color="var(--am-positive)">▲ {m.cats.filter(c => c.win).length} won</MChip>
                <MChip strong color="var(--am-negative)">▼ {m.cats.filter(c => !c.win).length} lost</MChip>
              </div>
            </div>
          </MIridRing>
        </div>

        <MSection title="Category breakdown" style={{ padding: "0 14px 12px" }}>
          <MCard padded={false}>
            {m.cats.map((c, i) => (
              <div key={c.cat} style={{
                display: "grid", gridTemplateColumns: "44px 1fr 24px",
                alignItems: "center", gap: 10, padding: "10px 14px",
                borderTop: i > 0 ? "1px solid var(--am-border)" : "none",
              }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--am-text-faint)", letterSpacing: 1 }}>{c.cat}</div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, fontVariantNumeric: "tabular-nums", marginBottom: 4 }}>
                    <span style={{ color: c.win ? "var(--am-text)" : "var(--am-text-muted)", fontWeight: c.win ? 600 : 400 }}>{c.yours}</span>
                    <span style={{ color: !c.win ? "var(--am-text)" : "var(--am-text-muted)", fontWeight: !c.win ? 600 : 400 }}>{c.theirs}</span>
                  </div>
                  <div style={{ height: 4, background: "var(--am-chip)", borderRadius: 99, overflow: "hidden", display: "flex" }}>
                    <div style={{ flex: c.win ? 1.5 : 0.6, background: c.win ? "var(--am-irid)" : "var(--am-chip-strong)" }} />
                    <div style={{ flex: c.win ? 0.6 : 1.5, background: c.win ? "var(--am-chip-strong)" : "var(--am-irid)", opacity: 0.8 }} />
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, textAlign: "right", color: c.win ? "var(--am-positive)" : "var(--am-negative)" }}>{c.win ? "▲" : "▼"}</div>
              </div>
            ))}
          </MCard>
        </MSection>

        <MSection title="✦ Win path · 2 plays to seal it" style={{ padding: "0 14px 12px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <MAICard icon="▲" title="Stream Houck Sat vs CHC" body="Park-shift +0.4 K · projected 1 QS swing." cta="Add" />
            <MAICard icon="↺" title="Bench Nootbaar Sun" body="vs LHP Snell — protect AVG lead." cta="Apply" />
          </div>
        </MSection>
      </MScroll>
      <MTabBar active="Matchup" role={role} />
    </>
  );
}

/* ============================================================
   3. TEAM PAGE — DENSER cards, 4 stats inline
   ============================================================ */
function MTeam({ role = "manager" }) {
  const r = MD.ROSTER;
  const [tab, setTab] = useState("Hitters");
  const hitters = r.filter(p => !["SP", "RP"].includes(p.pos));
  const pitchers = r.filter(p => ["SP", "RP"].includes(p.pos));
  const list = tab === "Hitters" ? hitters : pitchers;
  const isHit = tab === "Hitters";

  return (
    <>
      <MScroll>
        <MTopbar
          title="Shoeless Joes"
          subtitle="1st place · keeper league"
          leading={<Glyph kind="back" size={20} />}
          trailing={<Glyph kind="moreDots" size={20} />}
        />

        {/* Compact hero — single row */}
        <div style={{ padding: "0 14px 10px" }}>
          <MIridRing>
            <div style={{ padding: 12, display: "grid", gridTemplateColumns: "auto 1fr auto auto auto", gap: 10, alignItems: "center" }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--am-irid)", display: "grid", placeItems: "center", fontFamily: "var(--am-display)", fontSize: 16, color: "#fff" }}>{MD.FOCUS_TEAM.initials}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "var(--am-display)", fontSize: 15, lineHeight: 1.05 }}>{MD.FOCUS_TEAM.name}</div>
                <div style={{ fontSize: 10, color: "var(--am-text-muted)", marginTop: 2 }}>1st · {MD.FOCUS_TEAM.record} · ${"248"} cap</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, letterSpacing: 0.5, color: "var(--am-text-faint)", fontWeight: 600 }}>FAAB</div>
                <div style={{ fontFamily: "var(--am-display)", fontSize: 14 }}>$48</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, letterSpacing: 0.5, color: "var(--am-text-faint)", fontWeight: 600 }}>MV</div>
                <div style={{ fontFamily: "var(--am-display)", fontSize: 14 }}>31</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, letterSpacing: 0.5, color: "var(--am-text-faint)", fontWeight: 600 }}>PTS</div>
                <div><MIridText size={16}>{MD.FOCUS_TEAM.points.toFixed(0)}</MIridText></div>
              </div>
            </div>
          </MIridRing>
        </div>

        {/* tabs */}
        <div style={{ padding: "0 14px 8px" }}>
          <div onClick={() => {}}>
            <div style={{ display: "flex", padding: 3, gap: 2, borderRadius: 12, background: "var(--am-chip)", border: "1px solid var(--am-border)" }}>
              {[`Hitters · ${hitters.length}`, `Pitchers · ${pitchers.length}`].map((opt, i) => {
                const k = i === 0 ? "Hitters" : "Pitchers";
                const on = tab === k;
                return (
                  <div key={k} onClick={() => setTab(k)} style={{
                    flex: 1, padding: "6px 0", textAlign: "center",
                    fontSize: 11.5, fontWeight: on ? 600 : 500,
                    color: on ? "var(--am-text)" : "var(--am-text-muted)",
                    background: on ? "var(--am-surface-strong)" : "transparent",
                    borderRadius: 9, cursor: "pointer",
                  }}>{opt}</div>
                );
              })}
            </div>
          </div>
        </div>

        {/* column header strip — cheap density gain */}
        <div style={{ padding: "0 16px 4px", display: "grid", gridTemplateColumns: "32px 1fr 36px 36px 36px 36px", gap: 6, alignItems: "center" }}>
          <div />
          <div style={{ fontSize: 9, letterSpacing: 0.6, color: "var(--am-text-faint)", fontWeight: 700 }}>PLAYER</div>
          {(isHit ? ["AVG","HR","RBI","SB"] : ["W","K","ERA","WHIP"]).map(s => (
            <div key={s} style={{ fontSize: 9, letterSpacing: 0.6, color: "var(--am-text-faint)", fontWeight: 700, textAlign: "right" }}>{s}</div>
          ))}
        </div>

        {/* DENSE rows — flush card */}
        <div style={{ padding: "0 14px 12px" }}>
          <MCard padded={false}>
            {list.map((p, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "32px 1fr 36px 36px 36px 36px",
                gap: 6, alignItems: "center",
                padding: "7px 14px",
                borderTop: i > 0 ? "1px solid var(--am-border)" : "none",
              }}>
                <div style={{
                  fontSize: 9.5, fontWeight: 700, color: "var(--am-text)",
                  background: "var(--am-chip-strong)",
                  padding: "3px 0", borderRadius: 5, textAlign: "center",
                  border: "1px solid var(--am-border)",
                }}>{p.slot}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: "var(--am-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.2 }}>{p.name}</div>
                  <div style={{ fontSize: 9.5, color: "var(--am-text-faint)" }}>{p.team} · {p.pos}</div>
                </div>
                {isHit ? (
                  <>
                    <div style={statCell}>{p.avg}</div>
                    <div style={statCell}>{p.hr}</div>
                    <div style={statCell}>{p.rbi || "—"}</div>
                    <div style={statCell}>{p.sb}</div>
                  </>
                ) : (
                  <>
                    <div style={statCell}>{p.w || 0}</div>
                    <div style={statCell}>{p.k || 0}</div>
                    <div style={statCell}>{p.era || "—"}</div>
                    <div style={statCell}>{p.whip || "—"}</div>
                  </>
                )}
              </div>
            ))}
          </MCard>
        </div>
      </MScroll>
      <MTabBar active="Home" role={role} />
    </>
  );
}
const statCell = {
  fontSize: 12, fontWeight: 600, color: "var(--am-text)",
  textAlign: "right", fontVariantNumeric: "tabular-nums",
};

/* ============================================================
   4. STANDINGS — TABLE FORMAT, sortable, hit/pitch/total toggle
   ============================================================ */
function MStandings({ role = "manager" }) {
  const cats = MD2.FULL_STANDINGS_CATS; // 13
  // Standard 5×5 roto — user only wants 4-5 cats per view, not all 13.
  const HIT_IDX   = [0, 3, 4, 5, 6];   // AVG, HR, R, RBI, SB
  const PITCH_IDX = [10, 11, 9, 7, 8]; // W, SV, K, ERA, WHIP
  const HIT_LABELS   = HIT_IDX.map(i => cats[i]);
  const PITCH_LABELS = PITCH_IDX.map(i => cats[i]);

  const [view, setView] = useState("Hitting");
  const [sortKey, setSortKey] = useState("total");
  const [sortDir, setSortDir] = useState("desc");

  const showIdx = view === "Hitting" ? HIT_IDX : view === "Pitching" ? PITCH_IDX : null;
  const labels  = view === "Hitting" ? HIT_LABELS
                 : view === "Pitching" ? PITCH_LABELS
                 : ["AVG","HR","RBI","SB","K"]; // total view: 5-cat headline subset

  const onSort = (k) => {
    if (sortKey === k) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const totalForView = (t) => {
    if (showIdx === null) return t.total;
    return showIdx.reduce((s, i) => s + t.pts[i], 0);
  };

  const rows = [...MD2.FULL_STANDINGS].sort((a, b) => {
    let av, bv;
    if (sortKey === "total") { av = totalForView(a); bv = totalForView(b); }
    else if (sortKey === "rank") { av = a.rank; bv = b.rank; }
    else if (sortKey === "team") { av = a.team; bv = b.team; }
    else { const idx = cats.indexOf(sortKey); av = a.pts[idx]; bv = b.pts[idx]; }
    if (typeof av === "string") return sortDir === "desc" ? bv.localeCompare(av) : av.localeCompare(bv);
    return sortDir === "desc" ? bv - av : av - bv;
  });

  // Inner ~358 - 24 row padding = 334.
  // rank 16 + 5 cats × 28 + total 32 = 188; team col = ~146 — plenty for "Bleacher Creatures".
  const colW = 28;
  const cols = `16px minmax(0,1fr) ${labels.map(() => `${colW}px`).join(" ")} 32px`;

  return (
    <>
      <MScroll>
        <MTopbar
          title="Standings"
          subtitle="13-cat 5×5+ · refreshed 3m"
          leading={<Glyph kind="back" size={20} />}
          trailing={<Glyph kind="filter" size={20} />}
        />

        <div style={{ padding: "0 14px 10px" }}>
          <div style={{ display: "flex", padding: 3, gap: 2, borderRadius: 12, background: "var(--am-chip)", border: "1px solid var(--am-border)" }}>
            {["Hitting", "Pitching", "Total"].map(v => {
              const on = view === v;
              return (
                <div key={v} onClick={() => setView(v)} style={{
                  flex: 1, padding: "6px 0", textAlign: "center",
                  fontSize: 11.5, fontWeight: on ? 600 : 500,
                  color: on ? "var(--am-text)" : "var(--am-text-muted)",
                  background: on ? "var(--am-surface-strong)" : "transparent",
                  borderRadius: 9, cursor: "pointer",
                }}>{v}</div>
              );
            })}
          </div>
        </div>

        {/* TABLE */}
        <div style={{ padding: "0 14px 12px", marginTop: 4 }}>
          <MCard padded={false}>
            {/* Header */}
            <div style={{
              display: "grid", gridTemplateColumns: cols, gap: 0,
              alignItems: "center", padding: "2px 12px",
              borderBottom: "1px solid var(--am-border-strong)",
              background: "var(--am-surface-faint)",
            }}>
              <SortHdr k="rank" label="#" active={sortKey} dir={sortDir} onSort={onSort} align="center" />
              <SortHdr k="team" label="TEAM" active={sortKey} dir={sortDir} onSort={onSort} align="left" />
              {labels.map((l) => (
                <SortHdr key={l} k={l} label={l} active={sortKey} dir={sortDir} onSort={onSort} align="center" />
              ))}
              <SortHdr k="total" label="TOT" active={sortKey} dir={sortDir} onSort={onSort} align="right" />
            </div>

            {rows.map((t, i) => {
              const isMe = t.team === "Shoeless Joes";
              return (
                <div key={t.team} style={{
                  display: "grid", gridTemplateColumns: cols, gap: 0,
                  alignItems: "center", padding: "7px 12px",
                  borderTop: i > 0 ? "1px solid var(--am-border)" : "none",
                  background: isMe ? "var(--am-chip)" : "transparent",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--am-text-muted)", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{t.rank}</div>
                  <div style={{ minWidth: 0, paddingLeft: 8, paddingRight: 6 }}>
                    <div style={{
                      fontSize: 12.5, color: "var(--am-text)",
                      fontWeight: isMe ? 700 : 500,
                      lineHeight: 1.2, letterSpacing: -0.1,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {t.team}
                      {isMe && <span style={{ fontSize: 9, color: "var(--am-accent)", marginLeft: 5, fontWeight: 700, letterSpacing: 0.4 }}>YOU</span>}
                    </div>
                  </div>
                  {(view === "Total" ? [t.pts[0], t.pts[3], t.pts[5], t.pts[6], t.pts[9]] : showIdx.map(idx => t.pts[idx])).map((p, j) => (                    <div key={j} style={{
                      textAlign: "center",
                      fontSize: 13, fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      color: p >= 8 ? "var(--am-positive)" : p >= 5 ? "var(--am-text)" : "var(--am-text-muted)",
                    }}>{p}</div>
                  ))}
                  <div style={{ textAlign: "right", paddingLeft: 4 }}>
                    <MIridText size={14} weight={700}>{(view === "Total" ? t.total : showIdx.reduce((s, i) => s + t.pts[i], 0)).toFixed(1)}</MIridText>
                  </div>
                </div>
              );
            })}
          </MCard>
        </div>

        <div style={{ padding: "0 14px 16px" }}>
          <div style={{ fontSize: 10, color: "var(--am-text-faint)", padding: "0 4px" }}>
            Each cell shows roto points (1–10). Tap any column header to sort. Green = top tier.
          </div>
        </div>
      </MScroll>
      <MTabBar active="Standings" role={role} />
    </>
  );
}

/* ============================================================
   5. PLAYERS — sortable 4-stat table + tap-to-expand inline
   ============================================================ */
// mock pitcher pool — supplements MD2.PLAYERS (hitters)
const PITCHERS_MOCK = [
  { name: "Tarik Skubal",     team: "DET", pos: "SP", w: 14, k: 198, era: "2.41", whip: "0.96", own: 100, fav: true,  status: "Healthy" },
  { name: "Paul Skenes",      team: "PIT", pos: "SP", w: 11, k: 207, era: "1.99", whip: "0.92", own: 100, fav: true,  status: "Healthy" },
  { name: "Zack Wheeler",     team: "PHI", pos: "SP", w: 13, k: 184, era: "2.78", whip: "1.02", own: 100, fav: false, status: "Healthy" },
  { name: "Garrett Crochet",  team: "BOS", pos: "SP", w: 10, k: 194, era: "3.12", whip: "1.05", own: 99,  fav: false, status: "Healthy" },
  { name: "Logan Webb",       team: "SF",  pos: "SP", w: 12, k: 168, era: "3.04", whip: "1.10", own: 98,  fav: false, status: "Healthy" },
  { name: "Emmanuel Clase",   team: "CLE", pos: "RP", w:  3, k:  72, era: "1.41", whip: "0.86", own: 100, fav: false, status: "Healthy" },
  { name: "Mason Miller",     team: "ATH", pos: "RP", w:  2, k:  84, era: "2.10", whip: "0.93", own: 99,  fav: false, status: "IL-15"   },
  { name: "Edwin Diaz",       team: "NYM", pos: "RP", w:  1, k:  74, era: "2.92", whip: "1.04", own: 96,  fav: false, status: "Healthy" },
];

function MPlayers({ role = "manager" }) {
  const [group, setGroup] = useState("Hitters"); // Hitters | Pitchers
  const isHit = group === "Hitters";

  // Pool depends on group
  const pool = isHit ? MD2.PLAYERS : PITCHERS_MOCK;

  // Position chips contextual to group (same set the real Players page uses)
  const positions = isHit
    ? ["All", "C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH"]
    : ["All", "P", "SP", "RP"];

  // League filter (matches real Players: ALL / NL / AL)
  const leagues = ["All", "NL", "AL"];
  const NL_TEAMS = new Set(["LAD","SD","SF","ARI","COL","ATL","NYM","PHI","WSH","MIA","CHC","CIN","MIL","PIT","STL"]);

  const [pos, setPos] = useState("All");
  const [league, setLeague] = useState("All");
  const [view, setView] = useState("Available"); // Available | On team | Watch
  const [sortKey, setSortKey] = useState(isHit ? "hr" : "k");
  const [sortDir, setSortDir] = useState("desc");
  const [openId, setOpenId] = useState(null);

  // Reset sort + position when group flips
  React.useEffect(() => {
    setSortKey(isHit ? "hr" : "k");
    setPos("All");
    setOpenId(null);
  }, [group]);

  const onSort = (k) => {
    if (sortKey === k) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const filtered = pool.filter(p => {
    if (pos !== "All" && p.pos !== pos && !(pos === "P" && (p.pos === "SP" || p.pos === "RP"))) return false;
    if (league === "NL" && !NL_TEAMS.has(p.team)) return false;
    if (league === "AL" &&  NL_TEAMS.has(p.team)) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey];
    if (sortKey === "name" || sortKey === "team" || sortKey === "pos") {
      return sortDir === "desc" ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
    }
    if (sortKey === "avg" || sortKey === "era" || sortKey === "whip") { av = parseFloat(av); bv = parseFloat(bv); }
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const cols = "1fr 36px 36px 36px 36px 24px";

  return (
    <>
      <MScroll>
        <MTopbar
          title="Players"
          subtitle="1,247 players · 192 free agents"
          leading={<Glyph kind="filter" size={20} />}
          trailing={<Glyph kind="moreDots" size={20} />}
        />

        {/* SEARCH */}
        <div style={{ padding: "0 14px 10px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "9px 14px", borderRadius: 12,
            background: "var(--am-surface-strong)", border: "1px solid var(--am-border)",
          }}>
            <span style={{ color: "var(--am-text-faint)" }}><Glyph kind="search" size={16} /></span>
            <span style={{ fontSize: 13, color: "var(--am-text-muted)" }}>Search players, teams, positions…</span>
          </div>
        </div>

        {/* HITTERS / PITCHERS — primary group toggle (matches real Players page) */}
        <div style={{ padding: "0 14px 8px" }}>
          <div style={{ display: "flex", padding: 3, gap: 2, borderRadius: 12, background: "var(--am-chip)", border: "1px solid var(--am-border)" }}>
            {["Hitters", "Pitchers"].map(g => {
              const on = group === g;
              return (
                <div key={g} onClick={() => setGroup(g)} style={{
                  flex: 1, padding: "7px 0", textAlign: "center",
                  fontSize: 12, fontWeight: on ? 700 : 500,
                  color: on ? "var(--am-text)" : "var(--am-text-muted)",
                  background: on ? "var(--am-surface-strong)" : "transparent",
                  borderRadius: 9, cursor: "pointer",
                }}>{g}</div>
              );
            })}
          </div>
        </div>

        {/* LEAGUE chips */}
        <div style={{ padding: "0 14px 6px", display: "flex", gap: 5, alignItems: "center" }}>
          <span style={{ fontSize: 9.5, letterSpacing: 0.6, fontWeight: 700, color: "var(--am-text-faint)", marginRight: 4 }}>LG</span>
          {leagues.map(l => {
            const on = league === l;
            return (
              <span key={l} onClick={() => setLeague(l)} style={{
                padding: "4px 10px", borderRadius: 99,
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                background: on ? "var(--am-irid)" : "var(--am-chip)",
                color: on ? "#fff" : "var(--am-text-muted)",
                border: "1px solid " + (on ? "transparent" : "var(--am-border)"),
              }}>{l}</span>
            );
          })}
        </div>

        {/* POSITION CHIPS — wrap to 2 rows, no horizontal scroll */}
        <div style={{ padding: "4px 14px 8px", display: "flex", gap: 5, flexWrap: "wrap" }}>
          {positions.map(p => {
            const on = pos === p;
            return (
              <span key={p} onClick={() => setPos(p)} style={{
                padding: "5px 11px", borderRadius: 99,
                fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                background: on ? "var(--am-irid)" : "var(--am-chip)",
                color: on ? "#fff" : "var(--am-text-muted)",
                border: "1px solid " + (on ? "transparent" : "var(--am-border)"),
              }}>{p}</span>
            );
          })}
        </div>

        {/* AVAIL/MINE/WATCH */}
        <div style={{ padding: "0 14px 10px" }}>
          <div style={{ display: "flex", padding: 3, gap: 2, borderRadius: 12, background: "var(--am-chip)", border: "1px solid var(--am-border)" }}>
            {["Available", "On team", "Watch · 7"].map(v => {
              const on = view === v;
              return (
                <div key={v} onClick={() => setView(v)} style={{
                  flex: 1, padding: "6px 0", textAlign: "center",
                  fontSize: 11.5, fontWeight: on ? 600 : 500,
                  color: on ? "var(--am-text)" : "var(--am-text-muted)",
                  background: on ? "var(--am-surface-strong)" : "transparent",
                  borderRadius: 9, cursor: "pointer",
                }}>{v}</div>
              );
            })}
          </div>
        </div>

        {/* PLAYER TABLE */}
        <div style={{ padding: "0 14px 12px" }}>
          <MCard padded={false}>
            {/* Header */}
            <div style={{
              display: "grid", gridTemplateColumns: cols, gap: 4,
              alignItems: "center", padding: "2px 12px 0 12px",
              borderBottom: "1px solid var(--am-border-strong)",
              background: "var(--am-surface-faint)",
            }}>
              <SortHdr k="name" label="PLAYER" active={sortKey} dir={sortDir} onSort={onSort} align="left" />
              {isHit ? (
                <>
                  <SortHdr k="avg"  label="AVG" active={sortKey} dir={sortDir} onSort={onSort} align="right" />
                  <SortHdr k="hr"   label="HR"  active={sortKey} dir={sortDir} onSort={onSort} align="right" />
                  <SortHdr k="rbi"  label="RBI" active={sortKey} dir={sortDir} onSort={onSort} align="right" />
                  <SortHdr k="sb"   label="SB"  active={sortKey} dir={sortDir} onSort={onSort} align="right" />
                </>
              ) : (
                <>
                  <SortHdr k="w"    label="W"    active={sortKey} dir={sortDir} onSort={onSort} align="right" />
                  <SortHdr k="k"    label="K"    active={sortKey} dir={sortDir} onSort={onSort} align="right" />
                  <SortHdr k="era"  label="ERA"  active={sortKey} dir={sortDir} onSort={onSort} align="right" />
                  <SortHdr k="whip" label="WHIP" active={sortKey} dir={sortDir} onSort={onSort} align="right" />
                </>
              )}
              <div />
            </div>

            {sorted.map((p, i) => {
              const open = openId === p.name;
              return (
                <React.Fragment key={p.name}>
                  <div onClick={() => setOpenId(open ? null : p.name)} style={{
                    display: "grid", gridTemplateColumns: cols, gap: 4,
                    alignItems: "center", padding: "9px 12px",
                    borderTop: i > 0 ? "1px solid var(--am-border)" : "none",
                    background: open ? "var(--am-chip-strong)" : "transparent",
                    cursor: "pointer",
                  }}>
                    <div style={{ minWidth: 0, display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ color: p.fav ? "var(--am-accent)" : "var(--am-text-faint)", flexShrink: 0 }}>
                        <Glyph kind={p.fav ? "starOn" : "star"} size={13} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, color: "var(--am-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.2 }}>
                          {p.name}
                          {p.status !== "Healthy" && <span style={{ fontSize: 9, color: "var(--am-negative)", marginLeft: 6, fontWeight: 700 }}>{p.status}</span>}
                        </div>
                        <div style={{ fontSize: 9.5, color: "var(--am-text-faint)" }}>{p.team} · {p.pos} · own {p.own}%</div>
                      </div>
                    </div>
                    {isHit ? (
                      <>
                        <div style={statCell}>{p.avg}</div>
                        <div style={statCell}>{p.hr}</div>
                        <div style={statCell}>{p.rbi}</div>
                        <div style={statCell}>{p.sb}</div>
                      </>
                    ) : (
                      <>
                        <div style={statCell}>{p.w}</div>
                        <div style={statCell}>{p.k}</div>
                        <div style={statCell}>{p.era}</div>
                        <div style={statCell}>{p.whip}</div>
                      </>
                    )}
                    <div style={{ textAlign: "right", color: "var(--am-text-faint)" }}>
                      <Glyph kind={open ? "chevD" : "chevR"} size={14} />
                    </div>
                  </div>

                  {/* INLINE EXPANDED ROW — career + recent + add */}
                  {open && (
                    <div style={{
                      padding: "12px 14px 14px",
                      background: "var(--am-surface-faint)",
                      borderTop: "1px solid var(--am-border)",
                    }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                        <ExpCell label="G" value="124" />
                        <ExpCell label="AB" value="478" />
                        <ExpCell label="R" value="78" />
                        <ExpCell label="OPS" value=".872" />
                      </div>

                      <div style={{ fontSize: 9.5, letterSpacing: 0.6, fontWeight: 700, color: "var(--am-text-faint)", marginBottom: 4 }}>
                        CAREER · 7 SEASONS
                      </div>
                      <div style={{
                        display: "grid", gridTemplateColumns: "70px repeat(5, 1fr)",
                        rowGap: 3, fontSize: 11, fontVariantNumeric: "tabular-nums",
                        marginBottom: 10,
                      }}>
                        <div style={hLab}>YEAR</div>
                        <div style={hLab}>AVG</div>
                        <div style={hLab}>HR</div>
                        <div style={hLab}>RBI</div>
                        <div style={hLab}>SB</div>
                        <div style={hLab}>OPS</div>
                        {[
                          ["2026", p.avg, p.hr, p.rbi, p.sb, ".872"],
                          ["2025", ".284", 32, 96, 11, ".845"],
                          ["2024", ".291", 28, 88, 14, ".830"],
                          ["2023", ".272", 24, 80, 9,  ".801"],
                        ].map((r, k) => (
                          <React.Fragment key={k}>
                            <div style={{ color: k === 0 ? "var(--am-text)" : "var(--am-text-muted)", fontWeight: k === 0 ? 700 : 500 }}>{r[0]}</div>
                            {r.slice(1).map((v, m) => (
                              <div key={m} style={{ color: k === 0 ? "var(--am-text)" : "var(--am-text-muted)", fontWeight: k === 0 ? 600 : 400, textAlign: "right" }}>{v}</div>
                            ))}
                          </React.Fragment>
                        ))}
                      </div>

                      {/* Last 15-day sparkline + status */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div style={{ fontSize: 10.5, color: "var(--am-text-muted)" }}>
                          <span style={{ color: "var(--am-text-faint)", fontWeight: 700, letterSpacing: 0.5, fontSize: 9 }}>L15 ·</span>{" "}
                          <span style={{ color: "var(--am-positive)", fontWeight: 700 }}>.342</span> · 5 HR · 12 RBI
                        </div>
                        <MSparkline data={[3,4,2,5,4,6,4,5,6,7,5,8,6,7]} w={110} h={22} />
                      </div>

                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={btnPrimary}>＋ Add to team</button>
                        <button style={btnGhost}>Watch</button>
                        <button style={btnGhost}>Compare</button>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </MCard>
        </div>
      </MScroll>
      <MTabBar active="Players" role={role} />
    </>
  );
}

const hLab = { fontSize: 9, letterSpacing: 0.5, fontWeight: 700, color: "var(--am-text-faint)", textAlign: "right" };
hLab[":first-child"] = { textAlign: "left" };
const btnPrimary = {
  flex: 1, padding: "9px 12px", borderRadius: 10,
  background: "var(--am-irid)", color: "#fff", border: "none",
  fontSize: 12, fontWeight: 700, cursor: "pointer",
};
const btnGhost = {
  padding: "9px 14px", borderRadius: 10,
  background: "var(--am-chip-strong)", color: "var(--am-text)",
  border: "1px solid var(--am-border)",
  fontSize: 12, fontWeight: 600, cursor: "pointer",
};

function ExpCell({ label, value }) {
  return (
    <div style={{ padding: "8px 10px", borderRadius: 9, background: "var(--am-chip)", border: "1px solid var(--am-border)" }}>
      <div style={{ fontSize: 9, letterSpacing: 0.6, color: "var(--am-text-faint)", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--am-text)", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{value}</div>
    </div>
  );
}

/* ============================================================
   6. MORE / COMMISH SHEET — secondary nav, conditional admin
   ============================================================ */
function MMore({ role = "manager" }) {
  const isCommish = role === "commish";
  return (
    <>
      <MScroll>
        <MTopbar
          title={isCommish ? "Commissioner" : "More"}
          subtitle={isCommish ? "League tools + your account" : "League, account, settings"}
          leading={<Glyph kind="x" size={20} />}
          trailing={<Glyph kind="cog" size={20} />}
        />

        {/* PROFILE STRIP */}
        <div style={{ padding: "0 14px 14px" }}>
          <MCard strong>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: "var(--am-irid)", color: "#fff",
                display: "grid", placeItems: "center",
                fontFamily: "var(--am-display)", fontSize: 18,
              }}>MO</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--am-text)" }}>Mike Ortega</div>
                <div style={{ fontSize: 10.5, color: "var(--am-text-muted)" }}>{isCommish ? "Commissioner · Shoeless Joes" : "Manager · Shoeless Joes"}</div>
              </div>
              <Glyph kind="chevR" size={16} />
            </div>
          </MCard>
        </div>

        {/* LEAGUE GROUP */}
        <MoreGroup label="League">
          <MoreItem icon="trophy"   title="Standings" sub="Roto · 13-cat" />
          <MoreItem icon="calendar" title="Schedule" sub="Period 18 starts Mon" />
          <MoreItem icon="trade"    title="Transactions" sub="3 pending offers" badge="3" />
          <MoreItem icon="ai"       title="Weekly Report" sub="AI digest · Sun 9pm" />
        </MoreGroup>

        {/* COMMISH-ONLY GROUP */}
        {isCommish && (
          <MoreGroup label="Commissioner" accent>
            <MoreItem icon="cog"      title="League Settings" sub="Rules, scoring, slots" />
            <MoreItem icon="players"  title="Members & invites" sub="10 active · 0 pending" />
            <MoreItem icon="trade"    title="Trade approvals" sub="2 awaiting your review" badge="2" />
            <MoreItem icon="calendar" title="Period close" sub="Wed 3:00 AM · auto" />
            <MoreItem icon="trophy"   title="Auction setup" sub="Apr 6 · $260 cap" />
            <MoreItem icon="shield"   title="Audit log" sub="All actions, last 90d" />
          </MoreGroup>
        )}

        {/* ACCOUNT */}
        <MoreGroup label="Account">
          <MoreItem icon="bell"  title="Notifications" sub="Push, email, lineup alerts" />
          <MoreItem icon="cog"   title="Appearance" sub="Aurora · Auto" />
          <MoreItem icon="me"    title="Profile" sub="Edit name, photo, email" />
        </MoreGroup>

        <div style={{ padding: "0 14px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "var(--am-text-faint)" }}>The Fantastic Leagues · v3.2.1</div>
          <div style={{ fontSize: 10, color: "var(--am-text-faint)", marginTop: 2 }}>Sign out</div>
        </div>
      </MScroll>
      <MTabBar active="More" role={role} />
    </>
  );
}

function MoreGroup({ label, accent, children }) {
  return (
    <div style={{ padding: "0 14px 14px" }}>
      <div style={{ padding: "0 4px 6px", display: "flex", alignItems: "center", gap: 6 }}>
        {accent && <span style={{ width: 4, height: 4, borderRadius: 99, background: "var(--am-accent)" }} />}
        <div style={{ fontSize: 9.5, letterSpacing: 1.1, fontWeight: 700, color: accent ? "var(--am-accent)" : "var(--am-text-faint)", textTransform: "uppercase" }}>{label}</div>
      </div>
      <MCard padded={false}>{children}</MCard>
    </div>
  );
}

function MoreItem({ icon, title, sub, badge }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "32px 1fr auto auto",
      gap: 12, alignItems: "center", padding: "11px 14px",
      borderTop: "1px solid var(--am-border)",
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        background: "var(--am-chip-strong)", border: "1px solid var(--am-border)",
        display: "grid", placeItems: "center", color: "var(--am-text-muted)",
      }}><Glyph kind={icon} size={15} /></div>
      <div>
        <div style={{ fontSize: 12.5, color: "var(--am-text)", fontWeight: 500 }}>{title}</div>
        {sub && <div style={{ fontSize: 10.5, color: "var(--am-text-faint)" }}>{sub}</div>}
      </div>
      {badge && (
        <span style={{
          padding: "2px 7px", borderRadius: 99, fontSize: 10, fontWeight: 700,
          background: "var(--am-irid)", color: "#fff",
        }}>{badge}</span>
      )}
      <Glyph kind="chevR" size={14} />
    </div>
  );
}

Object.assign(window, {
  MHome, MMatchup, MTeam, MStandings, MPlayers, MMore,
});
