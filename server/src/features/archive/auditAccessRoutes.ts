/**
 * Who may help on the archive player check (see auditAccess.ts for the rules).
 *
 *   GET /api/archive/audit-access/me             may the viewer help? (any member: drives the archive page's link)
 *   GET /api/archive/audit-access                every franchise member and his access (site admin)
 *   PUT /api/archive/audit-access/:membershipId  set one member's access (site admin)
 *
 * Mounted inside the archive router, after its members-only guard.
 */
import express from "express";
import { prisma } from "../../db/prisma.js";
import { requireAdmin } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { validateBody } from "../../middleware/validate.js";
import { writeAuditLog } from "../../lib/auditLog.js";
import {
  AuditAccessUpdateBodySchema,
  type AuditAccessListResponse, type AuditAccessMeResponse, type AuditAccessMember, type AuditAccessUpdateBody,
} from "../../../../shared/api/archivePlayerCheck.js";
import { resolveAuditAccess } from "./auditAccess.js";

const router = express.Router();

/** Franchises that have an archive: the only ones whose members can be given access. */
const hasArchive = { leagues: { some: { historicalSeasons: { some: {} } } } };

router.get("/archive/audit-access/me", asyncHandler(async (req, res) => {
  const access = await resolveAuditAccess(req.user!);
  const body: AuditAccessMeResponse = { level: access?.level ?? null, teamCodes: access?.teamCodes ?? null };
  res.json(body);
}));

router.get("/archive/audit-access", requireAdmin, asyncHandler(async (_req, res) => {
  const memberships = await prisma.franchiseMembership.findMany({
    // Site admins always have full access, so they aren't listed.
    where: { franchise: hasArchive, user: { isAdmin: false } },
    select: {
      id: true, franchiseId: true, role: true, archiveAudit: true,
      user: {
        select: {
          name: true, email: true,
          teamOwnerships: { select: { team: { select: { code: true, league: { select: { franchiseId: true } } } } } },
        },
      },
    },
  });
  const members: AuditAccessMember[] = memberships
    .map((m) => ({
      membershipId: m.id,
      name: m.user.name || m.user.email,
      role: m.role,
      teamCodes: [...new Set(
        m.user.teamOwnerships
          .filter((o) => o.team.league.franchiseId === m.franchiseId && o.team.code)
          .map((o) => o.team.code!),
      )].sort(),
      access: m.archiveAudit,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.membershipId - b.membershipId);
  const body: AuditAccessListResponse = { members };
  res.json(body);
}));

router.put("/archive/audit-access/:membershipId", requireAdmin, validateBody(AuditAccessUpdateBodySchema), asyncHandler(async (req, res) => {
  const id = Number(req.params.membershipId);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: "No such member." });
  const { access } = req.body as AuditAccessUpdateBody;
  const membership = await prisma.franchiseMembership.findFirst({
    where: { id, franchise: hasArchive },
    select: { id: true, archiveAudit: true, userId: true },
  });
  if (!membership) return res.status(404).json({ error: "No such member." });

  await prisma.franchiseMembership.update({ where: { id }, data: { archiveAudit: access } });
  writeAuditLog({
    userId: req.user!.id,
    action: "ARCHIVE_AUDIT_ACCESS",
    resourceType: "FranchiseMembership",
    resourceId: id,
    metadata: { memberUserId: membership.userId, previous: membership.archiveAudit, access },
  });
  return res.json({ membershipId: id, access });
}));

export const auditAccessRouter = router;
