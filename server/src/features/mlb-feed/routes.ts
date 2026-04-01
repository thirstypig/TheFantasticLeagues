import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, requireLeagueMember } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { mlbGetJson, fetchMlbTeamsMap } from "../../lib/mlbApi.js";
import { prisma } from "../../db/prisma.js";
import { logger } from "../../lib/logger.js";

const router = Router();

// ─── Types ───

interface GameScore {
  gamePk: number;
  status: string;
  detailedState: string;
  startTime: string;
  away: { id: number; name: string; abbr: string; score: number; wins: number; losses: number };
  home: { id: number; name: string; abbr: string; score: number; wins: number; losses: number };
  inning?: number;
  inningState?: string;
}

interface MlbTransaction {
  id: number;
  playerName: string;
  playerMlbId: number;
  teamName: string;
  teamAbbr: string;
  fromTeamName?: string;
  fromTeamAbbr?: string;
  type: string;
  typeCode: string;
  description: string;
  date: string;
}

interface MyPlayerToday {
  playerName: string;
  mlbId: number;
  mlbTeam: string;
  gameTime: string;
  opponent: string;
  homeAway: "home" | "away";
}

// ─── Helpers ───

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const WEEK_KEY_REGEX = /^\d{4}-W\d{2}$/;

/** MLB "game day" date in YYYY-MM-DD format, Pacific time.
 *  Before noon PST/PDT, returns YESTERDAY's date so last night's stats remain visible.
 *  After noon, returns today's date for upcoming/live games. */
function todayDateStr(): string {
  const now = new Date();
  const pacificHour = Number(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hour12: false }));
  if (pacificHour < 12) {
    // Before noon PST — show yesterday's games (last night's stats)
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return yesterday.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  }
  return now.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

// NL/AL team sets for transaction filtering
const NL_TEAMS = new Set([
  "ARI", "AZ", "ATL", "CHC", "CIN", "COL", "LAD", "MIA", "MIL",
  "NYM", "PHI", "PIT", "SD", "SF", "STL", "WSH",
]);

const AL_TEAMS = new Set([
  "BAL", "BOS", "CLE", "DET", "HOU", "KC", "LAA", "MIN",
  "NYY", "ATH", "OAK", "SEA", "TB", "TEX", "TOR", "CWS",
]);

// ─── GET /scores ───

router.get(
  "/scores",
  requireAuth,
  asyncHandler(async (req, res) => {
    const date = (req.query.date as string) || todayDateStr();
    if (!DATE_REGEX.test(date)) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
    }

    const url = `https://statsapi.mlb.com/api/v1/schedule?date=${date}&sportId=1&hydrate=linescore`;
    const [data, teamsMap] = await Promise.all([
      mlbGetJson(url, 60),
      fetchMlbTeamsMap(),
    ]);

    const games: GameScore[] = [];
    for (const dateEntry of data.dates || []) {
      for (const g of dateEntry.games || []) {
        const away = g.teams?.away;
        const home = g.teams?.home;
        const ls = g.linescore;
        const awayId = away?.team?.id ?? 0;
        const homeId = home?.team?.id ?? 0;

        games.push({
          gamePk: g.gamePk,
          status: g.status?.abstractGameState ?? "Unknown",
          detailedState: g.status?.detailedState ?? "Unknown",
          startTime: g.gameDate ?? "",
          away: {
            id: awayId,
            name: away?.team?.name ?? "",
            abbr: teamsMap[awayId] ?? "",
            score: away?.score ?? 0,
            wins: away?.leagueRecord?.wins ?? 0,
            losses: away?.leagueRecord?.losses ?? 0,
          },
          home: {
            id: homeId,
            name: home?.team?.name ?? "",
            abbr: teamsMap[homeId] ?? "",
            score: home?.score ?? 0,
            wins: home?.leagueRecord?.wins ?? 0,
            losses: home?.leagueRecord?.losses ?? 0,
          },
          ...(ls?.currentInning != null ? { inning: ls.currentInning } : {}),
          ...(ls?.inningState ? { inningState: ls.inningState } : {}),
        });
      }
    }

    return res.json({ date, games });
  })
);

// ─── GET /transactions ───

router.get(
  "/transactions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const date = (req.query.date as string) || todayDateStr();
    if (!DATE_REGEX.test(date)) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
    }

    const filter = ((req.query.filter as string) || "ALL").toUpperCase();
    if (!["ALL", "NL", "AL"].includes(filter)) {
      return res.status(400).json({ error: "Invalid filter. Use ALL, NL, or AL." });
    }

    const url = `https://statsapi.mlb.com/api/v1/transactions?date=${date}`;
    const data = await mlbGetJson(url, 1800);

    // Build abbreviation lookup from team IDs
    const teamsMap = await fetchMlbTeamsMap();

    const filterSet = filter === "NL" ? NL_TEAMS : filter === "AL" ? AL_TEAMS : null;

    const transactions: MlbTransaction[] = [];
    for (const t of data.transactions || []) {
      const toTeamId = t.toTeam?.id;
      const fromTeamId = t.fromTeam?.id;
      const toTeamAbbr = toTeamId ? (teamsMap[toTeamId] ?? "") : "";
      const fromTeamAbbr = fromTeamId ? (teamsMap[fromTeamId] ?? "") : "";

      // Filter by league if requested
      if (filterSet) {
        const matchesTo = toTeamAbbr && filterSet.has(toTeamAbbr);
        const matchesFrom = fromTeamAbbr && filterSet.has(fromTeamAbbr);
        if (!matchesTo && !matchesFrom) continue;
      }

      // Skip transactions without a player
      if (!t.person?.id || !t.person?.fullName) continue;

      transactions.push({
        id: t.id,
        playerName: t.person.fullName,
        playerMlbId: t.person.id,
        teamName: t.toTeam?.name ?? "",
        teamAbbr: toTeamAbbr,
        ...(t.fromTeam ? { fromTeamName: t.fromTeam.name ?? "", fromTeamAbbr } : {}),
        type: t.typeDesc ?? "",
        typeCode: t.typeCode ?? "",
        description: t.description ?? "",
        date: t.date ?? date,
      });
    }

    return res.json({ date, filter, transactions });
  })
);

