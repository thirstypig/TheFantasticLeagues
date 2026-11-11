// Pure model for the commissioner's meeting draft (step C). Every function
// returns a new object; storage access is wrapped so the page still works
// (draft in memory only) when localStorage throws.

export interface DraftPlayer {
  playerId: number;
  name: string;
  pos: string;
  mlbTeam: string | null;
  mlbId: number | null;
}

export interface DraftMove {
  id: string;
  teamId: number;
  add: DraftPlayer | null;
  drop: DraftPlayer | null;
  error?: string;
}

export type TeamMark = "passed" | "done";

export interface MeetingDraft {
  leagueId: number;
  periodId: number;
  moves: DraftMove[];
  marks: Record<number, TeamMark>;
  selectedTeamId: number | null;
}

export interface MoveFlag {
  moveId: string;
  message: string;
}

export function emptyDraft(leagueId: number, periodId: number): MeetingDraft {
  return { leagueId, periodId, moves: [], marks: {}, selectedTeamId: null };
}

export function draftKey(leagueId: number, periodId: number): string {
  return `fbst.meetingDraft.v1.${leagueId}.${periodId}`;
}

export function loadDraft(leagueId: number, periodId: number): MeetingDraft {
  try {
    const raw = localStorage.getItem(draftKey(leagueId, periodId));
    if (!raw) return emptyDraft(leagueId, periodId);
    const parsed = JSON.parse(raw) as Partial<MeetingDraft> | null;
    if (
      !parsed ||
      parsed.leagueId !== leagueId ||
      parsed.periodId !== periodId ||
      !Array.isArray(parsed.moves)
    ) {
      return emptyDraft(leagueId, periodId);
    }
    return {
      leagueId,
      periodId,
      moves: parsed.moves,
      marks: parsed.marks && typeof parsed.marks === "object" ? parsed.marks : {},
      selectedTeamId: typeof parsed.selectedTeamId === "number" ? parsed.selectedTeamId : null,
    };
  } catch {
    return emptyDraft(leagueId, periodId);
  }
}

export function saveDraft(d: MeetingDraft): void {
  try {
    localStorage.setItem(draftKey(d.leagueId, d.periodId), JSON.stringify(d));
  } catch {
    /* storage unavailable: draft lives in memory only */
  }
}

export function clearDraft(leagueId: number, periodId: number): void {
  try {
    localStorage.removeItem(draftKey(leagueId, periodId));
  } catch {
    /* ignore */
  }
}

function newId(): string {
  return crypto.randomUUID?.() ?? String(Date.now() + Math.random());
}

export function addMove(d: MeetingDraft, teamId: number): MeetingDraft {
  return { ...d, moves: [...d.moves, { id: newId(), teamId, add: null, drop: null }] };
}

export function updateMove(
  d: MeetingDraft,
  id: string,
  patch: Partial<Pick<DraftMove, "add" | "drop" | "error">>,
): MeetingDraft {
  return { ...d, moves: d.moves.map((m) => (m.id === id ? { ...m, ...patch } : m)) };
}

export function removeMove(d: MeetingDraft, id: string): MeetingDraft {
  return { ...d, moves: d.moves.filter((m) => m.id !== id) };
}

export function setMark(d: MeetingDraft, teamId: number, mark: TeamMark | null): MeetingDraft {
  const marks = { ...d.marks };
  if (mark === null) delete marks[teamId];
  else marks[teamId] = mark;
  return { ...d, marks };
}

export function completeMoves(d: MeetingDraft): DraftMove[] {
  return d.moves.filter((m) => m.add && m.drop);
}

export function flagMoves(d: MeetingDraft, teamNames: Record<number, string>): MoveFlag[] {
  const flags: MoveFlag[] = [];
  const addedBy = new Map<number, { teamId: number }>(); // playerId -> first adder
  const dropped = new Set<number>();
  for (const m of d.moves) {
    if (m.add && !m.drop) flags.push({ moveId: m.id, message: "Needs a drop" });
    if (m.drop && !m.add) flags.push({ moveId: m.id, message: "Needs an add" });
    if (m.add) {
      const prior = addedBy.get(m.add.playerId);
      if (prior) {
        flags.push({
          moveId: m.id,
          message: `Already added by ${teamNames[prior.teamId] ?? `Team ${prior.teamId}`} tonight`,
        });
      } else {
        addedBy.set(m.add.playerId, { teamId: m.teamId });
      }
    }
    if (m.drop) {
      const adder = addedBy.get(m.drop.playerId);
      if (adder && adder.teamId === m.teamId) {
        flags.push({ moveId: m.id, message: `${m.drop.name} was added tonight and can't be dropped` });
      }
      if (dropped.has(m.drop.playerId)) {
        flags.push({ moveId: m.id, message: `${m.drop.name} is already being dropped` });
      }
      dropped.add(m.drop.playerId);
    }
  }
  return flags;
}

export function teamCountAfter(activeCount: number, d: MeetingDraft, teamId: number): number {
  let n = activeCount;
  for (const m of completeMoves(d)) {
    if (m.teamId !== teamId) continue;
    n += 1; // add
    n -= 1; // drop
  }
  return n;
}
