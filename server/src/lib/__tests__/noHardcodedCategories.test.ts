import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Guard: production code must score a league's categories (getLeagueCategories),
 * never the hardcoded baseball CATEGORY_CONFIG. Only the sport config itself,
 * the resolver, and offline scripts may name it.
 */
const PATTERN = /\bCATEGORY_CONFIG\b/;

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EXCLUDED_FILES = new Set([
  path.join(SRC, "lib", "sportConfig.ts"),
  path.join(SRC, "lib", "leagueCategories.ts"),
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "scripts" && dir === SRC) continue;
      if (entry.name === "sports" && dir === path.join(SRC, "lib")) continue;
      if (entry.name === "__tests__") continue;
      walk(full, out);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !EXCLUDED_FILES.has(full)) {
      out.push(full);
    }
  }
  return out;
}

describe("no hardcoded CATEGORY_CONFIG in production code", () => {
  it("pattern self-test", () => {
    expect(PATTERN.test("const { computeCategoryRows, CATEGORY_CONFIG } =")).toBe(true);
    expect(PATTERN.test("SCORABLE_CATEGORIES")).toBe(false);
  });

  it("no server/src file outside the allowlist references CATEGORY_CONFIG", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        if (PATTERN.test(line)) offenders.push(`${path.relative(SRC, file)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
