// client/src/pages/design/WaiverWirePreview.tsx
//
// Design preview for the Waiver Wire List feature. Single scrollable
// page that walks through the 4 surfaces (owner list, add-claim form,
// commissioner view, post-execution results) using mocked data.
//
// CRITICAL: NO BUSINESS LOGIC. No DB, no API. Local React state only.
// Auction $ values are intentionally absent per PM direction.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Glass, SectionLabel, Chip, IridText } from "../../components/aurora/atoms";

// ─── Types (preview-local; not the prod schema) ──────────────────

type DropMode = "RELEASE" | "IL_STASH";

interface MockClaim {
  id: number;
  priority: number;
  addName: string;
  addPos: string;
  addTeam: string;
  dropName: string;
  dropPos: string;
  dropTeam: string;
  dropMode: DropMode;
}

interface MockOwnerSummary {
  teamCode: string;
  teamName: string;
  priority: number;
  tradedFrom?: string;
  claims: MockClaim[];
}

interface MockResult {
  priority: number;
  addName: string;
  dropName: string;
  outcome: "SUCCESS" | "FAILED" | "SKIPPED";
  reason?: string;
}

// ─── Mock data ───────────────────────────────────────────────────

const MY_CLAIMS_INITIAL: MockClaim[] = [
  { id: 1, priority: 1, addName: "Michael Toglia",  addPos: "1B", addTeam: "COL",
    dropName: "Carmen Mlodzinski", dropPos: "P", dropTeam: "ATH", dropMode: "IL_STASH" },
  { id: 2, priority: 2, addName: "Edwin Díaz",      addPos: "RP", addTeam: "HOU",
    dropName: "Foster Griffin",    dropPos: "P", dropTeam: "LAD", dropMode: "RELEASE" },
  { id: 3, priority: 3, addName: "Spencer Strider", addPos: "P",  addTeam: "ATL",
    dropName: "Justin Wrobleski",  dropPos: "P", dropTeam: "LAD", dropMode: "RELEASE" },
];

const WATCHLIST_PICKER: Array<{
  name: string; pos: string; team: string;
  state: "AVAILABLE" | "ROSTERED" | "ON_OWN_ROSTER";
  rosteredBy?: string;
}> = [
  { name: "Michael Toglia",  pos: "1B", team: "COL", state: "AVAILABLE" },
  { name: "Edwin Díaz",      pos: "RP", team: "HOU", state: "AVAILABLE" },
  { name: "Spencer Strider", pos: "P",  team: "ATL", state: "AVAILABLE" },
  { name: "Hunter Greene",   pos: "P",  team: "CIN", state: "ROSTERED", rosteredBy: "The Bombers" },
  { name: "Nick Pivetta",    pos: "P",  team: "SD",  state: "ROSTERED", rosteredBy: "Halfsies" },
];

const ROSTER_PICKER = [
  { name: "Carmen Mlodzinski", pos: "P", team: "ATH" },
  { name: "Foster Griffin",    pos: "P", team: "LAD" },
  { name: "Justin Wrobleski",  pos: "P", team: "LAD" },
  { name: "Brandon Lockridge", pos: "OF", team: "NYY" },
  { name: "Gavin Sheets",      pos: "OF", team: "CWS" },
];

const COMMISSIONER_TEAMS: MockOwnerSummary[] = [
  { teamCode: "DRS", teamName: "The Drowning Sorrows", priority: 1, claims: [
    { id: 11, priority: 1, addName: "Michael Toglia", addPos: "1B", addTeam: "COL",
      dropName: "Bob Smith",      dropPos: "1B", dropTeam: "COL", dropMode: "RELEASE" },
    { id: 12, priority: 2, addName: "Hunter Greene",  addPos: "P",  addTeam: "CIN",
      dropName: "Tommy Walker",   dropPos: "P",  dropTeam: "ARI", dropMode: "IL_STASH" },
  ]},
  { teamCode: "HFS", teamName: "Halfsies", priority: 2, tradedFrom: "The Bombers", claims: [
    { id: 21, priority: 1, addName: "Edwin Díaz",     addPos: "RP", addTeam: "HOU",
      dropName: "Taijuan Walker", dropPos: "P",  dropTeam: "PHI", dropMode: "IL_STASH" },
  ]},
  { teamCode: "LDY", teamName: "Los Doyers", priority: 3, claims: [
    { id: 31, priority: 1, addName: "Spencer Strider", addPos: "P", addTeam: "ATL",
      dropName: "Foster Griffin",  dropPos: "P", dropTeam: "LAD", dropMode: "RELEASE" },
  ]},
];

