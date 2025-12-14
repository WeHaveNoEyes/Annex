import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { getSyncService } from "../services/sync.js";
import { getJobQueueService } from "../services/jobQueue.js";
import { getMDBListService } from "../services/mdblist.js";
import { prisma } from "../db/client.js";
import { calculateAggregateScore } from "../services/ratingAggregator.js";

export const syncRouter = router({
  /**
   * Get current sync status and statistics
   */
  status: publicProcedure.query(async () => {
    const sync = getSyncService();
    const jobQueue = getJobQueueService();

    const [syncStats, progress, queueStats] = await Promise.all([
      sync.getStats(),
      sync.getProgress(),
      jobQueue.getStats(),
    ]);

    return {
      database: syncStats,
      currentProgress: progress,
      jobQueue: queueStats,
    };
  }),

  /**
   * Start a full sync (download all IDs from TMDB and hydrate via MDBList)
   * This queues a background job and returns immediately
   * Uses deduplication to prevent duplicate sync jobs
   */
  startFullSync: publicProcedure
    .input(
      z
        .object({
          movies: z.boolean().default(true),
          tvShows: z.boolean().default(true),
          popularityThreshold: z.number().default(0),
          maxItems: z.number().optional(),
        })
        .default({})
    )
    .mutation(async ({ input }) => {
      const jobQueue = getJobQueueService();

      const payload = {
        movies: input.movies,
        tvShows: input.tvShows,
        popularityThreshold: input.popularityThreshold,
        maxItems: input.maxItems,
      };

      const job = await jobQueue.addJobIfNotExists(
        "sync:full",
        payload,
        "sync-full", // dedupe key
        { priority: 10 } // High priority
      );

      if (!job) {
        return {
          message: "Full sync already in progress",
          jobId: null,
          alreadyRunning: true,
        };
      }

      return {
        message: "Full sync started",
        jobId: job.id,
        alreadyRunning: false,
      };
    }),

  /**
   * Start an incremental sync (only new/changed items from TMDB changes API)
   * This queues a background job and returns immediately
   * Uses deduplication to prevent duplicate sync jobs
   */
  startIncrementalSync: publicProcedure.mutation(async () => {
    const jobQueue = getJobQueueService();

    const job = await jobQueue.addJobIfNotExists(
      "sync:incremental",
      {},
      "sync-incremental", // dedupe key
      { priority: 8 }
    );

    if (!job) {
      return {
        message: "Incremental sync already in progress",
        jobId: null,
        alreadyRunning: true,
      };
    }

    return {
      message: "Incremental sync started",
      jobId: job.id,
      alreadyRunning: false,
    };
  }),

  /**
   * Refresh stale items in the database
   * Items not updated in the last 24 hours will be refreshed from MDBList
   * Uses deduplication to prevent duplicate refresh jobs
   */
  refreshStale: publicProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(10000).default(1000),
        })
        .default({})
    )
    .mutation(async ({ input }) => {
      const jobQueue = getJobQueueService();

      const job = await jobQueue.addJobIfNotExists(
        "sync:refresh-stale",
        { limit: input.limit },
        "sync-refresh-stale", // dedupe key
        { priority: 5 }
      );

      if (!job) {
        return {
          message: "Stale refresh already in progress",
          jobId: null,
          alreadyRunning: true,
        };
      }

      return {
        message: "Stale refresh started",
        jobId: job.id,
        alreadyRunning: false,
      };
    }),

  /**
   * Get MDBList API limits and usage
   */
  apiLimits: publicProcedure.query(async () => {
    const mdblist = getMDBListService();
    return mdblist.getLimits();
  }),

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
  cancelJob: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ input }) => {
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
  pauseJob: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ input }) => {
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
  resumeJob: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ input }) => {
      const jobQueue = getJobQueueService();
      const success = await jobQueue.resumeJob(input.jobId);
      return {
        success,
        message: success ? "Job resumed" : "Job not found or not paused",
      };
    }),

  /**
   * Cancel a running sync job
   * The sync will stop gracefully at the next batch checkpoint
   */
  cancelRunningSync: publicProcedure
    .input(z.object({ jobType: z.enum(["sync:full", "sync:tmdb-full", "sync:tmdb-missing", "sync:incremental", "sync:refresh-stale"]) }))
    .mutation(async ({ input }) => {
      const jobQueue = getJobQueueService();
      const job = jobQueue.getRunningJobByType(input.jobType);

      if (!job) {
        return {
          success: false,
          message: "No running sync job of that type found",
        };
      }

      const success = await jobQueue.requestCancellation(job.id);
      return {
        success,
        message: success ? "Cancellation requested - sync will stop at next checkpoint" : "Failed to request cancellation",
        jobId: job.id,
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

  /**
   * Start a full TMDB sync to hydrate all media items with complete details
   * This fetches cast, crew, videos, etc. for all items that don't have them yet
   * Processes from newest to oldest (most recently added first)
   */
  startTMDBSync: publicProcedure
    .input(
      z
        .object({
          movies: z.boolean().default(true),
          tvShows: z.boolean().default(true),
          maxItems: z.number().optional(),
          includeSeasons: z.boolean().default(false), // Whether to also fetch all episodes
        })
        .default({})
    )
    .mutation(async ({ input }) => {
      const jobQueue = getJobQueueService();

      const payload = {
        movies: input.movies,
        tvShows: input.tvShows,
        maxItems: input.maxItems,
        includeSeasons: input.includeSeasons,
      };

      const job = await jobQueue.addJobIfNotExists(
        "sync:tmdb-full",
        payload,
        "sync-tmdb-full", // dedupe key
        { priority: 10 } // High priority
      );

      if (!job) {
        return {
          message: "TMDB sync already in progress",
          jobId: null,
          alreadyRunning: true,
        };
      }

      return {
        message: "TMDB sync started - hydrating media with full details",
        jobId: job.id,
        alreadyRunning: false,
      };
    }),

  /**
   * Start a TMDB sync for items missing MDBList data
   * This fetches basic info from TMDB for items that MDBList doesn't have
   * (typically very new content not yet in MDBList's database)
   */
  startTMDBMissingSync: publicProcedure
    .input(
      z
        .object({
          movies: z.boolean().default(true),
          tvShows: z.boolean().default(true),
          limit: z.number().min(1).max(100000).default(10000),
        })
        .default({})
    )
    .mutation(async ({ input }) => {
      const jobQueue = getJobQueueService();

      const payload = {
        movies: input.movies,
        tvShows: input.tvShows,
        limit: input.limit,
      };

      const job = await jobQueue.addJobIfNotExists(
        "sync:tmdb-missing",
        payload,
        "sync-tmdb-missing", // dedupe key
        { priority: 8 } // Slightly lower than full sync
      );

      if (!job) {
        return {
          message: "TMDB missing sync already in progress",
          jobId: null,
          alreadyRunning: true,
        };
      }

      return {
        message: "TMDB missing sync started - filling in items not in MDBList",
        jobId: job.id,
        alreadyRunning: false,
      };
    }),

  /**
   * Recalculate all aggregate scores from existing rating data
   * This is useful after fixing bugs in the aggregation algorithm
   */
  recalculateAggregates: publicProcedure.mutation(async () => {
    const batchSize = 500;
    let processed = 0;
    let updated = 0;
    let lastId: string | null = null;

    // Process in batches using offset pagination
    let hasMore = true;
    while (hasMore) {
      type RatingRow = {
        id: string;
        tmdbScore: number | null;
        tmdbVotes: number | null;
        imdbScore: number | null;
        imdbVotes: number | null;
        rtCriticScore: number | null;
        rtAudienceScore: number | null;
        metacriticScore: number | null;
        traktScore: number | null;
        traktVotes: number | null;
        letterboxdScore: number | null;
      };

      let ratings: RatingRow[];
      if (lastId) {
        ratings = await prisma.mediaRatings.findMany({
          take: batchSize,
          where: { id: { gt: lastId } },
          orderBy: { id: "asc" },
          select: {
            id: true,
            tmdbScore: true,
            tmdbVotes: true,
            imdbScore: true,
            imdbVotes: true,
            rtCriticScore: true,
            rtAudienceScore: true,
            metacriticScore: true,
            traktScore: true,
            traktVotes: true,
            letterboxdScore: true,
          },
        });
      } else {
        ratings = await prisma.mediaRatings.findMany({
          take: batchSize,
          orderBy: { id: "asc" },
          select: {
            id: true,
            tmdbScore: true,
            tmdbVotes: true,
            imdbScore: true,
            imdbVotes: true,
            rtCriticScore: true,
            rtAudienceScore: true,
            metacriticScore: true,
            traktScore: true,
            traktVotes: true,
            letterboxdScore: true,
          },
        });
      }

      if (ratings.length === 0) {
        hasMore = false;
        break;
      }

      for (const rating of ratings) {
        const aggregate = calculateAggregateScore({
          tmdbScore: rating.tmdbScore,
          tmdbVotes: rating.tmdbVotes,
          imdbScore: rating.imdbScore,
          imdbVotes: rating.imdbVotes,
          rtCriticScore: rating.rtCriticScore,
          rtAudienceScore: rating.rtAudienceScore,
          metacriticScore: rating.metacriticScore,
          traktScore: rating.traktScore,
          traktVotes: rating.traktVotes,
          letterboxdScore: rating.letterboxdScore,
        });

        await prisma.mediaRatings.update({
          where: { id: rating.id },
          data: {
            aggregateScore: aggregate.aggregateScore,
            sourceCount: aggregate.sourceCount,
            confidenceScore: aggregate.confidenceScore,
            isTrusted: aggregate.isTrusted,
            aggregatedAt: aggregate.aggregatedAt,
          },
        });

        updated++;
      }

      processed += ratings.length;
      lastId = ratings[ratings.length - 1].id;

      console.log(`[RecalculateAggregates] Processed ${processed} ratings...`);

      if (ratings.length < batchSize) {
        hasMore = false;
      }
    }

    return {
      message: `Recalculated aggregates for ${updated} items`,
      updated,
    };
  }),
});
