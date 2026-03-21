import { prisma } from '../db/prisma.js';
import { logger } from '../lib/logger.js';
import { z } from 'zod';

// Lazy-load @google/generative-ai (1.2MB) — only imported when AI analysis is actually requested
let _genAI: any = null;
async function ensureGenAI(): Promise<any> {
  if (_genAI) return _genAI;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
  if (!GEMINI_API_KEY) return null;
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  _genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  return _genAI;
}

interface AnalysisResult {
  success: boolean;
  analysis?: string;
  error?: string;
}

export class AIAnalysisService {
  private async getModel() {
    const genAI = await ensureGenAI();
    if (!genAI) return null;
    return genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  }

  /**
   * Analyze team's period-over-period performance trends
   */
  async analyzeTeamTrends(year: number, teamCode: string): Promise<AnalysisResult> {
    const model = await this.getModel();
    if (!model) {
      return { success: false, error: 'AI analysis is not available' };
    }

    try {
      // Fetch all periods for this team and year
      const season = await prisma.historicalSeason.findFirst({
        where: { year },
        include: {
          periods: {
            orderBy: { periodNumber: 'asc' },
            include: {
              stats: {
                where: { teamCode },
              },
            },
          },
          standings: {
            where: { teamCode },
          },
        },
      });

      if (!season) {
        return { success: false, error: `No data found for ${year}` };
      }

      // Build period summaries
      const periodSummaries = season.periods.map(p => {
        const hitters = p.stats.filter(s => !s.isPitcher);
        const pitchers = p.stats.filter(s => s.isPitcher);
        
        const hitTotals = {
          R: hitters.reduce((sum, s) => sum + (s.R || 0), 0),
          HR: hitters.reduce((sum, s) => sum + (s.HR || 0), 0),
          RBI: hitters.reduce((sum, s) => sum + (s.RBI || 0), 0),
          SB: hitters.reduce((sum, s) => sum + (s.SB || 0), 0),
          AVG: hitters.length > 0 ? hitters.reduce((sum, s) => sum + (s.AVG || 0), 0) / hitters.length : 0,
        };

        const pitchTotals = {
          W: pitchers.reduce((sum, s) => sum + (s.W || 0), 0),
          SV: pitchers.reduce((sum, s) => sum + (s.SV || 0), 0),
          K: pitchers.reduce((sum, s) => sum + (s.K || 0), 0),
          ERA: pitchers.length > 0 ? pitchers.reduce((sum, s) => sum + (s.ERA || 0), 0) / pitchers.length : 0,
          WHIP: pitchers.length > 0 ? pitchers.reduce((sum, s) => sum + (s.WHIP || 0), 0) / pitchers.length : 0,
        };

        const topHitters = hitters
          .sort((a, b) => (b.HR || 0) - (a.HR || 0))
          .slice(0, 3)
          .map(s => `${s.playerName}: ${s.HR} HR, ${s.RBI} RBI`);

        const topPitchers = pitchers
          .sort((a, b) => (b.K || 0) - (a.K || 0))
          .slice(0, 3)
          .map(s => `${s.playerName}: ${s.K} K, ${s.W} W`);

        return {
          period: p.periodNumber,
          hitters: hitTotals,
          pitchers: pitchTotals,
          topHitters,
          topPitchers,
          playerCount: p.stats.length,
        };
      });

      const standing = season.standings[0];

      const prompt = `You are a fantasy baseball analyst. Analyze this team's performance trends across the ${year} season.

Team: ${teamCode}
Final Rank: ${standing?.finalRank || 'N/A'} / 8 teams
Total Score: ${standing?.totalScore || 'N/A'} points

Period-by-Period Stats:
${JSON.stringify(periodSummaries, null, 2)}

Provide a concise analysis (2-3 paragraphs) covering:
1. Overall season trajectory - improving, declining, or consistent?
2. Key category strengths and weaknesses
3. Best performers and their impact
4. Notable trends across periods

Keep it conversational and insightful. Use specific numbers.`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      return { success: true, analysis: text };
    } catch (err) {
      logger.error({ error: String(err) }, "AI analysis failed");
      return { success: false, error: 'Analysis failed' };
    }
  }

