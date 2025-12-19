-- Remove encoding profiles system

-- Drop foreign key from StorageServer
ALTER TABLE "StorageServer" DROP COLUMN IF EXISTS "encodingProfileId";

-- Drop EncodingProfile table
DROP TABLE IF EXISTS "EncodingProfile";

-- Drop related enums
DROP TYPE IF EXISTS "HwAccel";
DROP TYPE IF EXISTS "SubtitlesMode";
DROP TYPE IF EXISTS "Container";
