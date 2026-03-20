import { WebSocket, WebSocketServer } from "ws";
import type { IncomingMessage, Server as HttpServer } from "http";
import { supabaseAdmin } from "../../../lib/supabase.js";
import { prisma } from "../../../db/prisma.js";
import { logger } from "../../../lib/logger.js";
import type { AuctionState } from "../types.js";

/** Extended WebSocket with auction metadata */
interface AuctionSocket extends WebSocket {
  __userId?: number;
  __userName?: string;
  __leagueId?: number;
  __alive?: boolean;
}

// Per-league rooms: leagueId -> Set of connected WebSockets
const rooms = new Map<number, Set<WebSocket>>();

// Chat rate limiter: userId -> recent message timestamps (shared across all connections)
const chatRateLimits = new Map<number, number[]>();

/**
 * Broadcast auction state to all connected clients in a league room.
 */
export function broadcastState(leagueId: number, state: AuctionState): void {
  const clients = rooms.get(leagueId);
  if (!clients || clients.size === 0) return;

  // Strip proxyBids before sending — they are private per-team secrets
  const sanitized = state.nomination?.proxyBids
    ? { ...state, nomination: { ...state.nomination, proxyBids: undefined } }
    : state;

  const payload = JSON.stringify(sanitized);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

/**
 * Authenticate a WebSocket connection via JWT token in query params.
 * Returns the user ID if valid, null otherwise.
 */
async function authenticateWs(req: IncomingMessage): Promise<number | null> {
  try {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    if (!token) return null;

    const { data: { user: sbUser }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !sbUser?.email) return null;

    const user = await prisma.user.findUnique({
      where: { email: sbUser.email },
      select: { id: true },
    });

    return user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Attach a WebSocketServer to an existing HTTP server.
 * Handles authentication, room join/leave, and heartbeat.
 */
export function attachAuctionWs(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/auction" });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const userId = await authenticateWs(req);
    if (userId === null) {
      ws.close(4001, "Unauthorized");
      return;
    }

    // Parse leagueId from query
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const leagueId = Number(url.searchParams.get("leagueId"));
    if (!Number.isFinite(leagueId) || leagueId <= 0) {
      ws.close(4002, "Invalid leagueId");
      return;
    }

    // Verify league membership
    const membership = await prisma.leagueMembership.findFirst({
      where: { userId, league: { id: leagueId } },
    });
    if (!membership) {
      ws.close(4003, "Not a league member");
      return;
    }

    // Join room
    if (!rooms.has(leagueId)) {
      rooms.set(leagueId, new Set());
    }
    rooms.get(leagueId)!.add(ws);

    // Look up display name for chat
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const displayName = dbUser?.name || dbUser?.email?.split("@")[0] || `User ${userId}`;

    // Store metadata on socket for chat
    (ws as AuctionSocket).__userId = userId;
    (ws as AuctionSocket).__userName = displayName;
    (ws as AuctionSocket).__leagueId = leagueId;

    logger.info({ userId, leagueId }, "Auction WS client connected");

    // Handle incoming messages (chat)
    ws.on("message", (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
        if (msg.type !== "CHAT" || typeof msg.text !== "string") return;

        // Rate limit: max 5 messages per 10 seconds
        const now = Date.now();
        const times = chatRateLimits.get(userId) || [];
        const recent = times.filter(t => now - t < 10_000);
        if (recent.length >= 5) return; // silently drop
        recent.push(now);
        chatRateLimits.set(userId, recent);

        // Sanitize text (max 500 chars, strip control chars)
        const text = msg.text.slice(0, 500).replace(/[\x00-\x1f]/g, "");
        if (!text.trim()) return;

        const chatPayload = JSON.stringify({
          type: "CHAT",
          userId,
          userName: displayName,
          text,
          timestamp: now,
        });

        // Broadcast to all clients in the room
        const clients = rooms.get(leagueId);
        if (clients) {
          for (const client of clients) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(chatPayload);
            }
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });

    // Heartbeat: respond to pings
    ws.on("pong", () => {
      (ws as AuctionSocket).__alive = true;
    });
    (ws as AuctionSocket).__alive = true;

    // Clean up on close
    ws.on("close", () => {
      const room = rooms.get(leagueId);
      if (room) {
        room.delete(ws);
        if (room.size === 0) rooms.delete(leagueId);
      }
    });

    ws.on("error", () => {
      ws.close();
    });
  });

  // Heartbeat interval: detect stale connections
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if ((ws as AuctionSocket).__alive === false) {
        ws.terminate();
        continue;
      }
      (ws as AuctionSocket).__alive = false;
      ws.ping();
    }
  }, 30_000);

  wss.on("close", () => {
    clearInterval(heartbeat);
  });

  logger.info({}, "Auction WebSocket server attached at /ws/auction");

  return wss;
}
