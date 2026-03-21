import { useEffect, useRef } from 'react';
import type { ClientAuctionState } from './useAuctionState';
import { track } from '../../../lib/posthog';

/**
 * Requests notification permission and fires browser notifications for auction events.
 * - "Your turn to nominate!" when queueIndex points to myTeamId
 * - "You've been outbid on [player]!" when someone bids higher
 * - "You won [player] for $X!" when a lot you won finishes
 *
 * Uses the Web Notifications API (not Push API). No service worker needed.
 */

interface NotificationState {
  isMyTurn: boolean;
  highBidderTeamId: number | null;
  logLength: number;
}

function fireNotification(title: string, body: string, type: string) {
  try {
    if (Notification.permission !== 'granted') return;
    const n = new Notification(title, {
      body,
      icon: '/icon.svg',
      tag: `auction-${type}`, // replaces previous notification of the same type
      silent: false,
    });
    setTimeout(() => n.close(), 5000);
    track('auction_notification_shown', { type });
  } catch (e: unknown) {
    // Notification constructor can throw in some environments (e.g., insecure context)
    console.warn('Notification failed:', e);
  }
}

export function useAuctionNotifications(
  auctionState: ClientAuctionState | null,
  myTeamId: number | undefined,
  muted: boolean,
) {
  const prevRef = useRef<NotificationState>({
    isMyTurn: false,
    highBidderTeamId: null,
    logLength: 0,
  });

  // Request permission on mount (only if not already granted/denied)
  useEffect(() => {
    if (muted) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {
        // User dismissed or browser blocked — nothing to do
      });
    }
  }, [muted]);

  // Detect state transitions and fire notifications
  useEffect(() => {
    if (!auctionState || !myTeamId || muted) return;
    if (typeof Notification === 'undefined') return;

    const isMyTurn =
      auctionState.status === 'nominating' &&
      auctionState.queue?.[auctionState.queueIndex] === myTeamId;

    const highBidderTeamId = auctionState.nomination?.highBidderTeamId ?? null;
    const logLength = auctionState.log?.length ?? 0;
    const prev = prevRef.current;

    // Transition: not my turn -> my turn
    if (isMyTurn && !prev.isMyTurn) {
      fireNotification(
        'Your Turn!',
        'It\'s your turn to nominate a player.',
        'your_turn',
      );
    }

    // Transition: I was high bidder, now someone else is
    if (
      prev.highBidderTeamId === myTeamId &&
      highBidderTeamId !== null &&
      highBidderTeamId !== myTeamId
    ) {
      const playerName = auctionState.nomination?.playerName ?? 'a player';
      const currentBid = auctionState.nomination?.currentBid;
      fireNotification(
        'Outbid!',
        `You've been outbid on ${playerName}${currentBid ? ` ($${currentBid})` : ''}.`,
        'outbid',
      );
    }

    // Win: new log entries with a WIN for my team
    if (logLength > prev.logLength && auctionState.log) {
      const newCount = logLength - prev.logLength;
      const newEvents = auctionState.log.slice(0, newCount);
      for (const evt of newEvents) {
        if (evt.type === 'WIN' && evt.teamId === myTeamId) {
          fireNotification(
            'Player Won!',
            `You won ${evt.playerName ?? 'a player'} for $${evt.amount ?? '?'}!`,
            'win',
          );
        }
      }
    }

    prevRef.current = { isMyTurn, highBidderTeamId, logLength };
  }, [
    auctionState?.status,
    auctionState?.queueIndex,
    auctionState?.nomination?.highBidderTeamId,
    auctionState?.nomination?.currentBid,
    auctionState?.log?.length,
    myTeamId,
    muted,
  ]);
}
