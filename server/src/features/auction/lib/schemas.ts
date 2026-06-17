import { z } from "zod";

export const nominateSchema = z.object({
  leagueId: z.number().int().positive(),
  nominatorTeamId: z.number().int().positive(),
  playerId: z.string().min(1).max(20),
  playerName: z.string().min(1).max(200),
  startBid: z.number().int().min(1).max(999),
  positions: z.string().min(1).max(100),
  team: z.string().max(10).optional().default(""),
  isPitcher: z.boolean(),
});

export const bidSchema = z.object({
  leagueId: z.number().int().positive(),
  bidderTeamId: z.number().int().positive(),
  amount: z.number().int().min(1).max(999),
});

export const proxyBidSchema = z.object({
  leagueId: z.number().int().positive(),
  bidderTeamId: z.number().int().positive(),
  maxBid: z.number().int().min(1).max(999),
});

export const forceAssignSchema = z.object({
  leagueId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  playerId: z.string().min(1).max(20),   // mlbId
  playerName: z.string().min(1).max(200),
  price: z.number().int().min(0).max(999),
  positions: z.string().min(1).max(100),
  team: z.string().max(10).optional().default(""),
  isPitcher: z.boolean(),
});
