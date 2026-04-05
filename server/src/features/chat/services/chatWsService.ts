import { WebSocket, WebSocketServer } from "ws";
import type { IncomingMessage, Server as HttpServer } from "http";
import { supabaseAdmin } from "../../../lib/supabase.js";
import { prisma } from "../../../db/prisma.js";
import { logger } from "../../../lib/logger.js";

/** Extended WebSocket with chat metadata */
interface ChatSocket extends WebSocket {
  __userId?: number;
  __userName?: string;
  __leagueId?: number;
  __alive?: boolean;
}

// Per-league rooms: leagueId -> Set of connected WebSockets
const rooms = new Map<number, Set<WebSocket>>();

// Chat rate limiter: userId -> recent message timestamps
const chatRateLimits = new Map<number, number[]>();
const RATE_LIMIT_WINDOW = 30_000; // 30 seconds
const RATE_LIMIT_MAX = 10; // max messages per window

/**
 * Broadcast a chat event to all connected clients in a league room.
 */
export function broadcastChatMessage(leagueId: number, payload: Record<string, unknown>): void {
  const clients = rooms.get(leagueId);
  if (!clients || clients.size === 0) return;

  const json = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(json);
    }
  }
}

/**
 * Authenticate a WebSocket connection via JWT token in query params.
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
 * Attach the Chat WebSocketServer to an existing HTTP server at /ws/chat.
 */
export function attachChatWs(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/chat" });

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

    // Look up display name
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const displayName = dbUser?.name || dbUser?.email?.split("@")[0] || `User ${userId}`;

    // Store metadata on socket
    (ws as ChatSocket).__userId = userId;
    (ws as ChatSocket).__userName = displayName;
    (ws as ChatSocket).__leagueId = leagueId;
    (ws as ChatSocket).__alive = true;

    logger.info({ userId, leagueId }, "Chat WS client connected");

    // Handle incoming messages
    ws.on("message", async (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());

        switch (msg.type) {
          case "CHAT_SEND": {
            if (typeof msg.text !== "string") return;

            // Rate limit: max RATE_LIMIT_MAX messages per RATE_LIMIT_WINDOW
            const now = Date.now();
            const times = chatRateLimits.get(userId) || [];
            const recent = times.filter(t => now - t < RATE_LIMIT_WINDOW);
            if (recent.length >= RATE_LIMIT_MAX) {
              ws.send(JSON.stringify({ type: "CHAT_ERROR", error: "Rate limit exceeded. Slow down." }));
              return;
            }
            recent.push(now);
            chatRateLimits.set(userId, recent);

            // Sanitize text (max 1000 chars, strip control chars)
            const text = msg.text.slice(0, 1000).replace(/[\x00-\x1f]/g, "").trim();
            if (!text) return;

            // Persist to DB
            const chatMsg = await prisma.chatMessage.create({
              data: { leagueId, userId, text, type: "user" },
            });

            // Broadcast to all clients in the room
            broadcastChatMessage(leagueId, {
              type: "CHAT_MESSAGE",
              id: chatMsg.id,
              userId,
              userName: displayName,
              text,
              msgType: "user",
              createdAt: chatMsg.createdAt.toISOString(),
            });
            break;
          }

          case "CHAT_HISTORY": {
            const limit = Math.min(Math.max(Number(msg.limit) || 50, 1), 100);
            const before = Number(msg.before) || undefined;

            const where: Record<string, unknown> = { leagueId, deletedAt: null };
            if (before) where.id = { lt: before };

            const messages = await prisma.chatMessage.findMany({
              where,
              orderBy: { id: "desc" },
              take: limit,
              include: {
                user: { select: { id: true, name: true, email: true, avatarUrl: true } },
              },
            });

            ws.send(JSON.stringify({
              type: "CHAT_HISTORY",
              messages: messages.reverse().map(m => ({
                id: m.id,
                userId: m.userId,
                userName: m.user.name || m.user.email?.split("@")[0] || `User ${m.userId}`,
                avatarUrl: m.user.avatarUrl,
                text: m.text,
                msgType: m.type,
                metadata: m.metadata,
                createdAt: m.createdAt.toISOString(),
              })),
              hasMore: messages.length === limit,
            }));
            break;
          }

          case "CHAT_DELETE": {
            const messageId = Number(msg.messageId);
            if (!Number.isFinite(messageId)) return;

            // Only commissioner or admin can delete
            const delMembership = await prisma.leagueMembership.findFirst({
              where: { userId, league: { id: leagueId }, role: "COMMISSIONER" },
            });
            const delUser = await prisma.user.findUnique({
              where: { id: userId },
              select: { isAdmin: true },
            });

            if (!delMembership && !delUser?.isAdmin) {
              ws.send(JSON.stringify({ type: "CHAT_ERROR", error: "Only commissioners can delete messages" }));
              return;
            }

            // Soft delete
            await prisma.chatMessage.update({
              where: { id: messageId },
              data: { deletedAt: new Date() },
            });

            // Broadcast deletion to all clients
            broadcastChatMessage(leagueId, {
              type: "CHAT_DELETED",
              messageId,
            });
            break;
          }
        }
      } catch (err) {
        logger.warn({ error: String(err), userId, leagueId }, "Chat WS message error");
      }
    });

    // Heartbeat: respond to pings
    ws.on("pong", () => {
      (ws as ChatSocket).__alive = true;
    });

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
      if ((ws as ChatSocket).__alive === false) {
        ws.terminate();
        continue;
      }
      (ws as ChatSocket).__alive = false;
      ws.ping();
    }
  }, 30_000);

  wss.on("close", () => {
    clearInterval(heartbeat);
  });

  logger.info({}, "Chat WebSocket server attached at /ws/chat");

  return wss;
}
