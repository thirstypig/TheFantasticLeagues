import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { logger } from "./logger.js";

/**
 * Post a system-generated chat message to a league's chat.
 * Also broadcasts via WebSocket if the chat WS service is available.
 */
export async function postSystemChatMessage(
  leagueId: number,
  userId: number,
  text: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const chatMsg = await prisma.chatMessage.create({
      data: {
        leagueId,
        userId,
        text,
        type: "system",
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    // Dynamically import to avoid circular dependency
    const { broadcastChatMessage } = await import("../features/chat/services/chatWsService.js");

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const userName = user?.name || user?.email?.split("@")[0] || `User ${userId}`;

    broadcastChatMessage(leagueId, {
      type: "CHAT_MESSAGE",
      id: chatMsg.id,
      userId,
      userName,
      text,
      msgType: "system",
      metadata,
      createdAt: chatMsg.createdAt.toISOString(),
    });
  } catch (err) {
    logger.warn({ error: String(err), leagueId }, "Failed to post system chat message");
  }
}
