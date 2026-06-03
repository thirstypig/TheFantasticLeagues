// Draft Report Card checkpoint resolver.
//
// Three fixed checkpoints map to fixed period spans:
//   one_third  → periods 1..3   (label "1/3 Season")
//   two_thirds → periods 1..5   (label "2/3 Season")
//   end        → periods 1..7   (label "Final")
//
// PREVIEW vs LOCKED rules:
// - If the FIRST period in the span hasn't started yet (startDate > today),
//   the checkpoint isn't available — caller should 409.
// - If the LAST period in the span is still active (status === "active" OR
//   endDate > today), we still return data but flag isPreview=true and
//   surface unlocksAt = lastPeriod.endDate. The UI shows a "PREVIEW" banner.
// - Otherwise we're past the last period — isPreview=false, unlocksAt=null.
//
// Period.status field uses "active" / "completed" / future ("upcoming"?). We
// fall back to date math when status is missing or unrecognized.
import { prisma } from "../../../db/prisma.js";

export type Checkpoint = "one_third" | "two_thirds" | "end";

export interface CheckpointResolution {
  periodIds: number[];
  firstStart: Date;
  lastEnd: Date;
  isPreview: boolean;
  unlocksAt: Date | null;
  label: string;
}

const CHECKPOINT_COUNT: Record<Checkpoint, number> = {
  one_third: 3,
  two_thirds: 5,
  end: 7,
};

const CHECKPOINT_LABEL: Record<Checkpoint, string> = {
  one_third: "1/3 Season",
  two_thirds: "2/3 Season",
  end: "Final",
};

export function checkpointCount(c: Checkpoint): number {
  return CHECKPOINT_COUNT[c];
}

export function checkpointLabel(c: Checkpoint): string {
  return CHECKPOINT_LABEL[c];
}

/**
 * Resolve a checkpoint against the league's period sequence. Returns null
 * when the checkpoint hasn't started yet (caller maps to 409 with
 * unlocksAt = firstPeriod.startDate via the same payload pattern). Returns
 * a resolution with `isPreview=true` when the last period is in flight.
 */
export async function resolveCheckpoint(
  leagueId: number,
  checkpoint: Checkpoint,
  now: Date = new Date(),
): Promise<CheckpointResolution | { unlocksAt: Date } | null> {
  const want = CHECKPOINT_COUNT[checkpoint];

  const periods = await prisma.period.findMany({
    where: { season: { leagueId } },
    orderBy: { startDate: "asc" },
    select: { id: true, startDate: true, endDate: true, status: true },
    take: want,
  });

  if (periods.length === 0) return null;
  // Not enough periods exist yet — treat as not-started; caller 409s.
  if (periods.length < want) {
    return { unlocksAt: periods[periods.length - 1].endDate };
  }

  const first = periods[0];
  const last = periods[periods.length - 1];

  // First period not yet started → checkpoint not available at all.
  if (first.startDate.getTime() > now.getTime()) {
    return { unlocksAt: first.startDate };
  }

  const lastActive =
    last.status === "active" ||
    (last.status !== "completed" && last.endDate.getTime() > now.getTime());

  return {
    periodIds: periods.map((p) => p.id),
    firstStart: first.startDate,
    lastEnd: last.endDate,
    isPreview: lastActive,
    unlocksAt: lastActive ? last.endDate : null,
    label: CHECKPOINT_LABEL[checkpoint],
  };
}

export function isCheckpoint(v: unknown): v is Checkpoint {
  return v === "one_third" || v === "two_thirds" || v === "end";
}
