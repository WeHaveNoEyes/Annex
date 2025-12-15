-- Drop indexes first
DROP INDEX IF EXISTS "MediaRatings_aggregateScore_idx";
DROP INDEX IF EXISTS "MediaRatings_isTrusted_aggregateScore_idx";
DROP INDEX IF EXISTS "MediaRatings_sourceCount_idx";

-- Remove aggregate-related columns from MediaRatings
ALTER TABLE "MediaRatings" DROP COLUMN IF EXISTS "aggregateScore";
ALTER TABLE "MediaRatings" DROP COLUMN IF EXISTS "sourceCount";
ALTER TABLE "MediaRatings" DROP COLUMN IF EXISTS "confidenceScore";
ALTER TABLE "MediaRatings" DROP COLUMN IF EXISTS "isTrusted";
ALTER TABLE "MediaRatings" DROP COLUMN IF EXISTS "aggregatedAt";