// ─── GET /trade-rumors — Parse MLB Trade Rumors RSS ───

router.get("/trade-rumors", requireAuth, asyncHandler(async (_req, res) => {
  try {
    const feedUrl = "https://www.mlbtraderumors.com/feed";
    const response = await fetch(feedUrl, {
      headers: { "User-Agent": "FBST/1.0 Fantasy Baseball App" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return res.json({ items: [] });
    }
    const xml = await response.text();

    // Simple RSS XML parser — extract <item> entries
    const items: { title: string; link: string; pubDate: string; categories: string[] }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 15) {
      const block = match[1];
      const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
        ?? block.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
      const link = block.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/)?.[1]
        ?? block.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";
      const categories: string[] = [];
      const catRegex = /<category><!\[CDATA\[(.*?)\]\]><\/category>/g;
      let catMatch;
      while ((catMatch = catRegex.exec(block)) !== null) {
        categories.push(catMatch[1]);
      }
      if (title && link) {
        items.push({ title, link, pubDate, categories });
      }
    }

    res.json({ items });
  } catch (err) {
    logger.warn({ error: String(err) }, "Failed to fetch MLB Trade Rumors RSS");
    res.json({ items: [] });
  }
}));

// ─── GET /roster-status — MLB roster status for user's fantasy players ───

