// client/src/pages/design/WaiverWirePreview.tsx
//
// Design preview for the Waiver Wire List feature — TWO INDEPENDENT
// RANKED LISTS model (per spec revision 2026-05-06).
//
//   - Add List: ranked acquisition priorities, sourced from Watchlist
//     filtered to FA-eligible.
//   - Drop List: ranked drop priorities ("drop first" = top), each with
//     a Release / IL Stash mode toggle.
//   - Lists are INDEPENDENT, not paired row-for-row.
//   - At process time: each successful add consumes the next UNUSED
//     drop entry top-down. Failed adds skip without consuming.
//     Excess successful adds get SKIPPED — no drop slot available.
//
// CRITICAL: NO BUSINESS LOGIC. No DB, no API. Local React state only.
// Auction $ values are intentionally absent per PM directive.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Glass, SectionLabel, Chip, IridText } from "../../components/aurora/atoms";

// ─── Types ───────────────────────────────────────────────────────

type DropMode = "RELEASE" | "IL_STASH";
type AddOutcome = "PENDING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
type DropStatus = "PENDING" | "CONSUMED" | "UNUSED";

interface AddEntry {
  id: number;
  priority: number;
  name: string;
  pos: string;
  team: string;
}

interface DropEntry {
  id: number;
  priority: number;
  name: string;
  pos: string;
  team: string;
  mode: DropMode;
  acquiredThisPeriod?: boolean; // for the picker hard-block; not on a real entry
}

// ─── Mock data ───────────────────────────────────────────────────

const ADDS_INITIAL: AddEntry[] = [
  { id: 1, priority: 1, name: "Pete Alonso",      pos: "1B", team: "NYM" },
  { id: 2, priority: 2, name: "Christian Walker", pos: "1B", team: "ARI" },
  { id: 3, priority: 3, name: "Josh Naylor",      pos: "1B", team: "CLE" },
  { id: 4, priority: 4, name: "Spencer Steer",    pos: "1B", team: "CIN" },
];

const DROPS_INITIAL: DropEntry[] = [
  { id: 11, priority: 1, name: "Brandon Belt",     pos: "1B", team: "TOR", mode: "RELEASE" },
  { id: 12, priority: 2, name: "Daniel Vogelbach", pos: "DH", team: "TOR", mode: "RELEASE" },
  { id: 13, priority: 3, name: "Josh Bell",        pos: "1B", team: "WSH", mode: "IL_STASH" },
];

const WATCHLIST_PICKER: Array<{
  name: string; pos: string; team: string;
  state: "AVAILABLE" | "ROSTERED";
  rosteredBy?: string;
}> = [
  { name: "Pete Alonso",      pos: "1B", team: "NYM", state: "AVAILABLE" },
  { name: "Christian Walker", pos: "1B", team: "ARI", state: "AVAILABLE" },
  { name: "Josh Naylor",      pos: "1B", team: "CLE", state: "AVAILABLE" },
  { name: "Spencer Steer",    pos: "1B", team: "CIN", state: "AVAILABLE" },
  { name: "Hunter Greene",    pos: "P",  team: "CIN", state: "ROSTERED", rosteredBy: "The Bombers" },
];

const ROSTER_PICKER: DropEntry[] = [
  { id: 101, priority: 0, name: "Carmen Mlodzinski", pos: "P",  team: "ATH", mode: "RELEASE" },
  { id: 102, priority: 0, name: "Foster Griffin",    pos: "P",  team: "LAD", mode: "RELEASE" },
  { id: 103, priority: 0, name: "Brandon Lockridge", pos: "OF", team: "NYY", mode: "RELEASE" },
  { id: 104, priority: 0, name: "Michael Toglia",    pos: "1B", team: "COL", mode: "RELEASE", acquiredThisPeriod: true },
];

// ─── Commissioner mock ───────────────────────────────────────────

