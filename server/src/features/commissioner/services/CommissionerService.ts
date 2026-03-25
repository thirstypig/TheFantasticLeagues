import { prisma } from "../../../db/prisma.js";
import { logger } from "../../../lib/logger.js";
import { norm, slugify } from "../../../lib/utils.js";
import { assertPlayerAvailable } from "../../../lib/rosterGuard.js";
import { AuctionImportService } from "../../auction/services/auctionImport.js";
import { DEFAULT_RULES } from "../../../lib/sportConfig.js";
import { sendInviteEmail } from "../../../lib/emailService.js";

const auctionImportService = new AuctionImportService();

export class CommissionerService {
  /**
   * League Management
   */
// ... existing methods ...
  /**
   * Rules Management
   */
  async createLeague(data: {
    name: string;
    season: number;
    draftMode: "AUCTION" | "DRAFT";
    draftOrder?: "SNAKE" | "LINEAR";
    scoringFormat?: string;
    isPublic: boolean;
    publicSlug?: string;
    copyFromLeagueId?: number;
    creatorUserId: number;
  }) {
    const {
      name,
      season,
      draftMode,
      draftOrder,
      scoringFormat,
      isPublic,
      publicSlug: publicSlugInput,
      copyFromLeagueId,
      creatorUserId,
    } = data;

    const baseSlug = slugify(publicSlugInput || `${name}-${season}`);
    const publicSlug = isPublic ? baseSlug : null;

    // 1. Resolve or create Franchise
    let franchiseId: number;
    if (copyFromLeagueId && copyFromLeagueId > 0) {
      // Reuse the source league's franchise
      const source = await prisma.league.findUnique({
        where: { id: copyFromLeagueId },
        select: { franchiseId: true },
      });
      if (source) {
        franchiseId = source.franchiseId;
      } else {
        // Source not found — create new franchise
        const franchise = await prisma.franchise.create({
          data: { name, isPublic },
        });
        franchiseId = franchise.id;
      }
    } else {
      // Check if franchise with this name exists, otherwise create
      const existing = await prisma.franchise.findUnique({ where: { name } });
      if (existing) {
        franchiseId = existing.id;
      } else {
        const franchise = await prisma.franchise.create({
          data: { name, isPublic },
        });
        franchiseId = franchise.id;
      }
    }

    // 2. Create League with franchise link
    const league = await prisma.league.create({
      data: {
        name,
        season,
        draftMode,
        draftOrder: draftOrder || undefined,
        scoringFormat: scoringFormat || "ROTO",
        isPublic,
        publicSlug: publicSlug || undefined,
        franchiseId,
      },
    });

    // 3. Add Creator as Commissioner (league-level for backwards compat)
    await prisma.leagueMembership.upsert({
      where: {
        leagueId_userId: { leagueId: league.id, userId: creatorUserId },
      },
      create: {
        leagueId: league.id,
        userId: creatorUserId,
        role: "COMMISSIONER",
      },
      update: {
        role: "COMMISSIONER",
      },
    });

    // 4. Ensure FranchiseMembership for creator
    await prisma.franchiseMembership.upsert({
      where: {
        franchiseId_userId: { franchiseId, userId: creatorUserId },
      },
      create: {
        franchiseId,
        userId: creatorUserId,
        role: "COMMISSIONER",
      },
      update: {},
    });

    // 5. Create Season record in SETUP status
    try {
      await prisma.season.create({
        data: { leagueId: league.id, year: season, status: "SETUP" },
      });
    } catch (e) {
      logger.warn({ error: String(e), leagueId: league.id, season }, "Season record already exists or failed to create");
    }

    // 6. Copy Data (if requested)
    if (copyFromLeagueId && copyFromLeagueId > 0) {
      await this.copyLeagueData(league.id, copyFromLeagueId, creatorUserId);
    }

    return league;
  }