router.get("/roster-status", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  const userId = req.user!.id;

  // Find user's team and roster
  const team = await prisma.team.findFirst({
    where: { leagueId, OR: [{ ownerUserId: userId }, { ownerships: { some: { userId } } }] },
    select: { id: true, name: true },
  });
  if (!team) return res.json({ players: [], teamName: "" });

  const roster = await prisma.roster.findMany({
    where: { teamId: team.id, releasedAt: null },
    include: { player: { select: { name: true, mlbId: true, mlbTeam: true, posPrimary: true } } },
  });

  // Get unique MLB teams from the roster
  const mlbTeams = new Set(roster.map(r => r.player.mlbTeam).filter(Boolean));
  const teamsMap = await fetchMlbTeamsMap();
  const teamIdMap: Record<string, number> = {};
  for (const [id, abbr] of Object.entries(teamsMap)) {
    teamIdMap[abbr as string] = Number(id);
  }

  // Fetch roster/status for each MLB team (cached 6 hours)
  const mlbStatusMap = new Map<number, { status: string; position: string }>();

  for (const teamAbbr of mlbTeams) {
    const teamId = teamIdMap[teamAbbr!];
    if (!teamId) continue;

    try {
      const data = await mlbGetJson(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=fullSeason`, 21600);
      for (const entry of (data.roster || [])) {
        const mlbId = entry.person?.id;
        const status = entry.status?.description || "Unknown";
        const pos = entry.position?.abbreviation || "";
        if (mlbId) mlbStatusMap.set(mlbId, { status, position: pos });
      }
    } catch (err) {
      logger.warn({ error: String(err), teamAbbr }, "Failed to fetch MLB roster status");
    }
  }

  // Cross-reference fantasy roster with MLB status
  const players = roster.map(r => {
    const mlbStatus = r.player.mlbId ? mlbStatusMap.get(r.player.mlbId) : undefined;
    return {
      playerName: r.player.name,
      mlbId: r.player.mlbId,
      mlbTeam: r.player.mlbTeam || "",
      position: r.assignedPosition || r.player.posPrimary || "",
      mlbStatus: mlbStatus?.status || "Unknown",
      isInjured: mlbStatus?.status?.includes("Injured") || false,
      isMinors: mlbStatus?.status?.includes("Minor") || mlbStatus?.status === "Reassigned" || false,
    };
  });

  // Sort: injured/minors first (alerts), then by position
  players.sort((a, b) => {
    if (a.isInjured !== b.isInjured) return a.isInjured ? -1 : 1;
    if (a.isMinors !== b.isMinors) return a.isMinors ? -1 : 1;
    return 0;
  });

  res.json({ players, teamName: team.name });
}));

// ─── GET /injuries — MLB injury list ───

router.get("/injuries", requireAuth, asyncHandler(async (_req, res) => {
  try {
    const data = await mlbGetJson("https://statsapi.mlb.com/api/v1/injuries?sportId=1", 3600);
    const injuries = (data.injuries || []).map((inj: any) => ({
      playerName: inj.player?.fullName ?? "",
      mlbId: inj.player?.id ?? 0,
      team: inj.team?.abbreviation ?? inj.team?.name ?? "",
      injuryType: inj.injuries?.[0]?.description ?? inj.description ?? "",
      ilType: inj.injuries?.[0]?.type ?? "",
      date: inj.date ?? "",
    }));
    res.json({ injuries });
  } catch (err) {
    logger.warn({ error: String(err) }, "Failed to fetch MLB injuries");
    res.json({ injuries: [] });
  }
}));

// ─── GET /player-videos — YouTube highlights for rostered players ───

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";
const YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";

// Cache: player name → { videos, fetchedAt }
const videoCache = new Map<string, { videos: any[]; fetchedAt: number }>();
const VIDEO_CACHE_TTL = 6 * 3600 * 1000; // 6 hours

router.get("/player-videos", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  const userId = req.user!.id;

  // Find user's team
  const team = await prisma.team.findFirst({
    where: { leagueId, OR: [{ ownerUserId: userId }, { ownerships: { some: { userId } } }] },
    select: { id: true, name: true },
  });
  if (!team) return res.json({ videos: [], teamName: "" });

  // Get rostered player names
  const roster = await prisma.roster.findMany({
    where: { teamId: team.id, releasedAt: null },
    select: { player: { select: { name: true, posPrimary: true } }, assignedPosition: true },
  });

  // Include both hitters and pitchers for YouTube search
  const hitterNames = roster
    .filter(r => !["P", "SP", "RP"].includes((r.assignedPosition || r.player.posPrimary || "").toUpperCase()))
    .map(r => r.player.name)
    .slice(0, 4); // Top 4 hitters
  const pitcherNames = roster
    .filter(r => ["P", "SP", "RP"].includes((r.assignedPosition || r.player.posPrimary || "").toUpperCase()))
    .map(r => r.player.name)
    .slice(0, 2); // Top 2 pitchers
  const playerNames = [...hitterNames, ...pitcherNames]; // 6 total searches

  if (!YOUTUBE_API_KEY) {
    // No API key — use YouTube channel RSS from multiple channels (free, no auth)
    const videos: any[] = [];
    const channels = [
      { id: "UCoLrcjPV5PbUrUyXq6TIGtg", name: "MLB" },
      { id: "UCl9E4Zxa8KGW5GRR93lt6mg", name: "Jomboy Media" },
    ];

    for (const channel of channels) {
      try {
        const rssRes = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!rssRes.ok) continue;
        const xml = await rssRes.text();
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let match;
        while ((match = entryRegex.exec(xml)) !== null && videos.length < 12) {
          const block = match[1];
          const title = block.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
          const videoId = block.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1] ?? "";
          const published = block.match(/<published>(.*?)<\/published>/)?.[1] ?? "";
          if (!videoId) continue;

          const thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
          const decodedTitle = title.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"');

          // Check if title mentions a rostered player
          const lowerTitle = decodedTitle.toLowerCase();
          const matchedPlayer = playerNames.find(name => lowerTitle.includes(name.toLowerCase()));

          videos.push({
            videoId,
            title: decodedTitle,
            thumbnail,
            published,
            channelTitle: channel.name,
            source: "rss",
            matchedPlayer: matchedPlayer || null,
          });
        }
      } catch (err) {
        logger.warn({ error: String(err), channel: channel.name }, "Failed to fetch YouTube channel RSS");
      }
    }

    // Sort by published date desc, prioritize matched players
    videos.sort((a, b) => {
      if (a.matchedPlayer && !b.matchedPlayer) return -1;
      if (!a.matchedPlayer && b.matchedPlayer) return 1;
      return new Date(b.published).getTime() - new Date(a.published).getTime();
    });

    return res.json({ videos: videos.slice(0, 12), teamName: team.name, source: "rss" });
  }

  // With API key — search for player highlights
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const publishedAfter = threeMonthsAgo.toISOString();

  const allVideos: any[] = [];

  for (const playerName of playerNames) {
    // Check cache
    const cached = videoCache.get(playerName);
    if (cached && Date.now() - cached.fetchedAt < VIDEO_CACHE_TTL) {
      allVideos.push(...cached.videos);
      continue;
    }

    try {
      const params = new URLSearchParams({
        part: "snippet",
        q: `${playerName} MLB highlights 2026`,
        type: "video",
        order: "date",
        publishedAfter,
        maxResults: "3",
        videoDuration: "short",
        relevanceLanguage: "en",
        key: YOUTUBE_API_KEY,
      });

      const ytRes = await fetch(`${YOUTUBE_SEARCH_URL}?${params}`, {
        signal: AbortSignal.timeout(8000),
      });

      if (ytRes.ok) {
        const data = await ytRes.json() as any;
        const videos = (data.items || []).map((item: any) => ({
          videoId: item.id?.videoId ?? "",
          title: item.snippet?.title ?? "",
          thumbnail: item.snippet?.thumbnails?.medium?.url ?? "",
          published: item.snippet?.publishedAt ?? "",
          channelTitle: item.snippet?.channelTitle ?? "",
          source: "search",
          matchedPlayer: playerName,
        }));
        videoCache.set(playerName, { videos, fetchedAt: Date.now() });
        allVideos.push(...videos);
      }

      // Rate limit: small delay between searches
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      logger.warn({ error: String(err), player: playerName }, "Failed YouTube search");
    }
  }

  // Sort by published date descending
  allVideos.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());

  // Filter out non-embeddable videos using YouTube Videos API
  let embeddableVideos = allVideos;
  if (YOUTUBE_API_KEY && allVideos.length > 0) {
    try {
      const ids = allVideos.slice(0, 20).map(v => v.videoId).filter(Boolean).join(",");
      const statusUrl = `https://www.googleapis.com/youtube/v3/videos?part=status&id=${ids}&key=${YOUTUBE_API_KEY}`;
      const statusRes = await fetch(statusUrl, { signal: AbortSignal.timeout(5000) });
      if (statusRes.ok) {
        const statusData = await statusRes.json() as any;
        const embeddableIds = new Set(
          (statusData.items || [])
            .filter((item: any) => item.status?.embeddable === true)
            .map((item: any) => item.id)
        );
        embeddableVideos = allVideos.filter(v => embeddableIds.has(v.videoId));
      }
    } catch (err) {
      logger.warn({ error: String(err) }, "Failed to check video embeddability — returning all videos");
    }
  }

  res.json({ videos: embeddableVideos.slice(0, 12), teamName: team.name, source: "api" });
}));

// ─── GET /reddit-baseball — Reddit baseball feed with player cross-referencing ───

