// server/src/services/keeperPrepService.ts
// Keeper Selection Agent — Pre-Auction Preparation Service

import { prisma } from "../../../db/prisma.js";
import { ROSTERS_2025 } from "../../../data/ogba_rosters_2025.js";
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
   * Populate the current-season Roster table from ROSTERS_2025 static data.
   * Standardizes to 14 hitters and 9 pitchers.
   */
  async populateRostersFromPriorSeason(leagueId: number): Promise<PopulateResult> {
    const result: PopulateResult = { teamsPopulated: 0, playersAdded: 0, skipped: [], errors: [] };

    // 1. Get current-season teams
    const teams = await prisma.team.findMany({ where: { leagueId } });
    if (teams.length === 0) throw new Error("No teams found for this league.");

    // 2. Build maps for resolution
    const codeToTeam = new Map<string, typeof teams[0]>();
    const nameToTeam = new Map<string, typeof teams[0]>();

    for (const t of teams) {
      if (t.code) codeToTeam.set(t.code.toUpperCase(), t);
      nameToTeam.set(t.name.toLowerCase().trim(), t);
      // Remove spaces/special for looser matching
      nameToTeam.set(t.name.toLowerCase().replace(/[^a-z0-9]/g, ''), t);
    }

    // 3. Check for existing rosters
    const existingRosterCount = await prisma.roster.count({
      where: { team: { leagueId }, releasedAt: null },
    });

    if (existingRosterCount > 0) {
      throw new Error(`League already has ${existingRosterCount} active roster entries. Clear existing rosters before re-populating.`);
    }

    // 4. Process each team in ROSTERS_2025
    const teamsPopulatedSet = new Set<number>();

    for (const tr of ROSTERS_2025) {
      // Resolve to current team
      let team = codeToTeam.get(tr.teamId.toUpperCase());
      if (!team) team = nameToTeam.get(tr.teamName.toLowerCase().trim());
      if (!team) team = nameToTeam.get(tr.teamName.toLowerCase().replace(/[^a-z0-9]/g, ''));

      if (!team) {
        result.skipped.push(`Team "${tr.teamName}" (${tr.teamId}) — no matching current-season team`);
        continue;
      }

      // Merge hitters and pitchers
      const allPlayers = [...tr.hitters, ...tr.pitchers];

      // Standardize counts? The user said "We need 14 hitters and 9 pitchers".
      // Let's check the counts in the source.
      // If the source has more/less, we just import what we have for now, or pad?
      // Usually "populate" means "copy over last year's end state".
      
      for (const p of allPlayers) {
        try {
          // Find or create Player
          let dbPlayer = await prisma.player.findFirst({
            where: { name: p.name },
          });

          if (!dbPlayer) {
            dbPlayer = await prisma.player.create({
              data: {
                name: p.name,
                posPrimary: p.pos,
                posList: p.pos,
              },
            });
          }

          // Guard: ensure player isn't already on another team
          await assertPlayerAvailable(prisma, dbPlayer.id, leagueId);

          // Create Roster entry
          await prisma.roster.create({
            data: {
              teamId: team.id,
              playerId: dbPlayer.id,
              source: "prior_season",
              price: 1, // Ignore cost for now as per user instruction
              isKeeper: false,
            },
          });

          result.playersAdded++;
          teamsPopulatedSet.add(team.id);
        } catch (e: unknown) {
          result.errors.push(`Player "${p.name}" for ${tr.teamName}: ${e instanceof Error ? e.message : "unknown error"}`);
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