interface OwnerLists {
  teamCode: string; teamName: string; priority: number; tradedFrom?: string;
  adds: Array<AddEntry & { outcome: AddOutcome; consumedDropId?: number }>;
  drops: Array<DropEntry & { status: DropStatus }>;
}

const COMMISSIONER_TEAMS: OwnerLists[] = [
  {
    teamCode: "DRS", teamName: "The Drowning Sorrows", priority: 1,
    adds: [
      { id: 201, priority: 1, name: "Michael Toglia",  pos: "1B", team: "COL", outcome: "SUCCEEDED", consumedDropId: 301 },
      { id: 202, priority: 2, name: "Hunter Greene",   pos: "P",  team: "CIN", outcome: "FAILED" },
      { id: 203, priority: 3, name: "Nick Pivetta",    pos: "P",  team: "SD",  outcome: "SUCCEEDED", consumedDropId: 302 },
      { id: 204, priority: 4, name: "Spencer Strider", pos: "P",  team: "ATL", outcome: "PENDING" },
    ],
    drops: [
      { id: 301, priority: 1, name: "Bob Smith",     pos: "1B", team: "COL", mode: "RELEASE",  status: "CONSUMED" },
      { id: 302, priority: 2, name: "Tommy Walker",  pos: "P",  team: "ARI", mode: "IL_STASH", status: "CONSUMED" },
      { id: 303, priority: 3, name: "Jane Doe",      pos: "OF", team: "PIT", mode: "RELEASE",  status: "PENDING" },
    ],
  },
  {
    teamCode: "HFS", teamName: "Halfsies", priority: 2, tradedFrom: "The Bombers",
    adds: [
      { id: 211, priority: 1, name: "Edwin Díaz",     pos: "RP", team: "HOU", outcome: "PENDING" },
      { id: 212, priority: 2, name: "Spencer Strider", pos: "P", team: "ATL", outcome: "PENDING" },
    ],
    drops: [
      { id: 311, priority: 1, name: "Taijuan Walker", pos: "P", team: "PHI", mode: "IL_STASH", status: "PENDING" },
    ],
  },
];

// ─── Owner's RESULTS report ──────────────────────────────────────

const RESULTS = {
  adds: [
    { priority: 1, name: "Pete Alonso",      outcome: "FAILED" as AddOutcome,    reason: "Claimed by The Bombers" },
    { priority: 2, name: "Christian Walker", outcome: "SUCCEEDED" as AddOutcome, consumedDropName: "Brandon Belt",      consumedDropMode: "RELEASE" as DropMode },
    { priority: 3, name: "Josh Naylor",      outcome: "SUCCEEDED" as AddOutcome, consumedDropName: "Daniel Vogelbach",  consumedDropMode: "RELEASE" as DropMode },
    { priority: 4, name: "Spencer Steer",    outcome: "SKIPPED" as AddOutcome,   reason: "No drop slot available" },
  ],
  unusedDrops: [
    { priority: 3, name: "Josh Bell" },
  ],
};

// ─── Atoms ───────────────────────────────────────────────────────

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

// ─── View 1: Owner's two-list view ───────────────────────────────

