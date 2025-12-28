import type { ProcessingItem, ProcessingStatus } from "@prisma/client";

export class ValidationError extends Error {
  constructor(
    public readonly itemId: string,
    public readonly status: ProcessingStatus,
    public readonly validationType: "entry" | "exit",
    message: string
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validation framework for ProcessingItem state transitions
 */
export class ValidationFramework {
  /**
   * Validate entry conditions for a status
   */
  async validateEntry(
    item: ProcessingItem,
    targetStatus: ProcessingStatus
  ): Promise<ValidationResult> {
    const errors: string[] = [];

    switch (targetStatus) {
      case "PENDING":
        // Always valid - initial state
        break;

      case "SEARCHING":
        if (!item.tmdbId) {
          errors.push("TMDB ID required for searching");
        }
        if (!item.title) {
          errors.push("Title required for searching");
        }
        break;

      case "FOUND": {
        // Requires search results in stepContext
        const searchContext = item.stepContext as Record<string, unknown>;
        if (!searchContext?.selectedRelease) {
          errors.push("No release selected from search results");
        }
        break;
      }

      case "DOWNLOADING":
        if (!item.downloadId) {
          errors.push("Download ID required to start downloading");
        }
        break;

      case "DOWNLOADED": {
        if (!item.downloadId) {
          errors.push("Download ID required for downloaded state");
        }
        // File validation should be done before transition
        const downloadContext = item.stepContext as Record<string, unknown>;
        if (!downloadContext?.filePath) {
          errors.push("File path required for downloaded state");
        }
        break;
      }

      case "ENCODING": {
        if (!item.encodingJobId) {
          errors.push("Encoding job ID required to start encoding");
        }
        const encodeEntryContext = item.stepContext as Record<string, unknown>;
        if (!encodeEntryContext?.inputPath) {
          errors.push("Input path required for encoding");
        }
        break;
      }

      case "ENCODED": {
        if (!item.encodingJobId) {
          errors.push("Encoding job ID required for encoded state");
        }
        // Encoded file validation should be done before transition
        const encodeExitContext = item.stepContext as Record<string, unknown>;
        if (!encodeExitContext?.outputPath) {
          errors.push("Output path required for encoded state");
        }
        break;
      }

      case "DELIVERING": {
        const deliveryContext = item.stepContext as Record<string, unknown>;
        if (!deliveryContext?.encodedFilePath) {
          errors.push("Encoded file path required for delivery");
        }
        if (
          !deliveryContext?.targetServers ||
          (deliveryContext.targetServers as unknown[]).length === 0
        ) {
          errors.push("At least one target server required for delivery");
        }
        break;
      }

      case "COMPLETED": {
        // All delivery confirmations should be in stepContext
        const completionContext = item.stepContext as Record<string, unknown>;
        if (!completionContext?.deliveryResults) {
          errors.push("Delivery results required for completion");
        }
        break;
      }

      case "FAILED":
        // Always valid - can fail from any state
        break;

      case "CANCELLED":
        // Always valid - can cancel from any state
        break;

      default:
        errors.push(`Unknown status: ${targetStatus}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate exit conditions for a status
   */
  async validateExit(
    item: ProcessingItem,
    currentStatus: ProcessingStatus
  ): Promise<ValidationResult> {
    const errors: string[] = [];

    switch (currentStatus) {
      case "PENDING":
        // No exit validation needed
        break;

      case "SEARCHING": {
        // Must have found at least one release
        const searchContext = item.stepContext as Record<string, unknown>;
        if (
          !searchContext?.searchResults ||
          (searchContext.searchResults as unknown[]).length === 0
        ) {
          errors.push("No search results found");
        }
        break;
      }

      case "FOUND": {
        // Must have selected a release
        const foundContext = item.stepContext as Record<string, unknown>;
        if (!foundContext?.selectedRelease) {
          errors.push("No release selected");
        }
        break;
      }

      case "DOWNLOADING": {
        // Download must be complete
        const downloadContext = item.stepContext as Record<string, unknown>;
        if (!downloadContext?.downloadComplete) {
          errors.push("Download not marked as complete");
        }
        break;
      }

      case "DOWNLOADED": {
        // File must exist and be validated
        const downloadedContext = item.stepContext as Record<string, unknown>;
        if (!downloadedContext?.fileValidated) {
          errors.push("File validation not performed");
        }
        if (!downloadedContext?.filePath) {
          errors.push("File path not set");
        }
        break;
      }

      case "ENCODING": {
        // Encoding must be complete
        const encodingContext = item.stepContext as Record<string, unknown>;
        if (!encodingContext?.encodingComplete) {
          errors.push("Encoding not marked as complete");
        }
        break;
      }

      case "ENCODED": {
        // Encoded file must be validated
        const encodedContext = item.stepContext as Record<string, unknown>;
        if (!encodedContext?.outputValidated) {
          errors.push("Output file validation not performed");
        }
        if (!encodedContext?.outputPath) {
          errors.push("Output path not set");
        }
        break;
      }

      case "DELIVERING": {
        // All deliveries must be complete
        const deliveringContext = item.stepContext as Record<string, unknown>;
        if (!deliveringContext?.allDeliveriesComplete) {
          errors.push("Not all deliveries marked as complete");
        }
        break;
      }

      case "COMPLETED":
      case "FAILED":
      case "CANCELLED":
        // Terminal states - no exit validation
        break;

      default:
        errors.push(`Unknown status: ${currentStatus}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate both entry and exit conditions for a transition
   */
  async validateTransition(
    item: ProcessingItem,
    fromStatus: ProcessingStatus,
    toStatus: ProcessingStatus
  ): Promise<ValidationResult> {
    // First validate exit from current status
    const exitValidation = await this.validateExit(item, fromStatus);
    if (!exitValidation.valid) {
      return {
        valid: false,
        errors: exitValidation.errors.map((e) => `Exit validation failed: ${e}`),
      };
    }

    // Then validate entry to new status
    const entryValidation = await this.validateEntry(item, toStatus);
    if (!entryValidation.valid) {
      return {
        valid: false,
        errors: entryValidation.errors.map((e) => `Entry validation failed: ${e}`),
      };
    }

    return { valid: true, errors: [] };
  }

  /**
   * Throw ValidationError if validation fails
   */
  async assertValid(
    item: ProcessingItem,
    status: ProcessingStatus,
    validationType: "entry" | "exit"
  ): Promise<void> {
    const validation =
      validationType === "entry"
        ? await this.validateEntry(item, status)
        : await this.validateExit(item, status);

    if (!validation.valid) {
      throw new ValidationError(
        item.id,
        status,
        validationType,
        `Validation failed: ${validation.errors.join(", ")}`
      );
    }
  }
}

export const validationFramework = new ValidationFramework();
