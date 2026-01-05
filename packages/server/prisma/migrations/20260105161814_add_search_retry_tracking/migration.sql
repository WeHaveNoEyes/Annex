-- AlterTable
ALTER TABLE "ProcessingItem" ADD COLUMN     "lastSearchedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "searchRetryIntervalHours" INTEGER NOT NULL DEFAULT 6;
