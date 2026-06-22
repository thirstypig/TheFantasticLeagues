# AI Analysis System

## Architecture

- **Service**: `server/src/services/aiAnalysisService.ts` — all AI methods, model selection, prompt templates
- **Models**: Google Gemini 2.5 Flash (primary), Anthropic Claude Sonnet 4 (fallback)
- **Validation**: All LLM JSON responses validated with Zod schemas
- **Attribution**: All AI-generated content must show "Powered by Google Gemini & Anthropic Claude"

## AI Features (8 active)

| Feature | Trigger | Persistence | Location |
|---------|---------|-------------|----------|
| Draft Report | Manual (generate once) | `AuctionSession.state.draftReport` | `/draft-report` page |
| Live Bid Advice | On-demand during auction | In-memory cache per bid | Auction stage inline |
| Weekly Team Insights | Auto on Team page load | `AiInsight` table (weekly dedup) | Team page header |
| League Digest | Auto on Home page load | `AiInsight` table (weekly dedup) | Home page (with week tabs) |
| Trade of the Week Poll | Part of League Digest | Votes in `AiInsight.data` JSON | Home page (current week only) |
| Post-Trade Analysis | Fire-and-forget on processing | `Trade.aiAnalysis` JSON | Activity/Trades inline |
| Post-Waiver Analysis | Fire-and-forget on processing | `WaiverClaim.aiAnalysis` JSON | Activity inline |
| Keeper Recommendations | On-demand | In-memory cache | Keeper prep page |

## Data Sources for AI Prompts

- **Projected values**: `server/data/ogba_auction_values_2026.csv` (843 players with dollar values)
- **Roster data**: Prisma queries (player names, positions, prices, MLB teams, keeper status via `source` field)
- **Auction log**: `AuctionSession.state.log` (WIN events with timestamps, prices, team assignments)
- **League context**: NL-only/AL-only/Mixed from league rules, budget caps, roster sizes

## Prompt Guidelines

- Always include NL-only context when applicable (player scarcity)
- Discount injury-prone players by 15-30% in projections
- Apply ~5% uncertainty discount on all stat projections
- Use "Waiver Budget" instead of "FAAB" in user-facing content
- Grade on value efficiency (surplus), not just star power

## League Digest Rules

- **NO auction prices, draft costs, or budget amounts** in weekly digests — focus on performance only
- Week 1 digest (post-draft) is the ONLY exception — it may discuss auction results and team grades for the draft
- All subsequent weekly digests must be stats-focused: real category standings, player availability, who played vs who didn't
- Trade of the Week must NEVER include keeper players — keepers are untouchable
- Power rankings must correlate with actual standings data
- Digest sections: weekInOneSentence, powerRankings, hotTeam, coldTeam, statOfTheWeek, categoryMovers, proposedTrade, boldPrediction
- Past digests are browsable via week tabs on the Home page; votes are read-only on past weeks