  private async copyLeagueData(
    targetLeagueId: number,
    sourceLeagueId: number,
    creatorUserId: number,
  ) {
    logger.info({ sourceLeagueId, targetLeagueId }, "Copying league data");

    // 1. Copy Teams — build source→target mapping for roster copy
    const sourceTeams = await prisma.team.findMany({
      where: { leagueId: sourceLeagueId },
      include: {
        rosters: {
          where: { releasedAt: null },
          select: { playerId: true, price: true, source: true },
        },
        ownerships: { select: { userId: true } },
      },
    });

    const teamIdMap = new Map<number, number>(); // sourceTeamId → targetTeamId
    for (const t of sourceTeams) {
      try {
        const newTeam = await prisma.team.create({
          data: {
            leagueId: targetLeagueId,
            name: t.name,
            code: t.code,
            owner: t.owner,
            ownerUserId: t.ownerUserId,
            budget: t.budget,
            priorTeamId: t.id,
          },
        });
        teamIdMap.set(t.id, newTeam.id);

        // Copy TeamOwnership entries
        for (const o of t.ownerships) {
          try {
            await prisma.teamOwnership.create({
              data: { teamId: newTeam.id, userId: o.userId },
            });
          } catch {
            // Ignore duplicates or FK issues
          }
        }
      } catch (e) {
        logger.warn({ error: String(e), teamName: t.name }, "Failed to copy team");
      }
    }

    // 2. Copy Memberships
    const sourceMembers = await prisma.leagueMembership.findMany({
      where: { leagueId: sourceLeagueId },
    });
    for (const m of sourceMembers) {
      if (m.userId === creatorUserId) continue; // Already added
      try {
        await prisma.leagueMembership.create({
          data: {
            leagueId: targetLeagueId,
            userId: m.userId,
            role: m.role,
          },
        });
      } catch (e) {
        logger.warn({ error: String(e), userId: m.userId }, "Failed to copy member");
      }
    }

    // 3. Copy Rules
    const sourceRules = await prisma.leagueRule.findMany({
      where: { leagueId: sourceLeagueId },
    });
    if (sourceRules.length > 0) {
      await prisma.leagueRule.createMany({
        data: sourceRules.map((r) => ({
          leagueId: targetLeagueId,
          category: r.category,
          key: r.key,
          value: r.value,
          label: r.label,
          isLocked: false,
        })),
      });
    }

    // 4. Copy Rosters directly from source teams using the team ID map
    // This is more reliable than populateRostersFromPriorSeason() which
    // re-discovers the source league via franchiseId + season - 1.
    let playersAdded = 0;
    const rosterErrors: string[] = [];
    for (const sourceTeam of sourceTeams) {
      const targetTeamId = teamIdMap.get(sourceTeam.id);
      if (!targetTeamId) continue; // Team copy failed earlier

      for (const roster of sourceTeam.rosters) {
        try {
          // No assertPlayerAvailable guard here: source data is already validated,
          // and two-way players (e.g. Ohtani as DH + P) legitimately appear on 2 teams.
          await prisma.roster.create({
            data: {
              teamId: targetTeamId,
              playerId: roster.playerId,
              source: "prior_season",
              price: roster.price,
              isKeeper: false,
            },
          });
          playersAdded++;
        } catch (e) {
          const msg = `Team ${sourceTeam.name}, playerId ${roster.playerId}: ${e instanceof Error ? e.message : String(e)}`;
          rosterErrors.push(msg);
          logger.warn(
            { error: String(e), sourceTeamId: sourceTeam.id, playerId: roster.playerId },
            "Failed to copy roster entry during season copy",
          );
        }
      }
    }

    logger.info(
      { targetLeagueId, sourceLeagueId, teamsCopied: teamIdMap.size, playersAdded, rosterErrors: rosterErrors.length },
      "Season copy complete",
    );
    if (rosterErrors.length > 0) {
      logger.warn({ rosterErrors }, "Roster copy errors during season copy");
    }
  }

