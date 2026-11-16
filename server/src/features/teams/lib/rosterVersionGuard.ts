/**
 * Optimistic-concurrency helpers for the roster hub (todo #181).
 *
 * The `rosterVersion` column on `Team` is a monotonic counter that increments
 * inside every roster-mutating transaction (PATCH slot, claim, drop, IL
 * stash/activate). The client reads the version from the hub GET response and
 * echoes it on mutations as an `If-Match` header. The server rejects stale
 * writes with 409 so the client can re-fetch and confirm against current state.
 */
import { prisma } from "../../../db/prisma.js";
import type { PrismaClient } from "@prisma/client";
import type { ITXClientDenyList } from "@prisma/client/runtime/library";

type Tx = Omit<PrismaClient, ITXClientDenyList>;

/**
 * Check the `If-Match` header against the team's current `rosterVersion`.
 *
 * - `{ missing: true }`: no header was sent. The caller must answer 428; a
 *   write with no version token would silently clobber another tab's changes.
 * - `{ stale: true, current }`: the token is not the team's current version.
 *   The caller must answer 409 and hand back `current` so the client can reload.
 * - `{ stale: false }`: the write may proceed.
 *
 * `If-Match: *` is the standard HTTP "match any current version" token. It is
 * for single-row edits made from screens that never loaded the roster hub (the
 * classic team page, the draft report, the commissioner grid). Those callers
 * have no version to send, and they were last-writer-wins before this guard.
 */
export async function checkRosterVersion(
  teamId: number,
  ifMatch: string | undefined,
): Promise<{ missing: true } | { stale: true; current: number } | { stale: false }> {
  const token = ifMatch?.trim().replace(/^"(.*)"$/, "$1");
  if (!token) return { missing: true };
  if (token === "*") return { stale: false };
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { rosterVersion: true },
  });
  const current = team?.rosterVersion ?? 0;
  if (String(current) !== token) return { stale: true, current };
  return { stale: false };
}

/**
 * Atomically increment `rosterVersion` for `teamId` within an open
 * transaction. Must be called after all roster row mutations so the counter
 * reflects the post-mutation state.
 */
export async function incrementRosterVersion(
  teamId: number,
  tx: Tx,
): Promise<number> {
  const updated = await tx.team.update({
    where: { id: teamId },
    data: { rosterVersion: { increment: 1 } },
    select: { rosterVersion: true },
  });
  return updated.rosterVersion;
}
