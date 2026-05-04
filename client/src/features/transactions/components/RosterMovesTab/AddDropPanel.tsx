import { Fragment, useEffect, useMemo, useState } from "react";
import { fetchJsonApi, API_BASE } from "../../../../api/base";
import { useLeague } from "../../../../contexts/LeagueContext";
import { useToast } from "../../../../contexts/ToastContext";
import { Button } from "../../../../components/ui/button";
import { reportError } from "../../../../lib/errorBus";
import { slotsFor } from "../../../../lib/positionEligibility";
import { isPitcher } from "../../../../lib/sports/baseball";
import { getPlayerCareerStats, type CareerHittingRow, type CareerPitchingRow, type HOrP } from "../../../../api";
import { CareerTable } from "../../../../components/shared/PlayerDetailModal";
import { formatReassignmentsToast, previewClaim, type AppliedReassignment } from "../../api";
import type { RosterMovesPlayer } from "./types";

interface Props {
  leagueId: number;
  teamId: number;
  players: RosterMovesPlayer[];
  onComplete: () => void;
  /** Optional upstream FA selection, used by commissioner roster hub search. */
  initialAddMlbId?: string | number | null;
  /** Hide the built-in FA search when the parent owns that selection step. */
  hideAddSearch?: boolean;
  /**
   * YYYY-MM-DD, commissioner-only. When set, the claim is backdated to this
   * date; the server attributes stats from this date onward to the new owner.
   * Empty string or undefined = server default (tomorrow 12:00 AM PT).
   */
  effectiveDate?: string;
}

const SLOT_ORDER = ["C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH", "P"];
const POSITION_FILTERS = ["ALL", "C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH", "P"] as const;
const HITTER_COLUMNS = ["AB", "H", "R", "HR", "RBI", "SB", "AVG"] as const;
const PITCHER_COLUMNS = ["IP", "K", "W", "SV", "ER", "ERA", "WHIP"] as const;
type StatKey = (typeof HITTER_COLUMNS)[number] | (typeof PITCHER_COLUMNS)[number];
type SortKey = "name" | "pos" | "mlbTeam" | "slot" | StatKey;
type StatMode = "hitting" | "pitching";

function playerName(p: RosterMovesPlayer | null | undefined): string {
  return p?.player_name || p?.name || "Unknown player";
}

function playerPositions(p: RosterMovesPlayer | null | undefined): string {
  const raw = p?.positions || p?.posPrimary || "-";
  return raw
    .split(/[,/| ]+/)
    .map((token) => {
      const t = token.trim().toUpperCase();
      if (t === "LF" || t === "CF" || t === "RF") return "OF";
      if (t === "SP" || t === "RP" || t === "CL" || t === "TWP") return "P";
      return t;
    })
    .filter(Boolean)
    .filter((token, index, arr) => arr.indexOf(token) === index)
    .join(", ") || "-";
}

function assignedSlot(p: RosterMovesPlayer | null | undefined): string {
  return p?.assignedPosition || p?.posPrimary || "UT";
}

function normalizedPositionTokens(p: RosterMovesPlayer | null | undefined): string[] {
  return (p?.positions || p?.posPrimary || "")
    .split(/[,/| ]+/)
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);
}

function matchesPositionFilter(p: RosterMovesPlayer, filter: string): boolean {
  if (filter === "ALL") return true;
  const tokens = normalizedPositionTokens(p);
  if (filter === "P") return tokens.some((token) => ["P", "SP", "RP", "CL", "TWP"].includes(token));
  return tokens.includes(filter) || slotsFor(playerPositions(p)).has(filter as any);
}

function playerMlbTeam(p: RosterMovesPlayer | null | undefined): string {
  const row = p as any;
  return String(row?.mlbTeam ?? row?.mlb_team ?? row?.mlb_team_abbr ?? row?.mlbTeamAbbr ?? "").trim() || "-";
}

function playerMlbId(p: RosterMovesPlayer | null | undefined): string {
  return String(p?.mlb_id ?? p?.mlbId ?? "").trim();
}

