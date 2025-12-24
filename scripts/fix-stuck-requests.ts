#!/usr/bin/env bun

/**
 * Fix Stuck Requests Script
 *
 * Recovers requests stuck in ENCODING or DELIVERING status when:
 * - Encoding jobs have completed but request wasn't updated
 * - Pipeline executions failed but request is stuck in progress
 * - Delivery started but pipeline failed mid-delivery
 */

import { AssignmentStatus, PrismaClient, RequestStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function fixStuckRequests() {
  console.log("[FixStuckRequests] Starting recovery...\n");

  // Find requests stuck in ENCODING or DELIVERING
  const stuckRequests = await prisma.mediaRequest.findMany({
    where: {
      status: { in: [RequestStatus.ENCODING, RequestStatus.DELIVERING] },
    },
    select: {
      id: true,
      title: true,
      status: true,
      progress: true,
      currentStep: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (stuckRequests.length === 0) {
    console.log("[FixStuckRequests] No stuck requests found");
    await prisma.$disconnect();
    return;
  }

  console.log(`[FixStuckRequests] Found ${stuckRequests.length} potentially stuck requests:\n`);

  let fixed = 0;
  let stillRunning = 0;
  let needsManualReview = 0;

  for (const request of stuckRequests) {
    console.log(`\n--- ${request.title} ---`);
    console.log(`Status: ${request.status}, Progress: ${request.progress.toFixed(1)}%`);
    console.log(`Current Step: ${request.currentStep || "N/A"}`);
    console.log(`Last Updated: ${request.updatedAt.toISOString()}`);

    // Find pipeline execution
    const pipelineExecution = await prisma.pipelineExecution.findFirst({
      where: { requestId: request.id },
      orderBy: { startedAt: "desc" },
    });

    if (pipelineExecution) {
      console.log(`Pipeline Execution: ${pipelineExecution.status}`);
      if (pipelineExecution.error) {
        console.log(`Pipeline Error: ${pipelineExecution.error}`);
      }
    } else {
      console.log("Pipeline Execution: Not found (using old system)");
    }

    // Find encoding jobs
    const jobs = await prisma.job.findMany({
      where: {
        type: "remote:encode",
        payload: { path: ["requestId"], equals: request.id },
      },
      select: {
        id: true,
        encoderAssignment: {
          select: {
            id: true,
            status: true,
            progress: true,
            outputPath: true,
            completedAt: true,
            error: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 1,
    });

    const latestJob = jobs[0];
    const assignment = latestJob?.encoderAssignment;

    if (assignment) {
      console.log(
        `Encoding Assignment: ${assignment.status} (${assignment.progress?.toFixed(1)}%)`
      );
      if (assignment.completedAt) {
        console.log(`Completed At: ${assignment.completedAt.toISOString()}`);
      }
      if (assignment.error) {
        console.log(`Assignment Error: ${assignment.error}`);
      }
    } else {
      console.log("Encoding Assignment: Not found");
    }

    // Decision logic
    if (assignment?.status === AssignmentStatus.COMPLETED && assignment.outputPath) {
      // Encoding completed - check if we need to resume delivery
      if (request.status === RequestStatus.ENCODING) {
        console.log("ACTION: Encoding completed, updating to move to delivery...");

        // Check if pipeline execution is RUNNING (can resume) or FAILED (needs manual intervention)
        if (pipelineExecution?.status === "RUNNING") {
          console.log(
            "Pipeline is RUNNING - it should auto-recover on next encoding recovery check"
          );
          stillRunning++;
        } else if (pipelineExecution?.status === "FAILED") {
          console.log("Pipeline FAILED - marking request as FAILED");
          await prisma.mediaRequest.update({
            where: { id: request.id },
            data: {
              status: RequestStatus.FAILED,
              error: pipelineExecution.error || "Pipeline execution failed",
              currentStep: null,
            },
          });
          fixed++;
        } else {
          needsManualReview++;
        }
      } else if (request.status === RequestStatus.DELIVERING) {
        // Check pipeline status
        if (pipelineExecution?.status === "FAILED") {
          console.log("ACTION: Pipeline FAILED during delivery - marking request as FAILED");
          await prisma.mediaRequest.update({
            where: { id: request.id },
            data: {
              status: RequestStatus.FAILED,
              error: pipelineExecution.error || "Pipeline execution failed during delivery",
              currentStep: null,
            },
          });
          fixed++;
        } else if (pipelineExecution?.status === "COMPLETED") {
          console.log(
            "ACTION: Pipeline COMPLETED but request still in DELIVERING - marking as COMPLETED"
          );
          await prisma.mediaRequest.update({
            where: { id: request.id },
            data: {
              status: RequestStatus.COMPLETED,
              progress: 100,
              currentStep: null,
              completedAt: new Date(),
            },
          });
          fixed++;
        } else if (pipelineExecution?.status === "RUNNING") {
          const timeSinceUpdate = Date.now() - request.updatedAt.getTime();
          const oneHour = 60 * 60 * 1000;

          if (timeSinceUpdate > oneHour) {
            console.log(
              `ACTION: No progress for ${Math.round(timeSinceUpdate / 60000)} minutes - marking as FAILED`
            );
            await prisma.mediaRequest.update({
              where: { id: request.id },
              data: {
                status: RequestStatus.FAILED,
                error: "Delivery stuck - no progress for over 1 hour",
                currentStep: null,
              },
            });

            // Also fail the pipeline
            await prisma.pipelineExecution.update({
              where: { id: pipelineExecution.id },
              data: {
                status: "FAILED",
                error: "Delivery stuck - no progress for over 1 hour",
                completedAt: new Date(),
              },
            });
            fixed++;
          } else {
            console.log("Delivery may still be in progress - waiting...");
            stillRunning++;
          }
        } else {
          needsManualReview++;
        }
      }
    } else if (
      assignment?.status === AssignmentStatus.ENCODING ||
      assignment?.status === AssignmentStatus.ASSIGNED ||
      assignment?.status === AssignmentStatus.PENDING
    ) {
      console.log("Encoding still in progress - no action needed");
      stillRunning++;
    } else if (assignment?.status === AssignmentStatus.FAILED) {
      console.log("ACTION: Encoding FAILED - marking request as FAILED");
      await prisma.mediaRequest.update({
        where: { id: request.id },
        data: {
          status: RequestStatus.FAILED,
          error: assignment.error || "Encoding failed",
          currentStep: null,
        },
      });
      fixed++;
    } else {
      console.log("No clear action - needs manual review");
      needsManualReview++;
    }
  }

  console.log(`\n\n[FixStuckRequests] Summary:`);
  console.log(`  Fixed: ${fixed}`);
  console.log(`  Still running: ${stillRunning}`);
  console.log(`  Needs manual review: ${needsManualReview}`);

  await prisma.$disconnect();
}

fixStuckRequests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