  /**
   * Analyze team's auction draft strategy
   */
  async analyzeDraft(year: number, teamCode: string): Promise<AnalysisResult> {
    const model = await this.getModel();
    if (!model) {
      return { success: false, error: 'AI analysis is not available' };
    }

    try {
      // Fetch Period 1 stats (draft results)
      const season = await prisma.historicalSeason.findFirst({
        where: { year },
        include: {
          periods: {
            where: { periodNumber: 1 },
            include: {
              stats: {
                where: { teamCode },
              },
            },
          },
          standings: {
            where: { teamCode },
          },
        },
      });

      if (!season || season.periods.length === 0) {
        return { success: false, error: `No draft data found for ${year}` };
      }

      const draftPicks = season.periods[0].stats;
      const hitters = draftPicks.filter(s => !s.isPitcher);
      const pitchers = draftPicks.filter(s => s.isPitcher);
      const keepers = draftPicks.filter(s => s.isKeeper);

      const totalSpent = draftPicks.reduce((sum, s) => sum + (s.draftDollars || 0), 0);
      const hitterSpent = hitters.reduce((sum, s) => sum + (s.draftDollars || 0), 0);
      const pitcherSpent = pitchers.reduce((sum, s) => sum + (s.draftDollars || 0), 0);
      const keeperSpent = keepers.reduce((sum, s) => sum + (s.draftDollars || 0), 0);

      const topPicks = [...draftPicks]
        .sort((a, b) => (b.draftDollars || 0) - (a.draftDollars || 0))
        .slice(0, 5)
        .map(s => ({
          name: s.playerName,
          position: s.position,
          price: s.draftDollars,
          isKeeper: s.isKeeper,
          stats: s.isPitcher 
            ? `${s.K} K, ${s.W} W, ${s.ERA?.toFixed(2)} ERA`
            : `${s.HR} HR, ${s.RBI} RBI, ${s.AVG?.toFixed(3)} AVG`,
        }));

      const standing = season.standings[0];

      const prompt = `You are a fantasy baseball auction draft analyst. Analyze this team's draft strategy for ${year}.

Team: ${teamCode}
Final Rank: ${standing?.finalRank || 'N/A'} / 8 teams

Draft Summary:
- Total Spent: $${totalSpent} / $400 budget
- Hitters: ${hitters.length} players, $${hitterSpent} (${Math.round(hitterSpent/totalSpent*100)}%)
- Pitchers: ${pitchers.length} players, $${pitcherSpent} (${Math.round(pitcherSpent/totalSpent*100)}%)
- Keepers: ${keepers.length} players, $${keeperSpent}

Top 5 Acquisitions:
${JSON.stringify(topPicks, null, 2)}

Full Roster (with prices):
Hitters: ${hitters.map(h => `${h.playerName}($${h.draftDollars})`).join(', ')}
Pitchers: ${pitchers.map(p => `${p.playerName}($${p.draftDollars})`).join(', ')}

Provide a concise analysis (2-3 paragraphs) covering:
1. Overall draft strategy - stars & scrubs, balanced, position-focused?
2. Best value picks vs potential overpays
3. Keeper strategy assessment
4. How draft decisions may have impacted final standing

Keep it conversational. Highlight specific players and prices.`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      return { success: true, analysis: text };
    } catch (err) {
      logger.error({ error: String(err) }, "AI draft analysis failed");
      return { success: false, error: 'Analysis failed' };
    }
  }
  /**
   * Grade all teams' drafts from the current auction results.
   * Returns A-F grades with reasoning for each team.
   */
  async gradeCurrentDraft(teams: {
    id: number;
    name: string;
    code: string;
    budget: number;
    roster: { playerId: number; price: number; assignedPosition?: string | null }[];
    pitcherCount?: number;
    hitterCount?: number;
  }[], leagueConfig: { budgetCap: number; rosterSize: number; pitcherCount: number; batterCount: number }): Promise<{
    success: boolean;
    grades?: { teamId: number; teamName: string; grade: string; summary: string }[];
    error?: string;
  }> {
    const model = await this.getModel();
    if (!model) {
      return { success: false, error: 'Draft grading is temporarily unavailable' };
    }

    try {
      const teamSummaries = teams.map(team => {
        const totalSpent = team.roster.reduce((sum, r) => sum + r.price, 0);
        const bargains = team.roster.filter(r => r.price <= 3).length;

        return {
          name: team.name,
          id: team.id,
          totalSpent,
          budgetRemaining: team.budget,
          rosterSize: team.roster.length,
          hitters: team.hitterCount ?? 0,
          pitchers: team.pitcherCount ?? 0,
          bargainCount: bargains,
        };
      });

      const leagueAvgSpent = teamSummaries.reduce((s, t) => s + t.totalSpent, 0) / teamSummaries.length;

      const prompt = `You are a fantasy baseball auction draft analyst. Grade each team's draft performance A through F.

League Config:
- Budget: $${leagueConfig.budgetCap} per team
- Roster: ${leagueConfig.rosterSize} total (${leagueConfig.batterCount} hitters, ${leagueConfig.pitcherCount} pitchers)
- League Avg Spend: $${Math.round(leagueAvgSpent)}

Team Summaries:
${JSON.stringify(teamSummaries, null, 2)}

For each team, provide:
1. A letter grade (A+, A, A-, B+, B, B-, C+, C, C-, D, F)
2. A 1-2 sentence summary explaining the grade

Consider these factors:
- Value efficiency: Did they get good value or overpay?
- Budget management: Did they use their budget wisely, or leave too much on the table?
- Roster balance: Good mix of hitters vs pitchers?
- Star power vs depth: Did they invest in elite talent or spread the budget thin?
- Bargain hunting: Did they find value at $1-$3?

IMPORTANT: Return ONLY a valid JSON array, no markdown, no code blocks. Example format:
[{"teamId": 1, "teamName": "Team A", "grade": "B+", "summary": "Solid draft with good value picks..."}]`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();

      // Parse JSON — strip markdown code fences if present
      const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const raw = JSON.parse(jsonStr);

      // Validate LLM output with Zod — AI is nondeterministic
      const gradeSchema = z.array(z.object({
        teamId: z.number(),
        teamName: z.string().max(200),
        grade: z.string().max(5),
        summary: z.string().max(1000),
      }));
      const parsed = gradeSchema.safeParse(raw);
      if (!parsed.success) {
        logger.error({ zodError: parsed.error.message }, "AI returned invalid grade structure");
        return { success: false, error: 'Draft grading returned invalid data' };
      }

      return { success: true, grades: parsed.data };
    } catch (err) {
      logger.error({ error: String(err) }, "AI draft grade failed");
      return { success: false, error: 'Draft grading failed' };
    }
  }

