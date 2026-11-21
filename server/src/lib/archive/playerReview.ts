/**
 * The archive player check: every name on an archived roster resolves to one
 * MLB player, and the ones the rules can't settle wait for a person. Pure —
 * the audit script builds the records, the loader stores them, the routes
 * apply decisions; all three share these rules.
 *
 *   VERIFIED   the name matched one player and he was eligible for every slot.
 *   SUGGESTED  several players fit the name; exactly one is eligible for every slot.
 *   FLAGGED    the name matched one player, but he wasn't eligible for a slot he held.
 *   OPEN       no player fits, or the rules can't separate the ones that do.
 *
 * A person's decision always wins over the machine and survives re-runs:
 *   PICK       this is the player (a candidate, or anyone found by search).
 *   EXCEPTION  keep the flagged match — the league allowed it at the time.
 *   WRONG      the flagged match is the wrong player; still unknown.
 *   NONE       none of the candidates; still unknown.
 */
import { slotEligibility, type PlayerSeasonFacts } from "./archiveEligibility.js";
import type { SeasonLine } from "./mlbFacts.js";

export type ReviewStatus = "VERIFIED" | "SUGGESTED" | "FLAGGED" | "OPEN";
export type ReviewDecision = "PICK" | "EXCEPTION" | "WRONG" | "NONE";
export type Role = "P" | "H" | "X";

export interface SlotCheck { slot: string; eligible: boolean; reason: string }

export interface ReviewCandidate {
  mlbId: number;
  name: string;
  line: SeasonLine | null;
  /** Plate appearances (hitter slot) or innings (pitcher slot) that season. */
  playingTime: number;
  eligibleSlots: number;
  checks: SlotCheck[];
  /** Why he's offered when the spelling doesn't match ("wrong first initial"). */
  note?: string;
}

export interface ReviewSuggestion { mlbId: number; why: string; closeCall: boolean }

/** One name on one team in one season, as the audit script writes it. */
export interface ReviewRecord {
  /** `year|team|abbreviation|surname|role` — see archivePlayerKey. */
  key: string;
  year: number;
  team: string;
  role: Role;
  /** Spellings as written in the workbook. */
  names: string[];
  slots: string[];
  /** Where he appears: "draft", "P2" … "P7", "final". */
  seenIn: string[];
  /** The slot he held on this team at the end of last season, if kept. */
  keptFromSlot: string | null;
  status: ReviewStatus;
  /** The machine's match (VERIFIED and FLAGGED). */
  match: {
    mlbId: number; name: string; how: string;
    /** Other real players a tie-break ruled out, and which rule did it. */
    beat?: string;
    checks: SlotCheck[]; line: SeasonLine | null;
  } | null;
  /** Ranked candidates (SUGGESTED and OPEN). */
  candidates: ReviewCandidate[];
  suggestion: ReviewSuggestion | null;
}

/** The JSON column on HistoricalPlayerMatch. */
export interface ReviewDetail {
  keptFromSlot: string | null;
  how: string | null;
  beat?: string;
  checks: SlotCheck[];
  line: SeasonLine | null;
  candidates: ReviewCandidate[];
  suggestion: ReviewSuggestion | null;
}

/** Columns the loader owns. Decision columns are never part of this. */
export interface MatchRowData {
  key: string;
  teamCode: string;
  role: string;
  names: string[];
  slots: string[];
  seenIn: string[];
  status: ReviewStatus;
  autoMlbId: number | null;
  autoName: string | null;
  detail: ReviewDetail;
}

export function toMatchRow(r: ReviewRecord): MatchRowData {
  return {
    key: r.key,
    teamCode: r.team,
    role: r.role,
    names: r.names,
    slots: r.slots,
    seenIn: r.seenIn,
    status: r.status,
    autoMlbId: r.match?.mlbId ?? null,
    autoName: r.match?.name ?? null,
    detail: {
      keptFromSlot: r.keptFromSlot,
      how: r.match?.how ?? null,
      ...(r.match?.beat ? { beat: r.match.beat } : {}),
      checks: r.match?.checks ?? [],
      line: r.match?.line ?? null,
      candidates: r.candidates,
      suggestion: r.suggestion,
    },
  };
}

// ── Eligibility checks and ranking ─────────────────────────────────────────

export function checkSlots(slots: string[], facts: PlayerSeasonFacts): SlotCheck[] {
  return slots.map((slot) => ({ slot, ...slotEligibility(slot, facts) }));
}

