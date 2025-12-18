// Pipeline Context - Shared data structure passed between pipeline steps
// Accumulates data as the pipeline executes, allowing steps to access results from previous steps

import type { MediaType } from '@prisma/client';

export interface PipelineContext {
  // Request details
  requestId: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  year: number;

  // TV-specific fields
  requestedSeasons?: number[];
  requestedEpisodes?: Array<{ season: number; episode: number }>;

  // Target servers with optional encoding profile overrides
  targets: Array<{
    serverId: string;
    encodingProfileId?: string;
  }>;

  // Step outputs (accumulated as pipeline executes)
  search?: {
    selectedRelease: {
      title: string;
      size: number;
      seeders: number;
      indexer: string;
      magnetUri: string;
      publishDate?: string;
      quality?: string;
      source?: string;
      codec?: string;
    };
    alternativeReleases?: unknown[];
    qualityMet?: boolean;
  };

  download?: {
    torrentHash: string;
    sourceFilePath: string;
    contentPath?: string;
    size?: number;
  };

  encode?: {
    encodedFiles: Array<{
      profileId: string;
      path: string;
      targetServerIds: string[];
      size?: number;
      compressionRatio?: number;
    }>;
  };

  deliver?: {
    deliveredServers: string[];
    failedServers?: Array<{
      serverId: string;
      error: string;
    }>;
  };

  approval?: {
    approvalId: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED' | 'TIMEOUT';
    processedBy?: string;
    comment?: string;
  };

  notification?: {
    sent: boolean;
    provider?: string;
    error?: string;
  };

  // Additional metadata that steps can store
  [key: string]: unknown;
}

export interface ConditionRule {
  field: string; // Context field path (e.g., "search.selectedRelease.quality")
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'not_in' | 'contains' | 'matches';
  value: unknown;
  logicalOp?: 'AND' | 'OR'; // For chaining multiple conditions
  conditions?: ConditionRule[]; // Nested conditions
}

export interface StepOutput {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  shouldSkip?: boolean; // If true, mark step as skipped and continue
  shouldPause?: boolean; // If true, pause execution (used by ApprovalStep)
}
