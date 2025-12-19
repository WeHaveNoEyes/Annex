-- Remove profileId from EncoderAssignment

ALTER TABLE "EncoderAssignment" DROP COLUMN IF EXISTS "profileId";
