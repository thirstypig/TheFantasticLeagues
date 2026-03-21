import { useState, useEffect, useCallback, useMemo } from 'react';
import { track } from '../../../lib/posthog';

export interface PlayerRanking {
  playerName: string;
  rank: number;
}

interface ParseResult {
  rankings: PlayerRanking[];
  errors: string[];
}

interface ImportResult {
  imported: number;
  errors: string[];
}

function storageKey(leagueId: number): string {
  return `auctionRankings_${leagueId}`;
}

function loadRankings(leagueId: number | null | undefined): PlayerRanking[] {
  if (!leagueId) return [];
  try {
    const saved = localStorage.getItem(storageKey(leagueId));
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return [];
}

function saveRankings(leagueId: number, rankings: PlayerRanking[]): void {
  localStorage.setItem(storageKey(leagueId), JSON.stringify(rankings));
}

/**
 * Parse CSV text into player rankings.
 * Supports two formats:
 *   1. Two-column CSV: "Player,Rank" (header optional)
 *   2. One name per line: rank = row number
 */
function parseCsv(csvText: string): ParseResult {
  const lines = csvText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) {
    return { rankings: [], errors: ['No data found in input'] };
  }

  const errors: string[] = [];
  const seen = new Set<string>();
  const rankings: PlayerRanking[] = [];

  // Detect format: check if first line looks like a header
  const firstParts = lines[0].split(',').map(s => s.trim());
  let startIdx = 0;

  // Skip header row if it matches common header patterns
  if (firstParts.length >= 1) {
    const col1 = firstParts[0].toLowerCase();
    if (col1 === 'player' || col1 === 'name' || col1 === 'player name') {
      startIdx = 1;
    }
  }

  // Detect if this is two-column (has commas with numbers) or single-column
  const hasTwoColumns = lines.slice(startIdx).some(line => {
    const parts = line.split(',');
    return parts.length >= 2 && /^\d+$/.test(parts[parts.length - 1].trim());
  });

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    let playerName: string;
    let rank: number;

    if (hasTwoColumns) {
      // Two-column format: "Name,Rank"
      const parts = line.split(',');
      if (parts.length < 2) {
        playerName = line.trim();
        rank = rankings.length + 1;
      } else {
        const rawRank = parts[parts.length - 1].trim();
        playerName = parts.slice(0, -1).join(',').trim();
        const parsedRank = parseInt(rawRank, 10);

        if (!playerName) {
          errors.push(`Line ${lineNum}: empty player name`);
          continue;
        }

        if (isNaN(parsedRank) || parsedRank < 1) {
          // Non-numeric second column -- treat as single-column
          playerName = line.trim();
          rank = rankings.length + 1;
        } else {
          rank = parsedRank;
        }
      }
    } else {
      // Single-column format: name per line, rank = order
      playerName = line.trim();
      rank = rankings.length + 1;
    }

    // Strip surrounding quotes
    playerName = playerName.replace(/^["']|["']$/g, '').trim();

    if (!playerName) {
      errors.push(`Line ${lineNum}: empty player name`);
      continue;
    }

    const key = playerName.toLowerCase();
    if (seen.has(key)) {
      errors.push(`Line ${lineNum}: duplicate "${playerName}" (skipped)`);
      continue;
    }

    seen.add(key);
    rankings.push({ playerName, rank });
  }

  return { rankings, errors };
}

export function useMyRankings(leagueId: number | null | undefined) {
  const [rawRankings, setRawRankings] = useState<PlayerRanking[]>(() => loadRankings(leagueId));

  // Reload when leagueId changes
  useEffect(() => {
    setRawRankings(loadRankings(leagueId));
  }, [leagueId]);

  // Build lookup map: lowercase name -> rank
  const rankings = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rawRankings) {
      map.set(r.playerName.toLowerCase(), r.rank);
    }
    return map;
  }, [rawRankings]);

  const importRankings = useCallback((csvText: string): ImportResult => {
    const { rankings: parsed, errors } = parseCsv(csvText);

    if (parsed.length > 0 && leagueId) {
      saveRankings(leagueId, parsed);
      setRawRankings(parsed);
      track('auction_rankings_imported', { count: parsed.length });
    }

    return { imported: parsed.length, errors };
  }, [leagueId]);

  const clearRankings = useCallback(() => {
    if (leagueId) {
      localStorage.removeItem(storageKey(leagueId));
    }
    setRawRankings([]);
    track('auction_rankings_cleared');
  }, [leagueId]);

  return { rankings, rankingsCount: rawRankings.length, importRankings, clearRankings };
}
