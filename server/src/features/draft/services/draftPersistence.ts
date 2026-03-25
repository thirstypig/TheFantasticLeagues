// server/src/features/draft/services/draftPersistence.ts
import { prisma } from "../../../db/prisma.js";
import { logger } from "../../../lib/logger.js";
import type { DraftState } from "../types.js";

/** Serialize DraftState for JSON storage (convert Sets to arrays). */
function serializeState(state: DraftState): Record<string, unknown> {
  return {
    ...state,
    draftedPlayerIds: Array.from(state.draftedPlayerIds),
    autoPickTeams: Array.from(state.autoPickTeams),
  };
}

/** Deserialize DraftState from JSON storage (convert arrays to Sets). */
export function deserializeState(raw: Record<string, unknown>): DraftState {
  return {
    ...(raw as any),
    draftedPlayerIds: new Set((raw.draftedPlayerIds as number[]) || []),
    autoPickTeams: new Set((raw.autoPickTeams as number[]) || []),
  };
}

/** Save draft state to DB. Unlike auction (fire-and-forget), this AWAITS completion. */
export async function saveState(leagueId: number, state: DraftState): Promise<void> {
  try {
    await prisma.snakeDraftSession.upsert({
      where: { leagueId },
      create: { leagueId, state: serializeState(state) as any },
      update: { state: serializeState(state) as any },
    });
  } catch (err) {
    logger.error({ error: String(err), leagueId }, "Failed to save draft state");
    throw err; // Propagate — picks must not be confirmed without persistence
  }
}

/** Load draft state from DB, or null if no session exists. */
export async function loadState(leagueId: number): Promise<DraftState | null> {
  const session = await prisma.snakeDraftSession.findUnique({ where: { leagueId } });
  if (!session) return null;
  return deserializeState(session.state as Record<string, unknown>);
}

/** Clear draft state (for reset). */
export async function clearState(leagueId: number): Promise<void> {
  await prisma.snakeDraftSession.deleteMany({ where: { leagueId } });
}
