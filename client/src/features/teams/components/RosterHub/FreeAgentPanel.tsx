// client/src/features/teams/components/RosterHub/FreeAgentPanel.tsx
//
// Free-agent side panel for the v3 roster hub (FA scenario,
// docs/plans/2026-04-30-roster-hub-direction-lock.md FA-#1..7).
//
//   FA-#1: Search ergonomics → name + MLB team abbr substring.
//   FA-#2: Filter persistence → component state, no localStorage.
//   FA-#3: Multi-add UX → sequential drops; pending-changes panel IS the batch.
//   FA-#4: Eligibility hint during drag → both highlight + dim (slot
//          glow + ineligible-row dim handled by the parent hub via the
//          drag controller; this panel only renders draggable rows).
//   FA-#5: Drop pool placement → see DropPool.tsx (rendered by Team page).
//   FA-#6: Sort order → projected $ desc default + dropdown (Trending /
//          Alpha / Scarcity).
//   FA-#7: Mobile layout → CSS-driven side panel ≥768px, bottom sheet
//          <768px. Both share the same React tree so dnd-kit drag works
//          across the boundary; no portal switch.
//
// Drag wiring uses dnd-kit's `useDraggable` keyed on a stable
// `fa-row-${mlbId}` id. The drop side lives in RosterRowV3 / IlSectionV3
// which already register `useDroppable` slots; the parent useRosterHubDrag
// extension reads the active id prefix to branch FA-add vs swap.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  freeAgentComparator,
  matchesFreeAgentPositions,
  matchesFreeAgentQuery,
  useFreeAgents,
  type FreeAgent,
  type FreeAgentSort,
} from "../../hooks/useFreeAgents";

// ─── Stable dnd-kit id helpers ─────────────────────────────────────

/** Prefix on FA draggable ids — distinct from Hub's `hub-row-` so the
 *  drag controller can branch swap vs fa_add purely on the active id. */
