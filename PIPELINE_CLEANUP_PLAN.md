# Pipeline Cleanup & TvEpisode Migration Plan

## Executive Summary

This plan addresses technical debt in the pipeline system, with the primary goal of eliminating the TvEpisode dual-state model and migrating fully to ProcessingItems. Additionally, it tackles performance issues and code organization problems identified in the audit.

**Scope:** 15 files, 66+ database queries, 6-7 schema changes
**Risk Level:** HIGH - Deep integration with TV pipeline and UI
**Estimated Effort:** ~2-3 weeks of focused development

---

## Phase 0: Preparation & Schema Enhancement

**Goal:** Add missing fields to ProcessingItem to support full TvEpisode migration

### Tasks

1. **Add fields to ProcessingItem model** (schema.prisma)
   ```prisma
   model ProcessingItem {
     // ... existing fields ...

     // Episode-specific tracking fields
     sourceFilePath   String?    // Path to extracted episode file
     airDate          DateTime?  // When episode airs (for AWAITING status)
     downloadedAt     DateTime?  // When source became available
     encodedAt        DateTime?  // When encoding completed
     deliveredAt      DateTime?  // When delivered to all targets
     qualityMet       Boolean    @default(false)
     availableReleases Json?     // Lower-quality alternatives
   }
   ```

2. **Create migration**
   ```bash
   bunx prisma migrate dev --name add_episode_tracking_fields
   ```

3. **Backfill existing data**
   - Create script to copy data from TvEpisode to ProcessingItem for existing records
   - Map TvEpisode.status → ProcessingStatus enum
   - Copy all tracking timestamps and metadata

**Files Changed:** 1
**Database Migrations:** 1
**Risk:** LOW (additive changes only)

---

## Phase 1: Extract DownloadProgressWorker

**Goal:** Move download progress syncing from index.ts to proper worker

### Current Problem

Lines 348-527 in index.ts contain 200+ lines of download progress syncing that:
- Violates separation of concerns
- Makes main server file bloated (untestable)
- Runs every 500ms with NO debouncing
- Could exhaust Prisma connection pool

### Tasks

1. **Create DownloadProgressWorker**
   - File: `packages/server/src/services/pipeline/workers/DownloadProgressWorker.ts`
   - Extends BaseWorker
   - Processes items in DOWNLOADING status
   - Updates progress from qBittorrent
   - Adds debouncing (only write if changed >1%)

2. **Implement debouncing logic**
   ```typescript
   private lastProgressMap = new Map<string, number>();

   private shouldUpdateProgress(itemId: string, newProgress: number): boolean {
     const lastProgress = this.lastProgressMap.get(itemId) ?? 0;
     const diff = Math.abs(newProgress - lastProgress);

     if (diff >= 1) {  // Only update if changed by 1% or more
       this.lastProgressMap.set(itemId, newProgress);
       return true;
     }
     return false;
   }
   ```

3. **Register with WorkerManager**
   - Add to worker list
   - Set pollInterval to 5000ms (not 500ms!)

4. **Remove from index.ts**
   - Delete lines 348-527
   - Clean up related imports

**Files Changed:** 3 (new worker, WorkerManager, index.ts)
**Risk:** MEDIUM (core download tracking functionality)

---

## Phase 2: Migrate Core Pipeline Services

**Goal:** Replace TvEpisode queries with ProcessingItem in pipeline steps

### Priority Order

#### 2.1: PipelineOrchestrator
- Already has ProcessingItem support
- Remove `syncTvEpisodeStatus()` method (lines 342-383)
- Stop creating TvEpisode records in `createRequest()` (line 105)

**Files:** 1
**Risk:** LOW (already using ProcessingItems for state)

#### 2.2: encoderDispatch.ts
- Remove `syncEpisodeProgress()` (lines 489-652) - marked as LEGACY
- Update `syncProcessingItemProgress()` to be the only method
- Remove TvEpisode progress syncing (line 722)

**Files:** 1
**Risk:** LOW (replacement already exists)

#### 2.3: Pipeline Steps (SearchStep, DownloadStep, EncodeStep, DeliverStep)
- Replace all TvEpisode queries with ProcessingItem queries
- Update status transitions to use ProcessingStatus enum
- Map episode-specific fields (sourceFilePath, downloadedAt, etc.)

**SearchStep changes:**
- Lines 80, 96, 322, 404, 443, 469, 781, 848 - Replace TvEpisode queries
- Use ProcessingItem.status instead of TvEpisodeStatus

**DownloadStep changes:**
- Lines 75, 109, 448, 463, 479, 856, 872, 900 - Replace queries
- Update sourceFilePath on ProcessingItem instead of TvEpisode

**EncodeStep changes:**
- Lines 515-1039 (12 queries) - Replace with ProcessingItem updates
- Use encodedAt field on ProcessingItem

