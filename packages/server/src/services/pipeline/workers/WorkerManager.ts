import type { BaseWorker } from "./BaseWorker";
import { deliverWorker } from "./DeliverWorker";
import { downloadWorker } from "./DownloadWorker";
import { encodeWorker } from "./EncodeWorker";
import { searchWorker } from "./SearchWorker";

/**
 * WorkerManager - Manages all pipeline workers
 * Starts/stops workers and handles lifecycle
 */
export class WorkerManager {
  private workers: BaseWorker[] = [];
  private isRunning = false;

  constructor() {
    this.workers = [searchWorker, downloadWorker, encodeWorker, deliverWorker];
  }

  /**
   * Start all workers
   */
  start(): void {
    if (this.isRunning) {
      console.log("[WorkerManager] Already running");
      return;
    }

    console.log("[WorkerManager] Starting all workers...");
    this.isRunning = true;

    for (const worker of this.workers) {
      worker.start();
    }

    console.log(`[WorkerManager] Started ${this.workers.length} workers`);
  }

  /**
   * Stop all workers
   */
  stop(): void {
    if (!this.isRunning) {
      console.log("[WorkerManager] Not running");
      return;
    }

    console.log("[WorkerManager] Stopping all workers...");
    this.isRunning = false;

    for (const worker of this.workers) {
      worker.stop();
    }

    console.log("[WorkerManager] Stopped all workers");
  }

  /**
   * Restart all workers
   */
  restart(): void {
    this.stop();
    setTimeout(() => this.start(), 1000);
  }

  /**
   * Get worker status
   */
  getStatus(): {
    isRunning: boolean;
    workers: Array<{ name: string; status: string }>;
  } {
    return {
      isRunning: this.isRunning,
      workers: this.workers.map((w) => ({
        name: w.name,
        status: this.isRunning ? "running" : "stopped",
      })),
    };
  }
}

export const workerManager = new WorkerManager();
