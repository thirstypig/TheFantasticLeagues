import { prisma } from '../db/prisma.js';
import { logger } from '../lib/logger.js';
import { z } from 'zod';
import { isPitcher as isPitcherPos } from '../lib/sportConfig.js';

// Lazy-load @google/generative-ai — only imported when AI analysis is actually requested
let _genAI: any = null;
async function ensureGenAI(): Promise<any> {
  if (_genAI) return _genAI;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
  if (!GEMINI_API_KEY) return null;
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  _genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  return _genAI;
}

/** Unified model interface — wraps Gemini or Anthropic behind a common generateContent API. */
interface AIModel {
  generateContent(prompt: string): Promise<{ response: { text(): string } }>;
}

/**
 * Temperature guidelines for this service:
 *   0.3 — critical/factual analysis (trades, waivers post-facto)
 *   0.4 — analytical grading (draft grades, keeper recs, bid advice)
 *   0.5–0.6 — mixed (draft report narrative, weekly insights)
 *   0.8 — creative prose with personality (league digest, banter)
 * Callers pass the value they want; `getModel(temp)` returns a model wired
 * with that temperature for both Gemini and Anthropic backends.
 */

/** Create Anthropic-backed model using raw fetch (no SDK dependency). */
function createAnthropicModel(apiKey: string, temperature: number): AIModel {
  return {
    async generateContent(prompt: string) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          temperature,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Anthropic API error ${res.status}: ${body}`);
      }
      const data = await res.json() as any;
      const text = data.content?.[0]?.text ?? '';
      return { response: { text: () => text } };
    },
  };
}

interface AnalysisResult {
  success: boolean;
  analysis?: string;
  error?: string;
}

export interface DraftReportTeamResult {
  teamId: number;
  teamName: string;
  grade: string;
  keeperAssessment: string;
  analysis: string;
  projectedStats: string;
  categoryStrengths: string;
  categoryWeaknesses: string;
  auctionSpend: number;
  keeperSpend: number;
  keeperCount: number;
  avgHitterPrice: number;
  avgPitcherPrice: number;
  totalSurplus: number;
  auctionSurplus: number;
  hitterSpend: number;
  pitcherSpend: number;
  top3Pct: number;
  favMlbTeam: { team: string; count: number } | null;
  bestBargain: { playerName: string; position: string; price: number; projectedValue: number; surplus: number } | null;
  worstOverpay: { playerName: string; position: string; price: number; projectedValue: number; surplus: number } | null;
  keepers: { playerName: string; position: string; price: number; projectedValue: number | null; surplus: number | null }[];
  roster: { rosterId?: number; playerName: string; position: string; posList?: string; mlbTeam?: string; price: number; isKeeper: boolean; projectedValue: number | null; surplus: number | null }[];
}

export interface DraftReportResult {
  leagueSummary: { avgHitterPrice: number; avgPitcherPrice: number };
  surplusRanking: { teamId: number; teamName: string; surplus: number }[];
  teams: DraftReportTeamResult[];
  generatedAt: string;
}

// Track Gemini availability — once it fails, use Anthropic for the rest of the process lifetime
let _geminiDisabled = false;

export class AIAnalysisService {
  /**
   * Try Gemini first, fall back to Anthropic Claude. `temperature` controls
   * output variance for both providers (see temperature guidelines above).
   * Default 0.7 matches industry standard for mixed analytical/creative work.
   */
  private async getModel(temperature: number = 0.7): Promise<AIModel | null> {
    // Try Gemini (unless previously disabled by quota/error)
    if (!_geminiDisabled) {
      const genAI = await ensureGenAI();
      if (genAI) {
        const geminiModel = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: { temperature },
        });
        // Wrap Gemini model to detect quota errors and auto-fallback
        const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
        if (anthropicKey) {
          return {
            async generateContent(prompt: string) {
              try {
                // Wrap Gemini call with 90-second timeout (Gemini SDK has no built-in timeout)
                const timeoutMs = 90_000;
                const result = await Promise.race([
                  geminiModel.generateContent(prompt),
                  new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Gemini timeout after ${timeoutMs}ms`)), timeoutMs)),
                ]);
                return result;
              } catch (err: any) {
                const msg = String(err?.message ?? err);
                logger.warn({ error: msg.substring(0, 200) }, "Gemini failed, switching to Anthropic");
                _geminiDisabled = true;
                return createAnthropicModel(anthropicKey, temperature).generateContent(prompt);
              }
            },
          };
        }
        return geminiModel;
      }
    }

    // Fallback: Anthropic Claude
    const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
    if (anthropicKey) {
      return createAnthropicModel(anthropicKey, temperature);
    }

    return null;
  }

  // ─── League Weekly Digest (Home Page) ──────────────────────────────────────

  async generateLeagueDigest(input: {
    leagueName: string;
    season: number;
    leagueType: string;
    teams: {
      id: number; name: string;
      keyPlayers: string; keeperNames: string; recentMoves: string;
      overallRank: number | null; totalPoints: number | null;
      statsLine: string; categoryRankLine: string;
      injuredPlayers: string; minorsPlayers: string;
      previousRank: number | null; rankChange: number | null;
    }[];
    tradeStyle: "conservative" | "outrageous" | "fun";
    weekNumber: number;
    previousVotes: { yes: number; no: number } | null;
    narrativeHints?: string[];
    mvpCandidates?: string;
    cyYoungCandidates?: string;
  }): Promise<{
    success: boolean;
    result?: {
      weekInOneSentence: string;
      powerRankings: { rank: number; teamName: string; movement: string; commentary: string }[];
      hotTeam: { name: string; reason: string };
      coldTeam: { name: string; reason: string };
      statOfTheWeek: string;
      categoryMovers: { category: string; team: string; direction: string; detail: string }[];
      proposedTrade?: {
        style: string; title: string; description: string;
        teamA: string; teamAGives: string;
        teamB: string; teamBGives: string;
        reasoning: string;
      };
      boldPrediction: string;
    };
    error?: string;
  }> {
    // Creative: banter, hot/cold team prose, bold predictions — voice matters
    const model = await this.getModel(0.8);
    if (!model) {
      return { success: false, error: 'AI league digest is not available' };
    }

    try {
      const { leagueName, season, leagueType, teams, tradeStyle, weekNumber, previousVotes, narrativeHints } = input;
      const leagueTypeLabel = leagueType === "NL" ? "NL-ONLY" : leagueType === "AL" ? "AL-ONLY" : "Mixed";
      const hasStats = teams.some(t => t.statsLine);

      const voteContext = previousVotes
        ? `\nLast week's proposed trade received ${previousVotes.yes} "yes" and ${previousVotes.no} "no" votes.${previousVotes.no > previousVotes.yes ? ' Owners felt it was unrealistic — aim for a more practical, mutually beneficial trade this week.' : previousVotes.yes > previousVotes.no ? ' Owners liked the idea — this week, try something in a similar vein.' : ''}`
        : '';

      const { mvpCandidates, cyYoungCandidates } = input;
      const prompt = `You are a stat-obsessed league member in "${leagueName}" writing the weekly digest after Week ${weekNumber} of the ${season} season (${teams.length} teams, 10-cat roto: R, HR, RBI, SB, AVG | W, SV, K, ERA, WHIP).

Write with personality — be opinionated, use trash talk, be specific. Use last names only ("Betts" not "Mookie Betts"). Do NOT use position labels (no "OF", "SP", "TWP" — just names).

IMPORTANT — DATA FORMAT:
The stats below are SEASON CUMULATIVE TOTALS with category rank in parentheses (e.g., "HR:12(3rd)" means 12 HR total this season, ranked 3rd).
You do NOT have per-week stat breakdowns. Do NOT invent or estimate weekly numbers.
You MUST only reference the cumulative totals and rank positions shown below.
When discussing movement, reference rank changes (e.g., "climbed from 6th to 3rd in HR") — NOT invented weekly stat totals.

TEAMS (sorted by current standings):
${teams
  .sort((a, b) => (a.overallRank ?? 99) - (b.overallRank ?? 99))
  .map(t => {
    const rankLabel = t.overallRank ? `#${t.overallRank} overall, ${t.totalPoints} pts` : 'unranked';
    const movementLabel = t.rankChange !== null && t.previousRank !== null
      ? t.rankChange > 0 ? `Last week: #${t.previousRank} (moved up ${t.rankChange} spots)`
        : t.rankChange < 0 ? `Last week: #${t.previousRank} (moved down ${Math.abs(t.rankChange)} spots)`
        : `Last week: #${t.previousRank} (steady)`
      : '';
    return `=== ${t.name} (${rankLabel}) ===
${hasStats && t.statsLine ? `Season totals: ${t.statsLine}` : ''}
${movementLabel ? movementLabel : ''}
Key players: ${t.keyPlayers}
Injured/IL: ${t.injuredPlayers || 'None'}
In Minors: ${t.minorsPlayers || 'None'}
Recent moves: ${t.recentMoves || 'None'}`.replace(/\n\n/g, '\n');
  }).join('\n\n')}
