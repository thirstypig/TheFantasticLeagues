import { prisma } from "../db/prisma.js";
import { logger } from "./logger.js";

export interface AuditLogParams {
  userId: number;
  action: string;
  resourceType: string;
  resourceId?: string | number;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget audit log writer.
 * Never throws — audit failure must not break the primary operation.
 *
 * For state-changing endpoints where forensic certainty matters, prefer
 * `writeAuditLogAwait` so the caller can decide how to handle a failed
 * audit write (log, push to errorBuffer, etc.). See todo #165.
 */
export function writeAuditLog(params: AuditLogParams): void {
  prisma.auditLog
    .create({
      data: {
        userId: params.userId,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId != null ? String(params.resourceId) : null,
        metadata: params.metadata ? (params.metadata as any) : undefined,
      },
    })
    .catch((err) => {
      logger.error({ error: String(err), audit: params }, "Failed to write audit log");
    });
}

/**
 * Awaitable audit log writer — returns the underlying promise so callers
 * can `await` it and observe failures. The caller is responsible for
 * try/catch handling; on failure the underlying mutation has already
 * committed in the typical wire-list usage, so we want the response to
 * still succeed but the failure to be logged (and optionally pushed to
 * the admin errorBuffer for high-stakes endpoints like /finalize).
 *
 * Per todo #165: state-changing wire-list endpoints (lock, finalize,
 * succeed, fail, skip, revert) MUST await audit-log writes. Without
 * await, a transient logger failure produces a 200 response with no
 * record of who did what — defeats the whole point of the audit trail.
 */
export async function writeAuditLogAwait(params: AuditLogParams): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId != null ? String(params.resourceId) : null,
      metadata: params.metadata ? (params.metadata as any) : undefined,
    },
  });
}
