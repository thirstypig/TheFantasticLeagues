// server/src/services/keeperPrepService.ts
// Keeper Selection Agent — Pre-Auction Preparation Service

import { prisma } from "../../../db/prisma.js";
import { assertPlayerAvailable } from "../../../lib/rosterGuard.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TeamKeeperStatus {
  teamId: number;
  teamName: string;
  teamCode: string | null;
  budget: number;
  rosterCount: number;
  keeperCount: number;
  keeperCost: number;
  keeperLimit: number;
  isLocked: boolean;
}

export interface PopulateResult {
  teamsPopulated: number;
  playersAdded: number;
  skipped: string[];
  errors: string[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class KeeperPrepService {

  /**
   * Read the `keeper_count` rule for a league.  Defaults to 4 if not set.
   */
  async getKeeperLimit(leagueId: number): Promise<number> {
    const rule = await prisma.leagueRule.findUnique({
      where: { leagueId_category_key: { leagueId, category: "draft", key: "keeper_count" } },
    });
    return rule ? Number(rule.value) || 4 : 4;
  }

  /**
   * Check whether keeper selections are locked for this league.
   */
  async isKeepersLocked(leagueId: number): Promise<boolean> {
    const rule = await prisma.leagueRule.findUnique({
      where: { leagueId_category_key: { leagueId, category: "status", key: "keepers_locked" } },
    });
    return rule?.value === "true";
  }

  /**
   * Lock keeper selections.
   */
  async lockKeepers(leagueId: number): Promise<void> {
    await prisma.leagueRule.upsert({
      where: { leagueId_category_key: { leagueId, category: "status", key: "keepers_locked" } },
      create: { leagueId, category: "status", key: "keepers_locked", value: "true", label: "Keepers Locked" },
      update: { value: "true" },
    });
  }

  /**
   * Unlock keeper selections.
   */
  async unlockKeepers(leagueId: number): Promise<void> {
    await prisma.leagueRule.upsert({
      where: { leagueId_category_key: { leagueId, category: "status", key: "keepers_locked" } },
      create: { leagueId, category: "status", key: "keepers_locked", value: "false", label: "Keepers Locked" },
      update: { value: "false" },
    });
  }

  // ─── Roster Population ──────────────────────────────────────────────────────

  /**
   * Populate the current-season Roster table from the prior season's DB data.
   * Finds the prior league by name + (season - 1), copies rosters and owner info.
   */
  async populateRostersFromPriorSeason(leagueId: number): Promise<PopulateResult> {
    const result: PopulateResult = { teamsPopulated: 0, playersAdded: 0, skipped: [], errors: [] };

    // 1. Get current league
    const currentLeague = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!currentLeague) throw new Error("League not found.");

    // 2. Find prior-season league (same name, season - 1)
    const priorLeague = await prisma.league.findFirst({
      where: { name: currentLeague.name, season: currentLeague.season - 1 },
    });
    if (!priorLeague) throw new Error(`No prior season found for "${currentLeague.name}" season ${currentLeague.season - 1}.`);

    // 3. Get current-season teams
    const teams = await prisma.team.findMany({ where: { leagueId } });
    if (teams.length === 0) throw new Error("No teams found for this league.");

    // 4. Get prior-season teams with rosters and ownership
    const priorTeams = await prisma.team.findMany({
      where: { leagueId: priorLeague.id },
      include: {
        rosters: {
          where: { releasedAt: null },
          include: { player: true },
        },
        ownerships: { select: { userId: true } },
      },
    });

    // 5. Build maps for matching current teams
    const codeToTeam = new Map<string, typeof teams[0]>();
    const nameToTeam = new Map<string, typeof teams[0]>();
    for (const t of teams) {
      if (t.code) codeToTeam.set(t.code.toUpperCase(), t);
      nameToTeam.set(t.name.toLowerCase().trim(), t);
      nameToTeam.set(t.name.toLowerCase().replace(/[^a-z0-9]/g, ''), t);
    }

    // 6. Check for existing rosters
    const existingRosterCount = await prisma.roster.count({
      where: { team: { leagueId }, releasedAt: null },
    });
    if (existingRosterCount > 0) {
      throw new Error(`League already has ${existingRosterCount} active roster entries. Clear existing rosters before re-populating.`);
    }

    // 7. Process each prior-season team
    const teamsPopulatedSet = new Set<number>();

    for (const priorTeam of priorTeams) {
      // Match to current team by code, then name
      let currentTeam = priorTeam.code ? codeToTeam.get(priorTeam.code.toUpperCase()) : undefined;
      if (!currentTeam) currentTeam = nameToTeam.get(priorTeam.name.toLowerCase().trim());
      if (!currentTeam) currentTeam = nameToTeam.get(priorTeam.name.toLowerCase().replace(/[^a-z0-9]/g, ''));

      if (!currentTeam) {
        result.skipped.push(`Prior team "${priorTeam.name}" (${priorTeam.code}) — no matching current-season team`);
        continue;
      }

      // Copy owner info if current team doesn't have it
      const ownerUpdates: Record<string, unknown> = {};
      if (!currentTeam.owner && priorTeam.owner) ownerUpdates.owner = priorTeam.owner;
      if (!currentTeam.ownerUserId && priorTeam.ownerUserId) ownerUpdates.ownerUserId = priorTeam.ownerUserId;
      if (!currentTeam.priorTeamId) ownerUpdates.priorTeamId = priorTeam.id;

      if (Object.keys(ownerUpdates).length > 0) {
        await prisma.team.update({ where: { id: currentTeam.id }, data: ownerUpdates });
      }

      // Copy TeamOwnership entries if current team has none
      if (priorTeam.ownerships.length > 0) {
        const existingOwnerships = await prisma.teamOwnership.count({ where: { teamId: currentTeam.id } });
        if (existingOwnerships === 0) {
          for (const o of priorTeam.ownerships) {
            try {
              await prisma.teamOwnership.create({ data: { teamId: currentTeam.id, userId: o.userId } });
            } catch {
              // Ignore duplicates or FK issues
            }
          }
        }
      }

      // Copy roster entries
      for (const roster of priorTeam.rosters) {
        try {
          // Guard: ensure player isn't already on another team in the target league
          await assertPlayerAvailable(prisma, roster.playerId, leagueId);

          await prisma.roster.create({
            data: {
              teamId: currentTeam.id,
              playerId: roster.playerId,
              source: "prior_season",
              price: roster.price,
              isKeeper: false,
            },
          });

          result.playersAdded++;
          teamsPopulatedSet.add(currentTeam.id);
        } catch (e: unknown) {
          result.errors.push(`Player "${roster.player.name}" for ${priorTeam.name}: ${e instanceof Error ? e.message : "unknown error"}`);
        }
      }
    }

    result.teamsPopulated = teamsPopulatedSet.size;
    return result;
  }

  // ─── Keeper Status ──────────────────────────────────────────────────────────

  /**
   * Get keeper readiness summary for every team in the league.
   */
  async getKeeperStatus(leagueId: number): Promise<TeamKeeperStatus[]> {
    const teams = await prisma.team.findMany({
      where: { leagueId },
      orderBy: { name: "asc" },
    });

    const keeperLimit = await this.getKeeperLimit(leagueId);
    const isLocked = await this.isKeepersLocked(leagueId);

    const statuses: TeamKeeperStatus[] = [];

    for (const team of teams) {
      const rosters = await prisma.roster.findMany({
        where: { teamId: team.id, releasedAt: null },
        select: { isKeeper: true, price: true },
      });

      const keeperRosters = rosters.filter((r) => r.isKeeper);

      statuses.push({
        teamId: team.id,
        teamName: team.name,
        teamCode: team.code,
        budget: team.budget,
        rosterCount: rosters.length,
        keeperCount: keeperRosters.length,
        keeperCost: keeperRosters.reduce((sum, r) => sum + r.price, 0),
        keeperLimit,
        isLocked,
      });
    }

    return statuses;
  }

  // ─── Save Keepers ──────────────────────────────────────────────────────────

  /**
   * Save keeper selections for a specific team (commissioner action).
   * Validates keeper count.
   * Hard-enforces the keeper limit.
   */
  async saveKeepersForTeam(
    leagueId: number,
    teamId: number,
    keeperRosterIds: number[]
  ): Promise<{ count: number; cost: number }> {
    // 1. Verify team belongs to league
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.leagueId !== leagueId) throw new Error("Team not found in this league");

    // 2. Validate all roster IDs belong to this team
    const validRosters = await prisma.roster.findMany({
      where: { teamId, id: { in: keeperRosterIds }, releasedAt: null },
    });

    if (validRosters.length !== keeperRosterIds.length) {
      throw new Error(`${keeperRosterIds.length - validRosters.length} invalid roster IDs provided`);
    }

    // 3. Validation
    const keeperLimit = await this.getKeeperLimit(leagueId);
    if (keeperRosterIds.length > keeperLimit) {
      throw new Error(`Keeper limit is ${keeperLimit}. You selected ${keeperRosterIds.length}.`);
    }

    // Cost is ignored for now, so we don't validate budget here as requested.

    // 4. Transaction: reset all → set selected
    await prisma.$transaction(async (tx) => {
      await tx.roster.updateMany({
        where: { teamId },
        data: { isKeeper: false },
      });

      if (keeperRosterIds.length > 0) {
        await tx.roster.updateMany({
          where: { id: { in: keeperRosterIds } },
          data: { isKeeper: true },
        });
      }
    }, { timeout: 30_000 });

    return { count: keeperRosterIds.length, cost: validRosters.reduce((sum, r) => sum + r.price, 0) };
  }
}