function statModeForPlayers(players: RosterMovesPlayer[], fallback?: RosterMovesPlayer | null): StatMode {
  const sample = players.find(Boolean) ?? fallback;
  return sample && isPitcher(sample as any) ? "pitching" : "hitting";
}

function columnsForMode(mode: StatMode): readonly StatKey[] {
  return mode === "pitching" ? PITCHER_COLUMNS : HITTER_COLUMNS;
}

function eligibilityLabels(p: RosterMovesPlayer | null | undefined): string[] {
  const labels = Array.from(slotsFor(p?.positions || p?.posPrimary || ""));
  return labels.sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b));
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatStat(key: string, value: unknown): string {
  const n = asNumber(value);
  if (n == null) return "-";
  if (key === "AVG") return n < 1 ? n.toFixed(3).replace(/^0/, "") : n.toFixed(3);
  if (key === "ERA" || key === "WHIP") return n.toFixed(2);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function sortNumberFallback(key: SortKey): number {
  return key === "ERA" || key === "WHIP" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
}

function sortValue(p: RosterMovesPlayer, key: SortKey): string | number {
  if (key === "name") return playerName(p).toLowerCase();
  if (key === "pos") return playerPositions(p).toLowerCase();
  if (key === "mlbTeam") return playerMlbTeam(p).toLowerCase();
  if (key === "slot") return assignedSlot(p).toLowerCase();
  return asNumber((p as any)[key]) ?? sortNumberFallback(key);
}

function comparePlayers(a: RosterMovesPlayer, b: RosterMovesPlayer, key: SortKey, dir: "asc" | "desc"): number {
  const av = sortValue(a, key);
  const bv = sortValue(b, key);
  if (typeof av === "string" || typeof bv === "string") {
    return String(av).localeCompare(String(bv)) * (dir === "asc" ? 1 : -1);
  }
  return (av - bv) * (dir === "asc" ? 1 : -1);
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "right",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: "asc" | "desc";
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = activeKey === sortKey;
  return (
    <th className={`px-2 py-2 text-${align} text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end" : "justify-start"} w-full rounded px-1 py-0.5 hover:bg-[var(--lg-tint)]`}
        aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      >
        {label}
        {active && <span aria-hidden>{direction === "asc" ? "^" : "v"}</span>}
      </button>
    </th>
  );
}

function PlayerStatsTable({
  players,
  selectedId,
  onSelect,
  sortKey,
  sortDir,
  onSort,
  emptyText,
  includeSlot = false,
  mode,
  expandedId,
  onToggleExpand,
}: {
  players: RosterMovesPlayer[];
  selectedId: string | number | null;
  onSelect: (p: RosterMovesPlayer) => void;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  emptyText: string;
  includeSlot?: boolean;
  mode: StatMode;
  expandedId: string | null;
  onToggleExpand: (p: RosterMovesPlayer) => void;
}) {
  const columns = columnsForMode(mode);
  const colSpan = includeSlot ? columns.length + 4 : columns.length + 3;
  return (
    <div className="overflow-x-auto rounded border border-[var(--lg-border-faint)]">
      <table className="min-w-[720px] w-full border-collapse text-[11px]">
        <thead className="bg-[var(--lg-tint)]/70">
          <tr>
            <SortHeader label="Player" sortKey="name" activeKey={sortKey} direction={sortDir} onSort={onSort} align="left" />
            <SortHeader label="Pos" sortKey="pos" activeKey={sortKey} direction={sortDir} onSort={onSort} align="left" />
            <SortHeader label="MLB" sortKey="mlbTeam" activeKey={sortKey} direction={sortDir} onSort={onSort} align="left" />
            {includeSlot && <SortHeader label="Slot" sortKey="slot" activeKey={sortKey} direction={sortDir} onSort={onSort} align="left" />}
            {columns.map((column) => (
              <SortHeader key={column} label={column} sortKey={column} activeKey={sortKey} direction={sortDir} onSort={onSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {players.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="px-3 py-4 text-center text-[var(--lg-text-muted)]">
                {emptyText}
              </td>
            </tr>
          ) : (
            players.map((p) => {
              const id = rowId(p);
              const hasSelection = selectedId !== null && selectedId !== "";
              const selected = hasSelection && (
                String(selectedId) === id ||
                (p._dbPlayerId != null && String(selectedId) === String(p._dbPlayerId))
              );
              const expanded = expandedId === id;
              return (
                <Fragment key={id}>
                  <tr
                    onClick={() => {
                      onSelect(p);
                      onToggleExpand(p);
                    }}
                    aria-selected={selected}
                    className={`cursor-pointer border-t border-[var(--lg-border-faint)] transition-colors ${
                      selected
                        ? "text-[var(--lg-text-primary)]"
                        : expanded
                          ? "bg-[var(--lg-tint)]"
                          : "hover:bg-[var(--lg-tint)]"
                    }`}
                    style={selected ? {
                      background: "color-mix(in srgb, var(--lg-accent) 18%, transparent)",
                      boxShadow: "inset 4px 0 0 var(--lg-accent)",
                    } : undefined}
                  >
                    <td className="sticky left-0 z-[1] min-w-[180px] bg-inherit px-3 py-2 font-semibold text-[var(--lg-text-primary)]">
                      <div className="flex items-center gap-2">
                        <span aria-hidden className="inline-flex h-5 w-5 items-center justify-center rounded border border-[var(--lg-border-faint)] text-[10px] text-[var(--lg-text-muted)]">
                          {expanded ? "-" : "+"}
                        </span>
                        <span>{playerName(p)}</span>
                        {selected && (
                          <span className="rounded-full border border-[var(--lg-accent)]/50 bg-[var(--lg-accent)]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--lg-accent)]">
                            Selected
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-left text-[var(--lg-text-muted)]">{playerPositions(p)}</td>
                    <td className="px-2 py-2 text-left font-mono text-[var(--lg-text-muted)]">{playerMlbTeam(p)}</td>
                    {includeSlot && <td className="px-2 py-2 text-left font-mono text-[var(--lg-text-muted)]">{assignedSlot(p)}</td>}
                    {columns.map((column) => (
                      <td key={column} className="px-2 py-2 text-right font-mono text-[var(--lg-text-primary)]">
                        {formatStat(column, (p as any)[column])}
                      </td>
                    ))}
                  </tr>
                  {expanded && (
                    <PlayerCareerExpansion
                      player={p}
                      mode={mode}
                      colSpan={colSpan}
                    />
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function rowId(p: RosterMovesPlayer): string {
  return String(p.mlb_id ?? p.mlbId ?? p._dbPlayerId ?? p.player_name ?? "");
}

function PlayerCareerExpansion({
  player,
  mode,
  colSpan,
}: {
  player: RosterMovesPlayer;
  mode: StatMode;
  colSpan: number;
}) {
  const mlbId = playerMlbId(player);
  const [rows, setRows] = useState<Array<CareerHittingRow | CareerPitchingRow>>([]);
  const [loading, setLoading] = useState(Boolean(mlbId));
  const [error, setError] = useState<string | null>(null);
  const statGroup: HOrP = mode === "pitching" ? "pitching" : "hitting";
  const eligible = eligibilityLabels(player);

  useEffect(() => {
    if (!mlbId) {
      setLoading(false);
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPlayerCareerStats(mlbId, statGroup)
      .then((res) => {
        if (!cancelled) setRows(res.rows ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load career stats.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mlbId, statGroup]);

  return (
    <tr className="border-t border-[var(--lg-border-faint)]">
      <td colSpan={colSpan} className="bg-[var(--lg-bg-surface)] px-4 py-3">
        <div className="grid gap-3 md:grid-cols-[220px_1fr]">
          <div className="rounded border border-[var(--lg-border-faint)] bg-[var(--lg-tint)]/40 p-3">
            <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">Player detail</div>
            <div className="mt-2 text-sm font-semibold text-[var(--lg-text-primary)]">{playerName(player)}</div>
            <div className="mt-1 text-xs text-[var(--lg-text-muted)]">{playerPositions(player)} · {playerMlbTeam(player)}</div>
            <div className="mt-3 text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">Eligible slots</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {eligible.length ? eligible.map((slot) => (
                <span key={slot} className="rounded border border-[var(--lg-border-faint)] bg-[var(--lg-bg-surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--lg-text-primary)]">
                  {slot}
                </span>
              )) : (
                <span className="text-xs text-[var(--lg-text-muted)]">No eligibility loaded.</span>
              )}
            </div>
          </div>
          <div className="min-w-0 rounded border border-[var(--lg-border-faint)] bg-[var(--lg-tint)]/30">
            <div className="border-b border-[var(--lg-border-faint)] px-3 py-2 text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">
              Career stats
            </div>
            <div className="overflow-x-auto p-2">
              {loading ? (
                <div className="px-3 py-5 text-xs text-[var(--lg-text-muted)]">Loading career stats...</div>
              ) : error ? (
                <div className="px-3 py-5 text-xs text-red-300">{error}</div>
              ) : rows.length ? (
                <CareerTable rows={rows} mode={statGroup} />
              ) : (
                <div className="px-3 py-5 text-xs text-[var(--lg-text-muted)]">No career stats available.</div>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function ComparisonTable({ add, drop }: { add: RosterMovesPlayer; drop: RosterMovesPlayer | null }) {
  const rows = [
    { label: "Add", player: add },
    { label: "Drop", player: drop },
  ];
  const mode = statModeForPlayers([add], add);
  const columns = columnsForMode(mode);
  return (
    <div className="overflow-x-auto rounded border border-[var(--lg-border-faint)]">
      <table className="min-w-[720px] w-full border-collapse text-[11px]">
        <thead className="bg-[var(--lg-tint)]/70">
          <tr>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">Move</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">Player</th>
            <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">Pos</th>
            <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">MLB</th>
            <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">Slot</th>
            {columns.map((column) => (
              <th key={column} className="px-2 py-2 text-right text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, player }) => (
            <tr key={label} className="border-t border-[var(--lg-border-faint)]">
              <td className="px-3 py-2 font-semibold text-[var(--lg-text-primary)]">{label}</td>
              <td className="px-3 py-2 font-semibold text-[var(--lg-text-primary)]">{player ? playerName(player) : "-"}</td>
              <td className="px-2 py-2 text-left text-[var(--lg-text-muted)]">{player ? playerPositions(player) : "-"}</td>
              <td className="px-2 py-2 text-left font-mono text-[var(--lg-text-muted)]">{player ? playerMlbTeam(player) : "-"}</td>
              <td className="px-2 py-2 text-left font-mono text-[var(--lg-text-muted)]">{player ? assignedSlot(player) : "-"}</td>
              {columns.map((column) => (
                <td key={column} className="px-2 py-2 text-right font-mono text-[var(--lg-text-primary)]">
                  {player ? formatStat(column, (player as any)[column]) : "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Add/Drop panel — the default mode of the Roster Moves tab.
 *
 * Select a free agent first. The drop list is then limited to roster slots
 * that the incoming player can legally cover, with the server preview kept as
 * the final roster-rule gate before confirmation.
 */
export default function AddDropPanel({
  leagueId,
  teamId,
  players,
  onComplete,
  initialAddMlbId,
  hideAddSearch = false,
  effectiveDate,
}: Props) {
  const { seasonStatus } = useLeague();
  const { toast } = useToast();
  const inSeason = seasonStatus === "IN_SEASON";

  const [query, setQuery] = useState("");
  const [addMlbId, setAddMlbId] = useState<string | null>(null);
  const [dropPlayerId, setDropPlayerId] = useState<number | "">("");
  const [positionFilter, setPositionFilter] = useState<(typeof POSITION_FILTERS)[number]>("ALL");
  const [faSortKey, setFaSortKey] = useState<SortKey>("name");
  const [faSortDir, setFaSortDir] = useState<"asc" | "desc">("asc");
  const [dropSortKey, setDropSortKey] = useState<SortKey>("name");
  const [dropSortDir, setDropSortDir] = useState<"asc" | "desc">("asc");
  const [expandedAddId, setExpandedAddId] = useState<string | null>(null);
  const [expandedDropId, setExpandedDropId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAddMlbId(initialAddMlbId == null ? null : String(initialAddMlbId));
  }, [initialAddMlbId]);

  const allFreeAgents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players
      .filter((p) => !(p.ogba_team_code || p.team || p._dbTeamId))
      .filter((p) => !q || playerName(p).toLowerCase().includes(q))
      .filter((p) => matchesPositionFilter(p, positionFilter))
      .sort((a, b) => comparePlayers(a, b, faSortKey, faSortDir));
  }, [faSortDir, faSortKey, players, positionFilter, query]);
  const freeAgents = useMemo(() => allFreeAgents.slice(0, 10), [allFreeAgents]);

  const dropCandidates = useMemo(() => {
    return players.filter((p) => {
      const tid = p._dbTeamId;
      return tid === teamId && p.assignedPosition !== "IL" && (p._dbPlayerId ?? 0) > 0;
    });
  }, [players, teamId]);

  const selectedAdd = useMemo(
    () => allFreeAgents.find((p) => String(p.mlb_id ?? "") === addMlbId) ?? null,
    [allFreeAgents, addMlbId],
  );
  const selectedDrop = useMemo(
    () => dropCandidates.find((p) => p._dbPlayerId === dropPlayerId) ?? null,
    [dropCandidates, dropPlayerId],
  );

  const addSlots = useMemo(
    () => slotsFor(selectedAdd?.positions || selectedAdd?.posPrimary || ""),
    [selectedAdd],
  );
  const eligibleSlotLabels = useMemo(
    () => Array.from(addSlots).sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b)),
    [addSlots],
  );
  const filteredDropCandidates = useMemo(() => {
    if (!selectedAdd) return [] as RosterMovesPlayer[];
    return dropCandidates
      .filter((p) => addSlots.has(assignedSlot(p) as any))
      .sort((a, b) => comparePlayers(a, b, dropSortKey, dropSortDir))
      .slice(0, 10);
  }, [addSlots, dropCandidates, dropSortDir, dropSortKey, selectedAdd]);
  const faStatMode = useMemo(() => statModeForPlayers(freeAgents, selectedAdd), [freeAgents, selectedAdd]);
  const dropStatMode = useMemo(() => statModeForPlayers(filteredDropCandidates, selectedAdd), [filteredDropCandidates, selectedAdd]);
  const dropTargetSlot = assignedSlot(selectedDrop);
  const slotCompatible = selectedDrop && addSlots.size > 0
    ? addSlots.has(dropTargetSlot as any)
    : true;

  const dropRequired = inSeason;
  const selectedFieldsComplete =
    addMlbId !== null &&
    (!dropRequired || dropPlayerId !== "");
  const needsServerPreview = inSeason && selectedFieldsComplete;
  const rosterRulesSatisfied =
    selectedFieldsComplete &&
    (needsServerPreview ? preview?.ok === true : (!selectedAdd || !selectedDrop || slotCompatible));
  const canSubmit = rosterRulesSatisfied && !previewing && !submitting;

  useEffect(() => {
    setDropPlayerId("");
    setExpandedDropId(null);
    setReviewOpen(false);
  }, [addMlbId]);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setPreviewing(false);
    if (!needsServerPreview || addMlbId === null || !selectedAdd || dropPlayerId === "") return;

    setPreviewing(true);
    previewClaim({
      leagueId,
      teamId,
      mlbId: Number(addMlbId),
      ...(selectedAdd._dbPlayerId ? { playerId: selectedAdd._dbPlayerId } : {}),
      dropPlayerId: Number(dropPlayerId),
      ...(effectiveDate ? { effectiveDate } : {}),
    })
      .then((result) => {
        if (!cancelled) setPreview({ ok: result.ok, message: result.message });
      })
      .catch((err: any) => {
        if (!cancelled) {
          setPreview({
            ok: false,
            error: err?.serverMessage || err?.message || "Roster rules are not satisfied.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewing(false);
      });

    return () => {
      cancelled = true;
    };
    // Depend on the player's stable id, not the memoized object — `selectedAdd`
    // is recomputed on every keystroke / sort toggle, which would re-fire previewClaim
    // dozens of times during typing.
  }, [addMlbId, dropPlayerId, effectiveDate, leagueId, needsServerPreview, selectedAdd?._dbPlayerId, teamId]);

  function handleSort(table: "fa" | "drop", key: SortKey) {
    if (table === "fa") {
      setFaSortKey((current) => {
        if (current === key) setFaSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
        else setFaSortDir(key === "ERA" || key === "WHIP" ? "asc" : key === "name" || key === "pos" ? "asc" : "desc");
        return key;
      });
      return;
    }
    setDropSortKey((current) => {
      if (current === key) setDropSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      else setDropSortDir(key === "ERA" || key === "WHIP" ? "asc" : key === "name" || key === "pos" ? "asc" : "desc");
      return key;
    });
  }

  function toggleAddExpansion(p: RosterMovesPlayer) {
    const id = rowId(p);
    setExpandedAddId((current) => current === id ? null : id);
  }

  function toggleDropExpansion(p: RosterMovesPlayer) {
    const id = rowId(p);
    setExpandedDropId((current) => current === id ? null : id);
  }

  async function handleSubmit() {
    if (!canSubmit || addMlbId === null || !selectedAdd) return;
    setSubmitting(true);
    setError(null);
    try {
      const addDbId = selectedAdd._dbPlayerId;
      const response = await fetchJsonApi<{
        success: boolean;
        playerId: number;
        appliedReassignments?: AppliedReassignment[];
      }>(`${API_BASE}/transactions/claim`, {
        method: "POST",
        body: JSON.stringify({
          leagueId,
          teamId,
          mlbId: addMlbId,
          ...(addDbId ? { playerId: addDbId } : {}),
          ...(dropPlayerId !== "" ? { dropPlayerId: Number(dropPlayerId) } : {}),
          ...(effectiveDate ? { effectiveDate } : {}),
        }),
      });
      const toastMsg = formatReassignmentsToast(
        response.appliedReassignments,
        `Claimed ${playerName(selectedAdd)}.`,
      );
      if (toastMsg) toast(toastMsg, "success");
      setAddMlbId(null);
      setDropPlayerId("");
      setQuery("");
      setReviewOpen(false);
      onComplete();
    } catch (err: any) {
      const msg = err?.serverMessage || err?.message || "Add/Drop failed";
      setError(msg);
      reportError(err, { source: "roster-moves-add-drop" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-[var(--lg-text-muted)]">
        Select a free agent. The drop table will automatically narrow to players in roster slots that the incoming player can cover.
      </p>

      {hideAddSearch ? (
        <div className="rounded border border-[var(--lg-border-faint)] bg-[var(--lg-bg-surface)] p-3 text-[11px]">
          <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">Add player</div>
          {selectedAdd ? (
            <ComparisonTable add={selectedAdd} drop={null} />
          ) : (
            <div className="mt-1 text-[var(--lg-text-muted)]">Select a free agent from the search above.</div>
          )}
        </div>
      ) : (
        <section>
          <label className="block text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-1">
            Add player (free agents)
          </label>
          <input
            type="text"
            placeholder="Search by name..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setAddMlbId(null); }}
            className="w-full mb-2 rounded border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)]"
          />
          <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
            {POSITION_FILTERS.map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => setPositionFilter(pos)}
                className={`shrink-0 rounded border px-2 py-1 text-[10px] font-semibold ${
                  positionFilter === pos
                    ? "border-[var(--lg-accent)] bg-[var(--lg-accent)]/15 text-[var(--lg-text-primary)]"
                    : "border-[var(--lg-border-faint)] bg-[var(--lg-tint)] text-[var(--lg-text-muted)] hover:bg-[var(--lg-tint-hover)]"
                }`}
              >
                {pos === "ALL" ? "All" : pos}
              </button>
            ))}
          </div>
          <PlayerStatsTable
            players={freeAgents}
            selectedId={addMlbId}
            onSelect={(p) => setAddMlbId(String(p.mlb_id ?? ""))}
            sortKey={faSortKey}
            sortDir={faSortDir}
            onSort={(key) => handleSort("fa", key)}
            emptyText="No matching free agents."
            mode={faStatMode}
            expandedId={expandedAddId}
            onToggleExpand={toggleAddExpansion}
          />
        </section>
      )}

      <section>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <label className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">
            Drop player{" "}
            <span className="text-[var(--lg-text-muted)]">
              ({dropRequired ? "required in-season" : "optional"})
            </span>
          </label>
          {selectedAdd && (
            <div className="text-[10px] text-[var(--lg-text-muted)]">
              Qualified slots: {eligibleSlotLabels.length ? eligibleSlotLabels.join(", ") : "none"}
            </div>
          )}
        </div>
        <PlayerStatsTable
          players={filteredDropCandidates}
          selectedId={dropPlayerId}
          onSelect={(p) => setDropPlayerId(p._dbPlayerId ?? "")}
          sortKey={dropSortKey}
          sortDir={dropSortDir}
          onSort={(key) => handleSort("drop", key)}
          emptyText={selectedAdd ? "No rostered players qualify as the matching drop." : "Select a free agent first."}
          includeSlot
          mode={dropStatMode}
          expandedId={expandedDropId}
          onToggleExpand={toggleDropExpansion}
        />
      </section>

      <div
        className={`rounded border p-2 text-[11px] ${
          rosterRulesSatisfied
            ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
            : "border-[var(--lg-border-faint)] bg-[var(--lg-tint)]/50 text-[var(--lg-text-muted)]"
        }`}
      >
        {previewing
          ? "Checking roster rules..."
          : rosterRulesSatisfied
          ? preview?.message || "Roster rules satisfied. Execute to review this add/drop."
          : preview?.error || "Execute unlocks after the add/drop satisfies roster rules."}
      </div>

      {dropRequired && addMlbId !== null && dropPlayerId === "" && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200">
          In-season adds require a matching drop. The drop table only includes players in eligible roster slots.
        </div>
      )}
      {selectedAdd && selectedDrop && !slotCompatible && !needsServerPreview && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200">
          {playerName(selectedAdd)} is not eligible for the {dropTargetSlot} slot. Pick a different drop.
        </div>
      )}
      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-[11px] text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setReviewOpen(true)} disabled={!canSubmit}>
          {submitting ? "Submitting..." : dropPlayerId !== "" ? "Execute Add + Drop" : "Execute Add"}
        </Button>
      </div>

      {reviewOpen && selectedAdd && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Review roster move"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"
          onClick={() => setReviewOpen(false)}
        >
          <div
            className="max-h-[90svh] w-full max-w-3xl overflow-y-auto rounded border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-primary)] p-4 shadow-2xl"
            style={{ boxShadow: "0 24px 80px rgba(0,0,0,0.45)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">Review transaction</div>
                <h3 className="mt-1 text-base font-semibold text-[var(--lg-text-primary)]">
                  {dropPlayerId !== "" ? "Add + Drop" : "Add Player"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                className="rounded border border-[var(--lg-border-faint)] px-2 py-1 text-[11px] text-[var(--lg-text-muted)] hover:bg-[var(--lg-tint)]"
              >
                Close
              </button>
            </div>

            <div className="mt-4">
              <ComparisonTable add={selectedAdd} drop={selectedDrop} />
            </div>

            <div className="mt-3 rounded border border-[var(--lg-border-faint)] bg-[var(--lg-tint)]/50 p-3 text-[11px] text-[var(--lg-text-muted)]">
              {effectiveDate && <div>Effective date: {effectiveDate}</div>}
              {selectedDrop && <div>Drop slot: {dropTargetSlot}</div>}
              <div>{preview?.message || "Roster rules satisfied."}</div>
            </div>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button size="sm" variant="outline" onClick={() => setReviewOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
                {submitting ? "Submitting..." : dropPlayerId !== "" ? "Confirm Add + Drop" : "Confirm Add"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
