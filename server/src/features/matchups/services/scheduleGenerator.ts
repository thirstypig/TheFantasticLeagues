// server/src/features/matchups/services/scheduleGenerator.ts

/**
 * Generate a round-robin schedule for N teams across W weeks.
 * Uses the circle method: fix one team, rotate the rest.
 * Returns array of { week, teamAId, teamBId } pairs.
 */
export function generateRoundRobinSchedule(
  teamIds: number[],
  totalWeeks: number,
): { week: number; teamAId: number; teamBId: number }[] {
  const n = teamIds.length;
  if (n < 2) return [];

  // For odd number of teams, add a BYE placeholder (id = -1)
  const teams = [...teamIds];
  if (n % 2 !== 0) teams.push(-1);
  const numTeams = teams.length;
  const roundsInCycle = numTeams - 1;

  const schedule: { week: number; teamAId: number; teamBId: number }[] = [];

  // Circle method: fix teams[0], rotate teams[1..n-1]
  const rotating = teams.slice(1);

  for (let week = 1; week <= totalWeeks; week++) {
    const roundIdx = (week - 1) % roundsInCycle;

    // Rotate the array for this round
    const rotated = [...rotating];
    for (let r = 0; r < roundIdx; r++) {
      rotated.push(rotated.shift()!);
    }

    // Pair up: fixed team vs first rotated, then pairs from ends
    const roundPairs: [number, number][] = [];
    roundPairs.push([teams[0], rotated[0]]);
    for (let i = 1; i < numTeams / 2; i++) {
      roundPairs.push([rotated[i], rotated[numTeams - 2 - i]]);
    }

    for (const [a, b] of roundPairs) {
      // Skip BYE matchups
      if (a === -1 || b === -1) continue;
      schedule.push({ week, teamAId: a, teamBId: b });
    }
  }

  return schedule;
}
