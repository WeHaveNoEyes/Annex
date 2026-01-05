-- AlterEnum
ALTER TYPE "ProcessingStatus" ADD VALUE 'DISCOVERED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RequestStatus" ADD VALUE 'FOUND';
ALTER TYPE "RequestStatus" ADD VALUE 'DISCOVERED';
ALTER TYPE "RequestStatus" ADD VALUE 'DOWNLOADED';
ALTER TYPE "RequestStatus" ADD VALUE 'ENCODED';

-- AlterTable
ALTER TABLE "ProcessingItem" ADD COLUMN     "allSearchResults" JSONB,
ADD COLUMN     "cooldownEndsAt" TIMESTAMP(3),
ADD COLUMN     "discoveredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "discoveryCooldownMinutes" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);
