# Pipeline System Redesign - Design Document

## Executive Summary

Complete redesign of the media processing pipeline to address critical architectural flaws. The new system uses a unified `ProcessingItem` abstraction, event-driven state machine, and explicit orchestration to ensure reliable, observable, and recoverable media processing.

## Goals

1. **Reliability**: Never lose track of work in progress
2. **Observability**: Always know what's happening and why
3. **Recoverability**: Automatic retry with exponential backoff
4. **Atomicity**: State transitions are atomic and consistent
5. **Flexibility**: Steps can run in any logical order
6. **Simplicity**: Clear ownership and responsibilities

## Core Concepts

### ProcessingItem: Universal Work Unit

Every piece of work is a `ProcessingItem`, whether it's a movie or a single TV episode.

```typescript
interface ProcessingItem {
  id: string;
  requestId: string;

  // What we're processing
  type: 'MOVIE' | 'EPISODE';
  tmdbId: number;
  title: string;
  year?: number;
  season?: number;      // For episodes
  episode?: number;     // For episodes

  // Where we are in the pipeline
  status: ProcessingStatus;
  currentStep: string | null;

  // State for current step
  stepContext: Json;    // Step-specific data

  // Retry handling
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  nextRetryAt: DateTime | null;

  // Progress tracking
  progress: number;     // 0-100
  startedAt: DateTime;
  completedAt: DateTime | null;

  // External references
  downloadId: string | null;
  encodingJobId: string | null;

  // Metadata
  createdAt: DateTime;
  updatedAt: DateTime;
}

enum ProcessingStatus {
  PENDING = 'PENDING',
  SEARCHING = 'SEARCHING',
  FOUND = 'FOUND',
  DOWNLOADING = 'DOWNLOADING',
  DOWNLOADED = 'DOWNLOADED',
  ENCODING = 'ENCODING',
  ENCODED = 'ENCODED',
  DELIVERING = 'DELIVERING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}
```

**Key benefits:**
- Movie = 1 ProcessingItem
- TV Show (full series) = N ProcessingItems (one per episode)
- TV Show (single episode) = 1 ProcessingItem
- All items processed identically regardless of type

### Request: User Intent

A `MediaRequest` represents what the user wants, not how it's being processed.

```typescript
interface MediaRequest {
  id: string;
  type: 'MOVIE' | 'TV';
  tmdbId: number;
  title: string;
  year?: number;

  // For TV shows
  requestedSeasons: number[] | null;
  requestedEpisodes: Array<{season: number, episode: number}> | null;

  // Configuration
  targets: Array<{serverId: string, encodingProfileId?: string}>;

  // Aggregate status from ProcessingItems
  status: RequestStatus;
  progress: number;  // Average of all ProcessingItems

  // Statistics
  totalItems: number;
  completedItems: number;
  failedItems: number;

  createdAt: DateTime;
  updatedAt: DateTime;
}

enum RequestStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  PARTIAL = 'PARTIAL',      // Some items completed, some failed
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}
```

**Relationship:**
```
MediaRequest (1) ──→ (N) ProcessingItem
```

### State Machine: Deterministic Progression

Each ProcessingItem follows a strict state machine:

```
                                    ┌──────────┐
                                    │ PENDING  │
                                    └────┬─────┘
                                         │
                                         ↓
                                  ┌──────────┐
                           ┌──────┤SEARCHING │
                           │      └────┬─────┘
                           │           │
                           │           ↓
                           │      ┌──────────┐
                           │      │  FOUND   │
                           │      └────┬─────┘
                           │           │
                           │           ↓
                           │   ┌──────────────┐
                           │   │ DOWNLOADING  │
                           │   └──────┬───────┘
                           │          │
                           │          ↓
                           │   ┌──────────────┐
                           │   │ DOWNLOADED   │
                           │   └──────┬───────┘
                           │          │
                           │          ↓
                           │   ┌──────────────┐
                           │   │  ENCODING    │
                           │   └──────┬───────┘
                           │          │
                           │          ↓
                           │   ┌──────────────┐
                           │   │   ENCODED    │
                           │   └──────┬───────┘
                           │          │
                           │          ↓
                           │   ┌──────────────┐
                           │   │ DELIVERING   │
                           │   └──────┬───────┘
                           │          │
                           │          ↓
                           │   ┌──────────────┐
                           │   │  COMPLETED   │
                           │   └──────────────┘
                           │
                           │   Any step can transition to:
                           │
                           ├──→ ┌──────────┐
                           │    │  FAILED  │
                           │    └──────────┘
                           │
                           └──→ ┌──────────┐
                                │CANCELLED │
                                └──────────┘
```

