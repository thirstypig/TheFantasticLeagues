/**
 * Push Notification Service
 *
 * Uses web-push with VAPID keys to send push notifications to subscribed browsers.
 * Graceful degradation: all sends are no-ops if VAPID keys are not configured.
 *
 * To generate VAPID keys: npx web-push generate-vapid-keys
 * Then set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env
 */

import webPush from "web-push";
import { prisma } from "../db/prisma.js";
import { logger } from "./logger.js";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";

const vapidConfigured = !!(VAPID_PUBLIC && VAPID_PRIVATE);

if (vapidConfigured) {
  webPush.setVapidDetails(
    "mailto:admin@thefantasticleagues.com",
    VAPID_PUBLIC,
    VAPID_PRIVATE,
  );
  logger.info({}, "VAPID keys configured — push notifications enabled");
} else {
  logger.warn({}, "VAPID keys not set — push notifications disabled");
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

/**
 * Send a push notification to all subscriptions for a given user.
 * Automatically removes stale subscriptions (410 Gone).
 */
export async function sendPushToUser(
  userId: number,
  payload: PushPayload,
  notificationType?: string,
): Promise<void> {
  if (!vapidConfigured) return;

  // Check user's notification preferences if a type is specified
  if (notificationType) {
    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (prefs) {
      const key = notificationType as keyof typeof prefs;
      if (key in prefs && prefs[key] === false) {
        logger.debug({ userId, notificationType }, "Push skipped — user opted out");
        return;
      }
    }
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) return;

  const jsonPayload = JSON.stringify(payload);
  const staleIds: number[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          jsonPayload,
        );
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          staleIds.push(sub.id);
        } else {
          logger.warn(
            { userId, endpoint: sub.endpoint.slice(0, 60), statusCode: err?.statusCode },
            "Push send failed",
          );
        }
      }
    }),
  );

  // Clean up stale subscriptions
  if (staleIds.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { id: { in: staleIds } },
    });
    logger.info({ userId, cleaned: staleIds.length }, "Cleaned stale push subscriptions");
  }
}

/**
 * Send a push notification to all owners of a team.
 * Resolves owners via TeamOwnership (multi-owner) with ownerUserId fallback.
 */
export async function sendPushToTeamOwners(
  teamId: number,
  payload: PushPayload,
  notificationType?: string,
  excludeUserId?: number,
): Promise<void> {
  if (!vapidConfigured) return;

  // Multi-owner support
  const ownerships = await prisma.teamOwnership.findMany({
    where: { teamId },
    select: { userId: true },
  });

  let userIds = ownerships.map((o) => o.userId);

  // Fallback: legacy single-owner
  if (userIds.length === 0) {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { ownerUserId: true },
    });
    if (team?.ownerUserId) {
      userIds = [team.ownerUserId];
    }
  }

  for (const uid of userIds) {
    if (uid === excludeUserId) continue;
    await sendPushToUser(uid, payload, notificationType);
  }
}

/**
 * Send a push notification to all members of a league.
 */
export async function sendPushToLeague(
  leagueId: number,
  payload: PushPayload,
  notificationType?: string,
  excludeUserId?: number,
): Promise<void> {
  if (!vapidConfigured) return;

  const members = await prisma.leagueMembership.findMany({
    where: { leagueId },
    select: { userId: true },
  });

  for (const m of members) {
    if (m.userId === excludeUserId) continue;
    await sendPushToUser(m.userId, payload, notificationType);
  }
}

/** Return the VAPID public key (safe for client use). */
export function getVapidPublicKey(): string {
  return VAPID_PUBLIC;
}
