-- Soft-delete / Trash (30-day retention) for users and projects
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
CREATE INDEX IF NOT EXISTS "User_deletedAt_idx" ON "User"("deletedAt");

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
CREATE INDEX IF NOT EXISTS "Project_companyId_deletedAt_idx" ON "Project"("companyId", "deletedAt");
CREATE INDEX IF NOT EXISTS "Project_deletedAt_idx" ON "Project"("deletedAt");
