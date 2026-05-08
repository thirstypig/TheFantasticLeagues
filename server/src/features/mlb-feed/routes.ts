import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, requireLeagueMember } from "../../middleware/auth.js";
import { mlbGetJson, fetchMlbTeamsMap } from "../../lib/mlbApi.js";
import { prisma } from "../../db/prisma.js";
import { logger } from "../../lib/logger.js";
import { createPlayerNameMatcher } from "./services/playerNameMatcher.js";

const router = Router();

// ─── GET /roster-status — MLB roster status for user's fantasy players ───

router.get("/roster-status", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  const userId = req.user!.id;
  const requestedTeamId = req.query.teamId ? Number(req.query.teamId) : null;

  // Find team: use requested teamId (for viewing any league team) or default to user's team
  const team = requestedTeamId
    ? await prisma.team.findFirst({ where: { id: requestedTeamId, leagueId }, select: { id: true, name: true } })
    : await prisma.team.findFirst({ where: { leagueId, OR: [{ ownerUserId: userId }, { ownerships: { some: { userId } } }] }, select: { id: true, name: true } });
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
      // Use 40Man roster to include 60-day IL players (fullSeason misses them)
      const data = await mlbGetJson(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=40Man`, 21600);
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

  // Fetch IL transaction dates for injured players and depth chart replacements
  const ilTransactions = new Map<number, { placedDate: string; ilDays: number; injury: string }>();
  const depthReplacements = new Map<number, string>(); // mlbId → replacement name

  // Collect injured player IDs for enrichment
  const injuredPlayers: { mlbId: number; mlbTeam: string; position: string }[] = [];
  for (const r of roster) {
    if (!r.player.mlbId) continue;
    const st = mlbStatusMap.get(r.player.mlbId);
    if (st?.status?.includes("Injured")) {
      injuredPlayers.push({ mlbId: r.player.mlbId, mlbTeam: r.player.mlbTeam || "", position: st.position || r.player.posPrimary || "" });
    }
  }

  if (injuredPlayers.length > 0) {
    // Fetch recent IL transactions per team (cached 6 hours)
    const teamsToFetchTx = new Set(injuredPlayers.map(p => p.mlbTeam));
    for (const teamAbbr of teamsToFetchTx) {
      const mlbTeamId = teamIdMap[teamAbbr];
      if (!mlbTeamId) continue;
      try {
        const txData = await mlbGetJson(
          `https://statsapi.mlb.com/api/v1/transactions?teamId=${mlbTeamId}&startDate=2026-01-01&endDate=${new Date().toISOString().slice(0, 10)}`,
          21600
        ) as { transactions?: Array<{ person?: { id?: number }; effectiveDate?: string; description?: string; typeCode?: string }> };
        for (const tx of txData.transactions || []) {
          const pid = tx.person?.id;
          if (!pid) continue;
          const desc = tx.description || "";
          // Only IL placement transactions (not transfers or activations)
          if (desc.toLowerCase().includes("injured list") && !desc.toLowerCase().includes("activated") && !desc.toLowerCase().includes("transferred")) {
            const ilMatch = desc.match(/(\d+)-day/i);
            const ilDays = ilMatch ? parseInt(ilMatch[1]) : 10;
            const injuryMatch = desc.match(/\.\s*(.+?)\.?\s*$/);
            const injury = injuryMatch ? injuryMatch[1].trim() : "";
            // Keep the most recent placement per player
            const existing = ilTransactions.get(pid);
            if (!existing || (tx.effectiveDate && tx.effectiveDate > existing.placedDate)) {
              ilTransactions.set(pid, {
                placedDate: tx.effectiveDate || "",
                ilDays,
                injury: injury.replace(/\.$/, ""),
              });
            }
          }
        }
      } catch (err) {
        logger.warn({ error: String(err), teamAbbr }, "Failed to fetch IL transactions");
      }
    }

    // Fetch depth charts for replacement info
    const teamsToFetchDepth = new Set(injuredPlayers.map(p => p.mlbTeam));
    for (const teamAbbr of teamsToFetchDepth) {
      const mlbTeamId = teamIdMap[teamAbbr];
      if (!mlbTeamId) continue;
      try {
        const dcData = await mlbGetJson(
          `https://statsapi.mlb.com/api/v1/teams/${mlbTeamId}/roster/depthChart`,
          3600
        ) as { roster?: Array<{ person: { id: number; fullName: string }; position: { abbreviation: string }; status: { description: string } }> };
        // For each injured player, find who's next at their position
        const dcRoster = dcData.roster || [];
        for (const ip of injuredPlayers.filter(p => p.mlbTeam === teamAbbr)) {
          // For pitchers, the 40-man roster returns generic "P" while depth chart
          // differentiates "SP", "CP", and "P" (relief). Match any pitcher type.
          const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP", "CL"]);
          const isPitcher = PITCHER_POSITIONS.has(ip.position);
          const samePos = dcRoster.filter(
            d => {
              const posMatch = isPitcher
                ? PITCHER_POSITIONS.has(d.position.abbreviation)
                : d.position.abbreviation === ip.position;
              return posMatch && d.person.id !== ip.mlbId && !d.status.description.includes("Injured");
            }
          );
          if (samePos.length > 0) {
            // For pitchers, prefer depth chart entries matching the injured player's role
            // SP depth chart entries first for SP injuries, RP/CP for RP injuries
            const preferred = isPitcher
              ? samePos.find(d => d.position.abbreviation === ip.position) || samePos[0]
              : samePos[0];
            depthReplacements.set(ip.mlbId, preferred.person.fullName);
          }
        }
      } catch (err) {
        logger.warn({ error: String(err), teamAbbr }, "Failed to fetch depth chart for replacements");
      }
    }
  }

  // Cross-reference fantasy roster with MLB status
  const players = roster.map(r => {
    const mlbStatus = r.player.mlbId ? mlbStatusMap.get(r.player.mlbId) : undefined;
    const isInjured = mlbStatus?.status?.includes("Injured") || false;
    const ilInfo = r.player.mlbId && isInjured ? ilTransactions.get(r.player.mlbId) : undefined;
    const replacement = r.player.mlbId && isInjured ? depthReplacements.get(r.player.mlbId) : undefined;

    // Compute eligible return date
    let eligibleReturn: string | null = null;
    if (ilInfo?.placedDate && ilInfo.ilDays) {
      const placed = new Date(ilInfo.placedDate + "T00:00:00");
      placed.setDate(placed.getDate() + ilInfo.ilDays);
      eligibleReturn = placed.toISOString().slice(0, 10);
    }

    return {
      playerName: r.player.name,
      mlbId: r.player.mlbId,
      mlbTeam: r.player.mlbTeam || "",
      position: r.assignedPosition || r.player.posPrimary || "",
      mlbStatus: mlbStatus?.status || "Unknown",
      isInjured,
      isMinors: mlbStatus?.status?.includes("Minor") || mlbStatus?.status?.includes("Optioned") || mlbStatus?.status === "Reassigned" || false,
      // IL enrichment
      ilPlacedDate: ilInfo?.placedDate || null,
      ilDays: ilInfo?.ilDays || null,
      ilInjury: ilInfo?.injury || null,
      ilEligibleReturn: eligibleReturn,
      ilReplacement: replacement || null,
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
  const playerMatchers = playerNames.map(name => ({ name, matcher: createPlayerNameMatcher(name) }));

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

          const matchedPlayer = playerMatchers.find(m => m.matcher.matches(decodedTitle))?.name ?? null;

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
      } else {
        const errBody = await ytRes.text().catch(() => "");
        logger.warn({ status: ytRes.status, player: playerName, body: errBody.slice(0, 200) }, "YouTube API returned non-OK");
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
        logger.info({ total: allVideos.length, embeddable: embeddableVideos.length }, "YouTube embeddability check");
      } else {
        logger.warn({ status: statusRes.status }, "YouTube embeddability check failed — returning all videos");
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
    const rosterMatchers = allRosters.map(r => ({
      name: r.player.name,
      team: r.team.name,
      matcher: createPlayerNameMatcher(r.player.name),
    }));

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

        const matchedPlayers: { name: string; fantasyTeam: string }[] = [];
        for (const rm of rosterMatchers) {
          if (rm.matcher.matches(title)) {
            if (!matchedPlayers.some(mp => mp.name === rm.name)) {
              matchedPlayers.push({ name: rm.name, fantasyTeam: rm.team });
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

// ─── GET /depth-chart?teamId=N — MLB depth chart for a team ───

router.get("/depth-chart", requireAuth, asyncHandler(async (req, res) => {
  const teamId = Number(req.query.teamId);
  if (!Number.isFinite(teamId) || teamId < 100 || teamId > 200) {
    return res.status(400).json({ error: "Invalid teamId" });
  }

  // Fetch depth chart and 40-man roster in parallel
  // The depth chart may lag behind on recently-placed IL players, so we
  // merge IL players from the 40-man roster to ensure they appear.
  const [dcData, rosterData] = await Promise.all([
    mlbGetJson(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster/depthChart`, 3600),
    mlbGetJson(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=40Man`, 3600),
  ]);

  type RosterEntry = {
    person: { id: number; fullName: string };
    position: { abbreviation: string; name: string; type: string };
    status: { code: string; description: string };
  };

  const roster = (dcData.roster || []) as RosterEntry[];
  const fullRoster = (rosterData.roster || []) as RosterEntry[];

  // Track which player IDs are already in the depth chart
  const depthChartIds = new Set(roster.map(p => p.person.id));

  // Find IL players from 40-man that are missing from the depth chart
  const missingIL = fullRoster.filter(
    p => p.status.description.includes("Injured") && !depthChartIds.has(p.person.id)
  );

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

  // Merge missing IL players into their position group (at the end, marked as IL)
  for (const p of missingIL) {
    const pos = p.position.abbreviation;
    // Map pitchers to appropriate group
    const effectivePos = ["P", "SP", "RP", "CL"].includes(pos) ? "P" : pos;
    if (!grouped[effectivePos]) grouped[effectivePos] = [];
    grouped[effectivePos].push({
      name: p.person.fullName,
      mlbId: p.person.id,
      status: p.status.description,
      isInjured: true,
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

  const totalCount = roster.length + missingIL.length;

  res.json({
    teamId: dcData.teamId,
    positions,
    playerCount: totalCount,
    source: "MLB Stats API",
    cachedAt: new Date().toISOString(),
  });
}));

// ─── Sub-routers (extracted to keep this file lean) ───
import { scoresRouter } from "./scoresRoutes.js";
import { playerNewsRouter } from "./playerNewsRoutes.js";
import { digestRouter } from "./digestRoutes.js";
router.use(scoresRouter);
router.use(playerNewsRouter);
router.use(digestRouter);

export const mlbFeedRouter = router;
export default mlbFeedRouter;

/* Additional routes live in scoresRoutes.ts, playerNewsRoutes.ts, and digestRoutes.ts.
 * DO NOT ADD ROUTES BELOW THIS LINE — extract a new sub-router instead. */
