import type { ProcessingItem } from "@prisma/client";
import { BaseWorker } from "./BaseWorker.js";

/**
 * DiscoveredWorker - Monitors items in DISCOVERED status and auto-transitions to DOWNLOADING
 * when cooldown period expires
 */
export class DiscoveredWorker extends BaseWorker {
  readonly processingStatus = "DISCOVERED" as const;
  readonly nextStatus = "DOWNLOADING" as const;
  readonly name = "DiscoveredWorker";

  protected async processItem(item: ProcessingItem): Promise<void> {
    console.log(`[${this.name}] Checking cooldown for ${item.type} ${item.title}`);

    // Skip if not in DISCOVERED status
    if (item.status !== "DISCOVERED") {
      console.log(`[${this.name}] Skipping ${item.title}: already in ${item.status} status`);
      return;
    }

    // Check if cooldown has expired
    const now = new Date();
    if (!item.cooldownEndsAt || item.cooldownEndsAt > now) {
      const remainingSeconds = item.cooldownEndsAt
        ? Math.ceil((item.cooldownEndsAt.getTime() - now.getTime()) / 1000)
        : 0;
      console.log(
        `[${this.name}] Cooldown not expired for ${item.title}: ${remainingSeconds}s remaining`
      );
      return;
    }

    console.log(`[${this.name}] Cooldown expired for ${item.title}, transitioning to DOWNLOADING`);

    // Get the selected release from stepContext
    const stepContext = item.stepContext as Record<string, unknown>;
    const selectedRelease = stepContext?.selectedRelease as Record<string, unknown> | undefined;
    const selectedPacks = stepContext?.selectedPacks as Array<Record<string, unknown>> | undefined;

    if (!selectedRelease && !selectedPacks) {
      throw new Error("No release selected in DISCOVERED state");
    }

    // Import downloadManager to create Download record
    const { downloadManager } = await import("../../downloadManager.js");
    const { pipelineOrchestrator } = await import("../PipelineOrchestrator.js");

    // Get request details
    const request = await this.getRequest(item.requestId);
    if (!request) {
      throw new Error(`Request ${item.requestId} not found`);
    }

    // Create Download record
    let download: Awaited<ReturnType<typeof downloadManager.createDownload>> | null = null;

    if (selectedPacks && selectedPacks.length > 0) {
      // Season pack(s) selected
      // For now, handle first pack (TODO: handle multiple season packs)
      download = await downloadManager.createDownload({
        requestId: item.requestId,
        mediaType: request.type as "MOVIE" | "TV",
        release: selectedPacks[0] as never,
        isSeasonPack: true,
        season: item.season ?? undefined,
      });
    } else if (selectedRelease) {
      // Single release selected (movie or episode)
      download = await downloadManager.createDownload({
        requestId: item.requestId,
        mediaType: request.type as "MOVIE" | "TV",
        release: selectedRelease as never,
        isSeasonPack: false,
        season: item.season ?? undefined,
      });
    } else {
      throw new Error("No release data available");
    }

    if (!download) {
      throw new Error("Failed to create download");
    }

    // Transition to DOWNLOADING with downloadId
    await pipelineOrchestrator.transitionStatus(item.id, "DOWNLOADING", {
      currentStep: "download",
      downloadId: download.id,
    });

    console.log(`[${this.name}] Successfully transitioned ${item.title} to DOWNLOADING`);
  }
}

export const discoveredWorker = new DiscoveredWorker();