const RESULTS: MockResult[] = [
  { priority: 1, addName: "Michael Toglia", dropName: "Carmen Mlodzinski (→ IL)", outcome: "SUCCESS" },
  { priority: 2, addName: "Edwin Díaz",     dropName: "Foster Griffin",
    outcome: "FAILED", reason: "Claimed by The Bombers (#1 priority got him first)" },
  { priority: 3, addName: "Spencer Strider", dropName: "Justin Wrobleski",
    outcome: "SKIPPED", reason: "Claim #2 failed — drop did not execute" },
];

// ─── Helpers ─────────────────────────────────────────────────────

function PosPill({ pos }: { pos: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 28, padding: "2px 8px", borderRadius: 6,
      background: "var(--am-chip-strong)", color: "var(--am-text)",
      fontFamily: "var(--am-mono)", fontSize: 11, fontWeight: 600,
      border: "1px solid var(--am-border)",
    }}>{pos}</span>
  );
}

function PreviewBanner({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "10px 14px",
      background: "color-mix(in srgb, #22d3ee 8%, transparent)",
      border: "1px dashed color-mix(in srgb, #22d3ee 40%, transparent)",
      borderRadius: 10, fontSize: 12, color: "var(--am-text-muted)",
      marginBottom: 16,
    }}>
      <span style={{ color: "#22d3ee", fontWeight: 600 }}>DESIGN PREVIEW</span> · {children}
    </div>
  );
}

function SectionTitle({ kicker, title, children }: {
  kicker: string; title: string; children?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <SectionLabel>{kicker}</SectionLabel>
      <div style={{ fontFamily: "var(--am-display)", fontSize: 22, color: "var(--am-text)", marginTop: 4 }}>
        {title}
      </div>
      {children && (
        <div style={{ fontSize: 13, color: "var(--am-text-muted)", marginTop: 4 }}>{children}</div>
      )}
    </div>
  );
}

// ─── View 1: Owner's claim list ──────────────────────────────────

