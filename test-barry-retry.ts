#!/usr/bin/env bun

import { prisma } from "./packages/server/src/db/client.ts";

async function main() {
  const barry = await prisma.mediaRequest.findFirst({
    where: { title: "Barry" },
  });

  if (!barry) {
    console.log("Barry request not found");
    process.exit(1);
  }

  console.log(`Barry request: ${barry.id}`);
  console.log(`Current status: ${barry.status}`);
  console.log(`Current error: ${barry.error}`);

  // Call the retry endpoint via fetch
  const response = await fetch("http://localhost:3000/trpc/requests.retry", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      json: {
        id: barry.id,
      },
    }),
  });

  if (!response.ok) {
    console.error("Retry failed:", await response.text());
    process.exit(1);
  }

  console.log("Retry triggered successfully!");

  // Wait a bit and check the result
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const updated = await prisma.mediaRequest.findUnique({
    where: { id: barry.id },
  });

  console.log("\nAfter retry:");
  console.log(`Status: ${updated?.status}`);
  console.log(`Error: ${updated?.error}`);
  console.log(`Current step: ${updated?.currentStep}`);

  // Check pipeline
  const pipeline = await prisma.pipelineExecution.findFirst({
    where: { requestId: barry.id, parentExecutionId: null },
    orderBy: { startedAt: "desc" },
  });

  console.log(`\nLatest pipeline template: ${pipeline?.templateId}`);
  console.log(`Pipeline status: ${pipeline?.status}`);

  await prisma.$disconnect();
}

main().catch(console.error);