**State transition rules:**
1. Transitions are atomic (database transaction)
2. Entry validation before transition
3. Exit validation after work complete
4. Automatic retry on transient failures
5. Idempotent operations

### Pipeline Orchestrator: Central Coordinator

The orchestrator owns the lifecycle of all ProcessingItems for a Request.

```typescript
class PipelineOrchestrator {
  // Start processing a request
  async start(requestId: string): Promise<void> {
    // 1. Load request
    const request = await this.loadRequest(requestId);

    // 2. Create ProcessingItems
    const items = await this.createProcessingItems(request);

    // 3. Start workers
    await this.startWorkers(items);

    // 4. Monitor completion
    await this.monitorProgress(requestId);
  }

  // Create ProcessingItems based on request type
  private async createProcessingItems(request: MediaRequest): Promise<ProcessingItem[]> {
    if (request.type === 'MOVIE') {
      return [this.createMovieItem(request)];
    } else {
      return this.createEpisodeItems(request);
    }
  }

  // Monitor all items until complete
  private async monitorProgress(requestId: string): Promise<void> {
    while (true) {
      const items = await this.getProcessingItems(requestId);

      // Check if all complete
      const allComplete = items.every(i =>
        i.status === 'COMPLETED' || i.status === 'FAILED' || i.status === 'CANCELLED'
      );

      if (allComplete) {
        await this.finalizeRequest(requestId);
        break;
      }

      // Update request aggregate status
      await this.updateRequestProgress(requestId, items);

      await sleep(5000);
    }
  }
}
```

### Workers: Step Executors

Workers poll for items in specific states and advance them through the pipeline.

```typescript
interface Worker {
  // Which status this worker processes
  readonly handlesStatus: ProcessingStatus;

  // Execute work for an item
  execute(item: ProcessingItem): Promise<WorkerResult>;

  // Validate item can be processed
  validate(item: ProcessingItem): Promise<boolean>;

  // Handle retries
  shouldRetry(item: ProcessingItem, error: Error): boolean;
  calculateBackoff(attempts: number): number;
}

class SearchWorker implements Worker {
  readonly handlesStatus = ProcessingStatus.PENDING;

  async execute(item: ProcessingItem): Promise<WorkerResult> {
    // 1. Transition to SEARCHING
    await this.transitionTo(item.id, ProcessingStatus.SEARCHING);

    try {
      // 2. Search indexers
      const release = await this.searchIndexers(item);

      if (!release) {
        return {
          status: 'retry',
          error: 'No releases found',
          retryAfter: this.calculateBackoff(item.attempts)
        };
      }

      // 3. Save release info
      await this.saveRelease(item.id, release);

      // 4. Transition to FOUND
      await this.transitionTo(item.id, ProcessingStatus.FOUND, {
        selectedRelease: release
      });

      return { status: 'success' };

    } catch (error) {
      if (this.shouldRetry(item, error)) {
        return {
          status: 'retry',
          error: error.message,
          retryAfter: this.calculateBackoff(item.attempts)
        };
      } else {
        return { status: 'failed', error: error.message };
      }
    }
  }

  private async transitionTo(
    itemId: string,
    status: ProcessingStatus,
    stepContext?: Json
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Atomic status update
      await tx.processingItem.update({
        where: { id: itemId },
        data: {
          status,
          stepContext: stepContext ?? Prisma.JsonNull,
          updatedAt: new Date()
        }
      });
    });
  }
}
```

**Worker types:**
- `SearchWorker`: PENDING → FOUND
- `DownloadWorker`: FOUND → DOWNLOADED
- `EncodeWorker`: DOWNLOADED → ENCODED
- `DeliverWorker`: ENCODED → COMPLETED

### Error Handling & Retry Strategy

**Retry categories:**

1. **Transient errors** (automatic retry):
   - Network timeouts
   - Indexer temporarily down
   - qBittorrent connection lost
   - Encoder offline

2. **Permanent errors** (no retry):
   - Invalid TMDB ID
   - File not found
   - Encoding format unsupported

3. **Rate limit errors** (retry with longer backoff):
   - Indexer rate limit
   - API quota exceeded