function OwnerClaimList() {
  const [claims, setClaims] = useState(MY_CLAIMS_INITIAL);

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= claims.length) return;
    const next = claims.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    next.forEach((c, i) => (c.priority = i + 1));
    setClaims(next);
  };
  const remove = (id: number) => {
    setClaims((cs) => cs.filter((c) => c.id !== id).map((c, i) => ({ ...c, priority: i + 1 })));
  };
  const toggleMode = (id: number) => {
    setClaims((cs) =>
      cs.map((c) =>
        c.id === id ? { ...c, dropMode: c.dropMode === "RELEASE" ? "IL_STASH" : "RELEASE" } : c,
      ),
    );
  };

  return (
    <Glass>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div>
          <SectionLabel>Waiver Wire List · OGBA · Period 7</SectionLabel>
          <div style={{ fontFamily: "var(--am-display)", fontSize: 18, color: "var(--am-text)", marginTop: 4 }}>
            Locks Tue 2026-05-12 23:59 PT
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Chip strong>Your priority: <strong style={{ color: "var(--am-text)", marginLeft: 4 }}>4th of 12</strong></Chip>
          <Chip color="#22d3ee">+1 traded pick (you got #2)</Chip>
        </div>
      </div>

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {claims.map((c, i) => (
          <div key={c.id} style={{
            display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 10,
            padding: 12, background: "var(--am-chip)", borderRadius: 12,
            border: "1px solid var(--am-border)",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
              <button onClick={() => move(i, -1)} aria-label="Move up" style={iconBtn}>▲</button>
              <span style={{ fontFamily: "var(--am-mono)", fontSize: 14, color: "var(--am-text)" }}>#{c.priority}</span>
              <button onClick={() => move(i, +1)} aria-label="Move down" style={iconBtn}>▼</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Chip color="#34d399" strong>ADD</Chip>
                <strong style={{ color: "var(--am-text)" }}>{c.addName}</strong>
                <PosPill pos={c.addPos} />
                <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>{c.addTeam}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Chip color="#f87171" strong>DROP</Chip>
                <span style={{ color: "var(--am-text)" }}>{c.dropName}</span>
                <PosPill pos={c.dropPos} />
                <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>{c.dropTeam}</span>
                <button onClick={() => toggleMode(c.id)} style={{
                  ...miniBtn,
                  background: c.dropMode === "IL_STASH" ? "color-mix(in srgb, #22d3ee 20%, transparent)" : "var(--am-chip-strong)",
                  borderColor: c.dropMode === "IL_STASH" ? "#22d3ee" : "var(--am-border)",
                }}>
                  {c.dropMode === "RELEASE" ? "Release" : "→ IL Stash"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <button style={miniBtn}>Edit</button>
              <button onClick={() => remove(c.id)} style={{ ...miniBtn, color: "#f87171" }}>Remove</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button style={primaryBtn}>+ Add a claim</button>
        <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>Auto-saved · Last edited 2m ago</span>
      </div>
    </Glass>
  );
}

// ─── View 2: Add-a-claim form ────────────────────────────────────

function AddClaimForm() {
  const [add, setAdd] = useState("Michael Toglia");
  const [drop, setDrop] = useState("Foster Griffin");
  const [mode, setMode] = useState<DropMode>("RELEASE");
  const [search, setSearch] = useState("");

  const filteredWatchlist = WATCHLIST_PICKER.filter((w) =>
    !search || w.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Glass>
      <SectionLabel>Add a waiver claim</SectionLabel>
      <div style={{ fontFamily: "var(--am-display)", fontSize: 18, color: "var(--am-text)", marginTop: 4, marginBottom: 16 }}>
        New claim
      </div>

      {/* Step 1: ADD picker */}
      <div style={stepBox}>
        <StepNum n={1} title="Player to ADD" subtitle="From your Watchlist · only currently-FA shown" />
        <input
          type="search"
          placeholder="Search your watchlist…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={searchInput}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10, maxHeight: 240, overflowY: "auto" }}>
          {filteredWatchlist.map((w) => {
            const disabled = w.state !== "AVAILABLE";
            const selected = !disabled && add === w.name;
            return (
              <button
                key={w.name}
                disabled={disabled}
                onClick={() => setAdd(w.name)}
                style={{
                  ...rowBtn,
                  opacity: disabled ? 0.45 : 1,
                  cursor: disabled ? "not-allowed" : "pointer",
                  borderColor: selected ? "#22d3ee" : "var(--am-border)",
                  background: selected ? "color-mix(in srgb, #22d3ee 10%, transparent)" : "var(--am-chip)",
                }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <RadioDot active={selected} disabled={disabled} />
                  <strong style={{ color: "var(--am-text)" }}>{w.name}</strong>
                  <PosPill pos={w.pos} />
                  <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>{w.team}</span>
                </span>
                {disabled && (
                  <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>
                    Rostered by {w.rosteredBy}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <Link to="#" style={{ fontSize: 12, color: "#22d3ee", textDecoration: "none", marginTop: 8, display: "inline-block" }}>
          Don't see your player? → Edit Watchlist
        </Link>
      </div>

      {/* Step 2: DROP picker */}
      <div style={{ ...stepBox, marginTop: 12 }}>
        <StepNum n={2} title="Player to DROP" subtitle="Your active roster" />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
          {ROSTER_PICKER.map((p) => {
            const selected = drop === p.name;
            return (
              <button
                key={p.name}
                onClick={() => setDrop(p.name)}
                style={{
                  ...rowBtn,
                  borderColor: selected ? "#22d3ee" : "var(--am-border)",
                  background: selected ? "color-mix(in srgb, #22d3ee 10%, transparent)" : "var(--am-chip)",
                }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <RadioDot active={selected} />
                  <span style={{ color: "var(--am-text)" }}>{p.name}</span>
                  <PosPill pos={p.pos} />
                  <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>{p.team}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 3: Drop mode */}
      <div style={{ ...stepBox, marginTop: 12 }}>
        <StepNum n={3} title="Drop mode" />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {(["RELEASE", "IL_STASH"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                ...rowBtn,
                flex: 1,
                borderColor: mode === m ? "#22d3ee" : "var(--am-border)",
                background: mode === m ? "color-mix(in srgb, #22d3ee 10%, transparent)" : "var(--am-chip)",
              }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <RadioDot active={mode === m} />
                <span style={{ color: "var(--am-text)" }}>{m === "RELEASE" ? "Release to FA pool" : "Move to IL slot"}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div style={{
        marginTop: 16, padding: 12, borderRadius: 10,
        background: "var(--am-chip-strong)", border: "1px solid var(--am-border)",
        fontSize: 13, color: "var(--am-text)",
      }}>
        <SectionLabel>Preview · if available on your turn</SectionLabel>
        <div style={{ marginTop: 6, fontFamily: "var(--am-mono)", fontSize: 12, color: "var(--am-text-muted)" }}>
          + add <strong style={{ color: "var(--am-text)" }}>{add}</strong>{"  "}
          → fills eligible slot<br />
          – {mode === "RELEASE" ? "release " : "stash to IL "}
          <strong style={{ color: "var(--am-text)" }}>{drop}</strong>
          {mode === "RELEASE" ? " → FA pool" : " → IL slot"}
        </div>
      </div>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button style={secondaryBtn}>Cancel</button>
        <button style={primaryBtn}>Save claim →</button>
      </div>
    </Glass>
  );
}

function StepNum({ n, title, subtitle }: { n: number; title: string; subtitle?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 22, height: 22, borderRadius: "50%",
        background: "color-mix(in srgb, #22d3ee 18%, transparent)",
        border: "1px solid color-mix(in srgb, #22d3ee 50%, transparent)",
        color: "#22d3ee", fontSize: 12, fontWeight: 700, fontFamily: "var(--am-mono)",
      }}>{n}</span>
      <strong style={{ color: "var(--am-text)" }}>{title}</strong>
      {subtitle && <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>{subtitle}</span>}
    </div>
  );
}

function RadioDot({ active, disabled }: { active: boolean; disabled?: boolean }) {
  return (
    <span style={{
      display: "inline-block", width: 14, height: 14, borderRadius: "50%",
      border: `2px solid ${active ? "#22d3ee" : "var(--am-border-strong)"}`,
      background: active ? "#22d3ee" : "transparent",
      opacity: disabled ? 0.5 : 1,
    }} />
  );
}

// ─── View 3: Commissioner's view ─────────────────────────────────

function CommissionerView() {
  const [view, setView] = useState<"rounds" | "owners">("rounds");
  const maxRounds = Math.max(...COMMISSIONER_TEAMS.map((t) => t.claims.length));

  return (
    <Glass>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div>
          <SectionLabel>Waiver Run · OGBA · Period 7</SectionLabel>
          <div style={{ fontFamily: "var(--am-display)", fontSize: 18, color: "var(--am-text)", marginTop: 4 }}>
            Deadline passed · 32 claims from 9 owners pending
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={primaryBtn}>🚀 Process all in priority order</button>
          <button style={secondaryBtn}>Edit override…</button>
        </div>
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 6, alignItems: "center" }}>
        <SectionLabel>Layout</SectionLabel>
        <button onClick={() => setView("rounds")} style={{ ...miniBtn, ...(view === "rounds" ? activeMini : {}) }}>Round-robin</button>
        <button onClick={() => setView("owners")} style={{ ...miniBtn, ...(view === "owners" ? activeMini : {}) }}>By owner</button>
      </div>

      {view === "rounds" && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
          {Array.from({ length: maxRounds }, (_, ri) => (
            <div key={ri}>
              <SectionLabel>Round {ri + 1} <span style={{ color: "var(--am-text-muted)", textTransform: "none", fontWeight: 400 }}>· each team's #{ri + 1} claim, in standings order</span></SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {COMMISSIONER_TEAMS
                  .filter((t) => t.claims[ri])
                  .map((t) => {
                    const c = t.claims[ri];
                    return (
                      <div key={t.teamCode + ri} style={{
                        display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10,
                        padding: 12, background: "var(--am-chip)", borderRadius: 12,
                        border: "1px solid var(--am-border)",
                      }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <span style={{ fontFamily: "var(--am-mono)", fontSize: 14, color: "var(--am-text)" }}>#{t.priority}</span>
                          {t.tradedFrom && (
                            <span style={{ fontSize: 9, color: "#22d3ee" }}>traded</span>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ fontSize: 12, color: "var(--am-text-muted)" }}>
                            {t.teamName}{t.tradedFrom ? <> · <span style={{ color: "#22d3ee" }}>traded from {t.tradedFrom}</span></> : null}
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <Chip color="#34d399" strong>ADD</Chip>
                            <strong style={{ color: "var(--am-text)" }}>{c.addName}</strong>
                            <PosPill pos={c.addPos} />
                            <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>{c.addTeam}</span>
                            <span style={{ color: "var(--am-text-muted)" }}>·</span>
                            <Chip color="#f87171" strong>DROP</Chip>
                            <span style={{ color: "var(--am-text)" }}>{c.dropName}</span>
                            <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>
                              {c.dropMode === "IL_STASH" ? "→ IL" : "release"}
                            </span>
                          </div>
                        </div>
                        <button style={{ ...miniBtn, alignSelf: "center" }}>▶ Run</button>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "owners" && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          {COMMISSIONER_TEAMS.map((t) => (
            <div key={t.teamCode} style={{
              padding: 12, background: "var(--am-chip)", borderRadius: 12,
              border: "1px solid var(--am-border)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <strong style={{ color: "var(--am-text)" }}>
                  #{t.priority} · {t.teamName}
                  {t.tradedFrom && <span style={{ marginLeft: 8, fontSize: 11, color: "#22d3ee" }}>(traded from {t.tradedFrom})</span>}
                </strong>
                <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>{t.claims.length} claim{t.claims.length === 1 ? "" : "s"}</span>
              </div>
              {t.claims.map((c) => (
                <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "4px 0", fontSize: 12 }}>
                  <span style={{ fontFamily: "var(--am-mono)", color: "var(--am-text-muted)" }}>#{c.priority}</span>
                  <Chip color="#34d399">ADD</Chip>
                  <span style={{ color: "var(--am-text)" }}>{c.addName}</span>
                  <span style={{ color: "var(--am-text-muted)" }}>·</span>
                  <Chip color="#f87171">DROP</Chip>
                  <span style={{ color: "var(--am-text)" }}>{c.dropName}</span>
                  <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>
                    ({c.dropMode === "IL_STASH" ? "→ IL" : "release"})
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Glass>
  );
}

// ─── View 4: Post-execution results ──────────────────────────────

function ResultsReport() {
  return (
    <Glass>
      <SectionLabel>Period 7 waiver results</SectionLabel>
      <div style={{ fontFamily: "var(--am-display)", fontSize: 18, color: "var(--am-text)", marginTop: 4, marginBottom: 12 }}>
        Processed 2026-05-13 06:00 PT
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {RESULTS.map((r) => {
          const palette = r.outcome === "SUCCESS"
            ? { glyph: "✓", color: "#34d399", bg: "color-mix(in srgb, #34d399 8%, transparent)" }
            : r.outcome === "FAILED"
            ? { glyph: "✗", color: "#f87171", bg: "color-mix(in srgb, #f87171 8%, transparent)" }
            : { glyph: "⊘", color: "var(--am-text-muted)", bg: "var(--am-chip)" };
          return (
            <div key={r.priority} style={{
              display: "grid", gridTemplateColumns: "auto auto 1fr", gap: 10, alignItems: "start",
              padding: 12, background: palette.bg, borderRadius: 12,
              border: "1px solid var(--am-border)",
            }}>
              <span style={{ color: palette.color, fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{palette.glyph}</span>
              <span style={{ fontFamily: "var(--am-mono)", fontSize: 13, color: "var(--am-text)" }}>Claim #{r.priority}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ color: "var(--am-text)" }}>
                  {r.addName} <span style={{ color: "var(--am-text-muted)" }}>→</span> <span style={{ color: "var(--am-text-muted)" }}>{r.dropName}</span>
                </div>
                <div style={{ fontSize: 11, color: palette.color, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {r.outcome}
                  {r.reason && <span style={{ color: "var(--am-text-muted)", textTransform: "none", letterSpacing: 0, marginLeft: 8 }}>· {r.reason}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <Link to="/teams/LDY" style={{ ...primaryBtn, textDecoration: "none", display: "inline-block" }}>
          View team →
        </Link>
      </div>
    </Glass>
  );
}

// ─── Page ────────────────────────────────────────────────────────

export default function WaiverWirePreview() {
  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 16px 80px", display: "flex", flexDirection: "column", gap: 32 }}>
      <div>
        <Chip color="#22d3ee">DESIGN PREVIEW</Chip>
        <h1 style={{ fontFamily: "var(--am-display)", fontSize: 32, color: "var(--am-text)", margin: "12px 0 4px", lineHeight: 1.2 }}>
          <IridText>Waiver Wire List</IridText>
        </h1>
        <p style={{ fontSize: 14, color: "var(--am-text-muted)", margin: 0 }}>
          Owner-curated, ranked list of conditional add/drop claims · processed in standings-derived priority order ·
          {" "}<strong style={{ color: "var(--am-text)" }}>no auction $ values</strong> per spec.
        </p>
        <PreviewBanner>
          All data is mocked. Buttons re-order claims and toggle drop mode locally; nothing persists.
        </PreviewBanner>
      </div>

      <section>
        <SectionTitle kicker="View 1 of 4" title="Owner's claim list">
          What an owner sees on /teams/&lt;code&gt; under a new "Waiver Wire" tab.
          Up/down arrows reorder. Release/IL toggle is on each row.
        </SectionTitle>
        <OwnerClaimList />
      </section>

      <section>
        <SectionTitle kicker="View 2 of 4" title="Add a claim — sub-route, not a modal">
          Mirrors Roster Hub pattern (no modals — stats stay visible). Picker for ADD sources from
          the owner's Watchlist filtered to FA-eligible. Greyed rows show watchlist players already on someone's roster.
        </SectionTitle>
        <AddClaimForm />
      </section>

      <section>
        <SectionTitle kicker="View 3 of 4" title="Commissioner view">
          Round-robin by default — matches how real waiver runs go (everyone's #1 first, then everyone's #2). Toggle to per-owner if a commissioner prefers reading owner-by-owner.
          [Process all] hits the existing /api/waivers/process endpoint; per-row [Run] is for manual overrides.
        </SectionTitle>
        <CommissionerView />
      </section>

      <section>
        <SectionTitle kicker="View 4 of 4" title="Post-execution results report">
          What each owner sees after the run. Successes show the resulting move; failures explain why; skipped rows say which earlier failure cascaded.
        </SectionTitle>
        <ResultsReport />
      </section>

      <Glass strong>
        <SectionLabel>Open questions for the PM</SectionLabel>
        <ol style={{ marginTop: 8, paddingLeft: 20, color: "var(--am-text)", fontSize: 13, lineHeight: 1.7 }}>
          <li><strong>Manual vs automated:</strong> /api/waivers/process already exists and runs everything atomically. Keep manual per-row, use [Process all], or both?</li>
          <li><strong>Period model:</strong> tie WaiverPeriod to stat-periods, or weekly cadence independent of them?</li>
          <li><strong>Watchlist on own roster:</strong> hide them or show greyed with "you already own"?</li>
          <li><strong>Deadline:</strong> hard lock at the second, or 30-second grace?</li>
          <li><strong>Commissioner override:</strong> read-only, edit, or remove-only on owners' lists?</li>
          <li><strong>Mid-period trades:</strong> auto-invalidate claims involving traded players, or fail at process-time?</li>
          <li><strong>"Same period" scope:</strong> blocks dropping a player added earlier in this run only, or also dropping a different player from a previous successful row?</li>
        </ol>
      </Glass>
    </div>
  );
}

// ─── Style helpers ───────────────────────────────────────────────

const iconBtn: React.CSSProperties = {
  width: 22, height: 18, padding: 0,
  background: "transparent", color: "var(--am-text-muted)",
  border: "none", cursor: "pointer", fontSize: 9,
};

const miniBtn: React.CSSProperties = {
  padding: "4px 10px", fontSize: 11, fontWeight: 500,
  background: "var(--am-chip-strong)", color: "var(--am-text)",
  border: "1px solid var(--am-border)", borderRadius: 8, cursor: "pointer",
};

const activeMini: React.CSSProperties = {
  borderColor: "#22d3ee",
  background: "color-mix(in srgb, #22d3ee 14%, transparent)",
};

const primaryBtn: React.CSSProperties = {
  padding: "8px 14px", fontSize: 13, fontWeight: 600,
  background: "color-mix(in srgb, #22d3ee 22%, transparent)",
  color: "var(--am-text)",
  border: "1px solid #22d3ee", borderRadius: 10, cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "8px 14px", fontSize: 13, fontWeight: 500,
  background: "var(--am-chip)", color: "var(--am-text-muted)",
  border: "1px solid var(--am-border)", borderRadius: 10, cursor: "pointer",
};

const stepBox: React.CSSProperties = {
  padding: 14, background: "var(--am-chip)", borderRadius: 12,
  border: "1px solid var(--am-border)",
};

const searchInput: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1px solid var(--am-border)", background: "var(--am-chip-strong)",
  color: "var(--am-text)", fontSize: 13, minHeight: 36,
};

const rowBtn: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "10px 12px", borderRadius: 10,
  border: "1px solid var(--am-border)", background: "var(--am-chip)",
  color: "var(--am-text)", cursor: "pointer", textAlign: "left", fontSize: 13,
  width: "100%",
};
