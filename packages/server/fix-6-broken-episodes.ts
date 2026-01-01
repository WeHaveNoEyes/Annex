import { prisma } from "./src/db/client.js";
import { pipelineOrchestrator } from "./src/services/pipeline/PipelineOrchestrator.js";

const brokenEpisodes = [
  {
    id: "6450e177-56eb-4366-b368-ac3aba5c4454",
    season: 2,
    episode: 4,
    brokenPath: "/media/downloads/completed/The.Sopranos.S01-S06.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP /The.Sopranos.S02.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP /The.Sopranos.S02E04.Commendatori.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP.mkv",
  },
  {
    id: "a8c323eb-1b4a-4b8d-897a-3922957d6889",
    season: 2,
    episode: 10,
    brokenPath: "/media/downloads/completed/The.Sopranos.S01-S06.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP /The.Sopranos.S02.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP /The.Sopranos.S02E10.Bust.Out.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP.mkv",
  },
  {
    id: "4add7d47-17f6-4bb4-8aea-8a9b0f813421",
    season: 3,
    episode: 3,
    brokenPath: "/media/downloads/completed/The.Sopranos.S01-S06.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP /The.Sopranos.S03.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP /The.Sopranos.S03E03.Fortunate.Son.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP.mkv",
  },
  {
    id: "2a60fd52-462f-4eae-8cdf-bdd51a34273e",
    season: 4,
    episode: 13,
    brokenPath: "/media/downloads/completed/The.Sopranos.S01-S06.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP /The.Sopranos.S04.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP /The.Sopranos.S04E13.Whitecaps.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP.mkv",
  },
  {
    id: "21c54327-60c2-4695-a518-4c8aa80421cd",
    season: 5,
    episode: 4,
    brokenPath: "/media/downloads/completed/The.Sopranos.S01-S06.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP /The.Sopranos.S05.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP /The.Sopranos.S05E04.All.Happy.Families.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP.mkv",
  },
  {
    id: "8414eb2a-0b29-4f95-8202-b218f8430283",
    season: 6,
    episode: 3,
    brokenPath: "/media/downloads/completed/The.Sopranos.S01-S06.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP /The.Sopranos.S06.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP /The.Sopranos.S06E03.Mayham.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP.mkv",
  },
];

async function fixBrokenEpisodes() {
  console.log("Fixing 6 broken Sopranos episodes...");

  for (const ep of brokenEpisodes) {
    const epNum = `S${String(ep.season).padStart(2, "0")}E${String(ep.episode).padStart(2, "0")}`;

    // Fix the path by replacing spaces between path components with slashes
    // Keep spaces within filenames intact
    const fixedPath = ep.brokenPath.replace(/ \//g, "/");

    console.log(`\n${epNum}: Fixing path`);
    console.log(`  Broken: ${ep.brokenPath}`);
    console.log(`  Fixed:  ${fixedPath}`);

    // Check if file exists
    try {
      const exists = await Bun.file(fixedPath).exists();
      if (!exists) {
        console.error(`  ERROR: File does not exist at fixed path!`);
        continue;
      }

      const stat = await Bun.file(fixedPath).stat();
      console.log(`  File exists: ${(stat.size / 1024 / 1024 / 1024).toFixed(2)} GB`);
    } catch (error) {
      console.error(`  ERROR checking file:`, error);
      continue;
    }

    // Get existing stepContext
    const item = await prisma.processingItem.findUnique({
      where: { id: ep.id },
      select: { stepContext: true },
    });

    const existingContext = (item?.stepContext as Record<string, unknown>) || {};

    // Build download context
    const downloadContext = {
      torrentHash: "unknown", // We don't have the original hash
      sourceFilePath: fixedPath,
      size: (await Bun.file(fixedPath).stat()).size,
    };

    // Merge with existing context
    const newStepContext = {
      ...existingContext,
      download: downloadContext,
    };

    // Update using orchestrator to populate stepContext.download and transition to DOWNLOADED
    console.log(`  Transitioning to DOWNLOADED with proper stepContext...`);
    await pipelineOrchestrator.transitionStatus(ep.id, "DOWNLOADED", {
      currentStep: "download",
      stepContext: newStepContext,
    });

    // Update sourceFilePath separately
    await prisma.processingItem.update({
      where: { id: ep.id },
      data: {
        sourceFilePath: fixedPath,
        downloadedAt: new Date(),
      },
    });

    console.log(`  ✓ Fixed ${epNum}`);
  }

  console.log("\n✓ All 6 episodes fixed and set to DOWNLOADED");
  console.log("EncodeWorker will pick them up and encode them.");
}

fixBrokenEpisodes()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