/** Playing time for the slot's role. An IL / rookie-spot name can be either, so take the larger. */
export function playingTime(line: SeasonLine | null | undefined, role: string): number {
  if (!line) return 0;
  if (role === "P") return line.ip;
  if (role === "H") return line.pa;
  return Math.max(line.pa, line.ip * 3);
}

/** Innings the way a box score writes them: 186⅓ is "186.1", never "186.3". */
export function formatInnings(ip: number): string {
  const outs = Math.round(ip * 3);
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

function playingTimeLabel(line: SeasonLine | null, role: string): string {
  const asPitcher = role === "P" || (role !== "H" && !!line && line.ip * 3 > line.pa);
  return asPitcher ? `${formatInnings(line?.ip ?? 0)} IP` : `${line?.pa ?? 0} PA`;
}

export function buildCandidate(
  c: { mlbId: number; name: string; note?: string }, slots: string[], role: string,
  facts: PlayerSeasonFacts, line: SeasonLine | null,
): ReviewCandidate {
  const checks = checkSlots(slots, facts);
  return {
    mlbId: c.mlbId, name: c.name, line, playingTime: playingTime(line, role),
    eligibleSlots: checks.filter((x) => x.eligible).length, checks,
    ...(c.note ? { note: c.note } : {}),
  };
}

/** Most eligible slots first, then whoever actually played more. */
export function rankCandidates(candidates: ReviewCandidate[]): ReviewCandidate[] {
  return [...candidates].sort((a, b) => b.eligibleSlots - a.eligibleSlots || b.playingTime - a.playingTime);
}

/** Two candidates are a close call when the runner-up played at least this share of the leader's time. */
export const CLOSE_CALL_RATIO = 0.85;

/**
 * The player to suggest: an owner rosters the regular, not the namesake with
 * 12 at-bats. `ranked` must come from rankCandidates.
 */
export function suggest(ranked: ReviewCandidate[], slotCount: number, role: string): ReviewSuggestion | null {
  const top = ranked[0];
  if (!top) return null;
  const fullyEligible = ranked.filter((c) => c.eligibleSlots === slotCount);
  const second = ranked[1];
  const closeCall = !!second && second.eligibleSlots === top.eligibleSlots
    && top.playingTime > 0 && second.playingTime >= top.playingTime * CLOSE_CALL_RATIO;
  const time = playingTimeLabel(top.line, role);
  const why = fullyEligible.length === 1
    ? "the only one eligible for every slot"
    : top.eligibleSlots === 0
      ? `none eligible; most playing time (${time})`
      : `eligible and played the most (${time})`;
  return { mlbId: top.mlbId, why, closeCall };
}

/** Status of a name the matcher could not settle, from its ranked candidates. */
export function unresolvedStatus(ranked: ReviewCandidate[], slotCount: number): "SUGGESTED" | "OPEN" {
  return ranked.filter((c) => c.eligibleSlots === slotCount).length === 1 ? "SUGGESTED" : "OPEN";
}

// ── Decisions ──────────────────────────────────────────────────────────────

export interface MatchState {
  status: ReviewStatus;
  autoMlbId: number | null;
  autoName: string | null;
}

export interface Resolved { mlbId: number | null; mlbName: string | null }

/**
 * Who the name resolves to with no decision on it: the machine's match stands
 * for VERIFIED and FLAGGED (the name fits one player — a flag questions the
 * slot, not the person); SUGGESTED and OPEN stay unknown until someone picks.
 */
export function defaultResolution(s: MatchState): Resolved {
  if ((s.status === "VERIFIED" || s.status === "FLAGGED") && s.autoMlbId != null) {
    return { mlbId: s.autoMlbId, mlbName: s.autoName };
  }
  return { mlbId: null, mlbName: null };
}

export type DecisionInput =
  | { decision: "PICK"; mlbId: number; name: string }
  | { decision: "EXCEPTION" }
  | { decision: "WRONG" }
  | { decision: "NONE" };

/** Why this decision can't be made on this row, or null when it can. */
export function decisionError(s: MatchState, input: DecisionInput): string | null {
  if (s.status === "VERIFIED") return "This player is already verified.";
  const hasMatch = s.status === "FLAGGED" && s.autoMlbId != null;
  if ((input.decision === "EXCEPTION" || input.decision === "WRONG") && !hasMatch) {
    return "There is no matched player on this one to keep or reject.";
  }
  if (input.decision === "NONE" && hasMatch) return "Use “Wrong player” for a matched player.";
  return null;
}

/**
 * What a decision resolves the name to. An exception pins the player it was
 * made about, so a later re-run that matches someone else can't silently move
 * the approval to him.
 */
export function decisionResolution(s: MatchState, input: DecisionInput): Resolved {
  if (input.decision === "PICK") return { mlbId: input.mlbId, mlbName: input.name };
  if (input.decision === "EXCEPTION") return { mlbId: s.autoMlbId, mlbName: s.autoName };
  return { mlbId: null, mlbName: null };
}

/**
 * The commissioner's word is final: anyone with archive access may decide an
 * undecided name or revise another member's decision, but only an admin may
 * change a decision an admin made.
 */
export function canChangeDecision(
  viewer: { isAdmin: boolean }, current: { decision: string | null; decidedByAdmin: boolean },
): boolean {
  if (viewer.isAdmin) return true;
  return !(current.decision && current.decidedByAdmin);
}

// ── Loader plan ────────────────────────────────────────────────────────────

/** JSON with object keys sorted, so jsonb's key reordering doesn't read as a change. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object).sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export interface ExistingMatchRow extends MatchRowData {
  id: number;
  decision: string | null;
  mlbId: number | null;
  mlbName: string | null;
}

export interface LoadPlan {
  create: (MatchRowData & Resolved)[];
  /** Generated columns changed. `resolved` is set only for undecided rows — a decision is never overwritten. */
  update: { id: number; data: MatchRowData; resolved: Resolved | null }[];
  /** Gone from the audit and never decided. */
  remove: number[];
  /** Gone from the audit but someone decided them: kept, and reported. */
  orphanedDecisions: string[];
  /** Decided rows where the machine now names a different player than the decision did. */
  disagreements: string[];
  unchanged: number;
}

