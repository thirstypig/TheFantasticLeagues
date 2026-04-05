// server/src/features/draft/services/draftWsService.ts
import { WebSocket, WebSocketServer } from "ws";
import type { IncomingMessage, Server as HttpServer } from "http";
import { supabaseAdmin } from "../../../lib/supabase.js";
import { prisma } from "../../../db/prisma.js";
import { logger } from "../../../lib/logger.js";
import type { DraftState } from "../types.js";

/** Extended WebSocket with draft metadata */
interface DraftSocket extends WebSocket {
  __userId?: number;
  __userName?: string;
  __leagueId?: number;
  __alive?: boolean;
}

// Per-league rooms: leagueId -> Set of connected WebSockets
const rooms = new Map<number, Set<WebSocket>>();

// Chat rate limiter: userId -> recent message timestamps
const chatRateLimits = new Map<number, number[]>();

/**
 * Broadcast draft state to all connected clients in a league room.
 * Called after every pick, pause, resume, etc.
 */
export function broadcastDraftState(leagueId: number, state: DraftState): void {
  const clients = rooms.get(leagueId);
  if (!clients || clients.size === 0) return;

  // Serialize Sets to arrays for JSON
  const serialized = {
    ...state,
    draftedPlayerIds: Array.from(state.draftedPlayerIds),
    autoPickTeams: Array.from(state.autoPickTeams),
  };

  const payload = JSON.stringify({ type: "DRAFT_STATE", data: serialized });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

/**
 * Broadcast a single pick event (lightweight update).
 */
export function broadcastPick(leagueId: number, pick: {
  pickNum: number;
  round: number;
  teamId: number;
  playerId: number | null;
  playerName: string | null;
  position: string | null;
  isAutoPick: boolean;
}): void {
  const clients = rooms.get(leagueId);
  if (!clients || clients.size === 0) return;

  const payload = JSON.stringify({ type: "DRAFT_PICK", data: pick });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
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
 * Attach a WebSocketServer for the snake draft to an existing HTTP server.
 */
export function attachDraftWs(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/draft" });

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

    // Store metadata on socket
    (ws as DraftSocket).__userId = userId;
    (ws as DraftSocket).__userName = displayName;
    (ws as DraftSocket).__leagueId = leagueId;

    logger.info({ userId, leagueId }, "Draft WS client connected");

    // Handle incoming messages (chat)
    ws.on("message", (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
        if (msg.type !== "CHAT" || typeof msg.text !== "string") return;

        // Rate limit: max 5 messages per 10 seconds
        const now = Date.now();
        const times = chatRateLimits.get(userId) || [];
        const recent = times.filter(t => now - t < 10_000);
        if (recent.length >= 5) return;
        recent.push(now);
        chatRateLimits.set(userId, recent);

        // Sanitize text
        const text = msg.text.slice(0, 500).replace(/[\x00-\x1f]/g, "");
        if (!text.trim()) return;

        const chatPayload = JSON.stringify({
          type: "CHAT",
          userId,
          userName: displayName,
          text,
          timestamp: now,
        });

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

    // Heartbeat
    ws.on("pong", () => { (ws as DraftSocket).__alive = true; });
    (ws as DraftSocket).__alive = true;

    // Clean up on close
    ws.on("close", () => {
      const room = rooms.get(leagueId);
      if (room) {
        room.delete(ws);
        if (room.size === 0) rooms.delete(leagueId);
      }
    });

    ws.on("error", () => { ws.close(); });
  });

  // Heartbeat interval
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if ((ws as DraftSocket).__alive === false) {
        ws.terminate();
        continue;
      }
      (ws as DraftSocket).__alive = false;
      ws.ping();
    }
  }, 30_000);

  wss.on("close", () => { clearInterval(heartbeat); });

  logger.info({}, "Draft WebSocket server attached at /ws/draft");
  return wss;
}
