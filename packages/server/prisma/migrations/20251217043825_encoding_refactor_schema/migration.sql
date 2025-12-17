-- Encoding System Refactor: Add ASSIGNED status, new tracking fields, remove legacy EncodingJob

-- AlterEnum: Add ASSIGNED status to AssignmentStatus
ALTER TYPE "AssignmentStatus" ADD VALUE 'ASSIGNED';

-- DropForeignKey: Remove EncodingJob foreign keys before dropping
ALTER TABLE "EncodingJob" DROP CONSTRAINT "EncodingJob_profileId_fkey";
ALTER TABLE "EncodingJob" DROP CONSTRAINT "EncodingJob_requestId_fkey";

-- AlterTable: Add new tracking fields to EncoderAssignment
ALTER TABLE "EncoderAssignment" ADD COLUMN "lastProgressAt" TIMESTAMP(3);
ALTER TABLE "EncoderAssignment" ADD COLUMN "sentAt" TIMESTAMP(3);

-- AlterTable: Add blockedUntil to RemoteEncoder for capacity error handling
ALTER TABLE "RemoteEncoder" ADD COLUMN "blockedUntil" TIMESTAMP(3);

-- DropTable: Remove legacy EncodingJob model (unused)
DROP TABLE "EncodingJob";

-- DropEnum: Remove unused EncodingStatus enum
DROP TYPE "EncodingStatus";
