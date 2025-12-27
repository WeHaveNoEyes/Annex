#!/usr/bin/env bun

import { prisma } from "./packages/server/src/db/client.ts";
import { getPipelineExecutor } from "./packages/server/src/services/pipeline/PipelineExecutor.ts";
import { registerPipelineSteps } from "./packages/server/src/services/pipeline/registerSteps.ts";

async function main() {
  registerPipelineSteps();

  const pipelineId = "cmjnz2135005qg3ryg6wc1upr";

  console.log(`Resuming pipeline ${pipelineId}...`);

  const executor = getPipelineExecutor();

  try {
    await executor.resumeTreeExecution(pipelineId);
    console.log("Resume completed successfully");

    // Check final status
    const pipeline = await prisma.pipelineExecution.findUnique({
      where: { id: pipelineId },
      select: { status: true, currentStep: true },
    });

    console.log(`Pipeline status: ${pipeline?.status}, step: ${pipeline?.currentStep}`);
  } catch (error) {
    console.error("Resume failed:", error);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
