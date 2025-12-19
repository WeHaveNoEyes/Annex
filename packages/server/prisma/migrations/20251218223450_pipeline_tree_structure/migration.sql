/*
  Warnings:

  - You are about to drop the `PipelineStep` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `steps` to the `PipelineTemplate` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "PipelineStep" DROP CONSTRAINT "PipelineStep_templateId_fkey";

-- AlterTable
ALTER TABLE "PipelineTemplate" ADD COLUMN     "steps" JSONB NOT NULL;

-- DropTable
DROP TABLE "PipelineStep";
