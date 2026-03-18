import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

/**
 * Shared SQLite cache for MLB API data.
 * Uses the same DB file as the MCP server so both benefit from cached data.
 */

const CACHE_PATH =
  process.env.MLB_CACHE_PATH ??
  path.join(process.cwd(), "..", "mcp-servers", "mlb-data", "cache", "mlb-data.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  db = new Database(CACHE_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS cache_entries (
      url TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      ttl_seconds INTEGER NOT NULL
    )
  `);
  return db;
}

export function cacheGet(url: string): unknown | null {
  const row = getDb()
    .prepare("SELECT data, fetched_at, ttl_seconds FROM cache_entries WHERE url = ?")
    .get(url) as { data: string; fetched_at: number; ttl_seconds: number } | undefined;

  if (!row) return null;

  const age = (Date.now() - row.fetched_at) / 1000;
  if (age > row.ttl_seconds) {
    getDb().prepare("DELETE FROM cache_entries WHERE url = ?").run(url);
    return null;
  }

  return JSON.parse(row.data);
}

export function cacheSet(url: string, data: unknown, ttlSeconds: number): void {
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO cache_entries (url, data, fetched_at, ttl_seconds) VALUES (?, ?, ?, ?)"
    )
    .run(url, JSON.stringify(data), Date.now(), ttlSeconds);
}