**Retry logic:**
```typescript
class RetryStrategy {
  shouldRetry(item: ProcessingItem, error: Error): boolean {
    // Max attempts reached?
    if (item.attempts >= item.maxAttempts) {
      return false;
    }

    // Classify error
    if (this.isPermanentError(error)) {
      return false;
    }

    return true;
  }

  calculateBackoff(attempts: number): number {
    // Exponential backoff: 1m, 2m, 4m, 8m, 16m, 30m (max)
    const minutes = Math.min(Math.pow(2, attempts), 30);
    return minutes * 60 * 1000;
  }

  private isPermanentError(error: Error): boolean {
    const permanent = [
      'TMDB_NOT_FOUND',
      'FILE_NOT_FOUND',
      'INVALID_FORMAT',
      'UNSUPPORTED_CODEC'
    ];
    return permanent.some(code => error.message.includes(code));
  }
}
```

### Validation Gates

Every state transition has validation:

```typescript
interface StateValidator {
  // Can we enter this state?
  validateEntry(item: ProcessingItem): Promise<ValidationResult>;

  // Can we exit this state?
  validateExit(item: ProcessingItem): Promise<ValidationResult>;
}

class EncodingStateValidator implements StateValidator {
  async validateEntry(item: ProcessingItem): Promise<ValidationResult> {
    // Must have downloaded file
    const download = await prisma.download.findUnique({
      where: { id: item.downloadId }
    });

    if (!download || download.status !== 'COMPLETED') {
      return { valid: false, reason: 'Download not completed' };
    }

    // Source file must exist
    const fileExists = await Bun.file(download.sourceFilePath).exists();
    if (!fileExists) {
      return { valid: false, reason: 'Source file not found' };
    }

    // File must be valid video
    const isValid = await this.validateVideoFile(download.sourceFilePath);
    if (!isValid) {
      return { valid: false, reason: 'Invalid video file' };
    }

    return { valid: true };
  }

  async validateExit(item: ProcessingItem): Promise<ValidationResult> {
    // Must have encoding job
    const job = await prisma.encoderAssignment.findUnique({
      where: { id: item.encodingJobId }
    });

    if (!job || job.status !== 'COMPLETED') {
      return { valid: false, reason: 'Encoding not completed' };
    }

    // Output file must exist
    const fileExists = await Bun.file(job.outputPath).exists();
    if (!fileExists) {
      return { valid: false, reason: 'Encoded file not found' };
    }

    // Output file must be valid and non-zero
    const stat = await Bun.file(job.outputPath).stat();
    if (stat.size === 0) {
      return { valid: false, reason: 'Encoded file is empty' };
    }

    return { valid: true };
  }
}
```

## Database Schema

### New Tables

```prisma
// Universal work unit
model ProcessingItem {
  id        String   @id @default(cuid())
  requestId String

  // What we're processing
  type      ProcessingType
  tmdbId    Int
  title     String
  year      Int?
  season    Int?      // For episodes only
  episode   Int?      // For episodes only

  // Pipeline state
  status       ProcessingStatus
  currentStep  String?
  stepContext  Json     @default("{}")

  // Retry handling
  attempts     Int      @default(0)
  maxAttempts  Int      @default(5)
  lastError    String?
  nextRetryAt  DateTime?

  // Progress
  progress     Int      @default(0)
  startedAt    DateTime @default(now())
  completedAt  DateTime?

  // External references
  downloadId     String?
  encodingJobId  String?

  // Relations
  request   MediaRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  download  Download?    @relation(fields: [downloadId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([requestId])
  @@index([status])
  @@index([status, nextRetryAt])
  @@index([requestId, status])
}

enum ProcessingType {
  MOVIE
  EPISODE
}

enum ProcessingStatus {
  PENDING
  SEARCHING
  FOUND
  DOWNLOADING
  DOWNLOADED
  ENCODING
  ENCODED
  DELIVERING
  COMPLETED
  FAILED
  CANCELLED
}

// Updated MediaRequest (simplified)
model MediaRequest {
  id       String    @id @default(cuid())
  type     MediaType
  tmdbId   Int
  title    String
  year     Int?

  // TV show specifics
  requestedSeasons  Json?
  requestedEpisodes Json?

  // Configuration
  targets  Json  // Array of {serverId, encodingProfileId}

  // Aggregate status (computed from ProcessingItems)
  status          RequestStatus
  progress        Int      @default(0)
  totalItems      Int      @default(0)
  completedItems  Int      @default(0)
  failedItems     Int      @default(0)

  // Relations
  processingItems ProcessingItem[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum RequestStatus {
  PENDING
  PROCESSING
  COMPLETED
  PARTIAL
  FAILED
  CANCELLED
}
```

