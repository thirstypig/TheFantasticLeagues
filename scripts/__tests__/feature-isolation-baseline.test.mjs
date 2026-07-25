import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const baseline = JSON.parse(readFileSync(join(REPO_ROOT, "scripts/feature-isolation-baseline.json"), "utf8"));

/**
 * ADR-015 makes feature-module isolation a RATCHET: 97 pre-existing cross-feature
 * imports are grandfathered, and the number may only go down.
 *
 * The failure mode this guards is specific and tempting: a CI failure from a new
 * cross-feature import is trivially "fixed" by re-running --update-baseline, which
 * silently legitimises the violation. This test makes that move fail loudly.
 *
 * When violations are genuinely REMOVED, lower HIGH_WATER to the new count — that
 * edit is the deliberate act ADR-015 asks for.
 */
const HIGH_WATER = 95; // ADR-015 baseline, deduped 2026-07-24 (97 import statements → 95 distinct keys)

describe("feature-isolation baseline (ADR-015 ratchet)", () => {
  it("never grows beyond the ADR-015 high-water mark", () => {
    expect(
      baseline.allowed.length,
      `Baseline grew to ${baseline.allowed.length} (high-water ${HIGH_WATER}). ` +
        `If CI failed on a new cross-feature import, fix the import — do not regenerate the baseline. ` +
        `See docs/engineering/adrs/ADR-015-feature-module-boundaries.md.`,
    ).toBeLessThanOrEqual(HIGH_WATER);
  });

  it("declared count matches the actual entry count", () => {
    expect(baseline.count).toBe(baseline.allowed.length);
  });

  it("contains no duplicate entries", () => {
    expect(new Set(baseline.allowed).size).toBe(baseline.allowed.length);
  });

  it("every entry is a well-formed side|file|specifier key", () => {
    for (const entry of baseline.allowed) {
      const [side, file, spec] = entry.split("|");
      expect(["server", "client"]).toContain(side);
      expect(file).toMatch(/^(server|client)\/src\/features\/[^/]+\/.+\.(ts|tsx)$/);
      expect(spec.length).toBeGreaterThan(0);
    }
  });

  it("keys carry no line numbers — moving code must not invalidate the baseline", () => {
    // A key like "client|path.tsx|../x:42" would make every refactor a false alarm.
    for (const entry of baseline.allowed) expect(entry).not.toMatch(/:\d+$/);
  });

  it("points at the ADR so the next person finds the rules", () => {
    expect(baseline._comment).toMatch(/ADR-015/);
  });
});
