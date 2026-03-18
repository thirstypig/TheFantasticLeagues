import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Cache } from "../src/cache.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Cache", () => {
  let cache: Cache;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `mlb-cache-test-${Date.now()}.db`);
    cache = new Cache(dbPath);
  });

  afterEach(() => {
    cache.close();
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.unlinkSync(dbPath + "-journal"); } catch {}
    try { fs.unlinkSync(dbPath + "-wal"); } catch {}
    try { fs.unlinkSync(dbPath + "-shm"); } catch {}
  });

  it("returns null for cache miss", () => {
    expect(cache.get("https://example.com/miss")).toBeNull();
  });

  it("stores and retrieves data", () => {
    const data = { teams: [{ id: 1, name: "Yankees" }] };
    cache.set("https://example.com/teams", data, 3600);
    expect(cache.get("https://example.com/teams")).toEqual(data);
  });

  it("returns null for expired entries", async () => {
    cache.set("https://example.com/expired", { x: 1 }, 1); // 1 second TTL
    // Entry should be available immediately
    expect(cache.get("https://example.com/expired")).toEqual({ x: 1 });
    // Wait for expiration
    await new Promise((r) => setTimeout(r, 1100));
    expect(cache.get("https://example.com/expired")).toBeNull();
  });

  it("replaces existing entries", () => {
    cache.set("https://example.com/replace", { v: 1 }, 3600);
    cache.set("https://example.com/replace", { v: 2 }, 3600);
    expect(cache.get("https://example.com/replace")).toEqual({ v: 2 });
  });

  it("invalidates entries by pattern", () => {
    cache.set("https://api.com/teams/1", { id: 1 }, 3600);
    cache.set("https://api.com/teams/2", { id: 2 }, 3600);
    cache.set("https://api.com/players/1", { id: 1 }, 3600);

    const deleted = cache.invalidate("teams");
    expect(deleted).toBe(2);
    expect(cache.get("https://api.com/teams/1")).toBeNull();
    expect(cache.get("https://api.com/players/1")).toEqual({ id: 1 });
  });

  it("clears all entries", () => {
    cache.set("https://a.com/1", { a: 1 }, 3600);
    cache.set("https://b.com/2", { b: 2 }, 3600);

    const deleted = cache.clear();
    expect(deleted).toBe(2);
    expect(cache.get("https://a.com/1")).toBeNull();
    expect(cache.get("https://b.com/2")).toBeNull();
  });

  it("returns correct stats", () => {
    cache.set("https://example.com/a", { data: "x".repeat(100) }, 3600);
    cache.set("https://example.com/b", { data: "y".repeat(200) }, 3600);

    // Generate some hits/misses
    cache.get("https://example.com/a"); // hit
    cache.get("https://example.com/a"); // hit
    cache.get("https://example.com/miss"); // miss

    const stats = cache.stats();
    expect(stats.totalEntries).toBe(2);
    expect(stats.hitRate).toBe("66.7%");
    expect(stats.oldestEntry).toBeTypeOf("number");
    expect(stats.totalSizeBytes).toBeGreaterThan(0);
  });

  it("tracks hit rate as N/A when no requests", () => {
    const stats = cache.stats();
    expect(stats.hitRate).toBe("N/A");
  });
});
