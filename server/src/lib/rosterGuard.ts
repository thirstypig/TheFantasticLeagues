// server/src/lib/rosterGuard.ts
// Shared guard: prevents duplicate players within a league

type PrismaLike = {
  roster: {
    findFirst: (args: any) => Promise<any>;
  };
};

/**
 * Throws if the player is already on an active roster in this league.
 * Works with both the global `prisma` client and a transaction client (`tx`).
 */
export async function assertPlayerAvailable(
  tx: PrismaLike,
  playerId: number,
  leagueId: number,
): Promise<void> {
  const existing = await tx.roster.findFirst({
    where: {
      playerId,
      releasedAt: null,
      team: { leagueId },
    },
    include: {
      player: { select: { name: true } },
      team: { select: { name: true } },
    },
  });

  if (existing) {
    const playerName = existing.player?.name ?? `Player #${playerId}`;
    const teamName = existing.team?.name ?? `Team #${existing.teamId}`;
    throw new Error(
      `${playerName} is already on ${teamName}'s active roster in this league`,
    );
  }
}
