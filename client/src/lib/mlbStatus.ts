// MLB IL status predicate for the client.
//
// MUST stay in sync with `server/src/lib/ilSlotGuard.ts#isMlbIlStatus` —
// the server runs this check against the live MLB feed, so if the two drift
// the UI will either hide legitimate warnings or show false-positive warnings.
//
// The MLB statsapi 40-man roster feed (`/teams/{id}/roster?rosterType=40Man`)
// returns `status.description` as "Injured 10-Day" / "Injured 15-Day" /
// "Injured 60-Day" — these are the real-world strings. The legacy form
// "Injured List 10-Day" is accepted as defensive forward-compat.

const MLB_IL_STATUS_RE = /^Injured (List )?\d+-Day$/;

export function isMlbIlStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return MLB_IL_STATUS_RE.test(status);
}
