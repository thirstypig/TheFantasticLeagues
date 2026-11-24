-- Player-check access per franchise member (NONE / OWN_TEAM / ALL).
-- Guarded so a re-run can't fail the boot with 42710 and freeze deploys (P3009).
DO $$ BEGIN
  CREATE TYPE "ArchiveAuditAccess" AS ENUM ('NONE', 'OWN_TEAM', 'ALL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "FranchiseMembership" ADD COLUMN IF NOT EXISTS "archiveAudit" "ArchiveAuditAccess" NOT NULL DEFAULT 'NONE';