${narrativeHints && narrativeHints.length > 0 ? `
INSIGHTS FROM THE DATA:
${narrativeHints.map(h => `- ${h}`).join('\n')}` : ''}
${mvpCandidates ? `
FANTASY MVP CANDIDATES (YTD, by OPS):
${mvpCandidates}` : ''}
${cyYoungCandidates ? `
FANTASY CY YOUNG CANDIDATES (YTD, by ERA):
${cyYoungCandidates}` : ''}

CRITICAL RULES (in priority order):

=== ACCURACY (HIGHEST PRIORITY) ===
1. NEVER invent stats. You ONLY have season cumulative totals and category ranks. If you cannot find a specific number in the data above, do NOT make one up.
2. When discussing category performance, cite the CUMULATIVE TOTAL and RANK from the data (e.g., "sitting at 12 HR, ranked 3rd"). Do NOT fabricate per-week numbers like "added 6 SB this week" — you don't have weekly breakdowns.
3. When discussing movement, use rank changes: "climbed from 6th to 3rd in HR" — NOT invented weekly deltas.

=== INJURIES (HIGH PRIORITY) ===
4. If a team has a KEY player on the IL (listed under "Injured/IL"), this is MAJOR NEWS. It MUST be prominently discussed in that team's power ranking commentary. Star players on the IL directly hurt a team's category production — call it out as a real concern.
5. Players in the minors are dead roster spots producing zero stats. Flag teams carrying multiple minors players as handicapped.

=== POWER RANKINGS (STRICT RULES) ===
6. Power rankings MUST closely mirror the actual standings order. Maximum deviation: 2 spots. If a team is #7 in standings, they CANNOT be ranked higher than #5 in power rankings. If a team is #1 in standings, they CANNOT be ranked lower than #3.
7. The "movement" field must reflect ACTUAL rank change from last week's standings data shown above, not a guess.
8. Commentary must cite 2+ specific numbers from the season totals. Explain WHY the team is at that rank — which categories are they strong/weak in?

=== CONTENT RULES ===
9. EVERY statement must include specific numbers from the data. Never say "crushing it" — say "leads the league with 12 HR, ranked 1st."
10. Hot/Cold team reasons must cite at least 3 specific numbers (cumulative totals + ranks).
11. Category movers must show the team's cumulative stat total AND current rank (e.g., "sitting at 45 RBI, up to 2nd from 5th last week"). Do NOT invent per-week numbers.
12. Stat of the week must reference exact cumulative numbers and comparisons from the data.
13. Do NOT mention auction prices, draft costs, budgets, or league type.
14. Do NOT use position abbreviations — just player last names.
15. Bold prediction should be fun but grounded in a real trend from the data.

