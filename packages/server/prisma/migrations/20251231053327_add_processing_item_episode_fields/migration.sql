-- Add episode-specific tracking fields to ProcessingItem
ALTER TABLE "ProcessingItem" ADD COLUMN IF NOT EXISTS "sourceFilePath" TEXT;
ALTER TABLE "ProcessingItem" ADD COLUMN IF NOT EXISTS "airDate" TIMESTAMP(3);
ALTER TABLE "ProcessingItem" ADD COLUMN IF NOT EXISTS "downloadedAt" TIMESTAMP(3);
ALTER TABLE "ProcessingItem" ADD COLUMN IF NOT EXISTS "encodedAt" TIMESTAMP(3);
ALTER TABLE "ProcessingItem" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "ProcessingItem" ADD COLUMN IF NOT EXISTS "qualityMet" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProcessingItem" ADD COLUMN IF NOT EXISTS "availableReleases" JSONB;

-- Add parentExecutionId to PipelineExecution for tree structure
ALTER TABLE "PipelineExecution" ADD COLUMN IF NOT EXISTS "parentExecutionId" TEXT;
CREATE INDEX IF NOT EXISTS "PipelineExecution_parentExecutionId_idx" ON "PipelineExecution"("parentExecutionId");
DO $$ BEGIN
  ALTER TABLE "PipelineExecution" ADD CONSTRAINT "PipelineExecution_parentExecutionId_fkey" FOREIGN KEY ("parentExecutionId") REFERENCES "PipelineExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Remove unique constraint on requestId
ALTER TABLE "PipelineExecution" DROP CONSTRAINT IF EXISTS "PipelineExecution_requestId_key";
