/*
 * NewsFeedsPanel — Aurora-styled aggregate news card.
 *
 * Restores the Reddit / YouTube / Yahoo / ESPN feed surface that the
 * pre-Aurora Home page (HomeLegacy.tsx) carried in its `News & Social`
 * + `YouTube Shorts` sections. This is a NEW Aurora component — caller
 * is responsible for placing it on the Home page (or wherever).
 *
 * Server endpoints consumed (all already exist in
 * `server/src/features/mlb-feed/routes.ts`, 5-min RSS TTL cache):
 *   GET /api/mlb/reddit-baseball?leagueId=N
 *     → { posts: Array<{ title, permalink, createdUtc, thumbnail, ... }> }
 *   GET /api/mlb/player-videos?leagueId=N
 *     → { videos: Array<{ videoId, title, thumbnail, published, channelTitle }> }
 *   GET /api/mlb/yahoo-sports
 *     → { articles: Array<{ title, link, pubDate, description }> }
 *   GET /api/mlb/espn-news
 *     → { articles: Array<{ title, link, pubDate, description }> }
 *
 * If the leagueId-gated endpoints are unavailable (no league context yet),
 * the component degrades gracefully: missing sources are skipped and the
 * mixed timeline is built from whatever returned successfully.
 */
import { useEffect, useMemo, useState } from "react";
import { fetchJsonApi, API_BASE } from "../../api/base";
import { useLeague } from "../../contexts/LeagueContext";
import { Glass, Chip, SectionLabel } from "../../components/aurora/atoms";

// ─── Source metadata ───
type Source = "Reddit" | "YouTube" | "Yahoo" | "ESPN";
const SOURCES: readonly Source[] = ["Reddit", "YouTube", "Yahoo", "ESPN"];

/**
 * Subtle source-tinted chip backgrounds. Low alpha keeps them within
 * the Aurora aesthetic — the full-saturation brand colors would clash
 * with the iridescent ring + glass surface.
 */
const SOURCE_TINT: Record<Source, { bg: string; fg: string; border: string }> = {
  Reddit:  { bg: "rgba(255, 69,  0,   0.15)", fg: "#ff8c5a", border: "rgba(255, 69, 0, 0.35)" },
  YouTube: { bg: "rgba(255, 0,   0,   0.15)", fg: "#ff7a7a", border: "rgba(255, 0,  0,  0.35)" },
  Yahoo:   { bg: "rgba(124, 58,  237, 0.18)", fg: "#c4a8ff", border: "rgba(124, 58, 237,0.40)" },
  ESPN:    { bg: "rgba(220, 38,  38,  0.15)", fg: "#ff8c8c", border: "rgba(220, 38, 38, 0.35)" },
};

// ─── Normalized headline shape ───
interface Headline {
  source: Source;
  title: string;
  url: string;
  /** Epoch ms — used for chronological mixing. */
  ts: number;
  thumbnail?: string | null;
  meta?: string | null;
}

// ─── API response shapes (only the fields we need) ───
interface RedditApiResp {
  posts: Array<{
    title: string;
    permalink: string;
    createdUtc: number;
    thumbnail: string | null;
  }>;
}
interface YouTubeApiResp {
  videos: Array<{
    videoId: string;
    title: string;
    thumbnail: string;
    published: string;
    channelTitle: string;
  }>;
}
interface RssApiResp {
  articles: Array<{
    title: string;
    link: string;
    pubDate: string;
    description?: string;
  }>;
}