export const FA_DND_ID_PREFIX = "fa-row-" as const;
export function encodeFaDndId(mlbId: number): string {
  return `${FA_DND_ID_PREFIX}${mlbId}`;
}
export function decodeFaDndId(id: string | number): number | null {
  const s = String(id);
  if (!s.startsWith(FA_DND_ID_PREFIX)) return null;
  const n = Number(s.slice(FA_DND_ID_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}

// ─── Position chips per direction-lock FA-#1/#6 ───────────────────

const POSITION_CHIPS: ReadonlyArray<{ label: string; tokens: readonly string[] }> = [
  { label: "C", tokens: ["C"] },
  { label: "1B", tokens: ["1B"] },
  { label: "2B", tokens: ["2B"] },
  { label: "3B", tokens: ["3B"] },
  { label: "SS", tokens: ["SS"] },
  { label: "OF", tokens: ["OF", "LF", "CF", "RF"] },
  { label: "DH", tokens: ["DH"] },
  { label: "SP", tokens: ["SP", "P"] },
  { label: "RP", tokens: ["RP"] },
];

const SORT_OPTIONS: ReadonlyArray<{ value: FreeAgentSort; label: string }> = [
  { value: "projected", label: "Projected $" },
  { value: "trending", label: "Trending (7d)" },
  { value: "alphabetical", label: "Alphabetical" },
  { value: "scarcity", label: "Position scarcity" },
];

interface FreeAgentPanelProps {
  leagueId: number;
  /** Owning team id — passed for context (claim endpoint reads this on save). */
  teamId: number;
  isOpen: boolean;
  onClose: () => void;
}

export function FreeAgentPanel(props: FreeAgentPanelProps) {
  const { leagueId, isOpen, onClose } = props;
  const { data, loading, error } = useFreeAgents(isOpen ? leagueId : null);

  const [query, setQuery] = useState("");
  const [activeChips, setActiveChips] = useState<ReadonlySet<string>>(() => new Set());
  const [sort, setSort] = useState<FreeAgentSort>("projected");

  // ESC closes (direction-lock implicit on side-panel UX).
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const toggleChip = useCallback((tokens: readonly string[]) => {
    setActiveChips((prev) => {
      const next = new Set(prev);
      // Toggle the entire token group atomically — clicking "OF" flips
      // OF + LF + CF + RF together.
      const allOn = tokens.every((t) => next.has(t));
      if (allOn) {
        for (const t of tokens) next.delete(t);
      } else {
        for (const t of tokens) next.add(t);
      }
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [] as FreeAgent[];
    const cmp = freeAgentComparator(sort);
    return data
      .filter((fa) => matchesFreeAgentQuery(fa, query))
      .filter((fa) => matchesFreeAgentPositions(fa, activeChips))
      .sort(cmp);
  }, [data, query, activeChips, sort]);

  // Virtualization: with 2,000+ FAs, rendering every row tanked scroll
  // perf (PR #210 DOM audit measured 2,283 nodes). The virtualizer
  // owns a fixed-height scroll viewport and only mounts the rows
  // currently in (or just outside) the viewport. Row height was eyeballed
  // from the rendered output (8px+10px padding + name + sub-line ≈ 56px)
  // — measureElement could refine it post-mount but the constant is fine
  // for a homogeneous list. Overscan of 6 keeps drag handoffs smooth at
  // the viewport edge so dnd-kit doesn't unmount a row mid-grab.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 6,
  });

  if (!isOpen) return null;

  return (
    <aside
      role="complementary"
      aria-label="Free agent panel"
      className="fa-panel"
      style={{
        background: "var(--am-card)",
        border: "1px solid var(--am-border-strong)",
        borderRadius: 18,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontFamily: "var(--am-display)", fontSize: 18, color: "var(--am-text)" }}>
          Free agents
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close free agent panel"
          style={{
            width: 32,
            height: 32,
            borderRadius: 99,
            background: "var(--am-chip)",
            border: "1px solid var(--am-border)",
            color: "var(--am-text)",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            padding: 0,
          }}
        >
          ✕
        </button>
      </header>

      {/* Search row */}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or team (BOS, NYY, …)"
        aria-label="Search free agents"
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid var(--am-border)",
          background: "var(--am-chip)",
          color: "var(--am-text)",
          fontSize: 13,
          minHeight: 36,
        }}
      />

      {/* Chip strip + sort dropdown */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {POSITION_CHIPS.map((chip) => {
          const active = chip.tokens.every((t) => activeChips.has(t));
          return (
            <button
              key={chip.label}
              type="button"
              onClick={() => toggleChip(chip.tokens)}
              aria-pressed={active}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "6px 10px",
                borderRadius: 99,
                border: `1px solid ${active ? "#22d3ee" : "var(--am-border)"}`,
                background: active ? "color-mix(in srgb, #22d3ee 14%, transparent)" : "var(--am-chip)",
                color: "var(--am-text)",
                cursor: "pointer",
                minHeight: 28,
              }}
            >
              {chip.label}
            </button>
          );
        })}

        <label style={{ marginLeft: "auto", fontSize: 11, color: "var(--am-text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as FreeAgentSort)}
            aria-label="Sort free agents"
            style={{
              fontSize: 12,
              padding: "5px 8px",
              borderRadius: 8,
              border: "1px solid var(--am-border)",
              background: "var(--am-chip)",
              color: "var(--am-text)",
              minHeight: 28,
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Body — virtualized scroll viewport. The role="list" semantics
          live on the scroll container; virtual children are absolutely
          positioned inside an oversize spacer so the scrollbar reflects
          the full FA pool size. */}
      <div
        ref={scrollRef}
        role="list"
        aria-label="Free agent list"
        data-fa-scroll
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          paddingRight: 4,
          // contain layout so the absolutely-positioned children don't
          // leak into ancestor layout calcs (small perf nicety).
          contain: "strict",
        }}
      >
        {loading && (
          <div style={{ fontSize: 12, color: "var(--am-text-muted)", padding: 8 }}>Loading…</div>
        )}
        {error && (
          <div role="alert" style={{ fontSize: 12, color: "#ff6b8a", padding: 8 }}>{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--am-text-muted)", padding: 8 }}>
            No free agents match those filters.
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <div
            style={{
              height: rowVirtualizer.getTotalSize(),
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const fa = filtered[virtualRow.index];
              if (!fa) return null;
              return (
                <FreeAgentRow
                  key={fa.rowKey}
                  fa={fa}
                  // Top inset places the row at its virtualized offset;
                  // a 6px gap is baked in by trimming row visual padding
                  // so the un-virtualized look is preserved.
                  top={virtualRow.start}
                  height={virtualRow.size}
                />
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Row ────────────────────────────────────────────────────────────

interface FreeAgentRowProps {
  fa: FreeAgent;
  /** Virtualizer offset (px from top of scroll viewport). When set, the
   *  row absolutely positions itself; when undefined the row flows
   *  inline (legacy/tests that bypass virtualization). */
  top?: number;
  /** Virtualizer-reported size in px (estimateSize default). */
  height?: number;
}

function FreeAgentRow({ fa, top, height }: FreeAgentRowProps) {
  const dndId = encodeFaDndId(fa.mlbId);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dndId });

  const isVirtualized = typeof top === "number";
  const style: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    background: "var(--am-chip)",
    border: "1px solid var(--am-border)",
    borderRadius: 10,
    cursor: "grab",
    opacity: isDragging ? 0.5 : 1,
    touchAction: "none",
    ...(isVirtualized
      ? {
          position: "absolute" as const,
          top: 0,
          left: 0,
          right: 4, // matches paddingRight on scroll viewport
          // Translate the row to its virtualizer offset. Using transform
          // (vs `top`) keeps the GPU layer cheap during scroll.
          transform: `translateY(${top}px)`,
          // Reserve the virtualizer-reported height minus a 6px gap so
          // adjacent rows match the un-virtualized 6px-gap look.
          height: (height ?? 56) - 6,
          boxSizing: "border-box" as const,
        }
      : {}),
  };

  // dnd-kit's `attributes` injects role="button" — spread first then
  // override the listitem role so the panel's `role="list"` parent +
  // FA-row hierarchy stays a11y-correct. testing-library still matches
  // by data-testid, which is the canonical query in our suite.
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="listitem"
      data-testid="fa-row"
      data-mlb-id={fa.mlbId}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--am-text)", display: "flex", alignItems: "center", gap: 6 }}>
          <span aria-hidden style={{ opacity: 0.55, fontSize: 11 }}>⋮⋮</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fa.name}</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--am-text-muted)", marginTop: 2 }}>
          {fa.posList || fa.posPrimary} · {fa.mlbTeam || "—"}
          {fa.statSnapshot ? ` · ${fa.statSnapshot}` : ""}
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--am-accent)" }}>
        {fa.projectedDollars > 0 ? `$${fa.projectedDollars}` : "—"}
      </div>
    </div>
  );
}
