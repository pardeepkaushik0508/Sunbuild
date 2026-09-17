-- AlterTable
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "heroImageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill from legacy single banner URL
UPDATE "Project"
SET "heroImageUrls" = ARRAY["heroImageUrl"]
WHERE "heroImageUrl" IS NOT NULL
  AND "heroImageUrl" <> ''
  AND (cardinality("heroImageUrls") = 0 OR "heroImageUrls" IS NULL);
