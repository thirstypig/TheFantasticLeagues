import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '../db/prisma.js';
import { logger } from '../lib/logger.js';

// Initialize Gemini
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

interface AnalysisResult {
  success: boolean;
  analysis?: string;
  error?: string;
}

export class AIAnalysisService {
  private model = genAI?.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

  /**
   * Analyze team's period-over-period performance trends
   */
  async analyzeTeamTrends(year: number, teamCode: string): Promise<AnalysisResult> {
    if (!this.model) {
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

      const result = await this.model.generateContent(prompt);
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
    if (!this.model) {
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

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      return { success: true, analysis: text };
    } catch (err) {
      logger.error({ error: String(err) }, "AI draft analysis failed");
      return { success: false, error: 'Analysis failed' };
    }
  }
}

export const aiAnalysisService = new AIAnalysisService();