Return ONLY valid JSON (no markdown, no code blocks):
{
  "weekInOneSentence": "One punchy headline (15-25 words, must include a number from the data)",
  "powerRankings": [
    {"rank": 1, "teamName": "Team", "movement": "up|down|steady", "commentary": "1-2 sentences citing 2+ specific stats. Explain rank position. Mention IL players if applicable."}
  ],
  "hotTeam": {"name": "Team", "reason": "2-3 sentences citing 3+ specific cumulative totals + ranks. What categories do they lead or dominate?"},
  "coldTeam": {"name": "Team", "reason": "2-3 sentences citing 3+ specific numbers. What categories are they near the bottom in? Mention injuries/minors if relevant."},
  "statOfTheWeek": "2 sentences about a surprising stat — cite exact cumulative totals and a comparison between teams",
  "categoryMovers": [
    {"category": "HR", "team": "Team", "direction": "up|down", "detail": "Cumulative total + current rank + rank change (e.g., 'Sitting at 18 HR (2nd), up from 5th last week')"}
  ],
  "boldPrediction": "1 fun sentence grounded in a real trend from the data",
  "fantasyMVP": [
    {"rank": 1, "playerName": "Last Name", "fantasyTeam": "Team", "statLine": "e.g. .331 AVG, 22 HR, 55 RBI, .985 OPS", "analysis": "1 sentence: why this player leads — cite specific stats from the MVP candidates data above"}
  ],
  "fantasyCyYoung": [
    {"rank": 1, "playerName": "Last Name", "fantasyTeam": "Team", "statLine": "e.g. 2.15 ERA, 0.92 WHIP, 95 K, 8-2", "analysis": "1 sentence: why this pitcher leads — cite specific stats from the Cy Young candidates data above"}
  ]
}

FINAL CHECK: Re-read every sentence in your response. If ANY sentence contains a number that does not appear in the team data above, DELETE that sentence and rewrite it using only real numbers. This is non-negotiable.`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const raw = JSON.parse(jsonStr);

      const schema = z.object({
        weekInOneSentence: z.string().max(300),
        powerRankings: z.array(z.object({
          rank: z.number().int().min(1),
          teamName: z.string().max(200),
          movement: z.string().max(20),
          commentary: z.string().max(500),
        })),
        hotTeam: z.object({ name: z.string().max(200), reason: z.string().max(800) }),
        coldTeam: z.object({ name: z.string().max(200), reason: z.string().max(800) }),
        statOfTheWeek: z.string().max(600),
        categoryMovers: z.array(z.object({
          category: z.string().max(20),
          team: z.string().max(200),
          direction: z.string().max(20),
          detail: z.string().max(400),
        })).max(5),
        // proposedTrade removed per user feedback — keep old digests intact
        proposedTrade: z.object({
          style: z.string().max(50),
          title: z.string().max(200),
          description: z.string().max(500),
          teamA: z.string().max(200),
          teamAGives: z.string().max(500),
          teamB: z.string().max(200),
          teamBGives: z.string().max(500),
          reasoning: z.string().max(1000),
        }).optional(),
        boldPrediction: z.string().max(400),
        fantasyMVP: z.array(z.object({
          rank: z.number().int().min(1),
          playerName: z.string().max(100),
          fantasyTeam: z.string().max(200),
          statLine: z.string().max(300),
          analysis: z.string().max(400),
        })).max(3).optional(),
        fantasyCyYoung: z.array(z.object({
          rank: z.number().int().min(1),
          playerName: z.string().max(100),
          fantasyTeam: z.string().max(200),
          statLine: z.string().max(300),
          analysis: z.string().max(400),
        })).max(3).optional(),
      });

      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        logger.error({ zodError: parsed.error.message }, "AI returned invalid league digest");
        return { success: false, error: 'League digest returned invalid data' };
      }

      return { success: true, result: parsed.data };
    } catch (err) {
      logger.error({ error: String(err) }, "AI league digest failed");
      return { success: false, error: 'League digest generation failed' };
    }
  }

  /**
   * Analyze team's period-over-period performance trends
   */
  async analyzeTeamTrends(year: number, teamCode: string): Promise<AnalysisResult> {
    // Analytical: factual historical trend summary — low variance preferred
    const model = await this.getModel(0.4);
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
    // Analytical: draft grade + rationale — keep consistent across runs
    const model = await this.getModel(0.4);
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
  // ─── Combined Draft Report ──────────────────────────────────────────────────

  /**
   * Generate a comprehensive per-team draft report with AI grades, analysis,
   * keeper assessment, and projected stat contributions.
   *
   * Data-driven: uses projected auction values (dollar_value from CSV) to
   * compute surplus per player, best bargain, worst overpay, and total surplus
   * per team — feeding all of this into the AI prompt for accurate grading.
   */
  async generateDraftReport(
    teams: {
      id: number;
      name: string;
      roster: { rosterId?: number; playerName: string; position: string; posList?: string; mlbTeam?: string; price: number; isKeeper: boolean; projectedValue: number | null }[];
      keeperSpend: number;
      auctionSpend: number;
      budget: number;
      favMlbTeam?: { team: string; count: number } | null;
    }[],
    leagueConfig: { budgetCap: number; rosterSize: number; pitcherCount: number; batterCount: number },
    auctionLog: { playerName: string; teamName: string; price: number; order: number }[],
  ): Promise<{
    success: boolean;
    report?: DraftReportResult;
    error?: string;
  }> {
    // Mixed: per-team grades + narrative analysis — some variance OK
    const model = await this.getModel(0.5);
    if (!model) {
      return { success: false, error: 'AI draft report is not available' };
    }

    try {
      // ── Compute data-driven metrics per team ──
      const allAuctionHitterPrices: number[] = [];
      const allAuctionPitcherPrices: number[] = [];

      const teamMetrics = teams.map(team => {
        const keepers = team.roster.filter(r => r.isKeeper);
        const auctionPicks = team.roster.filter(r => !r.isKeeper);

        const auctionHitters = auctionPicks.filter(r => !isPitcherPos(r.position));
        const auctionPitchers = auctionPicks.filter(r => isPitcherPos(r.position));
        auctionHitters.forEach(r => allAuctionHitterPrices.push(r.price));
        auctionPitchers.forEach(r => allAuctionPitcherPrices.push(r.price));

        const avgHitterPrice = auctionHitters.length > 0
          ? Math.round((auctionHitters.reduce((s, r) => s + r.price, 0) / auctionHitters.length) * 10) / 10
          : 0;
        const avgPitcherPrice = auctionPitchers.length > 0
          ? Math.round((auctionPitchers.reduce((s, r) => s + r.price, 0) / auctionPitchers.length) * 10) / 10
          : 0;

        // Surplus calculations (only for players with projected values)
        const withValues = team.roster
          .filter(r => r.projectedValue !== null)
          .map(r => ({ ...r, surplus: r.projectedValue! - r.price }));

        const auctionWithValues = withValues.filter(r => !r.isKeeper);
        const totalSurplus = withValues.reduce((s, r) => s + r.surplus, 0);
        const auctionSurplus = auctionWithValues.reduce((s, r) => s + r.surplus, 0);

        const bestBargain = auctionWithValues.length > 0
          ? [...auctionWithValues].sort((a, b) => b.surplus - a.surplus)[0]
          : null;
        const worstOverpay = auctionWithValues.length > 0
          ? [...auctionWithValues].sort((a, b) => a.surplus - b.surplus)[0]
          : null;

        // Top 3 most expensive auction picks
        const top3Picks = [...auctionPicks].sort((a, b) => b.price - a.price).slice(0, 3);
        const top3Pct = team.auctionSpend > 0
          ? Math.round((top3Picks.reduce((s, p) => s + p.price, 0) / team.auctionSpend) * 100)
          : 0;

        // Hitter/pitcher spend ratio
        const hitterSpend = auctionHitters.reduce((s, r) => s + r.price, 0);
        const pitcherSpend = auctionPitchers.reduce((s, r) => s + r.price, 0);

        return {
          id: team.id,
          name: team.name,
          keeperSpend: team.keeperSpend,
          auctionSpend: team.auctionSpend,
          avgHitterPrice,
          avgPitcherPrice,
          totalSurplus: Math.round(totalSurplus),
          auctionSurplus: Math.round(auctionSurplus),
          hitterSpend,
          pitcherSpend,
          top3Pct,
          favMlbTeam: team.favMlbTeam ?? null,
          bestBargain: bestBargain ? { playerName: bestBargain.playerName, position: bestBargain.position, price: bestBargain.price, projectedValue: bestBargain.projectedValue!, surplus: Math.round(bestBargain.surplus) } : null,
          worstOverpay: worstOverpay ? { playerName: worstOverpay.playerName, position: worstOverpay.position, price: worstOverpay.price, projectedValue: worstOverpay.projectedValue!, surplus: Math.round(worstOverpay.surplus) } : null,
          keepers: keepers.map(k => ({
            playerName: k.playerName, position: k.position, price: k.price,
            projectedValue: k.projectedValue,
            surplus: k.projectedValue !== null ? Math.round(k.projectedValue - k.price) : null,
          })),
          roster: team.roster.map(r => ({
            rosterId: r.rosterId, playerName: r.playerName, position: r.position, posList: r.posList,
            mlbTeam: r.mlbTeam ?? "", price: r.price, isKeeper: r.isKeeper,
            projectedValue: r.projectedValue,
            surplus: r.projectedValue !== null ? Math.round(r.projectedValue - r.price) : null,
          })),
        };
      });

      // League-wide averages
      const leagueAvgHitterPrice = allAuctionHitterPrices.length > 0
        ? Math.round((allAuctionHitterPrices.reduce((s, p) => s + p, 0) / allAuctionHitterPrices.length) * 10) / 10
        : 0;
      const leagueAvgPitcherPrice = allAuctionPitcherPrices.length > 0
        ? Math.round((allAuctionPitcherPrices.reduce((s, p) => s + p, 0) / allAuctionPitcherPrices.length) * 10) / 10
        : 0;

      // Surplus ranking
      const surplusRanking = [...teamMetrics].sort((a, b) => b.auctionSurplus - a.auctionSurplus);

      // ── Build AI prompt with all the data ──
      const sortedLog = [...auctionLog].sort((a, b) => a.order - b.order);
      const earlyPicks = sortedLog.slice(0, 8).map(l => `${l.playerName} → ${l.teamName} ($${l.price})`);
      const latePicks = sortedLog.slice(-8).map(l => `${l.playerName} → ${l.teamName} ($${l.price})`);

      const prompt = `You are an expert fantasy baseball auction draft analyst. Produce a comprehensive draft report for each team.

