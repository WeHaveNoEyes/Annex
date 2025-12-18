-- AlterTable
ALTER TABLE "Indexer" ADD COLUMN     "rateLimitEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rateLimitMax" INTEGER,
ADD COLUMN     "rateLimitWindowSecs" INTEGER;

-- CreateTable
CREATE TABLE "IndexerRateLimitRequest" (
    "id" TEXT NOT NULL,
    "indexerId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndexerRateLimitRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IndexerRateLimitRequest_indexerId_requestedAt_idx" ON "IndexerRateLimitRequest"("indexerId", "requestedAt");

-- CreateIndex
CREATE INDEX "IndexerRateLimitRequest_requestedAt_idx" ON "IndexerRateLimitRequest"("requestedAt");

-- AddForeignKey
ALTER TABLE "IndexerRateLimitRequest" ADD CONSTRAINT "IndexerRateLimitRequest_indexerId_fkey" FOREIGN KEY ("indexerId") REFERENCES "Indexer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
