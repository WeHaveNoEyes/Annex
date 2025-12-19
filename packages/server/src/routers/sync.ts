import { z } from "zod";
import { prisma } from "../db/client.js";
import { getJobQueueService } from "../services/jobQueue.js";
import { publicProcedure, router } from "../trpc.js";

export const syncRouter = router({
  /**
   * Get job queue statistics
   */
  queueStats: publicProcedure.query(async () => {
    const jobQueue = getJobQueueService();
    return jobQueue.getStats();
  }),

  /**
   * Clean up old completed/failed jobs
   */
  cleanupJobs: publicProcedure
    .input(
      z
        .object({
          olderThanDays: z.number().min(1).max(90).default(7),
        })
        .default({})
    )
    .mutation(async ({ input }) => {
      const jobQueue = getJobQueueService();
      const deleted = await jobQueue.cleanup(input.olderThanDays);
      return {
        message: `Cleaned up ${deleted} old jobs`,
        deleted,
      };
    }),

  /**
   * Cancel a pending job
   */
  cancelJob: publicProcedure.input(z.object({ jobId: z.string() })).mutation(async ({ input }) => {
    const jobQueue = getJobQueueService();
    const success = await jobQueue.cancelJob(input.jobId);
    return {
      success,
      message: success ? "Job cancelled" : "Job not found or not pending",
    };
  }),

  /**
   * Pause a pending or running job
   * Running jobs will stop at the next checkpoint
   */
  pauseJob: publicProcedure.input(z.object({ jobId: z.string() })).mutation(async ({ input }) => {
    const jobQueue = getJobQueueService();
    const success = await jobQueue.pauseJob(input.jobId);
    return {
      success,
      message: success ? "Job paused" : "Job not found or not in pausable state",
    };
  }),

  /**
   * Resume a paused job
   * The job will be re-queued and processed from where it left off
   */
  resumeJob: publicProcedure.input(z.object({ jobId: z.string() })).mutation(async ({ input }) => {
    const jobQueue = getJobQueueService();
    const success = await jobQueue.resumeJob(input.jobId);
    return {
      success,
      message: success ? "Job resumed" : "Job not found or not paused",
    };
  }),

  /**
   * Get running and paused jobs for the UI to show pause/resume/cancel buttons
   */
  getRunningJobs: publicProcedure.query(async () => {
    const jobQueue = getJobQueueService();
    const runningIds = jobQueue.getRunningJobIds();

    // Also get paused jobs from database
    const pausedJobs = await prisma.job.findMany({
      where: { status: "PAUSED" },
      select: {
        id: true,
        type: true,
        progress: true,
        progressCurrent: true,
        progressTotal: true,
        startedAt: true,
        status: true,
      },
    });

    const runningJobs = await Promise.all(
      runningIds.map(async (id) => {
        const job = await jobQueue.getJob(id);
        if (!job) return null;
        return {
          id: job.id,
          type: job.type,
          progress: job.progress,
          progressCurrent: job.progressCurrent,
          progressTotal: job.progressTotal,
          startedAt: job.startedAt,
          status: job.status,
        };
      })
    );

    const allJobs = [
      ...runningJobs.filter((j): j is NonNullable<typeof j> => j !== null),
      ...pausedJobs,
    ];

    return {
      jobs: allJobs,
    };
  }),
});