function ago(ts: number): string {
  if (!ts) return "";
  const ms = Date.now() - ts;
  if (ms < 0) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function NewsFeedsPanel({
  limit = 12,
}: {
  /** Default count of headlines to display in the mixed timeline. */
  limit?: number;
}) {
  const { leagueId } = useLeague();
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"All" | Source>("All");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    // All four feeds in parallel; any failure is swallowed so a single
    // dead source doesn't blank the entire panel.
    const reddit = leagueId
      ? fetchJsonApi<RedditApiResp>(`${API_BASE}/mlb/reddit-baseball?leagueId=${leagueId}`)
          .then(r => (r.posts || []).map<Headline>(p => ({
            source: "Reddit" as const,
            title: p.title,
            url: p.permalink,
            ts: (p.createdUtc || 0) * 1000,
            thumbnail: p.thumbnail && p.thumbnail.startsWith("http") ? p.thumbnail : null,
          })))
          .catch(() => [] as Headline[])
      : Promise.resolve([] as Headline[]);

    const youtube = leagueId
      ? fetchJsonApi<YouTubeApiResp>(`${API_BASE}/mlb/player-videos?leagueId=${leagueId}`)
          .then(r => (r.videos || []).map<Headline>(v => ({
            source: "YouTube" as const,
            title: v.title,
            url: `https://www.youtube.com/watch?v=${v.videoId}`,
            ts: v.published ? new Date(v.published).getTime() : 0,
            thumbnail: v.thumbnail || null,
            meta: v.channelTitle || null,
          })))
          .catch(() => [] as Headline[])
      : Promise.resolve([] as Headline[]);

    const yahoo = fetchJsonApi<RssApiResp>(`${API_BASE}/mlb/yahoo-sports`)
      .then(r => (r.articles || []).map<Headline>(a => ({
        source: "Yahoo" as const,
        title: a.title,
        url: a.link,
        ts: a.pubDate ? new Date(a.pubDate).getTime() : 0,
      })))
      .catch(() => [] as Headline[]);

    const espn = fetchJsonApi<RssApiResp>(`${API_BASE}/mlb/espn-news`)
      .then(r => (r.articles || []).map<Headline>(a => ({
        source: "ESPN" as const,
        title: a.title,
        url: a.link,
        ts: a.pubDate ? new Date(a.pubDate).getTime() : 0,
      })))
      .catch(() => [] as Headline[]);

    Promise.all([reddit, youtube, yahoo, espn])
      .then(([r, y, ya, e]) => {
        if (!alive) return;
        const combined = [...r, ...y, ...ya, ...e]
          .filter(h => h.title)
          .sort((a, b) => b.ts - a.ts);
        setHeadlines(combined);
        if (combined.length === 0) setError("Feed unavailable");
      })
      .catch(() => {
        if (alive) setError("Feed unavailable");
      })
      .finally(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, [leagueId]);

  const visible = useMemo(() => {
    const filtered = filter === "All" ? headlines : headlines.filter(h => h.source === filter);
    return filtered.slice(0, limit);
  }, [headlines, filter, limit]);

  return (
    <Glass>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div>
          <SectionLabel>✦ Around the League</SectionLabel>
          <div style={{ fontSize: 13, color: "var(--am-text-muted)", marginTop: 2 }}>
            Reddit, YouTube, Yahoo &amp; ESPN — refreshed every 5 minutes
          </div>
        </div>
      </div>

      {/* Source filter chips — Aurora chip-pill row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {(["All", ...SOURCES] as const).map(key => {
          const active = filter === key;
          const tint = key !== "All" ? SOURCE_TINT[key as Source] : null;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              style={{
                padding: "5px 11px",
                borderRadius: 99,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: 0.2,
                cursor: "pointer",
                background: active
                  ? (tint ? tint.bg : "var(--am-chip-strong)")
                  : "var(--am-chip)",
                color: active && tint ? tint.fg : "var(--am-text-muted)",
                border: `1px solid ${active ? (tint ? tint.border : "var(--am-border-strong)") : "var(--am-border)"}`,
              }}
            >
              {key}
            </button>
          );
        })}
      </div>

      {/* Body */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              style={{
                height: 44,
                borderRadius: 10,
                background: "var(--am-surface-faint)",
                border: "1px solid var(--am-border)",
                opacity: 0.6,
              }}
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--am-text-muted)", padding: "20px 4px", textAlign: "center" }}>
          {error ?? "News loading…"}
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {visible.map((h, i) => (
            <HeadlineRow key={`${h.source}-${i}`} h={h} />
          ))}
        </ul>
      )}
    </Glass>
  );
}

function HeadlineRow({ h }: { h: Headline }) {
  const tint = SOURCE_TINT[h.source];
  return (
    <li>
      <a
        href={h.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: 10,
          borderRadius: 12,
          background: "var(--am-surface-faint)",
          border: "1px solid var(--am-border)",
          textDecoration: "none",
          color: "inherit",
          transition: "border-color 120ms ease, background 120ms ease",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = "var(--am-border-strong)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = "var(--am-border)";
        }}
      >
        {h.thumbnail && (
          <img
            src={h.thumbnail}
            alt=""
            loading="lazy"
            style={{
              width: 56,
              height: 40,
              objectFit: "cover",
              borderRadius: 8,
              border: "1px solid var(--am-border)",
              flexShrink: 0,
            }}
            onError={e => { (e.currentTarget.style.display = "none"); }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--am-text)",
              lineHeight: 1.35,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {h.title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <Chip
              color={tint.fg}
              style={{
                background: tint.bg,
                border: `1px solid ${tint.border}`,
                fontSize: 10,
                padding: "2px 7px",
              }}
            >
              {h.source}
            </Chip>
            {h.meta && (
              <span style={{ fontSize: 10.5, color: "var(--am-text-faint)" }}>{h.meta}</span>
            )}
            {h.ts > 0 && (
              <span style={{ fontSize: 10.5, color: "var(--am-text-faint)" }}>· {ago(h.ts)}</span>
            )}
          </div>
        </div>
      </a>
    </li>
  );
}