IMPORTANT LEAGUE CONTEXT: This is an NL-ONLY league. Only National League players are eligible. This significantly increases the value of elite NL players due to scarcity — there is no AL talent pool to draw from. The projected dollar values provided are based on mixed-league projections and therefore UNDERVALUE NL players in this context. Keep this in mind when evaluating overpays vs bargains — paying above mixed-league value for an elite NL player may be reasonable in an NL-only format.

League Config:
- Budget: $${leagueConfig.budgetCap} per team (${leagueConfig.rosterSize} roster: ${leagueConfig.batterCount} hitters, ${leagueConfig.pitcherCount} pitchers)
- NL-ONLY league (15 NL teams, ~400 eligible players total)
- 4 keepers per team (carried over at keeper cost from prior season)
- 10-category roto: R, HR, RBI, SB, AVG (hitting) | W, SV, K, ERA, WHIP (pitching)
- League Avg Auction Hitter Price: $${leagueAvgHitterPrice}
- League Avg Auction Pitcher Price: $${leagueAvgPitcherPrice}

Value Efficiency Ranking (auction surplus = projected value minus price paid, higher is better):
${surplusRanking.map((t, i) => `${i + 1}. ${t.name}: ${t.auctionSurplus >= 0 ? '+' : ''}$${t.auctionSurplus}`).join('\n')}

Auction Spending Trends:
First 8 picks: ${earlyPicks.join(' | ')}
Last 8 picks: ${latePicks.join(' | ')}

Team-by-Team Rosters (with projected values):
${teamMetrics.map(t => `
## ${t.name} (id: ${t.id})
${t.favMlbTeam ? `Favorite MLB Team: ${t.favMlbTeam.team} (${t.favMlbTeam.count} players)` : ''}
Keeper Spend: $${t.keeperSpend} | Auction Spend: $${t.auctionSpend}
Avg Auction Hitter: $${t.avgHitterPrice} | Avg Auction Pitcher: $${t.avgPitcherPrice}
Hitter/Pitcher Spend Split: $${t.hitterSpend}/$${t.pitcherSpend} | Top 3 Concentration: ${t.top3Pct}%
Total Auction Surplus: ${t.auctionSurplus >= 0 ? '+' : ''}$${t.auctionSurplus}
${t.bestBargain ? `Best Bargain: ${t.bestBargain.playerName} (paid $${t.bestBargain.price}, val $${t.bestBargain.projectedValue}, surplus +$${t.bestBargain.surplus})` : ''}
${t.worstOverpay ? `Worst Overpay: ${t.worstOverpay.playerName} (paid $${t.worstOverpay.price}, val $${t.worstOverpay.projectedValue}, surplus $${t.worstOverpay.surplus})` : ''}
Keepers: ${t.keepers.map(k => `${k.playerName} (${k.position}, $${k.price}${k.projectedValue !== null ? `, val $${k.projectedValue}` : ''})`).join(', ') || 'None'}
Auction Picks: ${t.roster.filter(r => !r.isKeeper).sort((a, b) => b.price - a.price).map(p => `${p.playerName} (${p.position}/${p.mlbTeam ?? ''}, $${p.price}${p.projectedValue !== null ? `, val $${p.projectedValue}` : ''})`).join(', ') || 'None'}
`).join('\n')}

