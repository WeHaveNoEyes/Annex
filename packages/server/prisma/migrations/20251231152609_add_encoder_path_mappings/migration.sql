-- Add path mapping configuration to RemoteEncoder
ALTER TABLE "RemoteEncoder" ADD COLUMN IF NOT EXISTS "pathMappings" JSONB;
ALTER TABLE "RemoteEncoder" ADD COLUMN IF NOT EXISTS "remappingEnabled" BOOLEAN NOT NULL DEFAULT true;
