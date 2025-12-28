-- CreateEnum
CREATE TYPE "ProcessingType" AS ENUM ('MOVIE', 'EPISODE');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'SEARCHING', 'FOUND', 'DOWNLOADING', 'DOWNLOADED', 'ENCODING', 'ENCODED', 'DELIVERING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "RequestStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "RequestStatus" ADD VALUE 'PARTIAL';
ALTER TYPE "RequestStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "MediaRequest" ADD COLUMN "totalItems" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MediaRequest" ADD COLUMN "completedItems" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MediaRequest" ADD COLUMN "failedItems" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ProcessingItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" "ProcessingType" NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER,
    "season" INTEGER,
    "episode" INTEGER,
    "status" "ProcessingStatus" NOT NULL,
    "currentStep" TEXT,
    "stepContext" JSONB NOT NULL DEFAULT '{}',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "progress" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "downloadId" TEXT,
    "encodingJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcessingItem_requestId_idx" ON "ProcessingItem"("requestId");

-- CreateIndex
CREATE INDEX "ProcessingItem_status_idx" ON "ProcessingItem"("status");

-- CreateIndex
CREATE INDEX "ProcessingItem_status_nextRetryAt_idx" ON "ProcessingItem"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "ProcessingItem_requestId_status_idx" ON "ProcessingItem"("requestId", "status");

-- CreateIndex
CREATE INDEX "ProcessingItem_type_status_idx" ON "ProcessingItem"("type", "status");

-- AddForeignKey
ALTER TABLE "ProcessingItem" ADD CONSTRAINT "ProcessingItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MediaRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingItem" ADD CONSTRAINT "ProcessingItem_downloadId_fkey" FOREIGN KEY ("downloadId") REFERENCES "Download"("id") ON DELETE SET NULL ON UPDATE CASCADE;
