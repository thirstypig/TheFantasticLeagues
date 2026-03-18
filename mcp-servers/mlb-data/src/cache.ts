import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export interface CacheEntry {
  url: string;
  data: string; // JSON string
  fetchedAt: number; // epoch ms
  ttlSeconds: number;
}

export interface CacheStats {
  totalEntries: number;
  hitRate: string;
  oldestEntry: number | null;
  totalSizeBytes: number;
}

/**
 * SQLite-backed persistent cache with per-entry TTL.
 * Zero-config: creates the DB file automatically in the cache/ directory.
 */
export class Cache {
  private db: Database.Database;
  private hits = 0;
  private misses = 0;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? path.join(process.cwd(), "cache", "mlb-data.db");
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

    this.db = new Database(resolvedPath);
    this.db.pragma("journal_mode = WAL"); // better concurrent read performance
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache_entries (
        url TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        fetched_at INTEGER NOT NULL,
        ttl_seconds INTEGER NOT NULL
      )
    `);
  }

  get(url: string): unknown | null {
    const row = this.db
      .prepare("SELECT data, fetched_at, ttl_seconds FROM cache_entries WHERE url = ?")
      .get(url) as { data: string; fetched_at: number; ttl_seconds: number } | undefined;

    if (!row) {
      this.misses++;
      return null;
    }

    const age = (Date.now() - row.fetched_at) / 1000;
    if (age > row.ttl_seconds) {
      this.db.prepare("DELETE FROM cache_entries WHERE url = ?").run(url);
      this.misses++;
      return null;
    }

    this.hits++;
    return JSON.parse(row.data);
  }

  set(url: string, data: unknown, ttlSeconds: number): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO cache_entries (url, data, fetched_at, ttl_seconds) VALUES (?, ?, ?, ?)"
      )
      .run(url, JSON.stringify(data), Date.now(), ttlSeconds);
  }

  invalidate(pattern: string): number {
    const result = this.db
      .prepare("DELETE FROM cache_entries WHERE url LIKE ?")
      .run(`%${pattern}%`);
    return result.changes;
  }

  clear(): number {
    const result = this.db.prepare("DELETE FROM cache_entries").run();
    this.hits = 0;
    this.misses = 0;
    return result.changes;
  }

  stats(): CacheStats {
    const countRow = this.db.prepare("SELECT COUNT(*) as count FROM cache_entries").get() as {
      count: number;
    };
    const oldestRow = this.db
      .prepare("SELECT MIN(fetched_at) as oldest FROM cache_entries")
      .get() as { oldest: number | null };
    const sizeRow = this.db
      .prepare("SELECT SUM(LENGTH(data)) as size FROM cache_entries")
      .get() as { size: number | null };

    const total = this.hits + this.misses;
    return {
      totalEntries: countRow.count,
      hitRate: total > 0 ? `${((this.hits / total) * 100).toFixed(1)}%` : "N/A",
      oldestEntry: oldestRow.oldest,
      totalSizeBytes: sizeRow.size ?? 0,
    };
  }

  close(): void {
    this.db.close();
  }
}