  // ─── Feature 1: Trade Analyzer ──────────────────────────────────────────────

  async analyzeTrade(
    tradeItems: { playerId?: number; playerName: string; fromTeamId: number; toTeamId: number; type: "player" | "budget"; amount?: number }[],
    teams: { id: number; name: string; budget: number; roster: { playerName: string; position: string; price: number }[] }[],
    leagueId: number,
  ): Promise<{
    success: boolean;
    result?: { fairness: string; winner: string; analysis: string; recommendation: string };
    error?: string;
  }> {
    const model = await this.getModel();
    if (!model) {
      return { success: false, error: 'AI trade analysis is not available' };
    }

    try {
      const teamMap = new Map(teams.map(t => [t.id, t]));

      const itemDescriptions = tradeItems.map(item => {
        const from = teamMap.get(item.fromTeamId);
        const to = teamMap.get(item.toTeamId);
        if (item.type === "budget") {
          return `$${item.amount} FAAB from ${from?.name ?? 'Unknown'} to ${to?.name ?? 'Unknown'}`;
        }
        return `${item.playerName} from ${from?.name ?? 'Unknown'} to ${to?.name ?? 'Unknown'}`;
      });

      const teamSummaries = teams.map(t => ({
        name: t.name,
        budget: t.budget,
        rosterSize: t.roster.length,
        roster: t.roster.map(r => `${r.playerName} (${r.position}, $${r.price})`).join(', '),
      }));

      const prompt = `You are a fantasy baseball trade analyst. Analyze this trade proposal.

League ID: ${leagueId}

Trade Items:
${itemDescriptions.map((d, i) => `${i + 1}. ${d}`).join('\n')}

Teams Involved:
${JSON.stringify(teamSummaries, null, 2)}

Analyze the trade and return ONLY a valid JSON object (no markdown, no code blocks) with these fields:
- "fairness": one of "fair", "slightly_unfair", or "unfair"
- "winner": name of the team that benefits more (or "even" if fair)
- "analysis": 2-3 sentences analyzing the trade impact on both teams
- "recommendation": 1 sentence recommendation (approve, reject, or suggest modifications)`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const raw = JSON.parse(jsonStr);

      const schema = z.object({
        fairness: z.enum(["fair", "slightly_unfair", "unfair"]),
        winner: z.string().max(200),
        analysis: z.string().max(2000),
        recommendation: z.string().max(500),
      });

      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        logger.error({ zodError: parsed.error.message }, "AI returned invalid trade analysis structure");
        return { success: false, error: 'Trade analysis returned invalid data' };
      }

      return { success: true, result: parsed.data };
    } catch (err) {
      logger.error({ error: String(err) }, "AI trade analysis failed");
      return { success: false, error: 'Trade analysis failed' };
    }
  }

  // ─── Feature 2: Keeper Recommender ──────────────────────────────────────────

  async recommendKeepers(
    teamRoster: { playerId: number; playerName: string; position: string; price: number; keeperCost: number; statsSummary: string }[],
    leagueRules: { maxKeepers: number; budgetCap: number },
    teamBudget: number,
  ): Promise<{
    success: boolean;
    result?: { recommendations: { playerId: number; playerName: string; keeperCost: number; reasoning: string; rank: number }[]; strategy: string };
    error?: string;
  }> {
    const model = await this.getModel();
    if (!model) {
      return { success: false, error: 'AI keeper recommendation is not available' };
    }

    try {
      const rosterData = teamRoster.map(r => ({
        name: r.playerName,
        position: r.position,
        currentPrice: r.price,
        keeperCost: r.keeperCost,
        stats: r.statsSummary,
      }));

      const prompt = `You are a fantasy baseball keeper selection advisor. Recommend which players to keep.

Team Budget: $${teamBudget} / $${leagueRules.budgetCap}
Max Keepers: ${leagueRules.maxKeepers}

Roster (with keeper costs = current price + $5):
${JSON.stringify(rosterData, null, 2)}

Consider:
- Value relative to keeper cost (is the player worth more than their keeper price in an auction?)
- Position scarcity
- Player quality and consistency
- Budget impact of keeping vs drafting fresh

Return ONLY a valid JSON object (no markdown, no code blocks) with:
- "recommendations": array of objects with { "playerId": number, "playerName": string, "keeperCost": number, "reasoning": string (1-2 sentences), "rank": number (1 = best keeper value) }
  Include ALL roster players ranked, with the top ${leagueRules.maxKeepers} being recommended keepers.
- "strategy": 2-3 sentences about overall keeper strategy

Use these exact playerIds from the roster: ${teamRoster.map(r => `${r.playerName}=${r.playerId}`).join(', ')}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const raw = JSON.parse(jsonStr);

      const schema = z.object({
        recommendations: z.array(z.object({
          playerId: z.number(),
          playerName: z.string().max(200),
          keeperCost: z.number(),
          reasoning: z.string().max(500),
          rank: z.number(),
        })),
        strategy: z.string().max(2000),
      });

      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        logger.error({ zodError: parsed.error.message }, "AI returned invalid keeper recommendation structure");
        return { success: false, error: 'Keeper recommendation returned invalid data' };
      }

      return { success: true, result: parsed.data };
    } catch (err) {
      logger.error({ error: String(err) }, "AI keeper recommendation failed");
      return { success: false, error: 'Keeper recommendation failed' };
    }
  }

  // ─── Feature 3: Waiver Bid Advisor ──────────────────────────────────────────

  async adviseWaiverBid(
    player: { name: string; position: string; mlbTeam: string; statsSummary: string },
    teamRoster: { playerName: string; position: string; price: number }[],
    teamBudget: number,
    leagueContext: { teamCount: number; season: number },
  ): Promise<{
    success: boolean;
    result?: { suggestedBid: number; confidence: string; reasoning: string };
    error?: string;
  }> {
    const model = await this.getModel();
    if (!model) {
      return { success: false, error: 'AI waiver advice is not available' };
    }

    try {
      const positionPlayers = teamRoster.filter(r => r.position === player.position);

      const prompt = `You are a fantasy baseball FAAB waiver bid advisor.

Player to Claim: ${player.name} (${player.position}, ${player.mlbTeam})
Player Stats: ${player.statsSummary}

Team Info:
- Remaining FAAB Budget: $${teamBudget}
- League Size: ${leagueContext.teamCount} teams
- Season: ${leagueContext.season}

Current Roster at ${player.position}: ${positionPlayers.length > 0 ? positionPlayers.map(r => `${r.playerName} ($${r.price})`).join(', ') : 'None'}
Full Roster Size: ${teamRoster.length} players

Consider:
- Player's value and recent performance
- Position need (upgrade vs depth)
- Budget preservation for future claims
- League competitiveness (${leagueContext.teamCount} teams)

Return ONLY a valid JSON object (no markdown, no code blocks) with:
- "suggestedBid": number (integer, $0 minimum, max $${teamBudget})
- "confidence": one of "high", "medium", or "low"
- "reasoning": 2-3 sentences explaining the bid recommendation`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const raw = JSON.parse(jsonStr);

      const schema = z.object({
        suggestedBid: z.number().int().nonnegative(),
        confidence: z.enum(["high", "medium", "low"]),
        reasoning: z.string().max(2000),
      });

      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        logger.error({ zodError: parsed.error.message }, "AI returned invalid waiver advice structure");
        return { success: false, error: 'Waiver advice returned invalid data' };
      }

      return { success: true, result: parsed.data };
    } catch (err) {
      logger.error({ error: String(err) }, "AI waiver advice failed");
      return { success: false, error: 'Waiver advice failed' };
    }
  }

  // ─── Feature 4: Weekly AI Insights ──────────────────────────────────────────

  async generateWeeklyInsights(
    team: { id: number; name: string; budget: number },
    roster: { playerName: string; position: string; price: number }[],
    standings: { teamName: string; rank: number; totalScore: number }[],
    recentTransactions: { type: string; playerName: string; date: string }[],
  ): Promise<{
    success: boolean;
    result?: { insights: { category: string; title: string; detail: string }[]; overallGrade: string };
    error?: string;
  }> {
    const model = await this.getModel();
    if (!model) {
      return { success: false, error: 'AI insights are not available' };
    }

    try {
      const teamStanding = standings.find(s => s.teamName === team.name);

      const prompt = `You are a fantasy baseball team analyst providing weekly insights.

Team: ${team.name}
Current Rank: ${teamStanding?.rank ?? 'N/A'} / ${standings.length} teams
Total Score: ${teamStanding?.totalScore ?? 'N/A'}
Remaining Budget: $${team.budget}

Roster (${roster.length} players):
${roster.map(r => `- ${r.playerName} (${r.position}, $${r.price})`).join('\n')}

League Standings:
${standings.map(s => `${s.rank}. ${s.teamName}: ${s.totalScore} pts`).join('\n')}

Recent Transactions:
${recentTransactions.length > 0 ? recentTransactions.map(t => `- ${t.type}: ${t.playerName} (${t.date})`).join('\n') : 'None'}

Provide 3-5 actionable insights. Return ONLY a valid JSON object (no markdown, no code blocks) with:
- "insights": array of objects with { "category": string (e.g. "Roster", "Standings", "Budget", "Pitching", "Hitting"), "title": string (short headline), "detail": string (2-3 sentences) }
- "overallGrade": letter grade A+ through F for team's current position and trajectory`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const raw = JSON.parse(jsonStr);

      const schema = z.object({
        insights: z.array(z.object({
          category: z.string().max(50),
          title: z.string().max(200),
          detail: z.string().max(1000),
        })),
        overallGrade: z.string().max(5),
      });

      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        logger.error({ zodError: parsed.error.message }, "AI returned invalid insights structure");
        return { success: false, error: 'Weekly insights returned invalid data' };
      }

      return { success: true, result: parsed.data };
    } catch (err) {
      logger.error({ error: String(err) }, "AI weekly insights failed");
      return { success: false, error: 'Weekly insights failed' };
    }
  }

  // ─── Feature 5: Auction Draft Advisor ───────────────────────────────────────

  async adviseBid(
    playerName: string,
    playerPosition: string,
    currentBid: number,
    teamBudget: number,
    teamNeeds: { pitcherCount: number; hitterCount: number; pitcherMax: number; hitterMax: number; openSlots: number },
    leagueContext: { avgBudgetRemaining: number; teamsCount: number; rosterSize: number },
  ): Promise<{
    success: boolean;
    result?: { shouldBid: boolean; maxRecommendedBid: number; reasoning: string; confidence: string };
    error?: string;
  }> {
    const model = await this.getModel();
    if (!model) {
      return { success: false, error: 'AI bid advice is not available' };
    }

    try {
      const isPitcher = ['SP', 'RP', 'P', 'CL'].includes(playerPosition);
      const positionNeed = isPitcher
        ? `${teamNeeds.pitcherCount}/${teamNeeds.pitcherMax} pitchers filled`
        : `${teamNeeds.hitterCount}/${teamNeeds.hitterMax} hitters filled`;

      const prompt = `You are a fantasy baseball auction draft advisor. Should this team bid on this player?

Player: ${playerName} (${playerPosition})
Current Bid: $${currentBid}

Team Status:
- Budget Remaining: $${teamBudget}
- Open Roster Slots: ${teamNeeds.openSlots}
- Position: ${positionNeed}

League Context:
- ${leagueContext.teamsCount} teams in league
- Average Budget Remaining: $${Math.round(leagueContext.avgBudgetRemaining)}
- Roster Size: ${leagueContext.rosterSize}

Consider:
- Is the current price a good value?
- Does the team need this position?
- Budget preservation: need $1 minimum for each remaining slot
- Competitive advantage of this player vs waiting

Return ONLY a valid JSON object (no markdown, no code blocks) with:
- "shouldBid": boolean
- "maxRecommendedBid": number (integer, the highest you'd recommend bidding)
- "reasoning": 2-3 sentences explaining the recommendation
- "confidence": one of "high", "medium", or "low"`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const raw = JSON.parse(jsonStr);

      const schema = z.object({
        shouldBid: z.boolean(),
        maxRecommendedBid: z.number().int().nonnegative(),
        reasoning: z.string().max(2000),
        confidence: z.enum(["high", "medium", "low"]),
      });

      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        logger.error({ zodError: parsed.error.message }, "AI returned invalid bid advice structure");
        return { success: false, error: 'Bid advice returned invalid data' };
      }

      return { success: true, result: parsed.data };
    } catch (err) {
      logger.error({ error: String(err) }, "AI bid advice failed");
      return { success: false, error: 'Bid advice failed' };
    }
  }
}

export const aiAnalysisService = new AIAnalysisService();
