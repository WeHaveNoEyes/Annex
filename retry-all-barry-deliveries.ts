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

  // Find all DOWNLOADED episodes
  const episodes = await prisma.tvEpisode.findMany({
    where: {
      requestId: barryRequest.id,
      status: "DOWNLOADED",
      encodedAt: { not: null },
    },
    orderBy: [{ season: "asc" }, { episode: "asc" }],
  });

  console.log(`Found ${episodes.length} DOWNLOADED episodes to retry delivery`);

  if (episodes.length === 0) {
    console.log("No episodes need delivery retry");
    await prisma.$disconnect();
    process.exit(0);
  }

  // Get target servers
  const servers = await prisma.storageServer.findMany({
    where: { enabled: true },
    select: { id: true, name: true },
  });

  console.log(`Target servers: ${servers.map((s) => s.name).join(", ")}\n`);

  const executor = getPipelineExecutor();
  let completed = 0;
  let failed = 0;

  for (const episode of episodes) {
    const epNum = `S${String(episode.season).padStart(2, "0")}E${String(episode.episode).padStart(2, "0")}`;
    console.log(`[${completed + failed + 1}/${episodes.length}] Retrying delivery for ${epNum}...`);

    try {
      // Create context
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
              path: episode.sourceFilePath,
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

      // Create pipeline
      const pipeline = await prisma.pipelineExecution.create({
        data: {
          requestId: barryRequest.id,
          templateId: "episode-branch-pipeline",
          status: "RUNNING",
          context: context as any,
          currentStep: 2,
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

      // Trigger resume in background (don't wait for completion)
      executor.resumeTreeExecution(pipeline.id).catch((error) => {
        console.error(`  ${epNum}: Pipeline error:`, error.message);
      });

      // Small delay to avoid overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 1000));

      completed++;
    } catch (error) {
      console.error(
        `  ${epNum}: Failed to create pipeline:`,
        error instanceof Error ? error.message : error
      );
      failed++;
    }
  }

  console.log(`\nTriggered delivery retry for ${completed} episodes`);
  if (failed > 0) {
    console.log(`Failed to create pipelines for ${failed} episodes`);
  }

  console.log("\nDeliveries are running in the background. Check episode status with:");
  console.log(
    'PGPASSWORD=postgres psql -h localhost -U postgres -d annex -c "SELECT season, episode, status FROM \\"TvEpisode\\" WHERE \\"requestId\\" = (SELECT id FROM \\"MediaRequest\\" WHERE title = \'Barry\') ORDER BY season, episode;"'
  );

  await prisma.$disconnect();
}

main().catch(console.error);