For EACH team, provide:
1. A letter grade (A+, A, A-, B+, B, B-, C+, C, C-, D, F) — grade the AUCTION DRAFT ONLY (not keepers). Use the surplus data heavily but factor in NL-only scarcity: a team with positive or near-zero surplus should get A-range grades. A team with large negative surplus (-$100+) should get C or below. Be differentiated — not every team should get a B.
2. A 2-3 sentence keeper assessment: evaluate the quality of their keeper selections. Did they keep the right players? Were keeper costs good value?
3. A 3-4 sentence auction analysis covering draft strategy, best/worst moves, and how auction picks complement keepers.
4. Projected stat contributions: estimate realistic 2026 projected stats for the FULL roster (keepers + auction picks). Provide team totals for: R, HR, RBI, SB, AVG (hitters) and W, SV, K, ERA, WHIP (pitchers). IMPORTANT: Factor in injury history — players with significant injury histories (e.g., Buehler, May, Strider, Acuña) should have their projections discounted by 15-30%. Also build in a small uncertainty discount (~5%) for all projections to account for the unknown.
5. Category strengths (1-3 of the 10 roto categories where this team should DOMINATE) and category weaknesses (1-3 categories where this team is VULNERABLE). Be specific — reference which players drive the strength or create the weakness. Flag injury-prone players as risk factors.

IMPORTANT: Return ONLY a valid JSON array, no markdown, no code blocks. Each element:
[{"teamId": number, "teamName": string, "grade": string, "keeperAssessment": string, "analysis": string, "projectedStats": string, "categoryStrengths": string, "categoryWeaknesses": string}]

For projectedStats, format as a single line like: "Hitting: ~850 R, 280 HR, 830 RBI, 110 SB, .262 AVG | Pitching: ~85 W, 45 SV, 1050 K, 3.65 ERA, 1.18 WHIP"
For categoryStrengths/categoryWeaknesses, format like: "HR (Olson, Ohtani, Turner combine for ~90 HR), SB (Turner, Cruz elite speed)" or "SV (no elite closer), AVG (multiple low-average power bats)"`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();

      const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const raw = JSON.parse(jsonStr);

      const schema = z.array(z.object({
        teamId: z.number(),
        teamName: z.string().max(200),
        grade: z.string().max(5),
        keeperAssessment: z.string().max(2000),
        analysis: z.string().max(3000),
        projectedStats: z.string().max(500),
        categoryStrengths: z.string().max(1000),
        categoryWeaknesses: z.string().max(1000),
      }));

      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        logger.error({ zodError: parsed.error.message }, "AI returned invalid draft report structure");
        return { success: false, error: 'Draft report returned invalid data' };
      }

      // Merge AI output with computed metrics
      const reportTeams = parsed.data.map(g => {
        const metrics = teamMetrics.find(t => t.id === g.teamId);
        return {
          teamId: g.teamId,
          teamName: g.teamName,
          grade: g.grade,
          keeperAssessment: g.keeperAssessment,
          analysis: g.analysis,
          projectedStats: g.projectedStats,
          categoryStrengths: g.categoryStrengths,
          categoryWeaknesses: g.categoryWeaknesses,
          auctionSpend: metrics?.auctionSpend ?? 0,
          keeperSpend: metrics?.keeperSpend ?? 0,
          keeperCount: metrics?.keepers.length ?? 0,
          avgHitterPrice: metrics?.avgHitterPrice ?? 0,
          avgPitcherPrice: metrics?.avgPitcherPrice ?? 0,
          totalSurplus: metrics?.totalSurplus ?? 0,
          auctionSurplus: metrics?.auctionSurplus ?? 0,
          hitterSpend: metrics?.hitterSpend ?? 0,
          pitcherSpend: metrics?.pitcherSpend ?? 0,
          top3Pct: metrics?.top3Pct ?? 0,
          favMlbTeam: metrics?.favMlbTeam ?? null,
          bestBargain: metrics?.bestBargain ?? null,
          worstOverpay: metrics?.worstOverpay ?? null,
          keepers: metrics?.keepers ?? [],
          roster: metrics?.roster ?? [],
        };
      });

      return {
        success: true,
        report: {
          leagueSummary: { avgHitterPrice: leagueAvgHitterPrice, avgPitcherPrice: leagueAvgPitcherPrice },
          surplusRanking: surplusRanking.map(t => ({ teamId: t.id, teamName: t.name, surplus: t.auctionSurplus })),
          teams: reportTeams,
          generatedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      logger.error({ error: String(err) }, "AI draft report failed");
      return { success: false, error: 'Draft report generation failed' };
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
    // Analytical: grade letters + summary — consistency across teams matters
    const model = await this.getModel(0.4);
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
    teams: { id: number; name: string; budget: number; roster: { playerName: string; position: string; price: number; isKeeper?: boolean }[] }[],
    leagueId: number,
  ): Promise<{
    success: boolean;
    result?: { fairness: string; winner: string; analysis: string; recommendation: string; categoryImpact?: string | null; keeperNote?: string | null; positionNote?: string | null };
    error?: string;
  }> {
    // Critical analysis: who won the trade, fairness grade — facts-first
    const model = await this.getModel(0.3);
    if (!model) {
      return { success: false, error: 'AI trade analysis is not available' };
    }

    try {
      const teamMap = new Map(teams.map(t => [t.id, t]));

      const itemDescriptions = tradeItems.map(item => {
        const from = teamMap.get(item.fromTeamId);
        const to = teamMap.get(item.toTeamId);
        if (item.type === "budget") {
          return `$${item.amount} Waiver Budget from ${from?.name ?? 'Unknown'} to ${to?.name ?? 'Unknown'}`;
        }
        // Check if the traded player is a keeper
        const fromRoster = from?.roster ?? [];
        const isKeeper = fromRoster.find(r => r.playerName === item.playerName)?.isKeeper;
        const keeperTag = isKeeper ? " [KEEPER]" : "";
        return `${item.playerName}${keeperTag} from ${from?.name ?? 'Unknown'} to ${to?.name ?? 'Unknown'}`;
      });

      // Build position distribution for each team
      const teamSummaries = teams.map(t => {
        const positionCounts: Record<string, number> = {};
        t.roster.forEach(r => {
          const pos = r.position || "UT";
          positionCounts[pos] = (positionCounts[pos] || 0) + 1;
        });
        const keeperPlayers = t.roster.filter(r => r.isKeeper).map(r => r.playerName);
        return {
          name: t.name,
          budget: t.budget,
          rosterSize: t.roster.length,
          positionBreakdown: positionCounts,
          keeperPlayers: keeperPlayers.length > 0 ? keeperPlayers : undefined,
          roster: t.roster.map(r => `${r.playerName} (${r.position}, $${r.price}${r.isKeeper ? ', KEEPER' : ''})`).join(', '),
        };
      });

      // Detect keepers involved in trade
      const keeperItems = tradeItems.filter(item => {
        const from = teamMap.get(item.fromTeamId);
        return from?.roster.find(r => r.playerName === item.playerName)?.isKeeper;
      });

      const keeperWarning = keeperItems.length > 0
        ? `\n\nIMPORTANT KEEPER WARNING: ${keeperItems.map(k => k.playerName).join(', ')} ${keeperItems.length === 1 ? 'is a keeper player' : 'are keeper players'}. Trading keepers has long-term implications — note this prominently in your analysis.`
        : '';

      const prompt = `You are a fantasy baseball trade analyst for a head-to-head category league. Analyze this PRE-TRADE proposal and advise the proposer whether to proceed.

