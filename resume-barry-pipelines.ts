#!/usr/bin/env bun

import { prisma } from "./packages/server/src/db/client.ts";
import { getPipelineExecutor } from "./packages/server/src/services/pipeline/PipelineExecutor.ts";
import { registerPipelineSteps } from "./packages/server/src/services/pipeline/registerSteps.ts";

async function main() {
  // Register pipeline steps
  registerPipelineSteps();

  // Find Barry request
  const barryRequest = await prisma.mediaRequest.findFirst({
    where: { title: "Barry" },
    select: { id: true },
  });

  if (!barryRequest) {
    console.log("Barry request not found");
    process.exit(1);
  }

  // Find all RUNNING branch pipelines for Barry
  const pipelines = await prisma.pipelineExecution.findMany({
    where: {
      requestId: barryRequest.id,
      templateId: "episode-branch-pipeline",
      status: "RUNNING",
    },
    select: {
      id: true,
      episodeId: true,
    },
  });

  console.log(`Found ${pipelines.length} RUNNING branch pipelines for Barry`);

  const executor = getPipelineExecutor();

  for (const pipeline of pipelines) {
    console.log(`Resuming pipeline ${pipeline.id} (episode ${pipeline.episodeId})`);
    // Don't await - just trigger resume and let it run in background
    executor.resumeTreeExecution(pipeline.id).catch((error) => {
      console.error(`  ✗ Failed to resume ${pipeline.id}:`, error);
    });
  }

  console.log(`Triggered resume for ${pipelines.length} pipelines`);

  await prisma.$disconnect();
  console.log("Done!");
}

main().catch(console.error);
