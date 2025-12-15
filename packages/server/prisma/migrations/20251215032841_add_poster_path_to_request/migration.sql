-- AlterTable
ALTER TABLE "MediaItem" ADD COLUMN     "traktUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MediaRequest" ADD COLUMN     "posterPath" TEXT;

-- CreateIndex
CREATE INDEX "MediaItem_traktUpdatedAt_idx" ON "MediaItem"("traktUpdatedAt");
