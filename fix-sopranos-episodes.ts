#!/usr/bin/env bun
/**
 * Recovery script for Sopranos S06 episodes stuck in ENCODED status
 * These episodes were encoded successfully but the ProcessingItems weren't linked to jobs
 */

import { prisma } from "./packages/server/src/db/client.js";

const BROKEN_ITEMS = [
  {
    itemId: "28fb8791-62d8-447a-b282-ccc302a4a87b",
    jobId: "cmjvck2my1r0kg3de4fhi786w",
    season: 6,
    episode: 10,
    title: "Moe n' Joe",
  },
  {
    itemId: "b652abab-8059-4ff8-9dab-3839d0da4a3a",
    jobId: "cmjvck2n51r0qg3depn6vs8wx",
    season: 6,
    episode: 11,
    title: "Cold Stones",
  },
  {
    itemId: "0650f01b-4102-4b91-944f-4d284182b135",
    jobId: "cmjvck2nc1r0wg3deqw2iuakw",
    season: 6,
    episode: 12,
    title: "Kaisha",
  },
];

async function recoverBrokenItems() {
  console.log("Starting recovery for broken Sopranos episodes...");

  for (const item of BROKEN_ITEMS) {
    console.log(`\nProcessing ${item.title} S${item.season}E${item.episode}...`);

    try {
      // Get the ProcessingItem
      const processingItem = await prisma.processingItem.findUnique({
        where: { id: item.itemId },
        include: { request: true },
      });

      if (!processingItem) {
        console.error(`  ❌ ProcessingItem ${item.itemId} not found`);
        continue;
      }

      // Get the completed encoder assignment
      const assignment = await prisma.encoderAssignment.findUnique({
        where: { jobId: item.jobId },
      });

      if (!assignment || assignment.status !== "COMPLETED") {
        console.error(`  ❌ Encoding job ${item.jobId} not completed`);
        continue;
      }

      console.log(`  ✓ Found completed encoding job: ${assignment.outputPath}`);

      // Get encoding config from pipeline execution
      const execution = await prisma.pipelineExecution.findFirst({
        where: { requestId: processingItem.requestId, parentExecutionId: null },
        orderBy: { startedAt: "desc" },
      });

      if (!execution) {
        console.error(`  ❌ Pipeline execution not found`);
        continue;
      }

      // Extract encoding config from pipeline steps
      type StepConfig = {
        type: string;
        config?: Record<string, unknown>;
        children?: StepConfig[];
      };

      const findEncodeConfig = (stepList: StepConfig[]): Record<string, unknown> | null => {
        for (const step of stepList) {
          if (step.type === "ENCODE" && step.config) {
            return step.config;
          }
          if (step.children) {
            const found = findEncodeConfig(step.children);
            if (found) return found;
          }
        }
        return null;
      };

      const steps = execution.steps as StepConfig[];
      const encodeConfig = findEncodeConfig(steps);

      if (!encodeConfig) {
        console.error(`  ❌ No ENCODE step config found`);
        continue;
      }

      // Extract target servers from request
      const targetServerIds = processingItem.request.targets
        ? (processingItem.request.targets as Array<{ serverId: string }>).map((t) => t.serverId)
        : [];

      // Map encoder codec to display name
      const codecMap: Record<string, string> = {
        av1_vaapi: "AV1",
        hevc_vaapi: "HEVC",
        h264_vaapi: "H264",
        libx265: "HEVC",
        libx264: "H264",
      };
      const codec =
        codecMap[encodeConfig.videoEncoder as string] || (encodeConfig.videoEncoder as string);

      // Build the stepContext
      const currentStepContext = (processingItem.stepContext as Record<string, unknown>) || {};
      const newStepContext = {
        ...currentStepContext,
        encode: {
          jobId: item.jobId,
          encodedFiles: [
            {
              profileId: "default",
              path: assignment.outputPath,
              resolution: encodeConfig.maxResolution as string,
              codec,
              targetServerIds,
              season: item.season,
              episode: item.episode,
              episodeTitle: item.title,
              size: assignment.outputSize ? Number(assignment.outputSize) : undefined,
              compressionRatio: assignment.compressionRatio || undefined,
            },
          ],
          encodedAt: assignment.completedAt?.toISOString() || new Date().toISOString(),
        },
      };

      // Update the ProcessingItem with encodingJobId and stepContext
      await prisma.processingItem.update({
        where: { id: item.itemId },
        data: {
          encodingJobId: item.jobId,
          stepContext: newStepContext as import("@prisma/client").Prisma.InputJsonValue,
          lastError: null,
          updatedAt: new Date(),
        },
      });

      console.log(`  ✓ Updated ProcessingItem with encoding metadata`);
      console.log(`    - encodingJobId: ${item.jobId}`);
      console.log(`    - outputPath: ${assignment.outputPath}`);
      console.log(`    - season: ${item.season}, episode: ${item.episode}`);
      console.log(`    - codec: ${codec}, resolution: ${encodeConfig.maxResolution}`);
    } catch (error) {
      console.error(`  ❌ Error processing ${item.title}:`, error);
    }
  }

  console.log("\n✅ Recovery complete!");
  console.log("These items should now be picked up by DeliverWorker");
}

// Run the recovery
recoverBrokenItems()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