### Removed Tables

- `PipelineExecution` - replaced by ProcessingItem tracking
- `StepExecution` - state is in ProcessingItem.stepContext
- `TvEpisode` - replaced by ProcessingItem with type=EPISODE

## Implementation Phases

### Phase 1: Database Migration (Week 1)

1. Create new tables (ProcessingItem)
2. Update MediaRequest schema
3. Write migration script to convert existing data:
   - MediaRequest (movie) → 1 ProcessingItem
   - MediaRequest (tv) + TvEpisode → N ProcessingItems
4. Create indexes for worker queries

### Phase 2: Core Abstractions (Week 1-2)

1. `ProcessingItem` model and repository
2. `PipelineOrchestrator` skeleton
3. State machine implementation
4. Validation framework
5. Retry strategy

### Phase 3: Workers (Week 2-3)

1. `SearchWorker`
   - Reuse existing indexer service
   - Add validation gates
   - Add retry logic

2. `DownloadWorker`
   - Reuse existing download manager
   - Add file validation
   - Add progress tracking

3. `EncodeWorker`
   - Reuse existing encoder dispatch
   - Add file existence checks
   - Add output validation

4. `DeliverWorker`
   - Reuse existing delivery queue
   - Add atomic multi-server delivery
   - Add rollback on partial failure

### Phase 4: Orchestration (Week 3-4)

1. Worker polling loops
2. Request progress aggregation
3. Dead letter queue
4. Metrics and monitoring

### Phase 5: API Integration (Week 4)

1. Update tRPC routers to use new system
2. Backward compatibility layer
3. Migration tool for in-flight requests

### Phase 6: Testing & Rollout (Week 5)

1. Unit tests for each worker
2. Integration tests for full pipeline
3. Load testing
4. Gradual rollout with feature flag

## Migration Strategy

### Dual-Run Period

Run both old and new systems in parallel:

1. New requests use new pipeline
2. Old in-flight requests continue on old pipeline
3. Monitor both for 1 week
4. Cut over completely to new system
5. Remove old pipeline code

### Rollback Plan

If issues arise:
1. Feature flag to disable new pipeline
2. All new requests route to old pipeline
3. Fix issues in new system
4. Re-enable gradually

## Observability

### Metrics

```typescript
// Worker metrics
worker.items_processed_total{worker="search", status="success"}
worker.items_processed_total{worker="search", status="failed"}
worker.processing_duration_seconds{worker="search", percentile="p95"}

// Pipeline metrics
pipeline.items_by_status{status="encoding"}
pipeline.requests_by_status{status="processing"}
pipeline.stuck_items_total{status="downloading", age="1h"}

// Error metrics
pipeline.errors_total{worker="encode", error_type="transient"}
pipeline.retries_total{worker="search"}
```

### Logging

Structured logs with correlation IDs:

```typescript
logger.info('Processing item advanced', {
  itemId: item.id,
  requestId: item.requestId,
  fromStatus: 'DOWNLOADING',
  toStatus: 'DOWNLOADED',
  worker: 'DownloadWorker',
  duration: 1234,
  downloadId: item.downloadId
});
```

### Alerts

1. Items stuck in same status > 1 hour
2. Error rate > 10% for any worker
3. No items processed in 5 minutes
4. Download queue backed up > 50 items
5. Encoder offline > 5 minutes

## Benefits Over Current System

| Issue | Current System | New System |
|-------|---------------|------------|
| TV episode tracking | TvEpisode table, complex relationships | ProcessingItem, uniform abstraction |
| Parallel execution | Fire-and-forget branches | Orchestrator tracks all work |
| Error handling | Swallowed errors, no retries | Automatic retry with backoff |
| State consistency | Race conditions, overwrites | Atomic transactions |
| Recovery | Manual intervention required | Automatic retry until success |
| Observability | Scattered logs | Structured metrics and logs |
| Testing | Hard to test due to complexity | Each worker independently testable |

## Success Criteria

1. **Reliability**: 99% of requests complete successfully
2. **Recovery**: 95% of transient failures recover automatically
3. **Observability**: 100% of state transitions logged
4. **Performance**: Request completion time < 2x current system
5. **Zero data loss**: No work lost due to crashes/restarts

## Next Steps

1. Review and approve this design
2. Create database migration
3. Implement core abstractions
4. Build first worker (SearchWorker)
5. Test end-to-end with single movie
6. Iterate and expand to all workers
