/**
 * Chat feature removed — Board replaces it.
 * This function is kept as a no-op so trades/waivers callers don't need changes.
 */
export async function postSystemChatMessage(
  _leagueId: number,
  _userId: number,
  _text: string,
  _metadata?: Record<string, unknown>,
): Promise<void> {
  // No-op: chat disabled
}
