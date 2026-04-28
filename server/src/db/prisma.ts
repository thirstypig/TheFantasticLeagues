// server/src/db/prisma.ts
import { PrismaClient, Prisma } from "@prisma/client";
import { logger } from "../lib/logger.js";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Read-only Prisma operations — safe to retry on transient connection
// failures because they have no side effects. Write operations are
// deliberately NOT in this set: a 1xx-style "request sent, response lost"
// would re-execute the write and double-apply (extra rows, duplicate
// charges, etc.). Better to surface the error to the route handler and
// let it decide.
//
// Source of operation names: Prisma docs — https://www.prisma.io/docs/concepts/components/prisma-client/middleware
const RETRYABLE_OPERATIONS = new Set<string>([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "queryRaw",
  // queryRawUnsafe intentionally omitted — caller's domain to decide.
]);

// Prisma error codes that indicate transient infrastructure failure
// (Supabase pooler drop, DNS blip, brief network partition). Same-tier
// retry is appropriate; persistent failure will exhaust retries and
// surface the original error.
const TRANSIENT_ERROR_CODES = new Set<string>([
  "P1001", // Can't reach database server
  "P1002", // Database server timed out
  "P1008", // Operation timed out
  "P1017", // Server has closed the connection
]);

const RETRY_DELAYS_MS = [100, 300, 800]; // 3 attempts after the original

function isTransientPrismaError(err: unknown): boolean {
  // Initialization errors carry an `errorCode` rather than a `code`.
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return TRANSIENT_ERROR_CODES.has(err.errorCode ?? "");
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return TRANSIENT_ERROR_CODES.has(err.code);
  }
  // Plain Error with the Supabase pooler hostname — newer Prisma
  // versions sometimes throw here without a parseable error code.
  if (err instanceof Error && /Can't reach database server|pooler\.supabase\.com/.test(err.message)) {
    return true;
  }
  return false;
}

function buildClient(): PrismaClient {
  const base = new PrismaClient();

  // Cast through `unknown` to satisfy strict typing — `$extends` returns a
  // Proxy whose type is structurally identical to PrismaClient for our use
  // but TypeScript can't prove it without a phantom-type dance we don't need.
  return base.$extends({
    name: "transient-retry",
    query: {
      $allOperations: async ({ operation, model, args, query }) => {
        if (!RETRYABLE_OPERATIONS.has(operation)) {
          // Fast path for writes: no retry, no overhead.
          return query(args);
        }

        let attempt = 0;
        // Original attempt + RETRY_DELAYS_MS.length retries.
        while (true) {
          try {
            return await query(args);
          } catch (err) {
            const isTransient = isTransientPrismaError(err);
            const hasRetriesLeft = attempt < RETRY_DELAYS_MS.length;
            if (!isTransient || !hasRetriesLeft) {
              throw err;
            }
            const delay = RETRY_DELAYS_MS[attempt];
            logger.warn(
              {
                operation,
                model,
                attempt: attempt + 1,
                maxAttempts: RETRY_DELAYS_MS.length,
                delayMs: delay,
                errCode: (err as any)?.code ?? (err as any)?.errorCode ?? "(none)",
              },
              "Prisma transient error — retrying",
            );
            await new Promise(resolve => setTimeout(resolve, delay));
            attempt++;
          }
        }
      },
    },
  }) as unknown as PrismaClient;
}

// Prevent exhausting DB connections in dev with hot reload.
export const prisma: PrismaClient = global.__prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