function OwnerListsView() {
  const [adds, setAdds] = useState(ADDS_INITIAL);
  const [drops, setDrops] = useState(DROPS_INITIAL);

  const moveAdd = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= adds.length) return;
    const next = adds.slice(); [next[i], next[j]] = [next[j], next[i]];
    next.forEach((c, k) => (c.priority = k + 1));
    setAdds(next);
  };
  const removeAdd = (id: number) =>
    setAdds((cs) => cs.filter((c) => c.id !== id).map((c, k) => ({ ...c, priority: k + 1 })));

  const moveDrop = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= drops.length) return;
    const next = drops.slice(); [next[i], next[j]] = [next[j], next[i]];
    next.forEach((c, k) => (c.priority = k + 1));
    setDrops(next);
  };
  const removeDrop = (id: number) =>
    setDrops((cs) => cs.filter((c) => c.id !== id).map((c, k) => ({ ...c, priority: k + 1 })));
  const setMode = (id: number, mode: DropMode) =>
    setDrops((cs) => cs.map((c) => c.id === id ? { ...c, mode } : c));

  const showWarning = adds.length > drops.length;
  const overflow = adds.length - drops.length;

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

      {/* Two columns ≥768px, stacked below */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16,
      }} className="ww-two-col">
        {/* ADD LIST */}
        <div style={listColStyle}>
          <header style={listHeaderStyle}>
            <SectionLabel>Add List</SectionLabel>
            <span style={{ fontSize: 11, color: "var(--am-text-muted)", marginTop: 2 }}>
              Acquire in this priority order. Top of list = highest priority.
            </span>
          </header>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {adds.map((a, i) => (
              <div key={a.id} style={listRowStyle}>
                <PriorityCol priority={a.priority} onUp={() => moveAdd(i, -1)} onDown={() => moveAdd(i, +1)} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1 }}>
                  <strong style={{ color: "var(--am-text)" }}>{a.name}</strong>
                  <PosPill pos={a.pos} />
                  <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>{a.team}</span>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button style={miniBtn}>✎</button>
                  <button style={{ ...miniBtn, color: "#f87171" }} onClick={() => removeAdd(a.id)}>🗑</button>
                </div>
              </div>
            ))}
            <button style={{ ...secondaryBtn, marginTop: 4 }}>+ Add player</button>
          </div>
        </div>

        {/* DROP LIST */}
        <div style={listColStyle}>
          <header style={listHeaderStyle}>
            <SectionLabel>Drop List</SectionLabel>
            <span style={{ fontSize: 11, color: "var(--am-text-muted)", marginTop: 2 }}>
              Drop in this priority order. Top of list = drop FIRST.
            </span>
          </header>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {drops.map((d, i) => (
              <div key={d.id} style={listRowStyle}>
                <PriorityCol priority={d.priority} onUp={() => moveDrop(i, -1)} onDown={() => moveDrop(i, +1)} />
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ color: "var(--am-text)" }}>{d.name}</span>
                    <PosPill pos={d.pos} />
                    <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>{d.team}</span>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <ModePill active={d.mode === "RELEASE"} onClick={() => setMode(d.id, "RELEASE")}>Release</ModePill>
                    <ModePill active={d.mode === "IL_STASH"} onClick={() => setMode(d.id, "IL_STASH")}>→ IL Stash</ModePill>
                  </div>
                </div>
                <button style={{ ...miniBtn, color: "#f87171", alignSelf: "flex-start" }} onClick={() => removeDrop(d.id)}>🗑</button>
              </div>
            ))}
            <button style={{ ...secondaryBtn, marginTop: 4 }}>+ Drop player</button>
          </div>
        </div>
      </div>

      {showWarning && (
        <div style={{
          marginTop: 16, padding: 12, borderRadius: 12,
          background: "color-mix(in srgb, #fbbf24 10%, transparent)",
          border: "1px solid color-mix(in srgb, #fbbf24 50%, transparent)",
          fontSize: 13, color: "var(--am-text)",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}>
          <span>
            ⚠ <strong>{adds.length} adds, {drops.length} drops.</strong> If all adds succeed,
            the last <strong>{overflow}</strong> will be skipped (no drop slot).
          </span>
          <span style={{ display: "flex", gap: 6 }}>
            <button style={miniBtn}>+ Add a {drops.length + 1}th drop</button>
          </span>
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button style={primaryBtn}>Save</button>
        <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>Auto-saved · 3m ago</span>
      </div>
    </Glass>
  );
}

function PriorityCol({ priority, onUp, onDown }: { priority: number; onUp: () => void; onDown: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <button onClick={onUp} aria-label="Move up" style={iconBtn}>▲</button>
      <span style={{ fontFamily: "var(--am-mono)", fontSize: 13, color: "var(--am-text)" }}>#{priority}</span>
      <button onClick={onDown} aria-label="Move down" style={iconBtn}>▼</button>
    </div>
  );
}

function ModePill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      ...miniBtn,
      fontSize: 10,
      padding: "3px 8px",
      borderColor: active ? "#22d3ee" : "var(--am-border)",
      background: active ? "color-mix(in srgb, #22d3ee 18%, transparent)" : "var(--am-chip-strong)",
      color: active ? "var(--am-text)" : "var(--am-text-muted)",
    }}>{children}</button>
  );
}

