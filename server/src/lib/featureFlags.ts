// server/src/lib/featureFlags.ts
// Runtime feature flags read from environment variables.
// All flags default to "enabled" — explicit opt-out only.
//
// These are distinct from league-level rules (which live in the LeagueRule
// table): flags here are system-wide circuit breakers for platform behavior
// the commissioner can't (and shouldn't) control.

function readBoolEnv(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }
  return true;
}

/**
 * When true (default), in-season roster-rule invariants are enforced:
 *   - add-must-drop
 *   - position-inherit
 *   - per-league exact roster cap
 *   - IL slot gating and ghost-IL block
 *
 * Flip to `false` in the Railway dashboard (no deploy needed) to disable
 * just the enforcement layer while keeping new endpoints and billing live.
 *
 * Intended use: emergency safety net if enforcement starts rejecting
 * legitimate commissioner workflow in production. See risk R16 in
 * docs/plans/2026-04-21-feat-roster-rules-il-slots-and-fees-plan.md.
 */
export function enforceRosterRules(): boolean {
  return readBoolEnv("ENFORCE_ROSTER_RULES", true);
}
