import type { AuctionState } from "../types.js";

/**
 * Strip private fields from auction state before it leaves the server
 * (WebSocket broadcast, GET /state, route responses):
 * - `nomination.proxyBids`: each team's secret max bid (a team reads its own
 *   via GET /my-proxy-bid).
 * - `nominationLists`: each team's private "my list" (read via GET /my-list).
 *
 * Returns a shallow copy; the live state is never mutated. Kept dependency-free
 * so both the state manager and the WebSocket service can import it without a
 * cycle.
 */
export function sanitizeStateForBroadcast(state: AuctionState): AuctionState {
  const { nominationLists: _private, ...rest } = state;
  if (!state.nomination?.proxyBids) return rest;
  return { ...rest, nomination: { ...state.nomination, proxyBids: undefined } };
}
