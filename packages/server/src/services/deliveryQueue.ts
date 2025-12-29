/**
 * Delivery Queue Service
 *
 * Manages sequential delivery of episodes to storage servers to avoid
 * overwhelming SFTP connections.
 *
 * Key principles:
 * - Process one delivery at a time to avoid concurrent SFTP connections
 * - Queue episodes for delivery instead of spawning branch pipelines
 * - Database-backed queue for crash resilience
 */

import { TvEpisodeStatus } from "@prisma/client";
import { prisma } from "../db/client.js";
import { getDeliveryService } from "./delivery.js";
import { getNamingService } from "./naming.js";

// =============================================================================
// Types
// =============================================================================

interface DeliveryJob {
  episodeId: string;
  requestId: string;
  season: number;
  episode: number;
  title: string;
  year: number;
  sourceFilePath: string;
  targetServers: Array<{
    serverId: string;
    encodingProfileId: string;
  }>;
}

interface DeliveryResult {
  success: boolean;
  deliveredServers: string[];
  failedServers: string[];
  error?: string;
}

// =============================================================================
// Delivery Queue Service
// =============================================================================

class DeliveryQueueService {
  private queue: DeliveryJob[] = [];
  private processing = false;
  private processingEpisodeId: string | null = null;

  /**
   * Add an episode to the delivery queue
   */
  async enqueue(job: DeliveryJob): Promise<void> {
    // Check if already queued
    if (this.queue.some((j) => j.episodeId === job.episodeId)) {
      console.log(`[DeliveryQueue] Episode ${job.episodeId} already queued, skipping`);
      return;
    }

    // Check if currently processing this episode
    if (this.processingEpisodeId === job.episodeId) {
      console.log(`[DeliveryQueue] Episode ${job.episodeId} currently processing, skipping`);
      return;
    }

    this.queue.push(job);
    console.log(
      `[DeliveryQueue] Enqueued S${String(job.season).padStart(2, "0")}E${String(job.episode).padStart(2, "0")} for ${job.title} (queue size: ${this.queue.length})`
    );

    // Update episode status to DELIVERING
    await prisma.tvEpisode.update({
      where: { id: job.episodeId },
      data: { status: TvEpisodeStatus.DELIVERING },
    });

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }
  }

  /**
   * Process the delivery queue sequentially
   */
  private async processQueue(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) {
        break;
      }

      this.processingEpisodeId = job.episodeId;

      const epNum = `S${String(job.season).padStart(2, "0")}E${String(job.episode).padStart(2, "0")}`;
      console.log(
        `[DeliveryQueue] Processing ${epNum} for ${job.title} (${this.queue.length} remaining)`
      );

      try {
        const result = await this.deliverEpisode(job);

        if (result.success) {
          console.log(
            `[DeliveryQueue] ✓ ${epNum} delivered to ${result.deliveredServers.length} server(s)`
          );

          await prisma.tvEpisode.update({
            where: { id: job.episodeId },
            data: {
              status: TvEpisodeStatus.COMPLETED,
              deliveredAt: new Date(),
              error: null,
            },
          });
        } else {
          console.error(`[DeliveryQueue] ✗ ${epNum} failed: ${result.error}`);

          await prisma.tvEpisode.update({
            where: { id: job.episodeId },
            data: {
              status: TvEpisodeStatus.FAILED,
              error: result.error,
            },
          });
        }
      } catch (error) {
        console.error(
          `[DeliveryQueue] ✗ ${epNum} error:`,
          error instanceof Error ? error.message : error
        );

        await prisma.tvEpisode.update({
          where: { id: job.episodeId },
          data: {
            status: TvEpisodeStatus.FAILED,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }

      this.processingEpisodeId = null;

      // Check if all episodes for this request are complete
      await this.updateRequestStatus(job.requestId);

      // Small delay between deliveries to avoid overwhelming servers
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    this.processing = false;
    console.log("[DeliveryQueue] Queue processing complete");
  }

  /**
   * Update request status based on episode completion
   */
  private async updateRequestStatus(requestId: string): Promise<void> {
    const episodes = await prisma.tvEpisode.findMany({
      where: { requestId },
      select: { status: true },
    });

    if (episodes.length === 0) {
      return;
    }

    const statusCounts = episodes.reduce(
      (acc, ep) => {
        acc[ep.status] = (acc[ep.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const completed = statusCounts.COMPLETED || 0;
    const failed = statusCounts.FAILED || 0;
    const skipped = statusCounts.SKIPPED || 0;
    const delivering = statusCounts.DELIVERING || 0;
    const total = episodes.length;

    // All episodes done (completed, failed, or skipped)
    if (completed + failed + skipped === total) {
      if (completed > 0) {
        // At least some episodes succeeded
        await prisma.mediaRequest.update({
          where: { id: requestId },
          data: {
            status: "COMPLETED",
            progress: 100,
            currentStep: `Delivered ${completed} episode(s)`,
            completedAt: new Date(),
          },
        });
        console.log(
          `[DeliveryQueue] Request ${requestId} completed: ${completed} delivered, ${failed} failed, ${skipped} skipped`
        );
      } else {
        // All episodes failed or skipped
        await prisma.mediaRequest.update({
          where: { id: requestId },
          data: {
            status: "FAILED",
            progress: 0,
            currentStep: "All episodes failed delivery",
            error: "All episodes failed or were skipped",
          },
        });
        console.log(
          `[DeliveryQueue] Request ${requestId} failed: ${failed} failed, ${skipped} skipped`
        );
      }
    } else {
      // Still delivering - update progress
      const progress = Math.floor(((completed + failed + skipped) / total) * 100);
      await prisma.mediaRequest.update({
        where: { id: requestId },
        data: {
          status: "DELIVERING",
          progress,
          currentStep: `Delivered ${completed}/${total} episodes (${delivering} in queue)`,
        },
      });
    }
  }

  /**
   * Deliver an episode to target servers
   */
  private async deliverEpisode(job: DeliveryJob): Promise<DeliveryResult> {
    const deliveredServers: string[] = [];
    const failedServers: string[] = [];

    // Get target servers
    const servers = await prisma.storageServer.findMany({
      where: {
        id: { in: job.targetServers.map((t) => t.serverId) },
        enabled: true,
      },
    });

    if (servers.length === 0) {
      return {
        success: false,
        deliveredServers: [],
        failedServers: job.targetServers.map((t) => t.serverId),
        error: "No enabled target servers found",
      };
    }

    const delivery = getDeliveryService();
    const naming = getNamingService();

    // Deliver to each server
    for (const server of servers) {
      try {
        // Generate remote path for this server
        const remotePath = naming.getTvDestinationPath(server.pathTv, {
          series: job.title,
          year: job.year,
          season: job.season,
          episode: job.episode,
          quality: "2160p", // Hardcoded for now, should come from encoding profile
          codec: "AV1",
          container: "mkv",
        });

        const result = await delivery.deliver(server.id, job.sourceFilePath, remotePath);

        if (result.success) {
          deliveredServers.push(server.id);
        } else {
          failedServers.push(server.id);
          console.error(`[DeliveryQueue] Failed to deliver to ${server.name}: ${result.error}`);
        }
      } catch (error) {
        failedServers.push(server.id);
        console.error(`[DeliveryQueue] Error delivering to ${server.name}:`, error);
      }
    }

    const success = deliveredServers.length > 0;
    const error = !success
      ? `Failed to deliver to all ${servers.length} server(s)`
      : failedServers.length > 0
        ? `Failed to deliver to ${failedServers.length} server(s)`
        : undefined;

    return {
      success,
      deliveredServers,
      failedServers,
      error,
    };
  }

  /**
   * Get queue status
   */
  getStatus(): {
    queueSize: number;
    processing: boolean;
    currentEpisode: string | null;
  } {
    return {
      queueSize: this.queue.length,
      processing: this.processing,
      currentEpisode: this.processingEpisodeId,
    };
  }

  /**
   * Clear the queue (for testing/recovery)
   */
  clear(): void {
    this.queue = [];
    console.log("[DeliveryQueue] Queue cleared");
  }
}

// =============================================================================
// Singleton
// =============================================================================

let deliveryQueueService: DeliveryQueueService | null = null;

export function getDeliveryQueue(): DeliveryQueueService {
  if (!deliveryQueueService) {
    deliveryQueueService = new DeliveryQueueService();
  }
  return deliveryQueueService;
}
