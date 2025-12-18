import { prisma } from "../db/client.js";

interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterMs?: number;
  currentCount?: number;
  limit?: number;
}

export interface RateLimitStatus {
  enabled: boolean;
  currentCount: number;
  limit: number | null;
  windowSeconds: number | null;
  oldestRequestAt: Date | null;
  timeUntilReset: number | null;
}

class RateLimiter {

  async checkRateLimit(indexerId: string): Promise<RateLimitCheckResult> {
    const indexer = await prisma.indexer.findUnique({
      where: { id: indexerId },
      select: {
        rateLimitEnabled: true,
        rateLimitMax: true,
        rateLimitWindowSecs: true,
      },
    });

    if (!indexer || !indexer.rateLimitEnabled || !indexer.rateLimitMax || !indexer.rateLimitWindowSecs) {
      return { allowed: true };
    }

    const windowSecs = indexer.rateLimitWindowSecs;
    const limit = indexer.rateLimitMax;
    const windowStart = new Date(Date.now() - windowSecs * 1000);

    const count = await prisma.indexerRateLimitRequest.count({
      where: {
        indexerId,
        requestedAt: { gte: windowStart },
      },
    });

    if (count >= limit) {
      const oldest = await prisma.indexerRateLimitRequest.findFirst({
        where: {
          indexerId,
          requestedAt: { gte: windowStart },
        },
        orderBy: { requestedAt: "asc" },
      });

      const retryAfterMs = oldest
        ? windowSecs * 1000 - (Date.now() - oldest.requestedAt.getTime())
        : windowSecs * 1000;

      return {
        allowed: false,
        retryAfterMs: Math.max(retryAfterMs, 0),
        currentCount: count,
        limit,
      };
    }

    return { allowed: true, currentCount: count, limit };
  }

  async recordRequest(indexerId: string): Promise<void> {
    await prisma.indexerRateLimitRequest.create({
      data: {
        indexerId,
        requestedAt: new Date(),
      },
    });
  }

  async waitForRateLimit(indexerId: string, maxRetries: number = 10): Promise<boolean> {
    let attempts = 0;

    while (attempts < maxRetries) {
      const check = await this.checkRateLimit(indexerId);

      if (check.allowed) {
        return true;
      }

      const waitMs = check.retryAfterMs! * Math.min(2 ** attempts, 8);
      const waitSecs = (waitMs / 1000).toFixed(1);

      const indexer = await prisma.indexer.findUnique({
        where: { id: indexerId },
        select: { name: true },
      });

      console.log(
        `[RateLimit] ${indexer?.name || indexerId}: limit reached (${check.currentCount}/${check.limit}), waiting ${waitSecs}s...`
      );

      await new Promise((resolve) => setTimeout(resolve, waitMs));
      attempts++;
    }

    const indexer = await prisma.indexer.findUnique({
      where: { id: indexerId },
      select: { name: true },
    });

    console.error(
      `[RateLimit] ${indexer?.name || indexerId}: max retries (${maxRetries}) exceeded, giving up`
    );

    return false;
  }

  async cleanupOldRecords(): Promise<number> {
    const maxWindow = await prisma.indexer.aggregate({
      where: { rateLimitEnabled: true },
      _max: { rateLimitWindowSecs: true },
    });

    const maxWindowSecs = maxWindow._max.rateLimitWindowSecs || 3600;
    const cutoff = new Date(Date.now() - maxWindowSecs * 2000);

    const result = await prisma.indexerRateLimitRequest.deleteMany({
      where: { requestedAt: { lt: cutoff } },
    });

    if (result.count > 0) {
      console.log(`[RateLimit] Cleaned up ${result.count} old rate limit records`);
    }

    return result.count;
  }

  async getStatus(indexerId: string): Promise<RateLimitStatus> {
    const indexer = await prisma.indexer.findUnique({
      where: { id: indexerId },
      select: {
        rateLimitEnabled: true,
        rateLimitMax: true,
        rateLimitWindowSecs: true,
      },
    });

    if (!indexer || !indexer.rateLimitEnabled || !indexer.rateLimitMax || !indexer.rateLimitWindowSecs) {
      return {
        enabled: false,
        currentCount: 0,
        limit: null,
        windowSeconds: null,
        oldestRequestAt: null,
        timeUntilReset: null,
      };
    }

    const windowSecs = indexer.rateLimitWindowSecs;
    const limit = indexer.rateLimitMax;
    const windowStart = new Date(Date.now() - windowSecs * 1000);

    const [count, oldest] = await Promise.all([
      prisma.indexerRateLimitRequest.count({
        where: {
          indexerId,
          requestedAt: { gte: windowStart },
        },
      }),
      prisma.indexerRateLimitRequest.findFirst({
        where: {
          indexerId,
          requestedAt: { gte: windowStart },
        },
        orderBy: { requestedAt: "asc" },
      }),
    ]);

    const timeUntilReset = oldest
      ? windowSecs * 1000 - (Date.now() - oldest.requestedAt.getTime())
      : null;

    return {
      enabled: true,
      currentCount: count,
      limit,
      windowSeconds: windowSecs,
      oldestRequestAt: oldest?.requestedAt || null,
      timeUntilReset: timeUntilReset ? Math.max(timeUntilReset, 0) : null,
    };
  }
}

let rateLimiterInstance: RateLimiter | null = null;

export const getRateLimiter = (): RateLimiter => {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter();
  }
  return rateLimiterInstance;
};
