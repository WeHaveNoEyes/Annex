import type { MediaType, ProcessingItem } from "@prisma/client";
import type { PipelineContext } from "../PipelineContext";
import { EncodeStep } from "../steps/EncodeStep";
import { BaseWorker } from "./BaseWorker";

/**
 * EncodeWorker - Encodes media for items in DOWNLOADED status
 * Transitions items from DOWNLOADED → ENCODING → ENCODED
 */
export class EncodeWorker extends BaseWorker {
  readonly processingStatus = "DOWNLOADED" as const;
  readonly nextStatus = "ENCODED" as const;
  readonly name = "EncodeWorker";

  private encodeStep = new EncodeStep();

  protected async processItem(item: ProcessingItem): Promise<void> {
    console.log(`[${this.name}] Processing ${item.type} ${item.title}`);

    // Transition to ENCODING
    const { pipelineOrchestrator } = await import("../PipelineOrchestrator");
    await pipelineOrchestrator.transitionStatus(item.id, "ENCODING", {
      currentStep: "encode",
    });

    // Get request details
    const request = await this.getRequest(item.requestId);
    if (!request) {
      throw new Error(`Request ${item.requestId} not found`);
    }

    // Get pipeline execution to load encoding config from template
    const { prisma } = await import("../../../db/client.js");
    const execution = await prisma.pipelineExecution.findFirst({
      where: { requestId: item.requestId, parentExecutionId: null },
      orderBy: { startedAt: "desc" },
    });

    if (!execution) {
      throw new Error(`Pipeline execution not found for request ${item.requestId}`);
    }

    // Extract encoding config from pipeline steps
    const steps = execution.steps as Array<{
      type: string;
      config?: Record<string, unknown>;
      children?: Array<{ type: string; config?: Record<string, unknown>; children?: unknown[] }>;
    }>;

    const findEncodeConfig = (stepList: typeof steps): Record<string, unknown> | null => {
      for (const step of stepList) {
        if (step.type === "ENCODE" && step.config) {
          return step.config;
        }
        if (step.children) {
          const found = findEncodeConfig(step.children);
          if (found) return found;
        }
      }
      return null;
    };

    const encodeConfig = findEncodeConfig(steps);
    if (!encodeConfig) {
      throw new Error(`No ENCODE step found in pipeline template for request ${item.requestId}`);
    }

    console.log(`[${this.name}] Using encoding config from pipeline:`, encodeConfig);

    // Extract previous step contexts
    const stepContext = item.stepContext as Record<string, unknown>;
    const searchData = stepContext.search as PipelineContext["search"];
    const downloadData = stepContext.download as PipelineContext["download"];

    if (!downloadData?.sourceFilePath && !downloadData?.episodeFiles) {
      throw new Error("No download data found in item context");
    }

    // Build pipeline context
    const context: PipelineContext = {
      requestId: item.requestId,
      mediaType: request.type as MediaType,
      tmdbId: item.tmdbId,
      title: item.title,
      year: item.year || new Date().getFullYear(),
      targets: request.targets
        ? (request.targets as Array<{ serverId: string; encodingProfileId?: string }>)
        : [],
      search: searchData,
      download: downloadData,
    };

    // For TV episodes, add episode context
    if (item.type === "EPISODE" && item.season !== null && item.episode !== null) {
      context.requestedEpisodes = [{ season: item.season, episode: item.episode }];
    }

    // Set progress callback
    this.encodeStep.setProgressCallback((progress, message) => {
      this.updateProgress(item.id, progress, message);
    });

    // Execute encode using config from pipeline template
    const output = await this.encodeStep.execute(context, encodeConfig);

    if (!output.success) {
      throw new Error(output.error || "Encoding failed");
    }

    // Extract encode results
    const encodeContext = output.data?.encode as PipelineContext["encode"];
    if (!encodeContext?.encodedFiles || encodeContext.encodedFiles.length === 0) {
      throw new Error("No encoded files found");
    }

    // Merge contexts
    const newStepContext = {
      ...stepContext,
      encode: encodeContext,
    };

    // Get encoding job ID from first encoded file (they should all have the same job)
    const encodingJobId = encodeContext.encodedFiles[0]?.path; // Using path as proxy for job ID

    // Transition to ENCODED with results
    await this.transitionToNext(item.id, {
      currentStep: "encode_complete",
      stepContext: newStepContext,
      encodingJobId,
    });

    console.log(`[${this.name}] Encoded ${item.title}`);
  }
}

export const encodeWorker = new EncodeWorker();
