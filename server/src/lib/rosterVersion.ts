/**
 * Optimistic-concurrency helpers for the roster hub (todo #181).
 *
 * The `rosterVersion` column on `Team` is a monotonic counter that increments
 * inside every roster-mutating transaction (PATCH slot, claim, drop, IL
 * stash/activate, trades, wire-list, commissioner edits). The client reads the
 * version from the hub GET response and echoes it on guarded mutations as an
 * `If-Match` header. Missing header: 428. Stale: 409 so the client can
 * re-fetch and confirm against current state.
 */
import { prisma } from "../db/prisma.js";
import type { PrismaClient } from "@prisma/client";
import type { ITXClientDenyList } from "@prisma/client/runtime/library";

type Tx = Omit<PrismaClient, ITXClientDenyList>;

/** What the caller's `If-Match` header asks for. */
export type RosterVersionExpectation =
  | { kind: "missing" }
  | { kind: "any" }
  | { kind: "exact"; version: number }
  | { kind: "malformed" };

/**
 * Parse the `If-Match` header.
 * - absent/blank: `missing` (the route answers 428)
 * - `*`: `any`, the standard "match any current version" token. For single-row
 *   edits from screens that never loaded the roster hub (classic team page,
 *   commissioner grid); they were last-writer-wins before this guard.
 * - an integer (optionally quoted, as an HTTP etag): `exact`
 * - anything else: `malformed` (treated as stale, never as a pass)
 */
export function parseIfMatch(header: string | undefined): RosterVersionExpectation {
  const token = header?.trim().replace(/^"(.*)"$/, "$1");
  if (!token) return { kind: "missing" };
  if (token === "*") return { kind: "any" };
  if (/^\d+$/.test(token)) return { kind: "exact", version: Number(token) };
  return { kind: "malformed" };
}

/** Thrown inside a transaction when the caller's version is no longer current. */
export class StaleRosterError extends Error {
  constructor(readonly teamId: number, readonly expected: number) {
    super(`Roster version ${expected} is stale for team ${teamId}`);
    this.name = "StaleRosterError";
  }
}

/** Current `rosterVersion` (0 for an unknown team). Use after a rollback to report it. */
export async function readRosterVersion(teamId: number): Promise<number> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { rosterVersion: true },
  });
  return team?.rosterVersion ?? 0;
}

/**
 * Compare-and-increment inside an open transaction: bumps `rosterVersion`
 * only if it still equals `expected`. The conditional UPDATE takes the team
 * row lock, so a concurrent writer that holds the same token waits, then sees
 * the new version, matches zero rows and loses. Throws StaleRosterError so the
 * surrounding transaction (including the caller's roster writes) rolls back.
 * Returns the new version (`expected + 1`).
 */
export async function bumpRosterVersionIfCurrent(
  teamId: number,
  expected: number,
  tx: Tx,
): Promise<number> {
  const r = await tx.team.updateMany({
    where: { id: teamId, rosterVersion: expected },
    data: { rosterVersion: { increment: 1 } },
  });
  if (r.count === 0) throw new StaleRosterError(teamId, expected);
  return expected + 1;
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
