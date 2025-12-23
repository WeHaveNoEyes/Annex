import { AssignmentStatus, RequestStatus } from "@prisma/client";
import { prisma } from "../db/client.js";

/**
 * Recovers requests stuck in ENCODING status due to server restarts.
 *
 * When the server restarts during encoding, the EncodeStep polling loop is lost,
 * but the encoder keeps running. This function detects completed encodings that
 * weren't processed and updates the requests to continue the pipeline.
 */
export async function recoverStuckEncodings(): Promise<void> {
  console.log("[EncodingRecovery] Checking for stuck encodings...");

  // Find requests stuck in ENCODING status
  const stuckRequests = await prisma.mediaRequest.findMany({
    where: {
      status: RequestStatus.ENCODING,
    },
    select: {
      id: true,
      title: true,
      progress: true,
      currentStep: true,
      updatedAt: true,
    },
  });

  if (stuckRequests.length === 0) {
    console.log("[EncodingRecovery] No stuck encodings found");
    return;
  }

  console.log(`[EncodingRecovery] Found ${stuckRequests.length} requests in ENCODING status`);

  let recovered = 0;
  let stillRunning = 0;

  for (const request of stuckRequests) {
    // Find the encoding job for this request
    const job = await prisma.job.findFirst({
      where: {
        type: "remote:encode",
        payload: { path: ["requestId"], equals: request.id },
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });

    if (!job) {
      console.log(`[EncodingRecovery] ${request.title}: No encoding job found`);
      continue;
    }

    // Find the most recent assignment for this job
    const assignment = await prisma.encoderAssignment.findFirst({
      where: { jobId: job.id },
      orderBy: { assignedAt: "desc" },
    });

    if (!assignment) {
      console.log(`[EncodingRecovery] ${request.title}: No assignment found`);
      continue;
    }

    // Check if encoding completed while server was down
    if (assignment.status === AssignmentStatus.COMPLETED && assignment.outputPath) {
      console.log(
        `[EncodingRecovery] ${request.title}: Encoding completed at ${assignment.completedAt?.toISOString()} - recovering`
      );

      // Update request to proceed to delivery
      await prisma.mediaRequest.update({
        where: { id: request.id },
        data: {
          status: RequestStatus.ENCODING,
          progress: 90,
          currentStep: "Encoding complete",
        },
      });

      recovered++;
    } else if (assignment.status === AssignmentStatus.FAILED) {
      console.log(
        `[EncodingRecovery] ${request.title}: Encoding failed - ${assignment.error || "Unknown error"}`
      );
      // Leave it as is - user can retry manually
    } else if (
      assignment.status === AssignmentStatus.ENCODING ||
      assignment.status === AssignmentStatus.ASSIGNED
    ) {
      console.log(
        `[EncodingRecovery] ${request.title}: Encoding still in progress (${assignment.progress}%)`
      );
      stillRunning++;
      // The EncodeStep will resume monitoring when retried
    }
  }

  if (recovered > 0) {
    console.log(`[EncodingRecovery] ✓ Recovered ${recovered} stuck encodings`);
  }
  if (stillRunning > 0) {
    console.log(
      `[EncodingRecovery] ${stillRunning} encodings still in progress (will not resume automatically)`
    );
  }
}