**DeliverStep changes:**
- Lines 294, 344, 558 - Replace with ProcessingItem updates
- Use deliveredAt field on ProcessingItem

**Files:** 4
**Risk:** HIGH (core pipeline logic)

#### 2.4: downloadManager.ts
- Replace episode linking logic (lines 750, 794, 841, 1164, 1221, 1350)
- Link Downloads to ProcessingItems instead of TvEpisodes
- Use ProcessingItem.sourceFilePath instead of TvEpisode.sourceFilePath

**Files:** 1
**Risk:** MEDIUM (download tracking)

---

## Phase 3: Migrate UI Endpoint

**Goal:** Update requests.ts getEpisodeStatuses to use ProcessingItems

### Current Implementation (lines 946-1141)

Queries TvEpisode and returns:
- Episode status, progress, error
- Download progress from qBittorrent
- Air dates, timestamps
- Library availability
- Pending encoder status

### Migration Strategy

1. **Replace TvEpisode query with ProcessingItem query**
   ```typescript
   const episodes = await prisma.processingItem.findMany({
     where: {
       requestId: input.requestId,
       type: "EPISODE"
     },
     orderBy: [{ season: "asc" }, { episode: "asc" }],
   });
   ```

2. **Map ProcessingStatus to UI status**
   - Already have this mapping from existing code
   - Use the same `fromTvEpisodeStatus()` logic but for ProcessingStatus

3. **Use new timestamp fields**
   - downloadedAt → from ProcessingItem.downloadedAt
   - encodedAt → from ProcessingItem.encodedAt
   - deliveredAt → from ProcessingItem.deliveredAt

4. **Test thoroughly**
   - UI episode list displays correctly
   - Progress updates work
   - Library availability shows correctly
   - Pending encoder status accurate

**Files:** 1 (requests.ts)
**Risk:** HIGH (UI dependency)

---

## Phase 4: Migrate Recovery & Monitoring Services

**Goal:** Update background services to use ProcessingItems

### Services to Update

#### 4.1: deliveryQueue.ts
- Lines 74, 116, 127, 141, 167 - Replace TvEpisode with ProcessingItem
- Update deliveredAt timestamps

**Files:** 1
**Risk:** MEDIUM

#### 4.2: deliveryRecovery.ts
- Lines 176, 237 - Replace TvEpisode with ProcessingItem
- Find failed deliveries by ProcessingItem.status = "FAILED"

**Files:** 1
**Risk:** MEDIUM

#### 4.3: downloadExtractionRecovery.ts
- Line 23 - Replace TvEpisode with ProcessingItem
- Find stuck downloads by ProcessingItem.status = "DOWNLOADING"

**Files:** 1
**Risk:** LOW (already have DownloadRecoveryWorker)

#### 4.4: RSS/IRC Announce Services
- rssAnnounce.ts (lines 326, 583, 633, 644, 653)
- ircAnnounce.ts (lines 415, 677, 727, 738, 747)
- Replace TvEpisode with ProcessingItem
- Use qualityMet and availableReleases fields

**Files:** 2
**Risk:** LOW (monitoring only)

#### 4.5: downloadHelper.ts
- Lines 77, 93, 115 - Replace TvEpisode with ProcessingItem
- Update episode creation logic

**Files:** 1
**Risk:** LOW

---

## Phase 5: Remove Legacy Code

**Goal:** Delete TvEpisode model and all legacy pipeline code

### Tasks

1. **Remove TvEpisode model from schema**
   ```prisma
   // DELETE entire TvEpisode model block
   ```

2. **Remove foreign key relations**
   - Download.tvEpisodes → ProcessingItems (already exists)
   - MediaRequest.tvEpisodes → ProcessingItems (already exists)
   - PipelineExecution.episode → Remove or link to ProcessingItem

3. **Delete legacy PipelineExecutor methods**
   - Remove `executeNextStep()` (lines 248-316)
   - Remove StepExecution table if unused

4. **Remove TvEpisodeStatus enum**
   - Only use ProcessingStatus

5. **Create migration**
   ```bash
   bunx prisma migrate dev --name remove_tv_episode_table
   ```

6. **Clean up imports**
   - Remove TvEpisodeStatus imports across codebase
   - Update test mocks

**Files:** ~15+ (all files that imported TvEpisode/TvEpisodeStatus)
**Database Migrations:** 1
**Risk:** MEDIUM (breaking change, requires full migration first)

---

## Phase 6: Performance Optimizations

**Goal:** Address high-frequency DB updates and connection pool exhaustion

### Tasks

1. **Add debouncing to all progress updates**
   - DownloadProgressWorker (done in Phase 1)
   - EncoderDispatch.syncProcessingItemProgress
   - Any other frequent update loops

2. **Make polling intervals configurable**
   ```typescript
   // Environment variables
   ANNEX_DOWNLOAD_POLL_INTERVAL=5000
   ANNEX_ENCODER_POLL_INTERVAL=5000
   ANNEX_WORKER_POLL_INTERVAL=5000
   ```