router.get("/reddit-baseball", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  try {
    // Fetch r/baseball + r/fantasybaseball
    const [baseballRes, fantasyRes] = await Promise.allSettled([
      fetch("https://www.reddit.com/r/baseball/hot.json?limit=20", {
        headers: { "User-Agent": "FBST/1.0 Fantasy Baseball App" },
        signal: AbortSignal.timeout(10_000),
      }),
      fetch("https://www.reddit.com/r/fantasybaseball/hot.json?limit=10", {
        headers: { "User-Agent": "FBST/1.0 Fantasy Baseball App" },
        signal: AbortSignal.timeout(10_000),
      }),
    ]);

    // Merge posts from both subreddits
    const allChildren: any[] = [];
    for (const result of [baseballRes, fantasyRes]) {
      if (result.status === "fulfilled" && result.value.ok) {
        const data = await result.value.json() as any;
        const sub = data.data?.children || [];
        allChildren.push(...sub);
      }
    }

    if (allChildren.length === 0) {
      return res.json({ posts: [] });
    }

    const data = { data: { children: allChildren } };

    // Get all rostered player names in the league for cross-referencing
    const allRosters = await prisma.roster.findMany({
      where: { team: { leagueId }, releasedAt: null },
      select: { player: { select: { name: true } }, team: { select: { name: true } } },
    });
    const rosterMap = new Map<string, string>(); // lowercase last name → fantasy team
    for (const r of allRosters) {
      const parts = r.player.name.split(" ");
      const lastName = parts[parts.length - 1].toLowerCase();
      // Only map last names that are 4+ chars to avoid false positives (e.g., "Lee", "May")
      if (lastName.length >= 4) {
        rosterMap.set(lastName, r.team.name);
      }
      // Also map full name
      rosterMap.set(r.player.name.toLowerCase(), r.team.name);
    }

    const posts = (data.data?.children || [])
      .filter((child: any) => child.kind === "t3" && !child.data.stickied)
      .slice(0, 20)
      .map((child: any) => {
        const post = child.data;
        const title = post.title || "";
        const url = post.url || "";
        const permalink = `https://reddit.com${post.permalink}`;
        const score = post.score || 0;
        const numComments = post.num_comments || 0;
        const createdUtc = post.created_utc || 0;
        const thumbnail = post.thumbnail && post.thumbnail.startsWith("http") ? post.thumbnail : null;
        const flair = post.link_flair_text || "";

        // Cross-reference: check if title mentions any rostered player
        const lowerTitle = title.toLowerCase();
        const matchedPlayers: { name: string; fantasyTeam: string }[] = [];
        for (const [key, team] of rosterMap) {
          if (lowerTitle.includes(key)) {
            // Find the full player name for display
            const fullName = allRosters.find(r =>
              r.player.name.toLowerCase() === key || r.player.name.split(" ").pop()?.toLowerCase() === key
            )?.player.name ?? key;
            if (!matchedPlayers.some(mp => mp.name === fullName)) {
              matchedPlayers.push({ name: fullName, fantasyTeam: team });
            }
          }
        }

        return {
          title,
          url,
          permalink,
          score,
          numComments,
          createdUtc,
          thumbnail,
          flair,
          matchedPlayers,
        };
      });

    res.json({ posts });
  } catch (err) {
    logger.warn({ error: String(err) }, "Failed to fetch Reddit baseball feed");
    res.json({ posts: [] });
  }
}));

// ─── GET /yahoo-sports — Yahoo Sports MLB RSS feed ───

router.get("/yahoo-sports", requireAuth, asyncHandler(async (_req, res) => {
  try {
    const response = await fetch("https://sports.yahoo.com/mlb/rss/", {
      headers: { "User-Agent": "FBST/1.0 Fantasy Baseball App" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return res.json({ articles: [] });
    const xml = await response.text();

    const articles: { title: string; link: string; pubDate: string; description: string }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && articles.length < 15) {
      const block = match[1];
      const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
        ?? block.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
      const link = block.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/)?.[1]
        ?? block.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";
      const desc = block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]
        ?? block.match(/<description>(.*?)<\/description>/)?.[1] ?? "";
      if (title && link) {
        articles.push({
          title: title.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
          link,
          pubDate,
          description: desc.replace(/<[^>]*>/g, "").slice(0, 150),
        });
      }
    }

    res.json({ articles });
  } catch (err) {
    logger.warn({ error: String(err) }, "Failed to fetch Yahoo Sports MLB RSS");
    res.json({ articles: [] });
  }
}));

// ─── GET /mlb-news — MLB.com official news RSS feed ───

router.get("/mlb-news", requireAuth, asyncHandler(async (_req, res) => {
  try {
    const response = await fetch("https://www.mlb.com/feeds/news/rss.xml", {
      headers: { "User-Agent": "FBST/1.0 Fantasy Baseball App" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return res.json({ articles: [] });
    const xml = await response.text();

    const articles: { title: string; link: string; pubDate: string; description: string }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && articles.length < 15) {
      const block = match[1];
      const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
        ?? block.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
      const link = block.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/)?.[1]
        ?? block.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";
      const desc = block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]
        ?? block.match(/<description>(.*?)<\/description>/)?.[1] ?? "";
      if (title && link) {
        articles.push({
          title: title.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
          link,
          pubDate,
          description: desc.replace(/<[^>]*>/g, "").slice(0, 150),
        });
      }
    }

    res.json({ articles });
  } catch (err) {
    logger.warn({ error: String(err) }, "Failed to fetch MLB.com news RSS");
    res.json({ articles: [] });
  }
}));

// ─── GET /espn-news — ESPN MLB news RSS feed ───

router.get("/espn-news", requireAuth, asyncHandler(async (_req, res) => {
  try {
    const response = await fetch("https://www.espn.com/espn/rss/mlb/news", {
      headers: { "User-Agent": "FBST/1.0 Fantasy Baseball App" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return res.json({ articles: [] });
    const xml = await response.text();

    const articles: { title: string; link: string; pubDate: string; description: string }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && articles.length < 15) {
      const block = match[1];
      const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
        ?? block.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
      const link = block.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/)?.[1]
        ?? block.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";
      const desc = block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]
        ?? block.match(/<description>(.*?)<\/description>/)?.[1] ?? "";
      if (title && link) {
        articles.push({
          title: title.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
          link,
          pubDate,
          description: desc.replace(/<[^>]*>/g, "").slice(0, 150),
        });
      }
    }

    res.json({ articles });
  } catch (err) {
    logger.warn({ error: String(err) }, "Failed to fetch ESPN MLB news RSS");
    res.json({ articles: [] });
  }
}));

// ─── GET /depth-chart?teamId=N — MLB depth chart for a team ───