// ─── View 2: Add picker ──────────────────────────────────────────

function AddPicker() {
  const [search, setSearch] = useState("");
  const [pick, setPick] = useState("Pete Alonso");
  const filtered = WATCHLIST_PICKER.filter((w) => !search || w.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Glass>
      <SectionLabel>Add to Add List</SectionLabel>
      <div style={{ fontFamily: "var(--am-display)", fontSize: 18, color: "var(--am-text)", marginTop: 4, marginBottom: 12 }}>
        Pick a player to acquire
      </div>

      <input
        type="search"
        placeholder="Search your watchlist…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={searchInput}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10, maxHeight: 280, overflowY: "auto" }}>
        {filtered.map((w) => {
          const disabled = w.state !== "AVAILABLE";
          const selected = !disabled && pick === w.name;
          return (
            <button
              key={w.name}
              disabled={disabled}
              onClick={() => setPick(w.name)}
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

      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button style={secondaryBtn}>Cancel</button>
        <button style={primaryBtn}>Add to Add List →</button>
      </div>
    </Glass>
  );
}

// ─── View 3: Drop picker ─────────────────────────────────────────

function DropPicker() {
  const [pick, setPick] = useState(101);
  const [mode, setMode] = useState<DropMode>("RELEASE");
  const selected = ROSTER_PICKER.find((p) => p.id === pick);

  return (
    <Glass>
      <SectionLabel>Add to Drop List</SectionLabel>
      <div style={{ fontFamily: "var(--am-display)", fontSize: 18, color: "var(--am-text)", marginTop: 4, marginBottom: 12 }}>
        Pick a player from your roster to drop
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {ROSTER_PICKER.map((p) => {
          const disabled = !!p.acquiredThisPeriod;
          const isSel = !disabled && pick === p.id;
          return (
            <button
              key={p.id}
              disabled={disabled}
              onClick={() => setPick(p.id)}
              style={{
                ...rowBtn,
                opacity: disabled ? 0.45 : 1,
                cursor: disabled ? "not-allowed" : "pointer",
                borderColor: isSel ? "#22d3ee" : "var(--am-border)",
                background: isSel ? "color-mix(in srgb, #22d3ee 10%, transparent)" : "var(--am-chip)",
              }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <RadioDot active={isSel} disabled={disabled} />
                <span style={{ color: "var(--am-text)" }}>{p.name}</span>
                <PosPill pos={p.pos} />
                <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>{p.team}</span>
              </span>
              {disabled && (
                <span style={{ fontSize: 11, color: "#fbbf24" }}>
                  acquired this period — can't be dropped yet
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 16, padding: 14, background: "var(--am-chip)", borderRadius: 12, border: "1px solid var(--am-border)" }}>
        <SectionLabel>Drop mode</SectionLabel>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {(["RELEASE", "IL_STASH"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{
              ...rowBtn, flex: 1,
              borderColor: mode === m ? "#22d3ee" : "var(--am-border)",
              background: mode === m ? "color-mix(in srgb, #22d3ee 10%, transparent)" : "var(--am-chip)",
            }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <RadioDot active={mode === m} />
                <span style={{ color: "var(--am-text)" }}>
                  {m === "RELEASE" ? "Release to FA pool" : "Move to IL slot"}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{
        marginTop: 12, padding: 10, borderRadius: 8,
        background: "var(--am-chip-strong)", border: "1px solid var(--am-border)",
        fontFamily: "var(--am-mono)", fontSize: 12, color: "var(--am-text-muted)",
      }}>
        Will queue: <strong style={{ color: "var(--am-text)" }}>{selected?.name}</strong> ·{" "}
        {mode === "RELEASE" ? "release on consume" : "→ IL slot on consume"}
      </div>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button style={secondaryBtn}>Cancel</button>
        <button style={primaryBtn}>Add to Drop List →</button>
      </div>
    </Glass>
  );
}

// ─── View 4: Soft warning is shown inline in View 1; nothing extra here. ──

// ─── View 5: Commissioner view ───────────────────────────────────

function CommissionerView() {
  const [teams, setTeams] = useState(COMMISSIONER_TEAMS);

  const markOutcome = (teamIdx: number, addId: number, outcome: AddOutcome) => {
    setTeams((ts) => {
      const next = ts.map((t) => ({ ...t, adds: t.adds.map((a) => ({ ...a })), drops: t.drops.map((d) => ({ ...d })) }));
      const t = next[teamIdx];
      const add = t.adds.find((a) => a.id === addId)!;
      // If we're transitioning AWAY from SUCCEEDED, free the consumed drop.
      if (add.outcome === "SUCCEEDED" && add.consumedDropId) {
        const prevDrop = t.drops.find((d) => d.id === add.consumedDropId);
        if (prevDrop) prevDrop.status = "PENDING";
        add.consumedDropId = undefined;
      }
      add.outcome = outcome;
      // If we're entering SUCCEEDED, consume the next PENDING drop.
      if (outcome === "SUCCEEDED") {
        const nextPending = t.drops.find((d) => d.status === "PENDING");
        if (nextPending) {
          nextPending.status = "CONSUMED";
          add.consumedDropId = nextPending.id;
        } else {
          // No drop slot available — bump back to SKIPPED (the rule).
          add.outcome = "SKIPPED";
        }
      }
      return next;
    });
  };

  return (
    <Glass>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div>
          <SectionLabel>Waiver Run · OGBA · Period 7</SectionLabel>
          <div style={{ fontFamily: "var(--am-display)", fontSize: 18, color: "var(--am-text)", marginTop: 4 }}>
            Deadline passed · 6 add entries from 2 owners pending
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={primaryBtn}>🚀 Process all in priority order</button>
        </div>
      </div>

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        {teams.map((t, ti) => (
          <div key={t.teamCode} style={teamCardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <strong style={{ color: "var(--am-text)", fontSize: 15 }}>
                #{t.priority} priority · {t.teamName}
                {t.tradedFrom && <span style={{ marginLeft: 8, fontSize: 11, color: "#22d3ee" }}>(traded from {t.tradedFrom})</span>}
              </strong>
            </div>

            <div className="ww-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Add list with controls */}
              <div style={listColStyle}>
                <header style={listHeaderStyle}><SectionLabel>Their Add List</SectionLabel></header>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {t.adds.map((a) => {
                    const consumedDrop = a.consumedDropId ? t.drops.find((d) => d.id === a.consumedDropId) : undefined;
                    return (
                      <div key={a.id} style={listRowStyle}>
                        <span style={{ fontFamily: "var(--am-mono)", fontSize: 12, color: "var(--am-text-muted)", minWidth: 24, textAlign: "center" }}>
                          #{a.priority}
                        </span>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <OutcomeGlyph outcome={a.outcome} />
                            <strong style={{ color: "var(--am-text)" }}>{a.name}</strong>
                            <PosPill pos={a.pos} />
                            <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>{a.team}</span>
                          </div>
                          {consumedDrop && (
                            <span style={{ fontSize: 11, color: "var(--am-text-muted)", paddingLeft: 22 }}>
                              ↳ consumed Drop #{consumedDrop.priority}: {consumedDrop.name} · {consumedDrop.mode === "RELEASE" ? "release" : "→ IL"}
                            </span>
                          )}
                          <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                            <OutcomeBtn active={a.outcome === "SUCCEEDED"} onClick={() => markOutcome(ti, a.id, "SUCCEEDED")} color="#34d399">✓ Succeeded</OutcomeBtn>
                            <OutcomeBtn active={a.outcome === "FAILED"}    onClick={() => markOutcome(ti, a.id, "FAILED")}    color="#f87171">✗ Failed</OutcomeBtn>
                            <OutcomeBtn active={a.outcome === "SKIPPED"}   onClick={() => markOutcome(ti, a.id, "SKIPPED")}   color="var(--am-text-muted)">⊘ Skipped</OutcomeBtn>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Drop list with statuses */}
              <div style={listColStyle}>
                <header style={listHeaderStyle}><SectionLabel>Their Drop List</SectionLabel></header>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {t.drops.map((d) => (
                    <div key={d.id} style={{
                      ...listRowStyle,
                      opacity: d.status === "CONSUMED" ? 0.7 : 1,
                    }}>
                      <span style={{ fontFamily: "var(--am-mono)", fontSize: 12, color: "var(--am-text-muted)", minWidth: 24, textAlign: "center" }}>
                        #{d.priority}
                      </span>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <DropStatusGlyph status={d.status} />
                          <span style={{ color: "var(--am-text)" }}>{d.name}</span>
                          <PosPill pos={d.pos} />
                          <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>{d.team}</span>
                        </div>
                        <span style={{ fontSize: 11, color: "var(--am-text-muted)", paddingLeft: 22 }}>
                          mode: {d.mode === "RELEASE" ? "release" : "→ IL stash"} · status: {d.status.toLowerCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Glass>
  );
}

function OutcomeBtn({ active, onClick, color, children }: { active: boolean; onClick: () => void; color: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      ...miniBtn,
      fontSize: 10,
      padding: "3px 8px",
      borderColor: active ? color : "var(--am-border)",
      background: active ? `color-mix(in srgb, ${color} 18%, transparent)` : "var(--am-chip-strong)",
      color: active ? color : "var(--am-text-muted)",
    }}>{children}</button>
  );
}

function OutcomeGlyph({ outcome }: { outcome: AddOutcome }) {
  const map = {
    PENDING:   { glyph: "…", color: "var(--am-text-muted)" },
    SUCCEEDED: { glyph: "✓", color: "#34d399" },
    FAILED:    { glyph: "✗", color: "#f87171" },
    SKIPPED:   { glyph: "⊘", color: "var(--am-text-muted)" },
  } as const;
  const o = map[outcome];
  return <span style={{ color: o.color, fontWeight: 700, fontSize: 13, minWidth: 14, textAlign: "center" }}>{o.glyph}</span>;
}

function DropStatusGlyph({ status }: { status: DropStatus }) {
  const map = {
    PENDING:  { glyph: "○", color: "var(--am-text-muted)" },
    CONSUMED: { glyph: "✓", color: "#34d399" },
    UNUSED:   { glyph: "—", color: "var(--am-text-muted)" },
  } as const;
  const s = map[status];
  return <span style={{ color: s.color, fontWeight: 700, fontSize: 13, minWidth: 14, textAlign: "center" }}>{s.glyph}</span>;
}

// ─── View 6: Owner's results report ──────────────────────────────

function ResultsReport() {
  return (
    <Glass>
      <SectionLabel>Period 7 waiver results</SectionLabel>
      <div style={{ fontFamily: "var(--am-display)", fontSize: 18, color: "var(--am-text)", marginTop: 4, marginBottom: 12 }}>
        Processed 2026-05-13 06:00 PT
      </div>

      <SectionLabel>Add list outcomes</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
        {RESULTS.adds.map((r) => {
          const palette = r.outcome === "SUCCEEDED"
            ? { color: "#34d399", bg: "color-mix(in srgb, #34d399 8%, transparent)" }
            : r.outcome === "FAILED"
            ? { color: "#f87171", bg: "color-mix(in srgb, #f87171 8%, transparent)" }
            : { color: "var(--am-text-muted)", bg: "var(--am-chip)" };
          return (
            <div key={r.priority} style={{
              display: "grid", gridTemplateColumns: "auto auto 1fr", gap: 10, alignItems: "start",
              padding: 12, background: palette.bg, borderRadius: 12,
              border: "1px solid var(--am-border)",
            }}>
              <OutcomeGlyph outcome={r.outcome} />
              <span style={{ fontFamily: "var(--am-mono)", fontSize: 13, color: "var(--am-text)" }}>Add #{r.priority}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <strong style={{ color: "var(--am-text)" }}>{r.name}</strong>
                <span style={{ fontSize: 11, color: palette.color, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {r.outcome}
                </span>
                {r.consumedDropName && (
                  <span style={{ fontSize: 12, color: "var(--am-text-muted)" }}>
                    ↳ consumed Drop: <strong style={{ color: "var(--am-text)" }}>{r.consumedDropName}</strong>{" "}
                    {r.consumedDropMode === "RELEASE" ? "released to FA" : "→ IL slot"}
                  </span>
                )}
                {r.reason && (
                  <span style={{ fontSize: 12, color: "var(--am-text-muted)" }}>{r.reason}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16 }}>
        <SectionLabel>Drop list — unused</SectionLabel>
        <div style={{ marginTop: 8 }}>
          {RESULTS.unusedDrops.map((d) => (
            <div key={d.priority} style={{
              padding: "10px 12px", background: "var(--am-chip)", borderRadius: 10,
              border: "1px solid var(--am-border)",
              fontSize: 13, color: "var(--am-text-muted)",
            }}>
              Drop #{d.priority} · <strong style={{ color: "var(--am-text)" }}>{d.name}</strong> — UNUSED (still on your roster)
            </div>
          ))}
        </div>
      </div>

      <div style={{
        marginTop: 14, padding: 12, background: "var(--am-chip-strong)",
        border: "1px solid var(--am-border)", borderRadius: 10,
        fontSize: 12, color: "var(--am-text-muted)", lineHeight: 1.6,
      }}>
        Final: roster gained <strong style={{ color: "var(--am-text)" }}>Walker</strong> +{" "}
        <strong style={{ color: "var(--am-text)" }}>Naylor</strong>; lost <strong style={{ color: "var(--am-text)" }}>Belt</strong> +{" "}
        <strong style={{ color: "var(--am-text)" }}>Vogelbach</strong>. <strong style={{ color: "var(--am-text)" }}>Bell</strong> still on bench.
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
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 16px 80px", display: "flex", flexDirection: "column", gap: 32 }}>
      <style>{`
        @media (max-width: 767px) {
          .ww-two-col { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div>
        <Chip color="#22d3ee">DESIGN PREVIEW</Chip>
        <h1 style={{ fontFamily: "var(--am-display)", fontSize: 32, color: "var(--am-text)", margin: "12px 0 4px", lineHeight: 1.2 }}>
          <IridText>Waiver Wire List</IridText> · two-list model
        </h1>
        <p style={{ fontSize: 14, color: "var(--am-text-muted)", margin: 0 }}>
          Two independent ranked lists (Add + Drop). Successful adds consume the next pending Drop top-down.
          Failed adds skip without consuming. Excess successful adds are skipped if no drop slot remains.
          {" "}<strong style={{ color: "var(--am-text)" }}>No auction $ values</strong> per spec.
        </p>
        <PreviewBanner>
          All data is mocked. Buttons reorder lists, toggle drop mode, and drive the commissioner consume/free logic locally; nothing persists.
        </PreviewBanner>
      </div>

      <section>
        <SectionTitle kicker="View 1 of 6" title="Owner's Waiver Wire List">
          Two-column on desktop, stacked on mobile. Up/down arrows reorder priority; trash icon removes; Release/IL pill toggles per Drop row. Soft-warning banner appears live when adds &gt; drops.
        </SectionTitle>
        <OwnerListsView />
      </section>

      <section>
        <SectionTitle kicker="View 2 of 6" title="Add List — pick a player to acquire">
          Sub-route, not a modal. Source is the owner's Watchlist filtered to FA-eligible. Watchlist players currently on someone else's roster are greyed out.
        </SectionTitle>
        <AddPicker />
      </section>

      <section>
        <SectionTitle kicker="View 3 of 6" title="Drop List — pick a player to drop">
          Sub-route. Source is the owner's current roster. Hard block on players acquired this period.
          Each entry carries a Release / IL Stash mode toggle.
        </SectionTitle>
        <DropPicker />
      </section>

      <section>
        <SectionTitle kicker="View 4 of 6" title="Soft warning state (already shown in View 1)">
          When add count &gt; drop count, a yellow banner appears between the two lists and the save row. Save is allowed; the warning is for awareness, not blocking.
          Tip: try removing one of the Drop rows in View 1 — the banner appears live.
        </SectionTitle>
      </section>

      <section>
        <SectionTitle kicker="View 5 of 6" title="Commissioner's view — interactive">
          Per team, both lists with succeed/fail/skip controls on each Add row.
          Clicking ✓ Succeeded auto-consumes the next pending Drop entry (watch the green checks light up).
          Re-clicking the same outcome frees the drop. If you mark all 4 of DRS's adds Succeeded
          but they only have 3 drops, the 4th auto-bumps to ⊘ Skipped.
        </SectionTitle>
        <CommissionerView />
      </section>

      <section>
        <SectionTitle kicker="View 6 of 6" title="Owner's results report (post-run)">
          Per Add row outcome (succeeded / failed / skipped) with the consumed Drop attribution. Unused Drops listed separately so the owner sees what stayed on the roster.
        </SectionTitle>
        <ResultsReport />
      </section>

      <Glass strong>
        <SectionLabel>Open questions for the PM</SectionLabel>
        <ol style={{ marginTop: 8, paddingLeft: 20, color: "var(--am-text)", fontSize: 13, lineHeight: 1.7 }}>
          <li><strong>Outcome attribution:</strong> store WaiverDropEntry.status explicitly (CONSUMED/UNUSED), or derive via reverse-join from WaiverAddEntry.consumedDropEntryId? <em>Recommend: store explicitly.</em></li>
          <li><strong>"Acquired this period" timestamp:</strong> compare Roster.acquiredAt against WaiverPeriod.createdAt (recommend) or deadlineAt (more lenient)?</li>
          <li><strong>Mid-period trade-in eligibility:</strong> if a player is traded TO me mid-period, can I drop them? <em>Recommend: yes — the rule is about waiver claims, not trades.</em></li>
          <li><strong>Drop list mode default:</strong> Release as default? <em>Recommend: yes — more common case.</em></li>
          <li><strong>Commissioner override scope:</strong> read-only, edit, or remove only on owners' lists? <em>Recommend: remove only.</em></li>
          <li><strong>Drop entry's player traded mid-period:</strong> auto-remove at trade-execution, or fail at process-time?</li>
          <li><strong>Save warning persistence:</strong> persistent banner (recommend) or only at save click?</li>
          <li><strong>Drag-to-reorder MVP:</strong> up/down arrows for v1 (recommend), real drag in a follow-up?</li>
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
const listColStyle: React.CSSProperties = {
  padding: 12, background: "var(--am-chip)", borderRadius: 12,
  border: "1px solid var(--am-border)",
  display: "flex", flexDirection: "column", gap: 8,
};
const listHeaderStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", marginBottom: 4,
};
const listRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10,
  padding: "10px 12px", background: "var(--am-chip-strong)",
  borderRadius: 10, border: "1px solid var(--am-border)",
};
const teamCardStyle: React.CSSProperties = {
  padding: 14, background: "var(--am-chip)", borderRadius: 14,
  border: "1px solid var(--am-border)",
};
