import React from "react";
import { POS_ORDER } from "../../lib/baseballUtils";
import { OGBA_TEAM_NAMES } from "../../lib/ogbaTeams";

/* ── Toggle button (reused for Hitters/Pitchers and ALL/AL/NL) ───────── */
const toggleBtnBase =
  "text-xs font-bold uppercase tracking-wide rounded-[var(--lg-radius-md)] transition-all";
const toggleActive =
  "bg-[var(--lg-accent)] text-white shadow-xl shadow-blue-500/20 scale-[1.02]";
const toggleInactive =
  "text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint)]";

function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  const px = size === "sm" ? "px-4" : "px-6";
  return (
    <div
      className="flex bg-[var(--lg-tint)] rounded-[var(--lg-radius-lg)] p-1 border border-[var(--lg-border-subtle)]"
      role="group"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`${px} py-2 ${toggleBtnBase} ${value === o.value ? toggleActive : toggleInactive}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Select dropdown (shared styling) ──────────────────────────────── */
const selectClass = "lg-input w-auto min-w-[120px] font-medium text-xs py-2";

/* ── Period option type ────────────────────────────────────────────── */
export interface PeriodOption {
  id: number;
  label: string;
}

/* ── Props ─────────────────────────────────────────────────────────── */
export interface PlayerFilterBarProps {
  viewGroup: "hitters" | "pitchers";
  onViewGroupChange: (v: "hitters" | "pitchers") => void;

  filterLeague: "ALL" | "AL" | "NL";
  onFilterLeagueChange: (v: "ALL" | "AL" | "NL") => void;

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
  filterLeague,
  onFilterLeagueChange,
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
  const inner = (
    <div className="flex flex-wrap items-center gap-3 md:gap-4">
      <ToggleGroup
        options={[
          { label: "Hitters", value: "hitters" as const },
          { label: "Pitchers", value: "pitchers" as const },
        ]}
        value={viewGroup}
        onChange={onViewGroupChange}
      />

      <ToggleGroup
        options={[
          { label: "ALL", value: "ALL" as const },
          { label: "AL", value: "AL" as const },
          { label: "NL", value: "NL" as const },
        ]}
        value={filterLeague}
        onChange={onFilterLeagueChange}
        size="sm"
      />

      {/* Search */}
      <div className="relative group flex-1 min-w-[180px]">
        <input
          type="search"
          placeholder="Search players..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="lg-input pr-10"
          aria-label="Search players"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm opacity-30 group-focus-within:opacity-100 transition-opacity pointer-events-none">
          &#x1F50D;
        </div>
      </div>

      {/* Filter Dropdowns — single row on md+, 2-col grid on mobile */}
      <div className="grid grid-cols-2 md:flex gap-2 md:gap-3 w-full md:w-auto">
        <select
          value={viewMode}
          onChange={(e) => onViewModeChange(e.target.value as "all" | "remaining")}
          className={selectClass}
          aria-label="Player availability"
        >
          <option value="all">All Players</option>
          <option value="remaining">Available</option>
        </select>

        <select
          value={statsMode}
          onChange={(e) => onStatsModeChange(e.target.value)}
          className={selectClass}
          aria-label="Stats period"
        >
          <option value="season">Season Total</option>
          {periods.map((p) => (
            <option key={p.id} value={`period-${p.id}`}>
              {p.label}
            </option>
          ))}
        </select>

        <select
          value={filterTeam}
          onChange={(e) => onFilterTeamChange(e.target.value)}
          className={selectClass}
          aria-label="MLB team filter"
        >
          <option value="ALL">All MLB Teams</option>
          {showLeagueGroups && <option value="ALL_NL">All NL Teams</option>}
          {showLeagueGroups && <option value="ALL_AL">All AL Teams</option>}
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
        >
          <option value="ALL">All Fantasy Teams</option>
          {uniqueFantasyTeams
            .filter((t) => t !== "ALL")
            .map((t) => (
              <option key={t} value={t as string}>
                {OGBA_TEAM_NAMES[t as string] || t}
              </option>
            ))}
        </select>

        <select
          value={filterPos}
          onChange={(e) => onFilterPosChange(e.target.value)}
          className={selectClass}
          aria-label="Position filter"
        >
          <option value="ALL">All Positions</option>
          {POS_ORDER
            // OGBA rules: hitters use C/1B/2B/3B/SS/MI/CM/OF/DH; pitchers use a single "P" bucket.
            // SP/RP are filtered out — leagues that split pitching can re-enable via a future rule flag.
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
      </div>
    </div>
  );

  if (card) {
    return (
      <div className="lg-card p-4 flex flex-wrap items-center gap-3 md:gap-4 bg-transparent backdrop-blur-3xl">
        {inner}
      </div>
    );
  }

  return inner;
}
