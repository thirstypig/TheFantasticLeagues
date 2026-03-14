/**
 * Fix unmatched 2025 archive players.
 * Applies smarter name parsing and broader MLB API searches.
 * Usage: cd server && npx tsx ../scripts/fix-unmatched-2025.ts
 */
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { PrismaClient } from "../server/node_modules/.prisma/client/index.js";

const prisma = new PrismaClient();

interface MlbSearchPerson {
  id: number;
  fullName: string;
  firstName?: string;
  lastName?: string;
  active?: boolean;
  primaryPosition?: { abbreviation?: string };
}

interface MlbSearchResponse {
  people?: MlbSearchPerson[];
}

const YEAR = 2025;

/**
 * Known typos/misspellings from the source Excel → correct MLB search name.
 * These were identified manually from the unmatched results.
 */
const TYPO_CORRECTIONS: Record<string, string> = {
  "G.Conine": "Griffin Conine",
  "D. Sanatana": "Dennis Santana",
  "I. Kner-Flefa": "Isiah Kiner-Falefa",
  "Michael Yastremski": "Mike Yastrzemski",
  "Ronald Maurcio": "Ronny Mauricio",
  "Kyle Hernandez": "Enrique Hernandez",
  "J. Irvine": "Jake Irvin",
  "S. Steet": "Spencer Steer",
  "J. Deyer": "Jack Dreyer",
  "Michael Adel": "Michael A. Taylor",
};

/** Rate-limited fetch from MLB API */
async function mlbSearch(query: string): Promise<MlbSearchPerson[]> {
  const url = `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(query)}&sportIds=1&seasons=${YEAR}`;
  try {
    const res = await fetch(url);
    const data = (await res.json()) as MlbSearchResponse;
    await new Promise((r) => setTimeout(r, 100)); // rate limit
    return data.people || [];
  } catch {
    return [];
  }
}

/**
 * Parse abbreviated player name into search variants.
 * Handles: "A. Riley", "Riley A.", "De La Cruz E.", "A. De La Cruz"
 */
function parseNameVariants(name: string): { firstName: string; lastName: string; searchTerms: string[] }[] {
  const variants: { firstName: string; lastName: string; searchTerms: string[] }[] = [];
  const trimmed = name.trim();

  // Pattern 1: "F. LastName" or "FirstInitial LastName" (standard)
  const stdMatch = trimmed.match(/^([A-Za-z])\.?\s+(.+)$/);
  if (stdMatch) {
    const initial = stdMatch[1];
    const last = stdMatch[2].trim();
    variants.push({ firstName: initial, lastName: last, searchTerms: [last, `${initial}. ${last}`] });
  }

  // Pattern 2: "LastName F." or "LastName FirstInitial" (reversed)
  const revMatch = trimmed.match(/^(.+?)\s+([A-Za-z])\.?$/);
  if (revMatch) {
    const last = revMatch[1].trim();
    const initial = revMatch[2];
    // Only add if different from pattern 1
    if (!stdMatch || stdMatch[2].trim() !== last) {
      variants.push({ firstName: initial, lastName: last, searchTerms: [last, `${initial}. ${last}`] });
    }
  }

  // Pattern 3: Full name without dots "Riley Austin" — try both orderings
  const fullMatch = trimmed.match(/^([A-Za-z]+)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)$/);
  if (fullMatch && !trimmed.includes(".")) {
    const a = fullMatch[1];
    const b = fullMatch[2];
    // Try "FirstName LastName"
    variants.push({ firstName: a.charAt(0), lastName: b, searchTerms: [b, `${a} ${b}`] });
    // Try "LastName FirstName" if single words
    if (!b.includes(" ")) {
      variants.push({ firstName: b.charAt(0), lastName: a, searchTerms: [a, `${b} ${a}`] });
    }
  }

  return variants;
}