/** What a re-run has to write for one season, given what is stored. */
export function planSeasonLoad(next: MatchRowData[], existing: ExistingMatchRow[]): LoadPlan {
  const plan: LoadPlan = { create: [], update: [], remove: [], orphanedDecisions: [], disagreements: [], unchanged: 0 };
  const stored = new Map(existing.map((e) => [e.key, e]));
  const generated = (r: MatchRowData) => stableStringify({
    key: r.key, teamCode: r.teamCode, role: r.role, names: r.names, slots: r.slots, seenIn: r.seenIn,
    status: r.status, autoMlbId: r.autoMlbId, autoName: r.autoName, detail: r.detail,
  });
  for (const row of next) {
    const prev = stored.get(row.key);
    stored.delete(row.key);
    const fresh = defaultResolution(row);
    if (!prev) { plan.create.push({ ...row, ...fresh }); continue; }
    if (prev.decision && row.autoMlbId != null && prev.mlbId != null && prev.mlbId !== row.autoMlbId) {
      plan.disagreements.push(`${row.key}: decided ${prev.mlbName} (${prev.mlbId}), the matcher now says ${row.autoName} (${row.autoMlbId})`);
    }
    const resolved = prev.decision ? null : fresh;
    const sameResolution = !resolved || (resolved.mlbId === prev.mlbId && resolved.mlbName === prev.mlbName);
    if (generated(row) === generated(prev) && sameResolution) { plan.unchanged++; continue; }
    plan.update.push({ id: prev.id, data: row, resolved });
  }
  for (const left of stored.values()) {
    if (left.decision) plan.orphanedDecisions.push(left.key);
    else plan.remove.push(left.id);
  }
  return plan;
}

// ── Decisions made on the earlier review page ──────────────────────────────

export interface ImportedPick { key: string; decision: string; mlbId: number | null; name: string | null; decidedAt?: string }

/** Turn a saved pick into a decision, or say why it can't be applied. */
export function importedDecision(
  s: MatchState, pick: ImportedPick,
): { input: DecisionInput } | { error: string } {
  const kind = pick.decision.toUpperCase();
  let input: DecisionInput;
  if (kind === "PICK") {
    if (pick.mlbId == null || !pick.name) return { error: "pick has no player" };
    input = { decision: "PICK", mlbId: pick.mlbId, name: pick.name };
  } else if (kind === "EXCEPTION") {
    if (pick.mlbId != null && pick.mlbId !== s.autoMlbId) return { error: `exception was for player ${pick.mlbId}, the match is now ${s.autoMlbId}` };
    input = { decision: "EXCEPTION" };
  } else if (kind === "WRONG" || kind === "NONE") {
    input = { decision: kind };
  } else {
    return { error: `unknown decision "${pick.decision}"` };
  }
  const error = decisionError(s, input);
  return error ? { error } : { input };
}
