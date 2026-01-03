import type { ProcessingItem } from "@prisma/client";
import { prisma } from "../../../db/client.js";
import { BaseWorker } from "./BaseWorker";

/**
 * StuckItemRecoveryWorker - Automatically detects and recovers stuck processing items
 *
 * Recovers three types of stuck states:
 * 1. Episodes in FOUND status with no downloadId for >5 minutes
 * 2. Episodes at 100% progress in DOWNLOADING status for >5 minutes
 * 3. Seasons where some episodes have downloadId and others don't
 *
 * Runs every minute to eliminate need for manual SQL interventions
 */
export class StuckItemRecoveryWorker extends BaseWorker {
  readonly processingStatus = "PENDING" as const;
  readonly nextStatus = "PENDING" as const; // Not used - worker handles custom recovery
  readonly name = "StuckItemRecoveryWorker";

  constructor() {
    super();
    // Override default poll interval - recovery runs less frequently
    (this as { pollInterval: number }).pollInterval = 60000; // 1 minute
  }

  /**
   * Process batch - doesn't actually process items from database query
   * Instead runs custom recovery checks
   */
  async processBatch(): Promise<void> {
    await this.recoverFoundWithoutDownloadId();
    await this.recoverCompletedDownloads();
    await this.recoverMixedSeasonDownloads();
  }

  /**
   * Override processItem - not used by this worker
   */
  protected async processItem(_item: ProcessingItem): Promise<void> {
    // Not used - processBatch handles everything
  }

  /**
   * Fix episodes stuck in FOUND with no downloadId
   * These are episodes that found an existing season pack but failed to link
   */
  private async recoverFoundWithoutDownloadId(): Promise<void> {
    const stuckItems = await prisma.processingItem.findMany({
      where: {
        status: "FOUND",
        downloadId: null,
        updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) }, // Stuck for >5min
      },
    });

    if (stuckItems.length === 0) return;

    console.log(
      `[${this.name}] Found ${stuckItems.length} stuck FOUND items, resetting to PENDING`
    );

    await prisma.processingItem.updateMany({
      where: { id: { in: stuckItems.map((i: ProcessingItem) => i.id) } },
      data: { status: "PENDING", currentStep: null },
    });
  }

  /**
   * Fix downloads stuck at 100% in DOWNLOADING status
   * These episodes completed downloading but didn't transition forward
   */
  private async recoverCompletedDownloads(): Promise<void> {
    const completedItems = await prisma.processingItem.findMany({
      where: {
        status: "DOWNLOADING",
        progress: { gte: 100 },
        updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) }, // Stuck for >5min
      },
    });

    if (completedItems.length === 0) return;

    console.log(
      `[${this.name}] Found ${completedItems.length} completed downloads stuck in DOWNLOADING, resetting to PENDING`
    );

    // Reset to PENDING to let them re-process and transition properly
    await prisma.processingItem.updateMany({
      where: { id: { in: completedItems.map((i: ProcessingItem) => i.id) } },
      data: { status: "PENDING", currentStep: null },
    });
  }

  /**
   * Fix seasons where some episodes have downloadId and others don't
   * This happens when race conditions cause incomplete linking
   */
  private async recoverMixedSeasonDownloads(): Promise<void> {
    const mixedSeasons = await prisma.$queryRaw<
      Array<{
        requestId: string;
        season: number;
        total: bigint;
        linked: bigint;
        download_id: string;
      }>
    >`
      SELECT "requestId", season,
             COUNT(*) as total,
             COUNT("downloadId") as linked,
             MAX("downloadId") as download_id
      FROM "ProcessingItem"
      WHERE type = 'EPISODE'
        AND season IS NOT NULL
        AND status IN ('FOUND', 'DOWNLOADING', 'SEARCHING')
      GROUP BY "requestId", season
      HAVING COUNT(*) != COUNT("downloadId")
         AND COUNT("downloadId") > 0
    `;

    for (const season of mixedSeasons) {
      const total = Number(season.total);
      const linked = Number(season.linked);

      console.log(
        `[${this.name}] Fixing mixed season: ${linked}/${total} episodes linked in request ${season.requestId} season ${season.season}`
      );

      // Link unlinked episodes to the download that others have
      await prisma.processingItem.updateMany({
        where: {
          requestId: season.requestId,
          season: season.season,
          downloadId: null,
          status: { in: ["FOUND", "SEARCHING"] },
        },
        data: {
          downloadId: season.download_id,
          status: "DOWNLOADING",
          currentStep: "download",
        },
      });
    }
  }
}

export const stuckItemRecoveryWorker = new StuckItemRecoveryWorker();
