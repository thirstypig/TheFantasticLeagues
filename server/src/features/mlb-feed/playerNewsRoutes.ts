/**
 * Player news + RSS feed routes — extracted from mlb-feed/routes.ts (#147).
 * Handles: /trade-rumors, /player-news, /yahoo-sports, /mlb-news, /espn-news
 */
import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { fetchRssFeed } from "./services/rssParser.js";
import { createPlayerNameMatcher } from "./services/playerNameMatcher.js";

const router = Router();

// ─── GET /trade-rumors — Parse MLB Trade Rumors RSS ───

router.get("/trade-rumors", requireAuth, asyncHandler(async (_req, res) => {
  const articles = await fetchRssFeed("https://www.mlbtraderumors.com/feed", { sourceName: "TradeRumors" });
  res.json({ items: articles.map(a => ({ title: a.title, link: a.link, pubDate: a.pubDate, categories: a.categories })) });
}));

// ─── GET /player-news — Aggregated RSS news for a specific player ───

router.get("/player-news", requireAuth, asyncHandler(async (req, res) => {
  const playerName = typeof req.query.playerName === "string" ? req.query.playerName.trim() : "";
  if (!playerName || playerName.length < 2) {
    return res.status(400).json({ error: "playerName must be at least 2 characters" });
  }

  const matcher = createPlayerNameMatcher(playerName);

  // Fetch all 4 feeds in parallel (cached via rssParser 5-min TTL)
  const [rumors, yahoo, mlb, espn] = await Promise.all([
    fetchRssFeed("https://www.mlbtraderumors.com/feed", { sourceName: "TradeRumors" }),
    fetchRssFeed("https://sports.yahoo.com/mlb/rss/", { sourceName: "Yahoo" }),
    fetchRssFeed("https://www.mlb.com/feeds/news/rss.xml", { sourceName: "MLB.com" }),
    fetchRssFeed("https://www.espn.com/espn/rss/mlb/news", { sourceName: "ESPN" }),
  ]);

  const matched: { source: string; title: string; link: string; pubDate: string }[] = [];

  for (const a of rumors) {
    // Trade Rumors tags articles via categories (e.g., "Will Smith"); run matcher
    // on categories AND title — same word-boundary + ambiguous-last-name rules.
    const catMatch = a.categories.some(c => matcher.matches(c));
    if (matcher.matches(a.title) || catMatch) {
      matched.push({ source: "Trade Rumors", title: a.title, link: a.link, pubDate: a.pubDate });
    }
  }
  for (const a of [...yahoo, ...mlb, ...espn]) {
    if (matcher.matches(a.title)) {
      const source = yahoo.includes(a) ? "Yahoo" : mlb.includes(a) ? "MLB.com" : "ESPN";
      matched.push({ source, title: a.title, link: a.link, pubDate: a.pubDate });
    }
  }

  // Sort by date descending, limit to 5
  matched.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  res.json({ articles: matched.slice(0, 5) });
}));

// ─── GET /yahoo-sports — Yahoo Sports MLB RSS feed ───

router.get("/yahoo-sports", requireAuth, asyncHandler(async (_req, res) => {
  const articles = await fetchRssFeed("https://sports.yahoo.com/mlb/rss/", { sourceName: "Yahoo" });
  res.json({ articles: articles.map(a => ({ title: a.title, link: a.link, pubDate: a.pubDate, description: a.description })) });
}));

// ─── GET /mlb-news — MLB.com official news RSS feed ───

router.get("/mlb-news", requireAuth, asyncHandler(async (_req, res) => {
  const articles = await fetchRssFeed("https://www.mlb.com/feeds/news/rss.xml", { sourceName: "MLB.com" });
  res.json({ articles: articles.map(a => ({ title: a.title, link: a.link, pubDate: a.pubDate, description: a.description })) });
}));

// ─── GET /espn-news — ESPN MLB news RSS feed ───

router.get("/espn-news", requireAuth, asyncHandler(async (_req, res) => {
  const articles = await fetchRssFeed("https://www.espn.com/espn/rss/mlb/news", { sourceName: "ESPN" });
  res.json({ articles: articles.map(a => ({ title: a.title, link: a.link, pubDate: a.pubDate, description: a.description })) });
}));

export const playerNewsRouter = router;
