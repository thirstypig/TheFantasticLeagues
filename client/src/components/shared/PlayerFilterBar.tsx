import React, { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { POS_ORDER } from "../../lib/baseballUtils";
import { OGBA_TEAM_NAMES } from "../../lib/ogbaTeams";

/* ── Compact toggle (H/P, All/Avail) ───────────────────────────────── */
const toggleBtnBase =
  "text-[11px] font-bold uppercase tracking-wide rounded-[var(--lg-radius-sm)] transition-colors";
const toggleActive =
  "bg-[var(--lg-accent)] text-white";
const toggleInactive =
  "text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint)]";

function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { label: string; value: T; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      className="flex bg-[var(--lg-tint)] rounded-[var(--lg-radius-md)] p-0.5 border border-[var(--lg-border-subtle)] h-9"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          title={o.title ?? o.label}
          className={`px-3 ${toggleBtnBase} ${value === o.value ? toggleActive : toggleInactive}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Compact select dropdown ──────────────────────────────────────── */
// `w-auto` overrides `.lg-input`'s default `width: 100%` so dropdowns
// shrink to fit content and the bar stays on a single row.
const selectClass = "lg-input w-auto font-medium text-xs h-9 py-0 pl-2.5 pr-7";

/* ── Expandable search ─────────────────────────────────────────────
 * Collapsed: 36×36 icon button.
 * Expanded:  ~180px input with clear-X.
 * Auto-collapses on blur when the value is empty; stays expanded when
 * the URL or external state seeds a non-empty query. */
function ExpandableSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(value.length > 0);
  const inputRef = useRef<HTMLInputElement>(null);

  // If a non-empty query arrives from the URL or another caller, expand.
  useEffect(() => {
    if (value.length > 0 && !open) setOpen(true);
  }, [value, open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          // Focus on the next tick so the autoFocus fires after mount.
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        aria-label="Search players"
        title="Search players"
        className="lg-input flex items-center justify-center h-9 w-9 px-0 cursor-pointer"
      >
        <Search className="w-3.5 h-3.5" style={{ color: "var(--lg-text-muted)" }} />
      </button>
    );
  }

  return (
    <div className="relative" style={{ width: 180 }}>
      <input
        ref={inputRef}
        type="text"
        autoFocus
        placeholder="Search…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => { if (value.length === 0) setOpen(false); }}
        aria-label="Search players"
        className="lg-input h-9 pl-8 pr-7 text-xs"
      />
      <Search
        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
        style={{ color: "var(--lg-text-muted)" }}
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-[var(--lg-tint)] cursor-pointer"
        >
          <X className="w-3 h-3" style={{ color: "var(--lg-text-muted)" }} />
        </button>
      )}
    </div>
  );
}

/* ── Period option type ───────────────────────────────────────────── */
export interface PeriodOption {
  id: number;
  label: string;
}

/* ── Props ─────────────────────────────────────────────────────────── */
export interface PlayerFilterBarProps {
  viewGroup: "hitters" | "pitchers";
  onViewGroupChange: (v: "hitters" | "pitchers") => void;

  searchQuery: string;
  onSearchChange: (v: string) => void;

  viewMode: "all" | "remaining";
  onViewModeChange: (v: "all" | "remaining") => void;

  statsMode: string;
  onStatsModeChange: (v: string) => void;
  periods: PeriodOption[];

  filterTeam: string;
  onFilterTeamChange: (v: string) => void;
  uniqueMLBTeams: string[];

  filterFantasyTeam: string;
  onFilterFantasyTeamChange: (v: string) => void;
  uniqueFantasyTeams: string[];

  filterPos: string;
  onFilterPosChange: (v: string) => void;

  /** Show NL/AL group options in MLB team dropdown */
  showLeagueGroups?: boolean;
  /** Wrap in a card container (Players page) vs bare (AddDropTab) */
  card?: boolean;
}

export function PlayerFilterBar({
  viewGroup,
  onViewGroupChange,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  statsMode,
  onStatsModeChange,
  periods,
  filterTeam,
  onFilterTeamChange,
  uniqueMLBTeams,
  filterFantasyTeam,
  onFilterFantasyTeamChange,
  uniqueFantasyTeams,
  filterPos,
  onFilterPosChange,
  showLeagueGroups = true,
  card = false,
}: PlayerFilterBarProps) {
  // Single condensed row, ordered by typical adjustment frequency:
  //   H/P → Avail → Stats period → Pos → MLB → Fantasy → Search
  // The MLB dropdown absorbs the prior standalone ALL/AL/NL toggle via
  // its ALL_NL / ALL_AL group options. flex-wrap allows graceful
  // overflow on narrow viewports without horizontal scroll.
  const inner = (
    <div className="flex flex-wrap items-center gap-2 md:gap-2.5">
      <ToggleGroup
        options={[
          { label: "H", value: "hitters" as const, title: "Hitters" },
          { label: "P", value: "pitchers" as const, title: "Pitchers" },
        ]}
        value={viewGroup}
        onChange={onViewGroupChange}
        ariaLabel="Hitters or Pitchers"
      />

      <ToggleGroup
        options={[
          { label: "All", value: "all" as const, title: "All Players" },
          { label: "Avail", value: "remaining" as const, title: "Available (free agents)" },
        ]}
        value={viewMode}
        onChange={onViewModeChange}
        ariaLabel="Roster availability"
      />

      <select
        value={statsMode}
        onChange={(e) => onStatsModeChange(e.target.value)}
        className={selectClass}
        aria-label="Stats period"
        title="Stats period"
      >
        {periods.map((p) => (
          <option key={p.id} value={`period-${p.id}`}>
            {p.label}
          </option>
        ))}
        <option value="season">YTD</option>
      </select>

      <select
        value={filterPos}
        onChange={(e) => onFilterPosChange(e.target.value)}
        className={selectClass}
        aria-label="Position filter"
        title="Position"
      >
        <option value="ALL">Pos</option>
        {POS_ORDER
          // OGBA rules: hitters use C/1B/2B/3B/SS/MI/CM/OF/DH; pitchers use a single "P" bucket.
          .filter((p) => {
            if (p === 'SP' || p === 'RP') return false;
            const isPitcherPos = p === 'P';
            if (viewGroup === 'hitters') return !isPitcherPos;
            return isPitcherPos;
          })
          .map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
      </select>

      <select
        value={filterTeam}
        onChange={(e) => onFilterTeamChange(e.target.value)}
        className={selectClass}
        aria-label="MLB team filter"
        title="MLB team"
      >
        <option value="ALL">MLB</option>
        {showLeagueGroups && <option value="ALL_NL">All NL</option>}
        {showLeagueGroups && <option value="ALL_AL">All AL</option>}
        {uniqueMLBTeams
          .filter((t) => t !== "ALL")
          .map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
      </select>

      <select
        value={filterFantasyTeam}
        onChange={(e) => onFilterFantasyTeamChange(e.target.value)}
        className={selectClass}
        aria-label="Fantasy team filter"
        title="Fantasy team"
      >
        <option value="ALL">Fantasy</option>
        {uniqueFantasyTeams
          .filter((t) => t !== "ALL")
          .map((t) => (
            <option key={t} value={t as string}>
              {OGBA_TEAM_NAMES[t as string] || t}
            </option>
          ))}
      </select>

      <ExpandableSearch value={searchQuery} onChange={onSearchChange} />
    </div>
  );

  if (card) {
    return (
      <div className="lg-card p-3 md:p-4 bg-transparent backdrop-blur-3xl">
        {inner}
      </div>
    );
  }

  return inner;
}