3. **Monitor connection pool usage**
   - Add metrics for active connections
   - Adjust pool size if needed (currently 80)
   - Consider connection pooling strategy (PgBouncer?)

4. **Optimize high-frequency queries**
   - Add database indexes where needed
   - Consider caching for frequently accessed data
   - Batch updates where possible

**Files:** 5-10
**Risk:** LOW (performance improvements)

---

## Phase 7: Additional Cleanup

**Goal:** Address remaining audit items

### Tasks

1. **Consolidate worker registration** (index.ts)
   - Create `initializeWorkers()` function
   - Move all scheduler.register() calls to one place
   - Clean up index.ts further

2. **Convert recovery services to BaseWorker pattern**
   - failedJobRecovery → FailedJobRecoveryWorker
   - encodingRecovery → EncodingRecoveryWorker
   - deliveryRecovery → DeliveryRecoveryWorker
   - Register with WorkerManager

3. **Split PipelineExecutor**
   - LegacyPipelineExecutor (old sequential system)
   - TreePipelineExecutor (new tree-based system)
   - Or just remove legacy entirely if unused

4. **Implement pending TODOs**
   - index.ts:792 - Cancel/delete torrents in delete handler
   - ApprovalService - Resuming pipeline execution
   - auth.ts - Encrypt Plex/Emby tokens

**Files:** 10+
**Risk:** LOW-MEDIUM

---

## Testing Strategy

### Unit Tests
- New workers (DownloadProgressWorker, etc.)
- ProcessingItem field migrations
- Status mapping functions

### Integration Tests
- Full TV show pipeline flow with ProcessingItems only
- Movie pipeline (already uses ProcessingItems)
- UI episode display
- Progress updates
- Recovery systems

### Manual Testing
- Create new TV request → verify episodes display
- Monitor download progress → verify updates
- Check encoding progress → verify UI updates
- Test delivery → verify timestamps
- Test error states → verify error display

---

## Rollout Plan

### Stage 1: Schema & Workers (Phases 0-1)
- Add ProcessingItem fields
- Extract DownloadProgressWorker
- Deploy and monitor
- **Rollback:** Revert migrations, restore index.ts

### Stage 2: Core Pipeline (Phases 2-3)
- Migrate pipeline steps
- Migrate UI endpoint
- Keep TvEpisode table (no writes, read-only for rollback)
- Deploy and monitor heavily
- **Rollback:** Restore TvEpisode writes, revert queries

### Stage 3: Recovery & Cleanup (Phases 4-7)
- Migrate remaining services
- Remove TvEpisode table
- Performance optimizations
- Final cleanup
- **Rollback:** Not possible after TvEpisode deletion

---

## Success Criteria

- ✅ All TV requests use ProcessingItems exclusively
- ✅ UI displays episode statuses correctly
- ✅ Progress updates work for download/encode/deliver
- ✅ No TvEpisode queries in codebase
- ✅ Database has no TvEpisode table
- ✅ Download progress updates run at 5s intervals (not 500ms)
- ✅ Connection pool usage stays under 50 connections
- ✅ All workers follow BaseWorker pattern
- ✅ index.ts under 200 lines (currently ~800)

---

## Risk Mitigation

### High-Risk Items
1. **UI episode display breaking**
   - Mitigation: Extensive manual testing, gradual rollout
   - Rollback: Keep TvEpisode read-only until fully verified

2. **Progress tracking regression**
   - Mitigation: Monitor logs for missing updates
   - Rollback: Restore old progress sync temporarily

3. **State desync during migration**
   - Mitigation: Dual-write period, data validation scripts
   - Rollback: Restore TvEpisode as source of truth

### Medium-Risk Items
1. **Performance degradation**
   - Mitigation: Load testing before/after
   - Rollback: Revert debouncing changes

2. **Recovery system failures**
   - Mitigation: Test recovery on staging data
   - Rollback: Restore old recovery services

---

## Timeline Estimate

- **Phase 0:** 2-3 days (schema changes, migration scripts)
- **Phase 1:** 2-3 days (extract worker, debouncing)
- **Phase 2:** 5-7 days (core pipeline migration)
- **Phase 3:** 3-4 days (UI endpoint migration, testing)
- **Phase 4:** 3-4 days (recovery services)
- **Phase 5:** 2-3 days (remove TvEpisode, cleanup)
- **Phase 6:** 2-3 days (performance optimizations)
- **Phase 7:** 3-4 days (additional cleanup)

**Total:** 22-31 days (~3-4 weeks)

---

## Next Steps

1. Review and approve this plan
2. Create GitHub project or issue tracker
3. Begin Phase 0: Schema enhancement
4. Set up monitoring/metrics for migration progress
5. Create rollback procedures for each phase