League ID: ${leagueId}

Trade Items:
${itemDescriptions.map((d, i) => `${i + 1}. ${d}`).join('\n')}

Teams Involved:
${JSON.stringify(teamSummaries, null, 2)}
${keeperWarning}

Consider these factors:
1. FAIRNESS: Is the trade balanced in player value?
2. CATEGORY IMPACT: How does this trade shift each team's category strengths/weaknesses (HR, RBI, AVG, SB, R for hitters; W, K, ERA, WHIP, SV for pitchers)?
3. POSITION SCARCITY: Does the receiving team need this position? Does the sending team have depth?
4. KEEPER IMPLICATIONS: Are any keeper-eligible players being traded? What's the long-term cost?

Return ONLY a valid JSON object (no markdown, no code blocks) with these fields:
- "fairness": one of "fair", "slightly_unfair", or "unfair"
- "winner": name of the team that benefits more (or "even" if fair)
- "analysis": 2-3 sentences analyzing the trade impact on both teams
- "categoryImpact": 1-2 sentences on how this shifts category strengths for each team
- "keeperNote": 1 sentence on keeper implications (or null if no keepers involved)
- "positionNote": 1 sentence on position fit/scarcity for each side (or null if not relevant)
- "recommendation": 1 sentence recommendation (approve, reject, or suggest modifications)`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const raw = JSON.parse(jsonStr);

      const schema = z.object({
        fairness: z.enum(["fair", "slightly_unfair", "unfair"]),
        winner: z.string().max(200),
        analysis: z.string().max(2000),
        categoryImpact: z.string().max(1000).nullable().optional(),
        keeperNote: z.string().max(500).nullable().optional(),
        positionNote: z.string().max(500).nullable().optional(),
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
    // Analytical: ranked keeper picks by value — deterministic reasoning
    const model = await this.getModel(0.4);
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
- Value relative to keeper cost (is the player worth more than their keeper price in an auction? Use the projected values provided in stats summaries)
- Position scarcity (especially in NL-only leagues where the player pool is limited)
- Player quality, consistency, and INJURY HISTORY — discount injury-prone players by 15-30% in value
- Budget impact of keeping vs drafting fresh
- Age and multi-year keeper trajectory (younger players with surplus value are better long-term keepers)

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
    // Numerical advice: suggested waiver bid — low variance required
    const model = await this.getModel(0.4);
    if (!model) {
      return { success: false, error: 'AI waiver advice is not available' };
    }

    try {
      const positionPlayers = teamRoster.filter(r => r.position === player.position);

      const prompt = `You are a fantasy baseball Waiver Budget waiver bid advisor.

Player to Claim: ${player.name} (${player.position}, ${player.mlbTeam})
Player Stats: ${player.statsSummary}

