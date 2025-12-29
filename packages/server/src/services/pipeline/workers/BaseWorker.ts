import type { ProcessingItem, ProcessingStatus } from "@prisma/client";
import { pipelineOrchestrator } from "../PipelineOrchestrator";

/**
 * Base Worker class for processing items through pipeline stages
 * Workers poll for items in specific statuses and process them using Steps
 */
export abstract class BaseWorker {
  protected isRunning = false;
  protected pollInterval = 5000; // 5 seconds
  private pollTimeout?: NodeJS.Timeout;

  /**
   * The status this worker processes
   */
  abstract readonly processingStatus: ProcessingStatus;

  /**
   * The next status to transition to on success
   */
  abstract readonly nextStatus: ProcessingStatus;

  /**
   * Worker name for logging
   */
  abstract readonly name: string;

  /**
   * Process a single item
   */
  protected abstract processItem(item: ProcessingItem): Promise<void>;

  /**
   * Start the worker polling loop
   */
  start(): void {
    if (this.isRunning) {
      console.log(`[${this.name}] Already running`);
      return;
    }

    this.isRunning = true;
    console.log(`[${this.name}] Started`);
    this.poll();
  }

  /**
   * Stop the worker
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = undefined;
    }
    console.log(`[${this.name}] Stopped`);
  }

  /**
   * Poll for work
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      await this.processBatch();
    } catch (error) {
      console.error(`[${this.name}] Poll error:`, error);
    }

    // Schedule next poll
    if (this.isRunning) {
      this.pollTimeout = setTimeout(() => this.poll(), this.pollInterval);
    }
  }

  /**
   * Process a batch of items
   */
  private async processBatch(): Promise<void> {
    const items = await pipelineOrchestrator.getItemsForProcessing(this.processingStatus);

    if (items.length === 0) {
      return;
    }

    console.log(`[${this.name}] Processing ${items.length} items`);

    // Process items in parallel (with concurrency limit)
    const concurrency = 3;
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      await Promise.allSettled(batch.map((item) => this.processItemSafe(item)));
    }
  }

  /**
   * Safely process an item with error handling
   */
  private async processItemSafe(item: ProcessingItem): Promise<void> {
    try {
      await this.processItem(item);
    } catch (error) {
      console.error(`[${this.name}] Error processing item ${item.id}:`, error);
      await pipelineOrchestrator.handleError(
        item.id,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Update item progress
   */
  protected async updateProgress(
    itemId: string,
    progress: number,
    message?: string
  ): Promise<void> {
    await pipelineOrchestrator.updateProgress(itemId, progress);
    if (message) {
      console.log(`[${this.name}] ${itemId}: ${message} (${progress}%)`);
    }
  }

  /**
   * Update item context
   */
  protected async updateContext(itemId: string, context: Record<string, unknown>): Promise<void> {
    await pipelineOrchestrator.updateContext(itemId, context);
  }

  /**
   * Transition item to next status
   */
  protected async transitionToNext(
    itemId: string,
    context?: {
      currentStep?: string;
      stepContext?: Record<string, unknown>;
      downloadId?: string;
      encodingJobId?: string;
    }
  ): Promise<void> {
    await pipelineOrchestrator.transitionStatus(itemId, this.nextStatus, context);
  }

  /**
   * Get request details for an item
   */
  protected async getRequest(requestId: string) {
    const { prisma } = await import("../../../db/client.js");
    return await prisma.mediaRequest.findUnique({
      where: { id: requestId },
      include: {
        processingItems: true,
      },
    });
  }
}
