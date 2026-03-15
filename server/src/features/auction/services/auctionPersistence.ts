import { prisma } from "../../../db/prisma.js";
import { logger } from "../../../lib/logger.js";
import type { AuctionState } from "../routes.js";

/**
 * Save auction state to DB (upsert). Fire-and-forget — caller should not await.
 */
export async function saveState(leagueId: number, state: AuctionState): Promise<void> {
  try {
    await prisma.auctionSession.upsert({
      where: { leagueId },
      create: { leagueId, state: state as any },
      update: { state: state as any },
    });
  } catch (err) {
    logger.error({ error: String(err), leagueId }, "Failed to persist auction state");
  }
}

/**
 * Load auction state from DB. Returns null if no session exists.
 */
export async function loadState(leagueId: number): Promise<AuctionState | null> {
  try {
    const row = await prisma.auctionSession.findUnique({ where: { leagueId } });
    if (!row) return null;
    return row.state as unknown as AuctionState;
  } catch (err) {
    logger.error({ error: String(err), leagueId }, "Failed to load auction state from DB");
    return null;
  }
}

/**
 * Delete persisted auction state for a league.
 */
export async function clearState(leagueId: number): Promise<void> {
  try {
    await prisma.auctionSession.deleteMany({ where: { leagueId } });
  } catch (err) {
    logger.error({ error: String(err), leagueId }, "Failed to clear auction state from DB");
  }
}
