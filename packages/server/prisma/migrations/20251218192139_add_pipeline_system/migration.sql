-- CreateEnum
CREATE TYPE "StepType" AS ENUM ('SEARCH', 'DOWNLOAD', 'ENCODE', 'DELIVER', 'APPROVAL', 'NOTIFICATION');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "NotificationProvider" AS ENUM ('DISCORD', 'WEBHOOK', 'EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED', 'TIMEOUT');

-- CreateTable
CREATE TABLE "PipelineTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mediaType" "MediaType" NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStep" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "StepType" NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "condition" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "retryable" BOOLEAN NOT NULL DEFAULT true,
    "timeout" INTEGER,
    "continueOnError" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PipelineStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineExecution" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL,
    "currentStep" INTEGER,
    "steps" JSONB NOT NULL,
    "context" JSONB NOT NULL,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PipelineExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepExecution" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "stepType" "StepType" NOT NULL,
    "status" "StepStatus" NOT NULL,
    "progress" DOUBLE PRECISION DEFAULT 0,
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "StepExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "provider" "NotificationProvider" NOT NULL,
    "config" JSONB NOT NULL,
    "events" TEXT[],
    "mediaType" "MediaType",
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalQueue" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "reason" TEXT,
    "context" JSONB NOT NULL,
    "status" "ApprovalStatus" NOT NULL,
    "requiredRole" TEXT NOT NULL,
    "timeoutHours" INTEGER,
    "autoAction" TEXT,
    "processedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelineTemplate_userId_idx" ON "PipelineTemplate"("userId");

-- CreateIndex
CREATE INDEX "PipelineTemplate_mediaType_isDefault_idx" ON "PipelineTemplate"("mediaType", "isDefault");

-- CreateIndex
CREATE INDEX "PipelineTemplate_isPublic_idx" ON "PipelineTemplate"("isPublic");

-- CreateIndex
CREATE INDEX "PipelineStep_templateId_idx" ON "PipelineStep"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStep_templateId_order_key" ON "PipelineStep"("templateId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineExecution_requestId_key" ON "PipelineExecution"("requestId");

-- CreateIndex
CREATE INDEX "PipelineExecution_requestId_idx" ON "PipelineExecution"("requestId");

-- CreateIndex
CREATE INDEX "PipelineExecution_status_idx" ON "PipelineExecution"("status");

-- CreateIndex
CREATE INDEX "PipelineExecution_templateId_idx" ON "PipelineExecution"("templateId");

-- CreateIndex
CREATE INDEX "StepExecution_executionId_idx" ON "StepExecution"("executionId");

-- CreateIndex
CREATE INDEX "StepExecution_status_idx" ON "StepExecution"("status");

-- CreateIndex
CREATE UNIQUE INDEX "StepExecution_executionId_stepOrder_key" ON "StepExecution"("executionId", "stepOrder");

-- CreateIndex
CREATE INDEX "NotificationConfig_userId_idx" ON "NotificationConfig"("userId");

-- CreateIndex
CREATE INDEX "NotificationConfig_enabled_idx" ON "NotificationConfig"("enabled");

-- CreateIndex
CREATE INDEX "ApprovalQueue_requestId_idx" ON "ApprovalQueue"("requestId");

-- CreateIndex
CREATE INDEX "ApprovalQueue_status_idx" ON "ApprovalQueue"("status");

-- AddForeignKey
ALTER TABLE "PipelineTemplate" ADD CONSTRAINT "PipelineTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStep" ADD CONSTRAINT "PipelineStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PipelineTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineExecution" ADD CONSTRAINT "PipelineExecution_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MediaRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineExecution" ADD CONSTRAINT "PipelineExecution_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PipelineTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepExecution" ADD CONSTRAINT "StepExecution_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "PipelineExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationConfig" ADD CONSTRAINT "NotificationConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalQueue" ADD CONSTRAINT "ApprovalQueue_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MediaRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