router.get("/depth-chart", requireAuth, asyncHandler(async (req, res) => {
  const teamId = Number(req.query.teamId);
  if (!Number.isFinite(teamId) || teamId < 100 || teamId > 200) {
    return res.status(400).json({ error: "Invalid teamId" });
  }

  const data = await mlbGetJson(
    `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster/depthChart`,
    3600 // 1-hour cache
  );

  const roster = (data.roster || []) as Array<{
    person: { id: number; fullName: string };
    position: { abbreviation: string; name: string; type: string };
    status: { code: string; description: string };
  }>;

  // Group by position, preserving depth order from the API
  const positionOrder = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'SP', 'CP', 'P'];
  const grouped: Record<string, Array<{ name: string; mlbId: number; status: string; isInjured: boolean }>> = {};

  for (const p of roster) {
    const pos = p.position.abbreviation;
    if (!grouped[pos]) grouped[pos] = [];
    const statusDesc = p.status.description;
    grouped[pos].push({
      name: p.person.fullName,
      mlbId: p.person.id,
      status: statusDesc,
      isInjured: statusDesc.includes("Injured"),
    });
  }

  // Build ordered positions array
  const positions = positionOrder
    .filter(pos => grouped[pos]?.length)
    .map(pos => ({
      position: pos,
      label: pos === 'SP' ? 'Starting Pitchers' : pos === 'CP' ? 'Closer' : pos === 'P' ? 'Relief Pitchers' : pos,
      players: grouped[pos],
    }));

  res.json({
    teamId: data.teamId,
    positions,
    playerCount: roster.length,
    source: "MLB Stats API",
    cachedAt: new Date().toISOString(),
  });
}));

// ─── GET /roster-stats-today — Full roster with today's real-time game stats ───

router.get("/roster-stats-today", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  const userId = req.user!.id;
  const today = todayDateStr();

  // Find user's team
  const team = await prisma.team.findFirst({
    where: { leagueId, OR: [{ ownerUserId: userId }, { ownerships: { some: { userId } } }] },
    select: { id: true, name: true },
  });
  if (!team) return res.json({ date: today, teamName: "", players: [] });

  // Get active roster with player info
  const rosterEntries = await prisma.roster.findMany({
    where: { teamId: team.id, releasedAt: null },
    include: { player: { select: { id: true, name: true, mlbId: true, mlbTeam: true, posPrimary: true } } },
    orderBy: { acquiredAt: "asc" },
  });

  // Get today's schedule
  const scheduleUrl = `https://statsapi.mlb.com/api/v1/schedule?date=${today}&sportId=1`;
  const scheduleData = await mlbGetJson(scheduleUrl, 120); // 2-min cache for live data

  // Build player stats from live game feeds (not schedule boxscore hydration)
  const playerStatsMap = new Map<number, { hitting?: any; pitching?: any; gameStatus: string; opponent: string; homeAway: string }>();
  const teamsMap = await fetchMlbTeamsMap();

  // Build schedule map for all games (matchups, game times)
  const teamScheduleMap = new Map<string, { opponent: string; homeAway: string; gameTime: string; gameStatus: string }>();
  const liveGamePks: { gamePk: number; awayAbbr: string; homeAbbr: string; detailedState: string }[] = [];

  for (const dateEntry of scheduleData.dates || []) {
    for (const game of dateEntry.games || []) {
      const status = game.status?.abstractGameState || "Preview";
      const detailedState = game.status?.detailedState || status;
      const awayTeam = game.teams?.away?.team;
      const homeTeam = game.teams?.home?.team;
      const awayAbbr = awayTeam?.abbreviation ?? (awayTeam?.id ? teamsMap[awayTeam.id] : "") ?? "";
      const homeAbbr = homeTeam?.abbreviation ?? (homeTeam?.id ? teamsMap[homeTeam.id] : "") ?? "";
      const gameTime = game.gameDate ?? "";

      if (awayAbbr) teamScheduleMap.set(awayAbbr, { opponent: homeAbbr, homeAway: "away", gameTime, gameStatus: detailedState });
      if (homeAbbr) teamScheduleMap.set(homeAbbr, { opponent: awayAbbr, homeAway: "home", gameTime, gameStatus: detailedState });

      // Collect Live/Final games for boxscore fetching
      if (status === "Live" || status === "Final") {
        liveGamePks.push({ gamePk: game.gamePk, awayAbbr, homeAbbr, detailedState });
      }
    }
  }

  // Fetch live feeds for Live/Final games to get actual player boxscore stats
  // Only fetch games where our roster players might be playing
  const rosterTeams = new Set(rosterEntries.map(r => r.player.mlbTeam).filter(Boolean));
  const relevantGames = liveGamePks.filter(g => rosterTeams.has(g.awayAbbr) || rosterTeams.has(g.homeAbbr));

  for (const game of relevantGames) {
    try {
      const liveFeed = await mlbGetJson(`https://statsapi.mlb.com/api/v1.1/game/${game.gamePk}/feed/live`, 120);
      const boxscore = liveFeed.liveData?.boxscore;
      if (!boxscore) continue;

      for (const side of ["away", "home"] as const) {
        const teamPlayers = boxscore.teams?.[side]?.players;
        if (!teamPlayers) continue;
        const oppAbbr = side === "away" ? game.homeAbbr : game.awayAbbr;

        for (const [_key, player] of Object.entries(teamPlayers) as [string, any][]) {
          const mlbId = player.person?.id;
          if (!mlbId) continue;

          const hitting = player.stats?.batting;
          const pitching = player.stats?.pitching;

          playerStatsMap.set(mlbId, {
            hitting: hitting && (hitting.atBats > 0 || hitting.runs > 0 || hitting.walks > 0) ? {
              AB: hitting.atBats || 0,
              H: hitting.hits || 0,
              R: hitting.runs || 0,
              HR: hitting.homeRuns || 0,
              RBI: hitting.rbi || 0,
              SB: hitting.stolenBases || 0,
              BB: hitting.baseOnBalls || 0,
              K: hitting.strikeOuts || 0,
            } : undefined,
            pitching: pitching && pitching.inningsPitched && pitching.inningsPitched !== "0.0" ? {
              IP: pitching.inningsPitched || "0.0",
              H: pitching.hits || 0,
              R: pitching.runs || 0,
              ER: pitching.earnedRuns || 0,
              K: pitching.strikeOuts || 0,
              BB: pitching.baseOnBalls || 0,
              W: pitching.wins || 0,
              L: pitching.losses || 0,
              SV: pitching.saves || 0,
            } : undefined,
            gameStatus: game.detailedState,
            opponent: oppAbbr,
            homeAway: side,
          });
        }
      }
    } catch (err) {
      logger.warn({ error: String(err), gamePk: game.gamePk }, "Failed to fetch live feed for boxscore");
    }
  }

  // Fetch highlight thumbnails for roster players from game content API
  const playerThumbnails = new Map<number, string>();
  const uniqueGamePks = [...new Set(relevantGames.map(g => g.gamePk))];

  await Promise.allSettled(
    uniqueGamePks.slice(0, 6).map(async (gamePk) => {
      try {
        const content = await mlbGetJson(`https://statsapi.mlb.com/api/v1/game/${gamePk}/content`, 300);
        const items = content?.highlights?.highlights?.items || [];
        for (const item of items) {
          const playerKws = (item.keywordsAll || []).filter((k: any) => k.type === "player_id");
          if (playerKws.length === 0) continue;
          const mlbId = Number(playerKws[0].value);
          if (!mlbId || playerThumbnails.has(mlbId)) continue;
          const cuts = item.image?.cuts || [];
          const cut = Array.isArray(cuts)
            ? (cuts.find((c: any) => c.width === 640) || cuts.find((c: any) => c.width === 720) || cuts[cuts.length - 1])
            : null;
          if (cut?.src) playerThumbnails.set(mlbId, cut.src);
        }
      } catch { /* skip — thumbnails are optional */ }
    })
  );

  // Build response
  const PITCHER_POS = new Set(["P", "SP", "RP", "CL"]);
  const players = rosterEntries.map(r => {
    const p = r.player;
    const isPitcher = PITCHER_POS.has((p.posPrimary ?? "").toUpperCase());
    const stats = p.mlbId ? playerStatsMap.get(p.mlbId) : undefined;
    const schedule = p.mlbTeam ? teamScheduleMap.get(p.mlbTeam) : undefined;

    return {
      playerName: p.name,
      mlbId: p.mlbId,
      mlbTeam: p.mlbTeam || "",
      position: r.assignedPosition || p.posPrimary || "",
      isPitcher,
      gameToday: !!schedule,
      gameStatus: stats?.gameStatus || schedule?.gameStatus || "",
      opponent: stats?.opponent || schedule?.opponent || "",
      homeAway: stats?.homeAway || schedule?.homeAway || "",
      gameTime: schedule?.gameTime || "",
      hitting: stats?.hitting || null,
      pitching: stats?.pitching || null,
      thumbnail: (p.mlbId ? playerThumbnails.get(p.mlbId) : null) || null,
    };
  });

  // Sort: players with stats first, then by position
  const POS_ORDER = ["C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH", "P"];
  players.sort((a, b) => {
    // Hitters first, pitchers second
    if (a.isPitcher !== b.isPitcher) return a.isPitcher ? 1 : -1;
    // Within group, by position order
    const ia = POS_ORDER.indexOf(a.position);
    const ib = POS_ORDER.indexOf(b.position);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  res.json({ date: today, teamName: team.name, players });
}));

