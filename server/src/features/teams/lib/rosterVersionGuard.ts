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
 * Returns `{ stale: true, current }` when the versions diverge, or
 * `{ stale: false }` otherwise.
 *
 * The header is **optional for now** — callers without it are allowed
 * through (maintains backwards compatibility during rollout).
 */
export async function checkRosterVersion(
  teamId: number,
  ifMatch: string | undefined,
): Promise<{ stale: true; current: number } | { stale: false }> {
  if (!ifMatch) return { stale: false };
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { rosterVersion: true },
  });
  const current = team?.rosterVersion ?? 0;
  if (String(current) !== ifMatch) return { stale: true, current };
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