  async addMember(
    leagueId: number,
    data: {
      userId?: number;
      email?: string;
      role: "COMMISSIONER" | "OWNER";
      invitedBy: number;
    },
  ): Promise<{ status: "added" | "invited"; membership?: any; invite?: any }> {
    const { userId: userIdRaw, email: emailRaw, role, invitedBy } = data;

    let userId: number | null = null;

    if (userIdRaw != null) {
      userId = userIdRaw;
    } else if (emailRaw) {
      const email = emailRaw.toLowerCase().trim();
      const u = await prisma.user.findUnique({ where: { email } });
      if (!u) {
        // User hasn't signed up yet — create a pending invite
        const invite = await this.createInvite(leagueId, email, role, invitedBy);
        return { status: "invited", invite };
      }
      userId = u.id;
    } else {
      throw new Error("Provide userId or email");
    }

    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) throw new Error("League not found");

    // Ensure FranchiseMembership exists (don't downgrade existing role)
    await prisma.franchiseMembership.upsert({
      where: {
        franchiseId_userId: { franchiseId: league.franchiseId, userId },
      },
      create: {
        franchiseId: league.franchiseId,
        userId,
        role,
      },
      update: {},
    });

    const membership = await prisma.leagueMembership.upsert({
      where: { leagueId_userId: { leagueId, userId } },
      create: { leagueId, userId, role },
      update: { role },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            isAdmin: true,
          },
        },
      },
    });

    return { status: "added", membership };
  }

  /**
   * Create a pending invite for an email that hasn't signed up yet.
   */
  private async createInvite(
    leagueId: number,
    email: string,
    role: "COMMISSIONER" | "OWNER",
    invitedBy: number,
  ) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30-day expiry

    const invite = await prisma.leagueInvite.upsert({
      where: { leagueId_email: { leagueId, email } },
      create: {
        leagueId,
        email,
        role,
        invitedBy,
        status: "PENDING",
        expiresAt,
      },
      update: {
        role,
        invitedBy,
        status: "PENDING",
        expiresAt,
      },
    });

    // Fire-and-forget: send invite email
    const [league, inviter] = await Promise.all([
      prisma.league.findUnique({ where: { id: leagueId }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: invitedBy }, select: { name: true, email: true } }),
    ]);
    sendInviteEmail({
      to: email,
      leagueName: league?.name ?? "a fantasy league",
      role,
      inviterName: inviter?.name ?? inviter?.email ?? "A commissioner",
    }).catch(() => {}); // swallow — already logged inside sendInviteEmail

    return invite;
  }

  /**
   * Accept all pending invites for a user (called on first login).
   */
  async acceptPendingInvites(userId: number, email: string): Promise<number> {
    const pendingInvites = await prisma.leagueInvite.findMany({
      where: {
        email: email.toLowerCase().trim(),
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      include: {
        league: { select: { franchiseId: true } },
      },
    });

    if (pendingInvites.length === 0) return 0;

    let accepted = 0;
    for (const invite of pendingInvites) {
      // Create LeagueMembership
      await prisma.leagueMembership.upsert({
        where: { leagueId_userId: { leagueId: invite.leagueId, userId } },
        create: { leagueId: invite.leagueId, userId, role: invite.role },
        update: { role: invite.role },
      });

      // Create FranchiseMembership
      await prisma.franchiseMembership.upsert({
        where: {
          franchiseId_userId: {
            franchiseId: invite.league.franchiseId,
            userId,
          },
        },
        create: {
          franchiseId: invite.league.franchiseId,
          userId,
          role: invite.role,
        },
        update: {},
      });

      // Mark invite as accepted
      await prisma.leagueInvite.update({
        where: { id: invite.id },
        data: { status: "ACCEPTED" },
      });

      accepted++;
    }

    logger.info({ userId, email, accepted }, "Auto-accepted pending invites");
    return accepted;
  }

  /**
   * Get pending invites for a league.
   */
  async getInvites(leagueId: number) {
    return prisma.leagueInvite.findMany({
      where: { leagueId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Cancel a pending invite.
   */
  async changeMemberRole(leagueId: number, membershipId: number, role: "COMMISSIONER" | "OWNER") {
    const membership = await prisma.leagueMembership.findUnique({
      where: { id: membershipId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!membership || membership.leagueId !== leagueId) {
      throw new Error("Membership not found");
    }
    return prisma.leagueMembership.update({
      where: { id: membershipId },
      data: { role },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  }

  async removeMember(leagueId: number, membershipId: number) {
    const membership = await prisma.leagueMembership.findUnique({
      where: { id: membershipId },
    });
    if (!membership || membership.leagueId !== leagueId) {
      throw new Error("Membership not found");
    }
    // Also remove any team ownerships for this user in this league
    await prisma.teamOwnership.deleteMany({
      where: {
        userId: membership.userId,
        team: { leagueId },
      },
    });
    return prisma.leagueMembership.delete({
      where: { id: membershipId },
    });
  }

  async cancelInvite(leagueId: number, inviteId: number) {
    const invite = await prisma.leagueInvite.findUnique({
      where: { id: inviteId },
    });
    if (!invite || invite.leagueId !== leagueId) {
      throw new Error("Invite not found");
    }
    if (invite.status !== "PENDING") {
      throw new Error("Can only cancel pending invites");
    }
    return prisma.leagueInvite.update({
      where: { id: inviteId },
      data: { status: "CANCELLED" },
    });
  }

  /**
   * Team Management
   */
  async createTeam(
    leagueId: number,
    data: {
      name: string;
      code?: string;
      owner?: string;
      budget?: number;
      priorTeamId?: number;
    },
  ) {
    const { name, code, owner, budget, priorTeamId } = data;

    return await prisma.team.create({
      data: {
        leagueId,
        name: norm(name),
        code: code ? norm(code).toUpperCase() : undefined,
        owner: owner ? norm(owner) : undefined,
        budget: budget,
        priorTeamId: priorTeamId,
      },
      include: {
        ownerUser: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            isAdmin: true,
          },
        },
        ownerships: {
          include: { user: { select: { id: true, email: true, name: true } } },
        },
      },
    });
  }

  async addTeamOwner(
    leagueId: number,
    teamId: number,
    data: { userId?: number; email?: string; ownerName?: string },
  ) {
    const { userId: userIdRaw, email: emailRaw, ownerName } = data;

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { ownerships: true },
    });
    if (!team || team.leagueId !== leagueId) throw new Error("Team not found");

    if (team.ownerships.length >= 2)
      throw new Error("Team already has 2 owners. Remove one first.");

    let userId: number;

    if (userIdRaw) {
      userId = userIdRaw;
    } else if (emailRaw) {
      const u = await prisma.user.findUnique({
        where: { email: emailRaw.toLowerCase().trim() },
      });
      if (!u) throw new Error("User not found by email");
      userId = u.id;
    } else {
      throw new Error("Provide userId or email");
    }

    // Check existing
    if (team.ownerships.some((o) => o.userId === userId)) {
      throw new Error("User is already an owner of this team");
    }

    // Ensure league membership
    await prisma.leagueMembership.upsert({
      where: { leagueId_userId: { leagueId, userId } },
      create: { leagueId, userId, role: "OWNER" },
      update: {},
    });

    // Ensure franchise membership
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { franchiseId: true },
    });
    if (league) {
      await prisma.franchiseMembership.upsert({
        where: {
          franchiseId_userId: { franchiseId: league.franchiseId, userId },
        },
        create: {
          franchiseId: league.franchiseId,
          userId,
          role: "OWNER",
        },
        update: {},
      });
    }

    await prisma.teamOwnership.create({
      data: { teamId, userId },
    });

    // Update legacy fields if first owner
    if (team.ownerships.length === 0) {
      await prisma.team.update({
        where: { id: teamId },
        data: {
          ownerUserId: userId,
          owner: ownerName || undefined,
        },
      });
    }

    return this.getTeam(teamId);
  }

  async removeTeamOwner(leagueId: number, teamId: number, userId: number) {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.leagueId !== leagueId) throw new Error("Team not found");

    await prisma.teamOwnership.deleteMany({ where: { teamId, userId } });

    // Clean up legacy if needed
    if (team.ownerUserId === userId) {
      const nextOwner = await prisma.teamOwnership.findFirst({
        where: { teamId },
        include: { user: true },
      });
      await prisma.team.update({
        where: { id: teamId },
        data: {
          ownerUserId: nextOwner?.userId || null,
          owner: nextOwner?.user?.name || null,
        },
      });
    }

    return this.getTeam(teamId);
  }

  async deleteTeam(leagueId: number, teamId: number) {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { ownerships: true },
    });

    if (!team || team.leagueId !== leagueId) {
      throw new Error("Team not found in this league");
    }

    // Check if team has any rosters that aren't just keeper placeholders?
    // Actually, usually deletion is fine if auction hasn't happened or if commissioner is cleaning up.
    // If it's during a season, we might want to prevent deletion, but let's allow it for now as requested.

    await prisma.$transaction(async (tx) => {
      // Delete associated data
      await tx.teamOwnership.deleteMany({ where: { teamId } });
      await tx.roster.deleteMany({ where: { teamId } });
      await tx.teamStatsPeriod.deleteMany({ where: { teamId } });
      await tx.financeLedger.deleteMany({ where: { teamId } });
      await tx.auctionBid.deleteMany({ where: { teamId } });
      await tx.waiverClaim.deleteMany({ where: { teamId } });
      
      // Release player relations in TransactionEvent if any
      await tx.transactionEvent.updateMany({
        where: { teamId },
        data: { teamId: null }
      });

      // Finally delete the team
      await tx.team.delete({ where: { id: teamId } });
    }, { timeout: 30_000 });

    return { success: true };
  }

  private async getTeam(teamId: number) {
    return prisma.team.findUnique({
      where: { id: teamId },
      include: {
        ownerUser: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            isAdmin: true,
          },
        },
        ownerships: {
          include: { user: { select: { id: true, email: true, name: true } } },
        },
      },
    });
  }

  /**
   * Roster / Player Operations
   */
  async assignPlayer(
    leagueId: number,
    data: {
      teamId: number;
      mlbId?: number;
      name: string;
      posPrimary: string;
      posList?: string;
      price?: number;
      source?: string;
    },
  ) {
    const {
      teamId,
      mlbId,
      name,
      posPrimary,
      posList,
      price = 1,
      source = "manual",
    } = data;

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.leagueId !== leagueId)
      throw new Error("Team not found in this league");

    // 1. Resolve Player
    let player = mlbId
      ? await prisma.player.findFirst({ where: { mlbId } })
      : null;
    if (!player) {
      player = await prisma.player.findFirst({
        where: { name: norm(name), posPrimary: norm(posPrimary) },
      });
    }

    if (!player) {
      player = await prisma.player.create({
        data: {
          mlbId,
          name: norm(name),
          posPrimary: norm(posPrimary),
          posList: norm(posList) || norm(posPrimary),
        },
      });
    } else {
      // Refresh player data non-destructively
      player = await prisma.player.update({
        where: { id: player.id },
        data: {
          mlbId: mlbId ?? player.mlbId ?? undefined,
          posList: posList ? norm(posList) : undefined,
        },
      });
    }

    // 2. Release from any other active roster in this league
    await prisma.roster.updateMany({
      where: { playerId: player.id, releasedAt: null, team: { leagueId } },
      data: { releasedAt: new Date() },
    });

    // 3. Guard: ensure player isn't on another team in this league
    await assertPlayerAvailable(prisma, player.id, leagueId);

    // 4. Create Roster Entry
    return await prisma.roster.create({
      data: {
        teamId,
        playerId: player.id,
        source,
        price: Number(price),
      },
      include: {
        player: true,
      },
    });
  }

  async releasePlayer(
    leagueId: number,
    data: { rosterId?: number; teamId?: number; playerId?: number },
  ) {
    const { rosterId, teamId, playerId } = data;

    if (rosterId) {
      const r = await prisma.roster.findUnique({
        where: { id: rosterId },
        include: { team: true },
      });
      if (!r || r.team.leagueId !== leagueId)
        throw new Error("Roster item not found in league");

      return await prisma.roster.update({
        where: { id: rosterId },
        data: { releasedAt: new Date() },
      });
    }

    if (teamId && playerId) {
      // verify team in league
      const team = await prisma.team.findUnique({ where: { id: teamId } });
      if (!team || team.leagueId !== leagueId)
        throw new Error("Team not found");

      await prisma.roster.updateMany({
        where: { teamId, playerId, releasedAt: null },
        data: { releasedAt: new Date() },
      });
      return { success: true };
    }

    throw new Error("Invalid release params");
  }

  async importRosters(leagueId: number, csvContent: string) {
    return auctionImportService.importRostersFromCsv(leagueId, csvContent);
  }

  /**
   * League Update
   */
  async updateLeague(leagueId: number, data: { name?: string }) {
    return prisma.league.update({
      where: { id: leagueId },
      data: { name: data.name },
    });
  }

  /**
   * Rules Management
   */
  async getRules(leagueId: number) {
      let rules = await prisma.leagueRule.findMany({
          where: { leagueId },
          orderBy: [{ category: "asc" }, { key: "asc" }],
      });

      // If no rules exist, create defaults
      if (rules.length === 0) {
        await prisma.leagueRule.createMany({
          data: DEFAULT_RULES.map((r) => ({ ...r, leagueId })),
        });
        rules = await prisma.leagueRule.findMany({
          where: { leagueId },
          orderBy: [{ category: "asc" }, { key: "asc" }],
        });
      }
      return rules;
  }

  async updateRules(leagueId: number, updates: { id: number; value: string }[]) {
       // Check if rules are locked
      const lockedRule = await prisma.leagueRule.findFirst({
        where: { leagueId, isLocked: true },
      });

      if (lockedRule) {
        throw new Error("Rules are locked for this season");
      }

      // Check if any Season has moved past SETUP (rules locked after draft starts)
      const activeSeason = await prisma.season.findFirst({
        where: { leagueId, status: { not: "SETUP" } },
      });

      if (activeSeason) {
        throw new Error("Rules cannot be changed after season setup.");
      }

      // Verify all rule IDs belong to this league (prevent IDOR)
      const ruleIds = updates.map(u => u.id);
      const ownedRules = await prisma.leagueRule.findMany({
        where: { id: { in: ruleIds }, leagueId },
        select: { id: true },
      });
      const ownedIds = new Set(ownedRules.map(r => r.id));
      const unauthorized = ruleIds.filter(id => !ownedIds.has(id));
      if (unauthorized.length > 0) {
        throw new Error("One or more rule IDs do not belong to this league");
      }

      const results = await Promise.all(
        updates.map((u) =>
          prisma.leagueRule.update({
            where: { id: u.id },
            data: { value: u.value },
          })
        )
      );
      return results.length;
  }

  async lockRules(leagueId: number) {
      await prisma.leagueRule.updateMany({
        where: { leagueId },
        data: { isLocked: true },
      });
      return true;
  }

  async unlockRules(leagueId: number) {
      await prisma.leagueRule.updateMany({
        where: { leagueId },
        data: { isLocked: false },
      });
      return true;
  }

  /**
   * End Auction — snapshot rosters into RosterEntry archive + flag auction complete
   */
  async endAuction(leagueId: number) {
    const activeRosters = await prisma.roster.findMany({
      where: { team: { leagueId }, releasedAt: null },
      include: { team: true, player: true },
    });

    const currentLeague = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { season: true },
    });
    const leagueSeason = currentLeague?.season ?? new Date().getFullYear();

    const count = await prisma.$transaction(async (tx) => {
      let created = 0;
      for (const r of activeRosters) {
        await tx.rosterEntry.create({
          data: {
            year: leagueSeason,
            teamCode: r.team.code || r.team.name.substring(0, 3).toUpperCase(),
            playerName: r.player.name,
            position: r.player.posPrimary,
            mlbTeam: null,
            acquisitionCost: r.price,
          },
        });
        created++;
      }

      await tx.leagueRule.upsert({
        where: { leagueId_category_key: { leagueId, category: "status", key: "auction_complete" } },
        create: { leagueId, category: "status", key: "auction_complete", value: "true", label: "Auction Complete" },
        update: { value: "true" },
      });

      return created;
    }, { timeout: 30_000 });

    return { snapshotted: count };
  }

  /**
   * Execute Trade — commissioner direct trade (no proposal/accept flow)
   */
  async executeTrade(
    leagueId: number,
    items: Array<{
      senderId: number;
      recipientId: number;
      assetType: string;
      playerId?: number | null;
      amount?: number | null;
      pickRound?: number | null;
    }>,
  ) {
    // Verify all teams belong to this league
    const involvedTeamIds = [...new Set<number>(items.flatMap((i) => [i.senderId, i.recipientId]))];
    const teams = await prisma.team.findMany({
      where: { id: { in: involvedTeamIds } },
      select: { id: true, leagueId: true },
    });
    if (teams.length !== involvedTeamIds.length || teams.some((t) => t.leagueId !== leagueId)) {
      throw new Error("All teams must belong to this league");
    }

    const proposerId = items[0].senderId;

    const trade = await prisma.$transaction(async (tx) => {
      const trade = await tx.trade.create({
        data: {
          leagueId,
          proposerId,
          status: "PROCESSED",
          processedAt: new Date(),
          items: {
            create: items.map((item) => ({
              senderId: item.senderId,
              recipientId: item.recipientId,
              assetType: item.assetType,
              playerId: item.playerId ?? undefined,
              amount: item.amount ?? undefined,
              pickRound: item.pickRound ?? undefined,
            })),
          },
        } as any, // Prisma nested-create typing limitation: items.create not recognized in strict mode
        include: { items: true },
      });

      for (const item of (trade as any).items) { // Prisma nested-create typing limitation: items not typed on return
        if (item.assetType === "PLAYER" && item.playerId) {
          const rosterEntry = await tx.roster.findFirst({
            where: { teamId: item.senderId, playerId: item.playerId, releasedAt: null },
          });

          if (rosterEntry) {
            await tx.roster.update({
              where: { id: rosterEntry.id },
              data: { releasedAt: new Date(), source: "TRADE_OUT" },
            });

            await assertPlayerAvailable(tx, item.playerId, leagueId);

            await tx.roster.create({
              data: {
                teamId: item.recipientId,
                playerId: item.playerId,
                source: "TRADE_IN",
                acquiredAt: new Date(),
                price: rosterEntry.price,
                assignedPosition: null,
              },
            });
          }
        } else if (item.assetType === "BUDGET") {
          const transferAmount = item.amount || 0;
          if (transferAmount > 0) {
            const sender = await tx.team.findUnique({
              where: { id: item.senderId },
              select: { budget: true },
            });
            if (!sender || sender.budget < transferAmount) {
              throw new Error(
                `Insufficient budget: team ${item.senderId} has $${sender?.budget ?? 0} but trade requires $${transferAmount}`,
              );
            }
          }
          await tx.team.update({
            where: { id: item.senderId },
            data: { budget: { decrement: transferAmount } },
          });
          await tx.team.update({
            where: { id: item.recipientId },
            data: { budget: { increment: transferAmount } },
          });
        }
      }

      return trade;
    }, { timeout: 30_000 });

    return trade;
  }
}