// ─── GET /my-players-today ───

router.get(
  "/my-players-today",
  requireAuth,
  requireLeagueMember("leagueId"),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.query.leagueId);
    if (!Number.isFinite(leagueId)) {
      return res.status(400).json({ error: "Invalid leagueId" });
    }

    const userId = req.user!.id;

    // Find the user's team in this league
    const team = await prisma.team.findFirst({
      where: {
        leagueId,
        OR: [
          { ownerUserId: userId },
          { ownerships: { some: { userId } } },
        ],
      },
      select: { id: true },
    });

    if (!team) {
      return res.json({ players: [] });
    }

    // Get active roster players with mlbId
    const rosterEntries = await prisma.roster.findMany({
      where: {
        teamId: team.id,
        releasedAt: null,
        player: { mlbId: { not: null } },
      },
      select: {
        player: {
          select: { id: true, name: true, mlbId: true, mlbTeam: true },
        },
      },
    });

    if (rosterEntries.length === 0) {
      return res.json({ players: [] });
    }

    // Get today's schedule (reuses cached data from scores endpoint)
    const today = todayDateStr();
    const scheduleUrl = `https://statsapi.mlb.com/api/v1/schedule?date=${today}&sportId=1&hydrate=linescore`;
    const scheduleData = await mlbGetJson(scheduleUrl, 60);

    // Build a map: team abbreviation -> game info
    const teamsMap = await fetchMlbTeamsMap();
    const teamGameMap = new Map<string, { gameTime: string; opponent: string; homeAway: "home" | "away" }>();

    for (const dateEntry of scheduleData.dates || []) {
      for (const g of dateEntry.games || []) {
        const awayTeam = g.teams?.away?.team;
        const homeTeam = g.teams?.home?.team;
        const awayAbbr = awayTeam?.abbreviation ?? (awayTeam?.id ? teamsMap[awayTeam.id] : "") ?? "";
        const homeAbbr = homeTeam?.abbreviation ?? (homeTeam?.id ? teamsMap[homeTeam.id] : "") ?? "";
        const gameTime = g.gameDate ?? "";

        if (awayAbbr) {
          teamGameMap.set(awayAbbr, { gameTime, opponent: homeAbbr, homeAway: "away" });
        }
        if (homeAbbr) {
          teamGameMap.set(homeAbbr, { gameTime, opponent: awayAbbr, homeAway: "home" });
        }
      }
    }

    // Cross-reference roster with schedule
    const players: MyPlayerToday[] = [];
    for (const entry of rosterEntries) {
      const p = entry.player;
      if (!p.mlbTeam) continue;

      const game = teamGameMap.get(p.mlbTeam);
      if (!game) continue;

      players.push({
        playerName: p.name,
        mlbId: p.mlbId!,
        mlbTeam: p.mlbTeam,
        gameTime: game.gameTime,
        opponent: game.opponent,
        homeAway: game.homeAway,
      });
    }

    // Sort by game time
    players.sort((a, b) => a.gameTime.localeCompare(b.gameTime));

    return res.json({ players });
  })
);

// ─── Weekly League Digest ────────────────────────────────────────────────────

import { getWeekKey, weekKeyLabel } from "../../lib/utils.js";
import { buildDigestContext, extractVoteResults, type DigestData } from "./services/digestService.js";

