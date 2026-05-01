/**
 * loadRosterMovePlayers — single producer for the roster-moves panel data
 * shape.
 *
 * Background (todo #116, MEMORY `feedback_partial_browser_verification.md`):
 * The `RosterMovesTab` panels (`AddDropPanel`, `PlaceOnIlPanel`,
 * `ActivateFromIlPanel`) filter their drop / stash / IL dropdowns by
 *
 *   p._dbTeamId === teamId && p.assignedPosition !== "IL" && (p._dbPlayerId ?? 0) > 0
 *
 * Those three fields (`_dbPlayerId`, `_dbTeamId`, `assignedPosition`) are
 * NOT produced by `getPlayerSeasonStats` — that endpoint returns the
 * league-wide stats pool with `id` (Player.id), `mlb_id`, and
 * `ogba_team_code` only. The legacy code path (`TeamLegacy.tsx`) used to
 * synthesize the enrichment by mapping over `getTeamDetails().currentRoster`
 * and merging in the matching CSV/stats row by `mlb_id`. PR #182's v3
 * hub wiring kept calling `setPlayers(stats)` with the unenriched payload
 * and cast it via `as unknown as RosterMovesPlayer[]`, which silently
 * dropped the enrichment — leaving every drop dropdown empty in
 * production.
 *
 * This loader is the v3 replacement: it fetches both endpoints in
 * parallel, indexes the team's `currentRoster` by `mlb_id`, then walks
 * the season-stats pool and tags each row with the matching roster's
 * Prisma ids + slot. The output is a `RosterMovesPlayer[]` that the
 * panels can consume directly with no casts.
 *
 * Notes:
 *   - Only the active team's roster is enriched. Players rostered on
 *     OTHER teams in the same league flow through unenriched (which is
 *     what we want — they're not drop candidates, and the panel's
 *     `tid === teamId` filter excludes them anyway).
 *   - The shape is intentionally heterogeneous: free-agent rows have
 *     `mlb_id` only; own-team rows additionally carry `_dbPlayerId`,
 *     `_dbTeamId`, `assignedPosition`. The panels handle both branches.
 *   - `mlb_id` is the join key. Matching by `playerId` would require
 *     an extra round-trip since `getPlayerSeasonStats` already exposes
 *     `id` (Player.id) — but `currentRoster` carries `mlbId`, not
 *     `playerId`, on top of the line, and `mlb_id` is the conventional
 *     stable identifier across CSV / DB / live MLB API rows. A `String()`
 *     coerce on both sides handles the `string | number` mismatch the
 *     wire format permits.
 */
import { getPlayerSeasonStats } from "../../../api";
import { getTeamDetails } from "../../teams/api";
import type { RosterMovesPlayer } from "@shared/api/rosterMoves";

export async function loadRosterMovePlayers(
  leagueId: number,
  teamId: number,
): Promise<RosterMovesPlayer[]> {
  const [statsResult, detailsResult] = await Promise.allSettled([
    getPlayerSeasonStats(leagueId),
    getTeamDetails(teamId),
  ]);

  const stats = statsResult.status === "fulfilled" ? statsResult.value : [];
  const currentRoster =
    detailsResult.status === "fulfilled" ? (detailsResult.value.currentRoster ?? []) : [];

  // Index by mlb_id (string-coerced, since the wire format is `string | number`).
  // currentRoster.mlbId comes from Prisma as `number | null`; null mlbIds can't
  // be joined and are skipped. Synthetic players (Ohtani's pitcher row) may
  // have null mlbId and will appear in stats but not enrich — accepted today
  // since the legacy path had the same gap.
  const rosterByMlbId = new Map<
    string,
    { rosterId: number; playerId: number; assignedPosition: string | null }
  >();
  for (const row of currentRoster) {
    if (row.mlbId === null || row.mlbId === undefined) continue;
    rosterByMlbId.set(String(row.mlbId), {
      rosterId: row.id,
      playerId: row.playerId,
      assignedPosition: row.assignedPosition ?? null,
    });
  }

  const enriched: RosterMovesPlayer[] = stats.map((s: any) => {
    const mlbIdKey = String(s.mlb_id ?? s.mlbId ?? "");
    const match = mlbIdKey ? rosterByMlbId.get(mlbIdKey) : undefined;
    if (!match) return s as RosterMovesPlayer;
    return {
      ...s,
      _dbPlayerId: match.playerId,
      _dbTeamId: teamId,
      assignedPosition: match.assignedPosition ?? undefined,
    } as RosterMovesPlayer;
  });

  return enriched;
}