async function main() {
  console.log(`\n=== Fixing unmatched players for ${YEAR} ===\n`);

  // 1. Get all distinct unmatched player names
  const unmatchedRows = await prisma.historicalPlayerStat.findMany({
    where: {
      period: { season: { year: YEAR } },
      OR: [{ mlbId: null }, { mlbId: "" }],
    },
    select: {
      id: true,
      playerName: true,
      position: true,
      isPitcher: true,
    },
    distinct: ["playerName"],
  });

  console.log(`Found ${unmatchedRows.length} distinct unmatched player names.\n`);

  let matched = 0;
  let stillUnmatched = 0;
  let ambiguous = 0;
  const results: { name: string; status: string; detail?: string }[] = [];
  const cache = new Map<string, MlbSearchPerson[]>();

  for (const player of unmatchedRows) {
    // Check typo corrections first
    const correctedName = TYPO_CORRECTIONS[player.playerName];
    if (correctedName) {
      const candidates = await mlbSearch(correctedName);
      if (candidates.length >= 1) {
        // Take the best match (first result for corrected name)
        const best = candidates[0];
        await prisma.historicalPlayerStat.updateMany({
          where: {
            playerName: player.playerName,
            period: { season: { year: YEAR } },
          },
          data: {
            fullName: best.fullName,
            mlbId: String(best.id),
          },
        });
        matched++;
        results.push({
          name: player.playerName,
          status: "MATCHED",
          detail: `${best.fullName} (${best.id}) [typo correction]`,
        });
        console.log(`  ✓ ${player.playerName} → ${best.fullName} (${best.id}) [typo correction]`);
        continue;
      }
    }

    const variants = parseNameVariants(player.playerName);
    if (variants.length === 0) {
      stillUnmatched++;
      results.push({ name: player.playerName, status: "UNPARSEABLE" });
      continue;
    }

    let bestMatch: MlbSearchPerson | null = null;
    let bestMatchCount = 0;

    for (const variant of variants) {
      for (const term of variant.searchTerms) {
        let candidates = cache.get(term);
        if (candidates === undefined) {
          candidates = await mlbSearch(term);
          cache.set(term, candidates);
        }

        // Filter by first initial
        let filtered = candidates.filter(
          (c) => c.firstName?.charAt(0).toUpperCase() === variant.firstName.toUpperCase()
        );

        // Filter by pitcher status if multiple matches
        if (filtered.length > 1 && player.isPitcher !== null) {
          const pitcherCodes = ["P", "SP", "RP", "TWP"];
          const pitcherFiltered = filtered.filter((c) => {
            const isPitcher = pitcherCodes.includes(c.primaryPosition?.abbreviation?.toUpperCase() || "");
            return isPitcher === player.isPitcher;
          });
          if (pitcherFiltered.length > 0) filtered = pitcherFiltered;
        }

        if (filtered.length === 1) {
          bestMatch = filtered[0];
          bestMatchCount = 1;
          break; // exact single match found
        } else if (filtered.length > 1 && bestMatchCount !== 1) {
          bestMatchCount = filtered.length;
        }
      }
      if (bestMatch) break;
    }

    if (bestMatch && bestMatchCount === 1) {
      // Update all records for this player name
      await prisma.historicalPlayerStat.updateMany({
        where: {
          playerName: player.playerName,
          period: { season: { year: YEAR } },
        },
        data: {
          fullName: bestMatch.fullName,
          mlbId: String(bestMatch.id),
        },
      });
      matched++;
      results.push({
        name: player.playerName,
        status: "MATCHED",
        detail: `${bestMatch.fullName} (${bestMatch.id})`,
      });
      console.log(`  ✓ ${player.playerName} → ${bestMatch.fullName} (${bestMatch.id})`);
    } else if (bestMatchCount > 1) {
      ambiguous++;
      results.push({ name: player.playerName, status: "AMBIGUOUS", detail: `${bestMatchCount} candidates` });
      console.log(`  ? ${player.playerName} — ${bestMatchCount} candidates (ambiguous)`);
    } else {
      stillUnmatched++;
      results.push({ name: player.playerName, status: "UNMATCHED" });
      console.log(`  ✗ ${player.playerName} — no match found`);
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`  Matched:     ${matched}`);
  console.log(`  Ambiguous:   ${ambiguous}`);
  console.log(`  Unmatched:   ${stillUnmatched}`);
  console.log(`  Total:       ${unmatchedRows.length}`);

  if (stillUnmatched > 0 || ambiguous > 0) {
    console.log(`\n--- Still unresolved ---`);
    for (const r of results) {
      if (r.status !== "MATCHED") {
        console.log(`  ${r.status}: ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
