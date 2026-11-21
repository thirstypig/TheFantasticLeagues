// Pure helpers for the archive player check page: wording, stat lines, filters.
import type { PlayerCheckItem, PlayerCheckSeason, PlayerCheckStatus, SeasonLine } from "@shared/api/archivePlayerCheck";

export const STATUS_LABEL: Record<PlayerCheckStatus, string> = { FLAGGED: "Flagged", OPEN: "Open", SUGGESTED: "Suggested" };

/** Innings the way a box score writes them: 186⅓ is "186.1". */
export function formatInnings(ip: number): string {
  const outs = Math.round(ip * 3);
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

const hitting = (l: SeasonLine) => `${l.g} G · ${l.pa} PA · ${l.hr} HR · ${l.avg || "—"} AVG · ${l.sb} SB`;
const pitching = (l: SeasonLine) => `${formatInnings(l.ip)} IP · ${l.w} W · ${l.sv} SV · ${l.k} K · ${l.era || "—"} ERA`;

/**
 * The season line that matters for the slot: pitching for a pitcher slot,
 * hitting for a hitter slot. A slot that takes either (IL, rookie spot) shows
 * what he mostly did — never a hitter's one mop-up inning or a pitcher's
 * at-bats alongside. A player with nothing in the slot's role shows what he did do.
 */
export function formatLine(line: SeasonLine | null, role: string): string {
  if (!line || (line.pa === 0 && line.ip === 0)) return "No MLB stats that season";
  const hit = line.pa > 0 ? hitting(line) : null;
  const pitch = line.ip > 0 ? pitching(line) : null;
  if (role === "P") return pitch ?? hit!;
  if (role === "H") return hit ?? pitch!;
  return (line.ip * 3 > line.pa ? pitch : hit) ?? hit ?? pitch!;
}

/** "draft", "P2", "final" → where the name appears, in plain words. */
export function formatSeenIn(seenIn: string[]): string {
  const label = (s: string) => (s === "draft" ? "draft day" : s === "final" ? "the final roster" : `period ${s.slice(1)}`);
  return seenIn.map(label).join(", ");
}

/** One sentence on why the name is on the list. */
export function explain(item: PlayerCheckItem): string {
  if (item.status === "FLAGGED" && item.match) {
    const failed = item.match.checks.filter((c) => !c.eligible).map((c) => c.slot);
    return `The name fits ${item.match.name}, but he didn’t qualify at ${failed.join(" or ") || "a slot he held"}.`;
  }
  if (item.candidates.length === 0) return "No MLB player fits this spelling.";
  if (item.candidates.length === 1 && item.candidates[0].note) return "No player fits this spelling. This is the closest guess.";
  if (item.status === "SUGGESTED") return "More than one player fits this name. Only one qualifies for every slot he held.";
  return "More than one player fits this name.";
}

/** The surname as written, to start a search from ("Wm. Contreras" → "Contreras"). */
export function searchSeed(name: string): string {
  const afterInitials = name.replace(/^([A-Za-z]{1,4}\.\s*)+/, "").trim();
  return afterInitials || name.trim();
}

export interface CheckFilters {
  year: number | null;
  team: string;
  status: PlayerCheckStatus | "";
  todoOnly: boolean;
}

/**
 * The names to show. With "left to decide" on, a name decided during this
 * visit stays until the filters change, so a card doesn't vanish under the
 * click that decided it (and its Undo stays reachable).
 */
export function filterItems(items: PlayerCheckItem[], f: CheckFilters, decidedThisVisit: ReadonlySet<number>): PlayerCheckItem[] {
  return items.filter((i) =>
    (f.year === null || i.year === f.year)
    && (!f.team || i.teamCode === f.team)
    && (!f.status || i.status === f.status)
    && (!f.todoOnly || !i.decision || decidedThisVisit.has(i.id)));
}

export interface SeasonRow extends PlayerCheckSeason { todo: number }

/** Per-season counts plus how many names in it still have no decision. */
export function seasonRows(seasons: PlayerCheckSeason[], items: PlayerCheckItem[]): SeasonRow[] {
  return seasons.map((s) => ({ ...s, todo: items.filter((i) => i.year === s.year && !i.decision).length }));
}

export function parseFilters(params: URLSearchParams): CheckFilters {
  const year = Number(params.get("season"));
  const status = (params.get("status") ?? "").toUpperCase();
  return {
    year: Number.isInteger(year) && year > 1900 ? year : null,
    team: params.get("team") ?? "",
    status: status === "FLAGGED" || status === "OPEN" || status === "SUGGESTED" ? status : "",
    todoOnly: params.get("todo") === "1",
  };
}

export function filtersToParams(f: CheckFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.year !== null) out.season = String(f.year);
  if (f.team) out.team = f.team;
  if (f.status) out.status = f.status.toLowerCase();
  if (f.todoOnly) out.todo = "1";
  return out;
}

/** "Nov 20" for this year, "Nov 20, 2025" otherwise. */
export function formatDecidedAt(iso: string | null, now = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
}
