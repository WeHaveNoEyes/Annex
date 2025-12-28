import type { ProcessingStatus } from "@prisma/client";

/**
 * State transition map defining valid status transitions
 */
const STATE_TRANSITIONS: Record<ProcessingStatus, ProcessingStatus[]> = {
  PENDING: ["SEARCHING", "CANCELLED"],
  SEARCHING: ["FOUND", "FAILED", "CANCELLED"],
  FOUND: ["DOWNLOADING", "FAILED", "CANCELLED"],
  DOWNLOADING: ["DOWNLOADED", "FAILED", "CANCELLED"],
  DOWNLOADED: ["ENCODING", "FAILED", "CANCELLED"],
  ENCODING: ["ENCODED", "FAILED", "CANCELLED"],
  ENCODED: ["DELIVERING", "FAILED", "CANCELLED"],
  DELIVERING: ["COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: [], // Terminal state
  FAILED: ["PENDING"], // Can be retried by resetting to PENDING
  CANCELLED: [], // Terminal state
};

/**
 * State metadata for each status
 */
interface StateMetadata {
  description: string;
  isTerminal: boolean;
  requiresValidation: boolean;
  allowsRetry: boolean;
}

const STATE_METADATA: Record<ProcessingStatus, StateMetadata> = {
  PENDING: {
    description: "Waiting to begin processing",
    isTerminal: false,
    requiresValidation: false,
    allowsRetry: false,
  },
  SEARCHING: {
    description: "Searching for releases",
    isTerminal: false,
    requiresValidation: false,
    allowsRetry: true,
  },
  FOUND: {
    description: "Release found and selected",
    isTerminal: false,
    requiresValidation: true,
    allowsRetry: false,
  },
  DOWNLOADING: {
    description: "Downloading content",
    isTerminal: false,
    requiresValidation: false,
    allowsRetry: true,
  },
  DOWNLOADED: {
    description: "Download complete, file validated",
    isTerminal: false,
    requiresValidation: true,
    allowsRetry: false,
  },
  ENCODING: {
    description: "Encoding in progress",
    isTerminal: false,
    requiresValidation: false,
    allowsRetry: true,
  },
  ENCODED: {
    description: "Encoding complete, file validated",
    isTerminal: false,
    requiresValidation: true,
    allowsRetry: false,
  },
  DELIVERING: {
    description: "Delivering to storage servers",
    isTerminal: false,
    requiresValidation: false,
    allowsRetry: true,
  },
  COMPLETED: {
    description: "Successfully completed all steps",
    isTerminal: true,
    requiresValidation: false,
    allowsRetry: false,
  },
  FAILED: {
    description: "Permanent failure",
    isTerminal: true,
    requiresValidation: false,
    allowsRetry: true,
  },
  CANCELLED: {
    description: "Cancelled by user",
    isTerminal: true,
    requiresValidation: false,
    allowsRetry: false,
  },
};

export class StateTransitionError extends Error {
  constructor(
    public readonly fromStatus: ProcessingStatus,
    public readonly toStatus: ProcessingStatus,
    message?: string
  ) {
    super(message || `Invalid transition from ${fromStatus} to ${toStatus}`);
    this.name = "StateTransitionError";
  }
}

export class StateMachine {
  /**
   * Check if a status transition is valid
   */
  canTransition(from: ProcessingStatus, to: ProcessingStatus): boolean {
    const allowedTransitions = STATE_TRANSITIONS[from];
    return allowedTransitions.includes(to);
  }

  /**
   * Validate and get next status, throwing error if invalid
   */
  transition(from: ProcessingStatus, to: ProcessingStatus): ProcessingStatus {
    if (!this.canTransition(from, to)) {
      throw new StateTransitionError(
        from,
        to,
        `Cannot transition from ${from} to ${to}. Allowed transitions: ${STATE_TRANSITIONS[from].join(", ")}`
      );
    }
    return to;
  }

  /**
   * Get all valid next states from current state
   */
  getNextStates(current: ProcessingStatus): ProcessingStatus[] {
    return STATE_TRANSITIONS[current];
  }

  /**
   * Check if a status is terminal (no further transitions)
   */
  isTerminal(status: ProcessingStatus): boolean {
    return STATE_METADATA[status].isTerminal;
  }

  /**
   * Check if a status requires validation before transitioning
   */
  requiresValidation(status: ProcessingStatus): boolean {
    return STATE_METADATA[status].requiresValidation;
  }

  /**
   * Check if a status can be retried
   */
  canRetry(status: ProcessingStatus): boolean {
    return STATE_METADATA[status].allowsRetry;
  }

  /**
   * Get metadata for a status
   */
  getMetadata(status: ProcessingStatus): StateMetadata {
    return STATE_METADATA[status];
  }

  /**
   * Get the natural next status in the pipeline flow
   */
  getNextPipelineStatus(current: ProcessingStatus): ProcessingStatus | null {
    switch (current) {
      case "PENDING":
        return "SEARCHING";
      case "SEARCHING":
        return "FOUND";
      case "FOUND":
        return "DOWNLOADING";
      case "DOWNLOADING":
        return "DOWNLOADED";
      case "DOWNLOADED":
        return "ENCODING";
      case "ENCODING":
        return "ENCODED";
      case "ENCODED":
        return "DELIVERING";
      case "DELIVERING":
        return "COMPLETED";
      default:
        return null; // Terminal or error state
    }
  }

  /**
   * Get the error status (always FAILED)
   */
  getErrorStatus(): ProcessingStatus {
    return "FAILED";
  }

  /**
   * Get the cancellation status (always CANCELLED)
   */
  getCancelledStatus(): ProcessingStatus {
    return "CANCELLED";
  }
}

export const stateMachine = new StateMachine();