Team Info:
- Remaining Waiver Budget Budget: $${teamBudget}
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

  // ─── Feature 4: Weekly AI Insights (Stats-Aware) ───────────────────────────

  async generateWeeklyInsights(input: {
    team: { id: number; name: string; budget: number };
    roster: { playerName: string; position: string; mlbTeam?: string; price: number; projectedValue: number | null; projectedStats: string | null }[];
    standings: { teamName: string; rank: number; totalScore: number }[];
    /** Category standings: where this team ranks in each of 10 roto categories (null if no stats yet) */
    categoryRankings: { category: string; rank: number; value: number }[] | null;
    recentTransactions: { type: string; playerName: string; date: string }[];
    leagueType: string;
    /** Whether actual stats are available or we're in pre-season projection mode */
    hasActualStats: boolean;
  }): Promise<{
    success: boolean;
    result?: {
      insights: { category: string; title: string; detail: string; priority: string }[];
      overallGrade: string;
      mode: string;
    };
    error?: string;
  }> {
    // Mixed: team performance narrative + data callouts — some flavor OK
    const model = await this.getModel(0.6);
    if (!model) {
      return { success: false, error: 'AI insights are not available' };
    }

    try {
      const { team, roster, standings, categoryRankings, recentTransactions, leagueType, hasActualStats } = input;
      const teamStanding = standings.find(s => s.teamName === team.name);
      const leagueTypeLabel = leagueType === "NL" ? "NL-ONLY" : leagueType === "AL" ? "AL-ONLY" : "Mixed";
      const mode = hasActualStats ? "in-season" : "pre-season";

      const hitters = roster.filter(r => !isPitcherPos(r.position));
      const pitchers = roster.filter(r => isPitcherPos(r.position));

      // Format player stats for the prompt (show actual numbers, not guesses)
      const formatHitter = (r: any) => {
        const ps = r.periodStats;
        if (!ps || ps.AB === 0) return `${r.playerName} (${r.position}, ${r.mlbTeam || '?'}) — NO STATS YET (0 AB)`;
        const avg = ps.AB > 0 ? (ps.H / ps.AB).toFixed(3).replace(/^0/, '') : '.000';
        return `${r.playerName} (${r.position}, ${r.mlbTeam || '?'}) — ${ps.AB}AB ${ps.R}R ${ps.HR}HR ${ps.RBI}RBI ${ps.SB}SB ${avg}AVG`;
      };
      const formatPitcher = (r: any) => {
        const ps = r.periodStats;
        if (!ps || ps.IP === 0) return `${r.playerName} (${r.position}, ${r.mlbTeam || '?'}) — HAS NOT PITCHED (0 IP)`;
        const era = ps.IP > 0 ? ((ps.ER / ps.IP) * 9).toFixed(2) : '0.00';
        const whip = ps.IP > 0 ? ((ps.BB_H || 0) / ps.IP).toFixed(2) : '0.00';
        return `${r.playerName} (${r.position}, ${r.mlbTeam || '?'}) — ${ps.W}W ${ps.SV}SV ${ps.K}K ${ps.IP}IP ${era}ERA ${whip}WHIP`;
      };

      const prompt = `You are a fantasy baseball analyst. Analyze this team's ACTUAL STATS below and provide performance insights.

CRITICAL: ONLY reference stats shown in the data below. If a player shows "0 IP" or "HAS NOT PITCHED", do NOT say they pitched well. If a player shows "0 AB" or "NO STATS YET", do NOT comment on their hitting. Only discuss what the numbers actually show.

TEAM: ${team.name}
${teamStanding ? `Rank: ${teamStanding.rank}/${standings.length} (${teamStanding.totalScore} roto pts)` : 'Standings not yet available'}

HITTER STATS (this period):
${hitters.map(formatHitter).join('\n')}

PITCHER STATS (this period):
${pitchers.map(formatPitcher).join('\n')}

${categoryRankings ? `TEAM CATEGORY RANKS (out of ${standings.length} teams):
${categoryRankings.map(c => `  ${c.category}: #${c.rank}${c.rank <= 2 ? ' ★' : c.rank >= standings.length - 1 ? ' ⚠' : ''} (${c.value})`).join('\n')}` : ''}

STANDINGS: ${standings.map(s => `${s.rank}. ${s.teamName} ${s.totalScore}pts`).join(' | ')}

${recentTransactions.length > 0 ? `RECENT MOVES: ${recentTransactions.map(t => `${t.type}: ${t.playerName}`).join(', ')}` : ''}

Provide exactly 4 concise insights based ONLY on the stats above:
1. **Hot/Cold Bats** — Which hitters have good or bad stat lines? Reference their actual numbers.
2. **Pitching** — Which pitchers have pitched and how did they do? Who has NOT pitched yet (0 IP)?
3. **Roster Alert** — Any players with 0 AB or 0 IP who may be injured or not yet in the lineup.
4. **Hot Take** — One bold, specific prediction about this team's next week. Reference a player's trend.

Keep each insight to 1-2 sentences. Be factual — cite actual stat lines from the data above.

GRADING RULES — grade MUST correlate with standings position:
- 1st-2nd place: A- to A+ (only A- if terrible week)
- 3rd-4th place: B to A- (adjust based on weekly trajectory)
- 5th-6th place: C to B (average production)
- 7th-8th place: D to C (only give F if truly catastrophic)
A 1st-place team CANNOT receive below B-. A last-place team CANNOT receive above B+.

Return ONLY valid JSON:
{
  "insights": [{ "category": string, "title": string, "detail": string, "priority": "high" | "medium" | "low" }],
  "overallGrade": "A+ through F"
}

Categories: "Hot Bats", "Cold Bats", "Pitching", "Injury", "Waiver Wire", "Standings", "Hot Take"`;


      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const raw = JSON.parse(jsonStr);

      const schema = z.object({
        insights: z.array(z.object({
          category: z.string().max(50),
          title: z.string().max(200),
          detail: z.string().max(1000),
          priority: z.enum(["high", "medium", "low"]).default("medium"),
        })),
        overallGrade: z.string().max(5),
      });

      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        logger.error({ zodError: parsed.error.message }, "AI returned invalid insights structure");
        return { success: false, error: 'Weekly insights returned invalid data' };
      }

      return { success: true, result: { ...parsed.data, mode } };
    } catch (err) {
      logger.error({ error: String(err) }, "AI weekly insights failed");
      return { success: false, error: 'Weekly insights failed' };
    }
  }

  // ─── Feature 5: Auction Draft Advisor (Team-Aware Marginal Value) ──────────

  async adviseBid(input: {
    player: { name: string; position: string; mlbTeam: string; projectedValue: number | null };
    currentBid: number;
    team: {
      name: string;
      budget: number;
      openSlots: number;
      hitterCount: number;
      pitcherCount: number;
      hitterMax: number;
      pitcherMax: number;
      roster: { playerName: string; position: string; price: number }[];
    };
    league: {
      teamsCount: number;
      avgBudgetRemaining: number;
      rosterSize: number;
      leagueType: string; // "NL" | "AL" | "ALL"
    };
    /** Top remaining players at the same position still available in the auction pool */
    alternativesAtPosition: { name: string; projectedValue: number }[];
    /** The team's projected category totals based on current roster */
    teamProjections: {
      R: number; HR: number; RBI: number; SB: number; AVG: number;
      W: number; SV: number; K: number; ERA: number; WHIP: number;
    } | null;
    /** What the nominated player would add to the team's category totals */
    playerProjectedStats: string | null;
  }): Promise<{
    success: boolean;
    result?: {
      shouldBid: boolean;
      maxRecommendedBid: number;
      reasoning: string;
      confidence: string;
      categoryImpact: string;
    };
    error?: string;
  }> {
    // In-auction advice: suggested bid + reasoning — consistency per context
    const model = await this.getModel(0.4);
    if (!model) {
      return { success: false, error: 'AI bid advice is not available' };
    }

    try {
      const { player, currentBid, team, league, alternativesAtPosition, teamProjections, playerProjectedStats } = input;
      const isPitcher = isPitcherPos(player.position);
      const positionNeed = isPitcher
        ? `${team.pitcherCount}/${team.pitcherMax} pitchers filled`
        : `${team.hitterCount}/${team.hitterMax} hitters filled`;

      const leagueTypeLabel = league.leagueType === "NL" ? "NL-ONLY" : league.leagueType === "AL" ? "AL-ONLY" : "Mixed";

      const prompt = `You are a fantasy baseball auction draft advisor for a team in an ${leagueTypeLabel} league. Analyze whether this team should bid on the nominated player and provide a maximum recommended bid based on MARGINAL VALUE TO THIS SPECIFIC TEAM.

NOMINATED PLAYER:
- ${player.name} (${player.position}, ${player.mlbTeam})
- Current Bid: $${currentBid}
- Projected Auction Value: ${player.projectedValue !== null ? `$${player.projectedValue}` : 'unknown'}
${playerProjectedStats ? `- Projected Stats: ${playerProjectedStats}` : ''}

YOUR TEAM (${team.name}):
- Budget Remaining: $${team.budget}
- Open Roster Slots: ${team.openSlots}
- Position Need: ${positionNeed}
- Current Roster (${team.roster.length} players):
${team.roster.map(r => `  ${r.playerName} (${r.position}, $${r.price})`).join('\n')}
${teamProjections ? `
- Team's Category Strength Scores (summed projections from rostered players — higher = stronger):
  Hitting: R:${teamProjections.R.toFixed(1)}, HR:${teamProjections.HR.toFixed(1)}, RBI:${teamProjections.RBI.toFixed(1)}, SB:${teamProjections.SB.toFixed(1)}, AVG:${teamProjections.AVG.toFixed(1)}
  Pitching: W:${teamProjections.W.toFixed(1)}, SV:${teamProjections.SV.toFixed(1)}, K:${teamProjections.K.toFixed(1)}, ERA:${teamProjections.ERA.toFixed(1)}, WHIP:${teamProjections.WHIP.toFixed(1)}
  (Compare against player's stats above to see which categories they'd boost)` : ''}

ALTERNATIVES STILL AVAILABLE at ${player.position}:
${alternativesAtPosition.length > 0 ? alternativesAtPosition.map(a => `  ${a.name} (val $${a.projectedValue})`).join('\n') : '  None — this may be the last quality option at this position'}

LEAGUE CONTEXT:
- ${leagueTypeLabel} league, ${league.teamsCount} teams, ${league.rosterSize}-man rosters
- Average Budget Remaining across league: $${Math.round(league.avgBudgetRemaining)}
- 10-category roto: R, HR, RBI, SB, AVG | W, SV, K, ERA, WHIP

IMPORTANT: The max bid should reflect the MARGINAL VALUE of this player TO THIS TEAM — not just the generic projected value. A team desperate for saves should pay more for a closer than a team that already has two. A team with surplus budget late in the draft can be more aggressive. Factor in:
1. Does the team NEED this position/category contribution?
2. How scarce are alternatives at this position?
3. Budget math: team needs $1 per remaining open slot minimum
4. Is the current bid already above fair value, or is there room?

Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "shouldBid": boolean,
  "maxRecommendedBid": number (integer),
  "reasoning": "2-3 sentences explaining the recommendation — reference specific category needs and alternatives",
  "confidence": "high" | "medium" | "low",
  "categoryImpact": "1 sentence: which categories this player would help or hurt (e.g., 'Fills SV gap (+30 SV), but doesn't help SB')"
}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const raw = JSON.parse(jsonStr);

      const schema = z.object({
        shouldBid: z.boolean(),
        maxRecommendedBid: z.number().int().nonnegative(),
        reasoning: z.string().max(2000),
        confidence: z.enum(["high", "medium", "low"]),
        categoryImpact: z.string().max(500),
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
  // ─── Post-Waiver Claim Analysis ──────────────────────────────────────────

  async analyzeWaiverClaim(input: {
    teamName: string;
    teamBudgetAfter: number;
    playerName: string;
    playerPosition: string;
    playerMlbTeam: string;
    bidAmount: number;
    dropPlayerName: string | null;
    dropPlayerPosition: string | null;
    projectedValue: number | null;
    rosterSample: string[];
    leagueType: string;
  }): Promise<{
    success: boolean;
    result?: { assessment: string; bidGrade: string; categoryImpact: string };
    error?: string;
  }> {
    // Post-facto: bid grade + category impact — factual, low variance
    const model = await this.getModel(0.3);
    if (!model) {
      return { success: false, error: 'AI waiver analysis is not available' };
    }

    try {
      const leagueTypeLabel = input.leagueType === "NL" ? "NL-ONLY" : input.leagueType === "AL" ? "AL-ONLY" : "Mixed";

      const prompt = `You are a fantasy baseball analyst. Evaluate this completed waiver claim.

League: ${leagueTypeLabel}, 10-cat roto

CLAIM:
- Team: ${input.teamName} (waiver budget after: $${input.teamBudgetAfter})
- Added: ${input.playerName} (${input.playerPosition}, ${input.playerMlbTeam}) for $${input.bidAmount}
${input.dropPlayerName ? `- Dropped: ${input.dropPlayerName} (${input.dropPlayerPosition})` : '- No player dropped'}
${input.projectedValue !== null ? `- Player projected value: $${input.projectedValue}` : ''}

TEAM ROSTER (after claim):
${input.rosterSample.join('\n')}

Provide a brief assessment. Return ONLY a valid JSON object (no markdown, no code blocks):
{"assessment": "2-3 sentences", "bidGrade": "A+ through F", "categoryImpact": "which categories this helps"}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const raw = JSON.parse(jsonStr);

      const schema = z.object({
        assessment: z.string().max(2000),
        bidGrade: z.string().max(5),
        categoryImpact: z.string().max(500),
      });

      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        logger.error({ zodError: parsed.error.message }, "AI returned invalid waiver analysis");
        return { success: false, error: 'Waiver analysis returned invalid data' };
      }

      return { success: true, result: parsed.data };
    } catch (err) {
      logger.error({ error: String(err) }, "AI waiver analysis failed");
      return { success: false, error: 'Waiver analysis failed' };
    }
  }
}

export const aiAnalysisService = new AIAnalysisService();
