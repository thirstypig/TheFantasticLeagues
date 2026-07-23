import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../db/prisma.js";
import { isLocalThrowawayDbUrl } from "../../../test-support/dbSafety.js";
import type { DraftState } from "../types.js";

// SAFETY GUARD: this suite's beforeEach runs UNSCOPED `deleteMany({})` against
// every core table — it wipes the entire database it connects to. It must FAIL
// CLOSED: it runs ONLY when BOTH (a) DATABASE_URL's host is local loopback AND
// (b) ALLOW_DESTRUCTIVE_DB_TESTS=1 is set deliberately. A misconfigured
// DATABASE_URL alone can never trigger the wipe — neither can a guard
// false-positive, an SSH tunnel, or CI (which sets neither). See
// test-support/dbSafety.ts + its unit test.
// TODO(week2/ci): replace with a scoped per-test dataset + a dedicated CI
// Postgres service so these integration tests actually run in CI.
const DESTRUCTIVE_DB_TESTS_OK =
  isLocalThrowawayDbUrl(process.env.DATABASE_URL) &&
  process.env.ALLOW_DESTRUCTIVE_DB_TESTS === "1";

describe.skipIf(!DESTRUCTIVE_DB_TESTS_OK)("Draft Integration Tests", () => {
  let testLeagueId: number;
  let testTeamIds: number[];

  beforeEach(async () => {
    // Clean up test data.
    //
    // The old hand-ordered deleteMany() chain deleted only draftPick / snakeDraftSession
    // / roster before team — but Team has 11 other non-cascading children
    // (RosterSlotEvent, TeamStats{Period,CategoryDaily,Season}, FinanceLedger, Trade,
    // TradeItem, WaiverClaim, Waiver{Add,Drop}Entry, Matchup). A second `it`'s beforeEach
    // hit `team.deleteMany()` while RosterSlotEvent rows from the first test still
    // referenced those teams → P2003 FK violation (RosterSlotEvent_teamId_fkey). This has
    // failed the db-integration CI job on every branch since 2026-07-11.
    //
    // TRUNCATE ... CASCADE removes dependents regardless of FK order, so a future child
    // table can never re-break this the way the enumerated chain did. Blast radius is
    // identical to the previous unscoped deleteMany({}) chain and is already gated to a
    // local throwaway DB by DESTRUCTIVE_DB_TESTS_OK above.
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "User", "Player", "Team", "League", "Franchise" RESTART IDENTITY CASCADE',
    );

    // Create test franchise and league
    const franchise = await prisma.franchise.upsert({
      where: { name: "Test Franchise" },
      create: { name: "Test Franchise" },
      update: {},
    });

    const league = await prisma.league.create({
      data: {
        name: `Test Draft League ${Date.now()}`,
        season: 2026,
        sport: "MLB",
        draftMode: "DRAFT",
        franchiseId: franchise.id,
      },
    });
    testLeagueId = league.id;

    // Create test users for team owners
    const users = [];
    for (let i = 0; i < 4; i++) {
      const user = await prisma.user.create({
        data: {
          email: `owner${i}@test.draft`,
          name: `Owner ${i + 1}`,
        },
      });
      users.push(user.id);
    }

    // Create test teams
    const teams = [];
    for (let i = 0; i < 4; i++) {
      const team = await prisma.team.create({
        data: {
          name: `Test Team ${i + 1}`,
          code: `T${i + 1}`,
          leagueId: testLeagueId,
          ownerUserId: users[i],
        },
      });
      teams.push(team.id);
    }
    testTeamIds = teams;

    // Create test players
    for (let i = 0; i < 20; i++) {
      const pos = ["C", "1B", "SS", "OF"][i % 4];
      await prisma.player.create({
        data: {
          mlbId: 100000 + i,
          name: `Player ${i + 1}`,
          posPrimary: pos,
          posList: pos,
          mlbTeam: "NYY",
        },
      });
    }
  });

  describe("Pick conflict detection", () => {
    it("should prevent the same player from being picked twice", async () => {
      const players = await prisma.player.findMany({ take: 2 });
      const [player1, player2] = players;

      // Create first pick
      await prisma.draftPick.create({
        data: {
          leagueId: testLeagueId,
          round: 1,
          pickNum: 1,
          teamId: testTeamIds[0],
          playerId: player1.id,
        },
      });

      // Try to create duplicate pick (same player)
      const duplicatePickAttempt = async () => {
        // Simulate validation that would happen on API
        const existingPick = await prisma.draftPick.findFirst({
          where: {
            leagueId: testLeagueId,
            playerId: player1.id,
          },
        });

        if (existingPick) {
          throw new Error(`Player ${player1.id} already drafted`);
        }

        return prisma.draftPick.create({
          data: {
            leagueId: testLeagueId,
            round: 1,
            pickNum: 2,
            teamId: testTeamIds[1],
            playerId: player1.id,
          },
        });
      };

      await expect(duplicatePickAttempt()).rejects.toThrow("Player");
    });

    it("should allow multiple picks by different teams", async () => {
      const players = await prisma.player.findMany({ take: 4 });

      for (let i = 0; i < 4; i++) {
        const pick = await prisma.draftPick.create({
          data: {
            leagueId: testLeagueId,
            round: 1,
            pickNum: i + 1,
            teamId: testTeamIds[i],
            playerId: players[i].id,
          },
        });

        expect(pick.teamId).toBe(testTeamIds[i]);
        expect(pick.playerId).toBe(players[i].id);
      }

      const picks = await prisma.draftPick.findMany({
        where: { leagueId: testLeagueId },
      });
      expect(picks).toHaveLength(4);
    });
  });

  describe("Snake draft pick order", () => {
    it("should enforce correct pick order across rounds", async () => {
      // Simulate a 2-round snake draft with 4 teams
      // Round 1: Teams 1, 2, 3, 4
      // Round 2: Teams 4, 3, 2, 1 (reversed)
      const players = await prisma.player.findMany({ take: 8 });

      const expectedOrder = [
        { round: 1, team: testTeamIds[0], pickNum: 1 },
        { round: 1, team: testTeamIds[1], pickNum: 2 },
        { round: 1, team: testTeamIds[2], pickNum: 3 },
        { round: 1, team: testTeamIds[3], pickNum: 4 },
        { round: 2, team: testTeamIds[3], pickNum: 5 }, // Reversed
        { round: 2, team: testTeamIds[2], pickNum: 6 },
        { round: 2, team: testTeamIds[1], pickNum: 7 },
        { round: 2, team: testTeamIds[0], pickNum: 8 },
      ];

      for (let i = 0; i < expectedOrder.length; i++) {
        const expected = expectedOrder[i];
        await prisma.draftPick.create({
          data: {
            leagueId: testLeagueId,
            round: expected.round,
            pickNum: expected.pickNum,
            teamId: expected.team,
            playerId: players[i].id,
          },
        });
      }

      // Verify picks are in correct order
      const picks = await prisma.draftPick.findMany({
        where: { leagueId: testLeagueId },
        orderBy: { pickNum: "asc" },
      });

      expect(picks).toHaveLength(8);
      for (let i = 0; i < expectedOrder.length; i++) {
        const expected = expectedOrder[i];
        expect(picks[i].round).toBe(expected.round);
        expect(picks[i].teamId).toBe(expected.team);
        expect(picks[i].pickNum).toBe(expected.pickNum);
      }
    });
  });

  describe("Draft state persistence", () => {
    it("should save and load draft state correctly", async () => {
      const draftState: DraftState = {
        leagueId: testLeagueId,
        status: "active",
        config: {
          totalRounds: 10,
          secondsPerPick: 120,
          orderType: "SNAKE",
          teamOrder: testTeamIds,
        },
        pickOrder: testTeamIds,
        currentPickIndex: 0,
        picks: [],
        draftedPlayerIds: new Set<number>(),
        autoPickTeams: new Set<number>(),
        timerExpiresAt: null,
      };

      // Save state
      const session = await prisma.snakeDraftSession.create({
        data: {
          leagueId: testLeagueId,
          state: {
            ...draftState,
            draftedPlayerIds: Array.from(draftState.draftedPlayerIds),
            autoPickTeams: Array.from(draftState.autoPickTeams),
          } as any,
        },
      });

      expect(session.leagueId).toBe(testLeagueId);

      // Load state
      const loaded = await prisma.snakeDraftSession.findUnique({
        where: { leagueId: testLeagueId },
      });

      expect(loaded).toBeDefined();
      expect(loaded?.state).toBeDefined();
      const state = loaded?.state as any;
      expect(state.status).toBe("active");
      expect(state.config.totalRounds).toBe(10);
      expect(state.config.orderType).toBe("SNAKE");
    });
  });
});