// GET /api/mlb/league-digest/weeks?leagueId=N — list all persisted digest weeks
router.get("/league-digest/weeks", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Missing leagueId" });

  const rows = await prisma.aiInsight.findMany({
    where: { type: "league_digest", leagueId },
    select: { weekKey: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const currentWeekKey = getWeekKey();
  const weeks: { weekKey: string; generatedAt: string | null; label: string }[] = rows.map(r => ({
    weekKey: r.weekKey,
    generatedAt: r.createdAt.toISOString(),
    label: weekKeyLabel(r.weekKey),
  }));

  // Always include current week (even if not yet generated)
  if (!weeks.some(w => w.weekKey === currentWeekKey)) {
    weeks.push({ weekKey: currentWeekKey, generatedAt: null, label: weekKeyLabel(currentWeekKey) });
  }

  res.json({ weeks, currentWeekKey });
}));

// GET /api/mlb/league-digest?leagueId=N[&weekKey=YYYY-WNN]
router.get("/league-digest", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Missing leagueId" });

  const currentWeekKey = getWeekKey();
  const raw = typeof req.query.weekKey === "string" ? req.query.weekKey : null;
  const requestedWeekKey = raw && WEEK_KEY_REGEX.test(raw) ? raw : null;
  const weekKey = requestedWeekKey || currentWeekKey;
  const isCurrentWeek = weekKey === currentWeekKey;

  // Check DB for persisted digest
  const persisted = await prisma.aiInsight.findFirst({
    where: { type: "league_digest", leagueId, weekKey },
  });
  if (persisted) {
    const data = (persisted.data ?? {}) as DigestData & Record<string, unknown>;
    const voteData = extractVoteResults(data, req.user!.id);
    return res.json({ ...data, generatedAt: persisted.createdAt.toISOString(), weekKey, isCurrentWeek, votes: undefined, voteResults: voteData });
  }

  // For past weeks, never auto-generate — return 404
  if (!isCurrentWeek) {
    return res.status(404).json({ error: "No digest found for this week" });
  }

  // Build context using digest service
  const digestCtx = await buildDigestContext(leagueId, weekKey);
  if (!digestCtx) return res.status(404).json({ error: "League not found" });

  // Generate digest via AI
  const { aiAnalysisService } = await import("../../services/aiAnalysisService.js");
  const result = await aiAnalysisService.generateLeagueDigest(digestCtx);

  if (!result.success) {
    logger.warn({ error: result.error, leagueId }, "League digest generation failed");
    return res.status(503).json({ error: "League digest is temporarily unavailable" });
  }

  // Persist digest
  const firstTeamId = (await prisma.team.findFirst({ where: { leagueId }, select: { id: true } }))?.id ?? 0;
  await prisma.aiInsight.create({
    data: {
      type: "league_digest",
      leagueId,
      teamId: firstTeamId,
      weekKey,
      data: result.result as any,
    },
  }).catch(err => {
    if (!(err as any)?.code?.includes("P2002")) {
      logger.error({ error: String(err) }, "Failed to persist league digest");
    }
  });

  res.json({ ...result.result, generatedAt: new Date().toISOString(), weekKey, isCurrentWeek: true, voteResults: { yes: 0, no: 0, myVote: null } });
}));

// POST /api/mlb/league-digest/vote — Vote on the Trade of the Week
const voteSchema = z.object({
  leagueId: z.number().int().positive(),
  vote: z.enum(["yes", "no"]),
});

router.post("/league-digest/vote", requireAuth, validateBody(voteSchema), requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const { leagueId, vote } = req.body;
  const userId = req.user!.id;
  const weekKey = getWeekKey();

  // Atomic vote update using SELECT ... FOR UPDATE to prevent lost votes
  const votes = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: number; data: unknown }[]>`
      SELECT id, data FROM "AiInsight"
      WHERE type = 'league_digest' AND "leagueId" = ${leagueId} AND "weekKey" = ${weekKey}
      FOR UPDATE
      LIMIT 1
    `;
    if (!rows.length) return null;

    const insightId = rows[0].id;
    const data = (rows[0].data ?? {}) as DigestData;
    const updatedVotes: Record<string, string> = { ...(data.votes || {}), [String(userId)]: vote };

    await tx.aiInsight.update({
      where: { id: insightId },
      data: { data: { ...data, votes: updatedVotes } as any },
    });
    return updatedVotes;
  });

  if (!votes) return res.status(404).json({ error: "No digest found for this week" });

  const yesCount = Object.values(votes).filter(v => v === "yes").length;
  const noCount = Object.values(votes).filter(v => v === "no").length;

  res.json({ yes: yesCount, no: noCount, myVote: vote });
}));

// ─── GET /league-headlines — Top performer from each fantasy team with highlight thumbnails ───

