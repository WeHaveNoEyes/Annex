import { RequestStatus } from "@prisma/client";
import { prisma } from "../db/client.js";
import { registerPipelineSteps } from "./pipeline/registerSteps.js";
import { StepRegistry } from "./pipeline/StepRegistry.js";

/**
 * Recovers requests stuck in DELIVERING status.
 *
 * When the server restarts during delivery, the DeliverStep's async delivery process
 * is lost. This function detects completed deliveries and updates the pipeline.
 */
export async function recoverStuckDeliveries(): Promise<void> {
  console.log("[DeliveryRecovery] Checking for stuck deliveries...");

  // Ensure pipeline steps are registered
  if (StepRegistry.getRegisteredTypes().length === 0) {
    console.log("[DeliveryRecovery] Pipeline steps not registered, registering now...");
    registerPipelineSteps();
  }

  // Find requests stuck in DELIVERING status
  const stuckRequests = await prisma.mediaRequest.findMany({
    where: {
      status: RequestStatus.DELIVERING,
    },
    select: {
      id: true,
      title: true,
      tmdbId: true,
      type: true,
      updatedAt: true,
    },
  });

  if (stuckRequests.length === 0) {
    console.log("[DeliveryRecovery] No stuck deliveries found");
    return;
  }

  console.log(`[DeliveryRecovery] Found ${stuckRequests.length} requests in DELIVERING status`);

  let recovered = 0;
  const stallTimeout = 300000; // 5 minutes
  const cutoff = new Date(Date.now() - stallTimeout);

  for (const request of stuckRequests) {
    // Check if file exists in library (delivery may have completed)
    const libraryItem = await prisma.libraryItem.findFirst({
      where: {
        tmdbId: request.tmdbId,
        type: request.type,
      },
      orderBy: { addedAt: "desc" },
    });

    if (libraryItem) {
      console.log(`[DeliveryRecovery] ${request.title}: Found in library, marking as COMPLETED`);

      // Get pipeline context to find encoded files for cleanup
      const pipelineExecution = await prisma.pipelineExecution.findFirst({
        where: {
          requestId: request.id,
          status: "RUNNING",
        },
        orderBy: { startedAt: "desc" },
      });

      // Clean up encoded files (keep source files for seeding)
      if (pipelineExecution) {
        const context = pipelineExecution.context as {
          encode?: {
            encodedFiles?: Array<{ path: string }>;
          };
        };

        const encodedFiles = context.encode?.encodedFiles || [];
        for (const encodedFile of encodedFiles) {
          try {
            const exists = await Bun.file(encodedFile.path).exists();
            if (exists) {
              await Bun.file(encodedFile.path).delete();
              console.log(
                `[DeliveryRecovery] ${request.title}: Cleaned up encoded file: ${encodedFile.path}`
              );
            }
          } catch (err) {
            console.warn(
              `[DeliveryRecovery] ${request.title}: Failed to clean up ${encodedFile.path}:`,
              err
            );
            // Don't fail recovery on cleanup errors
          }
        }
      }

      // Update request to COMPLETED
      await prisma.mediaRequest.update({
        where: { id: request.id },
        data: {
          status: RequestStatus.COMPLETED,
          progress: 100,
          currentStep: null,
          completedAt: new Date(),
        },
      });

      // Mark pipeline as COMPLETED
      await prisma.pipelineExecution.updateMany({
        where: {
          requestId: request.id,
          status: "RUNNING",
        },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });

      recovered++;
    } else if (request.updatedAt < cutoff) {
      // No progress for over 5 minutes - mark as failed
      console.log(
        `[DeliveryRecovery] ${request.title}: No progress for > 5 minutes, marking as FAILED`
      );

      await prisma.mediaRequest.update({
        where: { id: request.id },
        data: {
          status: RequestStatus.FAILED,
          error: "Delivery stalled - no progress for over 5 minutes",
          currentStep: null,
        },
      });

      await prisma.pipelineExecution.updateMany({
        where: {
          requestId: request.id,
          status: "RUNNING",
        },
        data: {
          status: "FAILED",
          error: "Delivery stalled",
          completedAt: new Date(),
        },
      });

      recovered++;
    }
  }

  if (recovered > 0) {
    console.log(`[DeliveryRecovery] ✓ Recovered ${recovered} stuck delivery/deliveries`);
  }
}
