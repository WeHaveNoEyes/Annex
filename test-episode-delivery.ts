#!/usr/bin/env bun

import { prisma } from "./packages/server/src/db/client.ts";
import { getPipelineExecutor } from "./packages/server/src/services/pipeline/PipelineExecutor.ts";
import { registerPipelineSteps } from "./packages/server/src/services/pipeline/registerSteps.ts";

async function main() {
  registerPipelineSteps();

  // Find Barry request
  const barryRequest = await prisma.mediaRequest.findFirst({
    where: { title: "Barry" },
    select: { id: true, title: true, tmdbId: true, year: true },
  });

  if (!barryRequest) {
    console.log("Barry request not found");
    process.exit(1);
  }

  // Find one DOWNLOADED episode to test
  const episode = await prisma.tvEpisode.findFirst({
    where: {
      requestId: barryRequest.id,
      status: "DOWNLOADED",
      encodedAt: { not: null },
    },
    orderBy: { season: "asc" },
  });

  if (!episode) {
    console.log("No DOWNLOADED episodes found for testing");
    process.exit(1);
  }

  const epNum = `S${String(episode.season).padStart(2, "0")}E${String(episode.episode).padStart(2, "0")}`;
  console.log(`Testing delivery for ${barryRequest.title} ${epNum}`);
  console.log(`Episode ID: ${episode.id}`);
  console.log(`Source file: ${episode.sourceFilePath}`);

  // Get target servers from the Barry request
  const servers = await prisma.storageServer.findMany({
    where: { enabled: true },
    select: { id: true, name: true },
  });

  console.log(`Target servers: ${servers.map((s) => s.name).join(", ")}`);

  // Create branch pipeline context for this episode
  const context = {
    requestId: barryRequest.id,
    mediaType: "TV",
    tmdbId: barryRequest.tmdbId,
    title: barryRequest.title,
    year: barryRequest.year,
    episodeId: episode.id,
    season: episode.season,
    episode: episode.episode,
    targets: servers.map((s) => ({
      serverId: s.id,
      encodingProfileId: "default",
    })),
    download: {
      sourceFilePath: episode.sourceFilePath,
      skipDownload: true,
    },
    encode: {
      encodedFiles: [
        {
          profileId: "default",
          path: episode.sourceFilePath, // The source is already the encoded file for recovery
          targetServerIds: servers.map((s) => s.id),
          resolution: "2160p",
          codec: "AV1",
          season: episode.season,
          episode: episode.episode,
          episodeId: episode.id,
        },
      ],
    },
  };

  console.log("\nCreating episode branch pipeline...");

  // Create pipeline execution
  const pipelineExecution = await prisma.pipelineExecution.create({
    data: {
      requestId: barryRequest.id,
      templateId: "episode-branch-pipeline",
      status: "RUNNING",
      context: context as any,
      currentStep: 2, // Start at Deliver step (0=Download, 1=Encode, 2=Deliver)
      startedAt: new Date(),
      episodeId: episode.id,
      steps: [
        {
          name: "Download Episode",
          type: "DOWNLOAD",
          config: {},
          children: [
            {
              name: "Encode Episode",
              type: "ENCODE",
              config: { hwAccel: "VAAPI", videoEncoder: "av1_vaapi" },
              children: [
                {
                  name: "Deliver Episode",
                  type: "DELIVER",
                  config: {},
                  required: true,
                  retryable: true,
                  continueOnError: false,
                },
              ],
              required: true,
              retryable: true,
              continueOnError: false,
            },
          ],
          required: true,
          retryable: true,
          continueOnError: false,
        },
      ] as any,
    },
  });

  console.log(`Created pipeline: ${pipelineExecution.id}`);
  console.log("\nStarting pipeline execution...");

  const executor = getPipelineExecutor();
  try {
    await executor.resumeTreeExecution(pipelineExecution.id);
    console.log("\nPipeline execution completed successfully!");
  } catch (error) {
    console.error("\nPipeline execution failed:", error);
  }

  // Check final status
  const updatedEpisode = await prisma.tvEpisode.findUnique({
    where: { id: episode.id },
    select: { status: true, error: true, deliveredAt: true },
  });

  console.log("\nFinal episode status:");
  console.log(`  Status: ${updatedEpisode?.status}`);
  console.log(`  Error: ${updatedEpisode?.error || "None"}`);
  console.log(`  Delivered: ${updatedEpisode?.deliveredAt ? "Yes" : "No"}`);

  await prisma.$disconnect();
}

main().catch(console.error);