router.get("/league-headlines", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  const today = todayDateStr();

  // Get all teams in the league with rosters
  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: {
      id: true,
      name: true,
      rosters: {
        where: { releasedAt: null },
        include: { player: { select: { id: true, name: true, mlbId: true, mlbTeam: true, posPrimary: true } } },
      },
    },
  });

  // Get today's schedule
  const scheduleUrl = `https://statsapi.mlb.com/api/v1/schedule?date=${today}&sportId=1`;
  const scheduleData = await mlbGetJson(scheduleUrl, 120);
  const teamsMap = await fetchMlbTeamsMap();

  // Build schedule maps + collect live game PKs
  const teamScheduleMap = new Map<string, { opponent: string; homeAway: string; gamePk: number }>();
  const liveGamePks: { gamePk: number; awayAbbr: string; homeAbbr: string; detailedState: string }[] = [];

  for (const dateEntry of scheduleData.dates || []) {
    for (const game of dateEntry.games || []) {
      const status = game.status?.abstractGameState || "Preview";
      const detailedState = game.status?.detailedState || status;
      const awayAbbr = game.teams?.away?.team?.abbreviation ?? (game.teams?.away?.team?.id ? teamsMap[game.teams.away.team.id] : "") ?? "";
      const homeAbbr = game.teams?.home?.team?.abbreviation ?? (game.teams?.home?.team?.id ? teamsMap[game.teams.home.team.id] : "") ?? "";

      if (awayAbbr) teamScheduleMap.set(awayAbbr, { opponent: homeAbbr, homeAway: "away", gamePk: game.gamePk });
      if (homeAbbr) teamScheduleMap.set(homeAbbr, { opponent: awayAbbr, homeAway: "home", gamePk: game.gamePk });

      if (status === "Live" || status === "Final") {
        liveGamePks.push({ gamePk: game.gamePk, awayAbbr, homeAbbr, detailedState });
      }
    }
  }

  // Collect all rostered MLB team abbreviations
  const allRosterTeams = new Set<string>();
  for (const team of teams) {
    for (const r of team.rosters) {
      if (r.player.mlbTeam) allRosterTeams.add(r.player.mlbTeam);
    }
  }

  // Fetch boxscores for relevant games
  const playerStatsMap = new Map<number, { hitting?: any; pitching?: any; opponent: string; detailedState: string }>();
  const relevantGames = liveGamePks.filter(g => allRosterTeams.has(g.awayAbbr) || allRosterTeams.has(g.homeAbbr));

  for (const game of relevantGames) {
    try {
      const liveFeed = await mlbGetJson(`https://statsapi.mlb.com/api/v1.1/game/${game.gamePk}/feed/live`, 120);
      const boxscore = liveFeed.liveData?.boxscore;
      if (!boxscore) continue;

      for (const side of ["away", "home"] as const) {
        const teamPlayers = boxscore.teams?.[side]?.players;
        if (!teamPlayers) continue;
        const oppAbbr = side === "away" ? game.homeAbbr : game.awayAbbr;

        for (const [_key, player] of Object.entries(teamPlayers) as [string, any][]) {
          const mlbId = player.person?.id;
          if (!mlbId) continue;

          const hitting = player.stats?.batting;
          const pitching = player.stats?.pitching;

          playerStatsMap.set(mlbId, {
            hitting: hitting && (hitting.atBats > 0 || hitting.runs > 0 || hitting.walks > 0) ? {
              AB: hitting.atBats || 0, H: hitting.hits || 0, R: hitting.runs || 0,
              HR: hitting.homeRuns || 0, RBI: hitting.rbi || 0, SB: hitting.stolenBases || 0,
            } : undefined,
            pitching: pitching && pitching.inningsPitched && pitching.inningsPitched !== "0.0" ? {
              IP: pitching.inningsPitched || "0.0", H: pitching.hits || 0, ER: pitching.earnedRuns || 0,
              K: pitching.strikeOuts || 0, W: pitching.wins || 0, L: pitching.losses || 0, SV: pitching.saves || 0,
            } : undefined,
            opponent: oppAbbr,
            detailedState: game.detailedState,
          });
        }
      }
    } catch (err) {
      logger.warn({ error: String(err), gamePk: game.gamePk }, "Failed to fetch live feed for league headlines");
    }
  }

  // Fetch highlight thumbnails per game — build mlbId → thumbnail map
  const playerThumbnails = new Map<number, string>();
  const uniqueGamePks = [...new Set(relevantGames.map(g => g.gamePk))];

  // Fetch content in parallel (up to 8 games)
  const contentResults = await Promise.allSettled(
    uniqueGamePks.slice(0, 8).map(async (gamePk) => {
      const content = await mlbGetJson(`https://statsapi.mlb.com/api/v1/game/${gamePk}/content`, 300); // 5-min cache
      const items = content?.highlights?.highlights?.items || [];
      for (const item of items) {
        const playerKws = (item.keywordsAll || []).filter((k: any) => k.type === "player_id");
        if (playerKws.length === 0) continue;
        const mlbId = Number(playerKws[0].value);
        if (!mlbId || playerThumbnails.has(mlbId)) continue; // first highlight wins
        const cuts = item.image?.cuts || [];
        // Prefer 640w, fall back to any available
        const cut = (Array.isArray(cuts)
          ? cuts.find((c: any) => c.width === 640) || cuts.find((c: any) => c.width === 720) || cuts[cuts.length - 1]
          : null);
        if (cut?.src) playerThumbnails.set(mlbId, cut.src);
      }
    })
  );

  // Score each roster player and pick the top performer per fantasy team
  const PITCHER_POS = new Set(["P", "SP", "RP", "CL"]);
  const headlines: any[] = [];

  for (const team of teams) {
    let best: any = null;
    let bestScore = -1;

    for (const r of team.rosters) {
      const p = r.player;
      const isPitcher = PITCHER_POS.has((p.posPrimary ?? "").toUpperCase());
      const stats = p.mlbId ? playerStatsMap.get(p.mlbId) : undefined;
      if (!stats || (!stats.hitting && !stats.pitching)) continue;

      const h = stats.hitting || {};
      const pt = stats.pitching || {};
      const hitScore = (h.HR || 0) * 4 + (h.RBI || 0) * 2 + (h.R || 0) * 2 + (h.SB || 0) * 3 + (h.H || 0);
      const pitchScore = (pt.W || 0) * 5 + (pt.SV || 0) * 5 + (pt.K || 0) + (parseFloat(pt.IP || "0") >= 5 && (pt.ER || 0) <= 2 ? 5 : 0);
      const score = hitScore + pitchScore;

      if (score > bestScore) {
        bestScore = score;
        const schedule = p.mlbTeam ? teamScheduleMap.get(p.mlbTeam) : undefined;
        best = {
          teamName: team.name,
          teamId: team.id,
          playerName: p.name,
          mlbId: p.mlbId,
          mlbTeam: p.mlbTeam || "",
          position: r.assignedPosition || p.posPrimary || "",
          isPitcher,
          opponent: stats.opponent || "",
          gameStatus: stats.detailedState || "",
          hitting: stats.hitting || null,
          pitching: stats.pitching || null,
          thumbnail: (p.mlbId ? playerThumbnails.get(p.mlbId) : null) || null,
          score,
        };
      }
    }

    if (best) headlines.push(best);
  }

  // Sort by score descending — best performer across the league first
  headlines.sort((a, b) => b.score - a.score);

  res.json({ date: today, headlines });
}));

export const mlbFeedRouter = router;
