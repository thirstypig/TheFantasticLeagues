import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  RETRYABLE_OPERATIONS,
  TRANSIENT_ERROR_CODES,
  isTransientPrismaError,
} from "../prisma.js";

// PR #136 added a Prisma client extension that retries reads on transient
// connection errors. The retry whitelist boundary is safety-critical: a
// write operation that gets retried after a "request sent, response lost"
// failure will double-apply (extra rows, duplicate transactions, etc.).
// These tests pin the boundary so a well-meaning future change can't
// silently move a write op into the retry list.

describe("Prisma retry — RETRYABLE_OPERATIONS whitelist", () => {
  // Hard-coded denylist of known write operations. If anyone ever adds
  // any of these to RETRYABLE_OPERATIONS, this test fails loudly.
  const WRITE_OPERATIONS = [
    "create",
    "createMany",
    "createManyAndReturn",
    "update",
    "updateMany",
    "updateManyAndReturn",
    "upsert",
    "delete",
    "deleteMany",
    "executeRaw",
    "executeRawUnsafe",
    "queryRawUnsafe", // user-supplied SQL — caller's domain to retry
  ];

  it.each(WRITE_OPERATIONS)(
    "does NOT include the write operation %s in the retry whitelist",
    (op) => {
      expect(RETRYABLE_OPERATIONS.has(op)).toBe(false);
    },
  );

  it("includes the canonical read operations Prisma supports", () => {
    // Spot-check the common reads. These MUST be in the set for the
    // retry to actually reduce the visible failure floor.
    const READS = [
      "findUnique",
      "findUniqueOrThrow",
      "findFirst",
      "findFirstOrThrow",
      "findMany",
      "count",
      "aggregate",
      "groupBy",
      "queryRaw",
    ];
    for (const op of READS) {
      expect(RETRYABLE_OPERATIONS.has(op)).toBe(true);
    }
  });

  it("does not include any operation that would compromise idempotency", () => {
    // Any retryable operation must be a pure read. The sentinel check:
    // every entry's name should start with "find" / "count" / "aggregate"
    // / "groupBy" / "queryRaw" — the readonly verb prefixes.
    const readPrefixes = ["find", "count", "aggregate", "groupBy", "queryRaw"];
    for (const op of RETRYABLE_OPERATIONS) {
      const matchesReadPrefix = readPrefixes.some(p => op.startsWith(p));
      expect(matchesReadPrefix).toBe(true);
    }
  });
});

describe("Prisma retry — TRANSIENT_ERROR_CODES whitelist", () => {
  it("includes the four documented Prisma connection-failure codes", () => {
    expect(TRANSIENT_ERROR_CODES.has("P1001")).toBe(true); // Can't reach DB
    expect(TRANSIENT_ERROR_CODES.has("P1002")).toBe(true); // DB timeout
    expect(TRANSIENT_ERROR_CODES.has("P1008")).toBe(true); // Op timeout
    expect(TRANSIENT_ERROR_CODES.has("P1017")).toBe(true); // Server closed
  });

  it("does NOT include logic-error codes that should propagate immediately", () => {
    // Logic / data errors must NOT retry — the retry would just delay
    // surfacing a real bug. Pin the boundary against the codes most
    // likely to be confused for transient issues.
    const LOGIC_ERRORS = [
      "P2002", // unique constraint violation
      "P2003", // foreign key constraint
      "P2025", // record not found
      "P2034", // transaction conflict (could deadlock-loop if retried)
      "P3000", // migration error
    ];
    for (const code of LOGIC_ERRORS) {
      expect(TRANSIENT_ERROR_CODES.has(code)).toBe(false);
    }
  });
});

describe("isTransientPrismaError", () => {
  // Concrete error inputs to pin the detection logic. The retry helper
  // calls this on every catch — false positives waste time, false
  // negatives surface the original 500 (worst case = same as no-retry).

  it("returns true for PrismaClientInitializationError with a transient code", () => {
    const err = new Prisma.PrismaClientInitializationError(
      "Can't reach database server at aws-1-us-west-1.pooler.supabase.com:5432",
      "6.19.3",
      "P1001",
    );
    expect(isTransientPrismaError(err)).toBe(true);
  });

  it("returns false for PrismaClientInitializationError with a non-transient code", () => {
    const err = new Prisma.PrismaClientInitializationError(
      "Schema validation failed",
      "6.19.3",
      "P1012", // schema error — not transient
    );
    expect(isTransientPrismaError(err)).toBe(false);
  });

  it("returns true for PrismaClientKnownRequestError with a transient code", () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      "Server has closed the connection.",
      { code: "P1017", clientVersion: "6.19.3" },
    );
    expect(isTransientPrismaError(err)).toBe(true);
  });

  it("returns false for PrismaClientKnownRequestError with a logic code (P2002 unique)", () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (`email`)",
      { code: "P2002", clientVersion: "6.19.3" },
    );
    expect(isTransientPrismaError(err)).toBe(false);
  });

  it("returns true for plain Error whose message names the Supabase pooler", () => {
    // Newer Prisma versions sometimes throw a plain Error without a
    // parseable code when the connection is dropped before the request
    // even starts. The string-match catch handles those.
    const err = new Error(
      "\nInvalid `prisma.period.findMany()` invocation\n" +
      "Can't reach database server at `aws-1-us-west-1.pooler.supabase.com:5432`\n",
    );
    expect(isTransientPrismaError(err)).toBe(true);
  });

  it("returns false for plain Error with an unrelated message", () => {
    const err = new Error("Validation failed: leagueId must be a number");
    expect(isTransientPrismaError(err)).toBe(false);
  });

  it("returns false for non-Error inputs (null, undefined, string, object)", () => {
    expect(isTransientPrismaError(null)).toBe(false);
    expect(isTransientPrismaError(undefined)).toBe(false);
    expect(isTransientPrismaError("Can't reach database server")).toBe(false);
    expect(isTransientPrismaError({ message: "Can't reach database server" })).toBe(false);
  });
});
