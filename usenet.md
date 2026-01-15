# Usenet Support Implementation Plan

## Overview

Add Usenet download support (SABnzbd and NZBGet) alongside existing qBittorrent, with automatic routing based on release type and global priority-based indexer ranking.

## Requirements

1. Support both SABnzbd and NZBGet download clients
2. Allow multiple simultaneous clients (qBittorrent for torrents + Usenet client for NZBs)
3. Mix Usenet and torrent indexer results using global priority ranking
4. Automatically route releases to correct client based on type

## Architecture

### 1. Download Client Abstraction

**IDownloadClient Interface** - Common contract for all download clients
- `addDownload()` - Add via URL or file data
- `getProgress()` - Get download status
- `pauseDownload()`, `resumeDownload()`, `deleteDownload()`
- `testConnection()` - Verify connectivity
- `supportsType()` - Check if client supports "torrent" or "nzb"

**Client Implementations:**
- `QBittorrentClient` - Refactored from existing DownloadService
- `SABnzbdClient` - JSON API integration
- `NZBGetClient` - JSON-RPC integration

### 2. Database Schema

**New Model: DownloadClient**
```prisma
model DownloadClient {
  id               String   @id @default(cuid())
  name             String   @unique
  type             DownloadClientType  // QBITTORRENT | SABNZBD | NZBGET
  url              String
  username         String?
  priority         Int      @default(50)  // 1-100, higher = preferred
  enabled          Boolean  @default(true)
  supportedTypes   String[] // ["torrent"] or ["nzb"]
  baseDir          String?  // Path mapping

  isHealthy        Boolean  @default(true)
  lastHealthCheck  DateTime?
  lastError        String?

  totalDownloads   Int      @default(0)
  activeDownloads  Int      @default(0)

  downloads        Download[]
}

enum DownloadClientType {
  QBITTORRENT
  SABNZBD
  NZBGET
}
```

**Update Download Model:**
- Add `downloadClientId` field (relation to DownloadClient)
- Add `clientHash` field (generic hash/ID, replaces torrentHash semantically)
- Keep `torrentHash` for backward compatibility

### 3. Client Manager

**DownloadClientManager** - Orchestrates client selection

**Client Selection Logic:**
1. Detect release type from `magnetUri`, `downloadUrl` extension, or indexer type
2. Filter clients by type support, enabled status, and health
3. Sort by priority (descending)
4. Return highest priority match

**Release Type Detection:**
- Has `magnetUri` → torrent
- `downloadUrl` contains `.nzb` or `/nzb/` → nzb
- Indexer type is NEWZNAB → nzb
- Default to torrent

### 4. Service Integration

**DownloadManager Updates:**
- Use `DownloadClientManager.selectClientForRelease()` to pick client
- Call `client.addDownload()` with magnet URI or fetched file data
- Store `downloadClientId` and `clientHash` in Download record

**DownloadWorker Updates:**
- Load client from Download.downloadClientId
- Fallback to default torrent client for legacy downloads
- Call `client.getProgress()` for monitoring

**IndexerService Enhancement:**
- Add `releaseType` field to Release objects
- Set based on Newznab vs Torznab indexer type

### 5. API Layer

**New tRPC Router: downloadClients**
- `list` - Get all clients with status
- `get` - Get single client with credentials
- `create` - Create new client, store credentials in secrets
- `update` - Update client config
- `delete` - Remove client
- `test` - Test connection to client

**Credentials Storage:**
- Store passwords/API keys in secrets service
- Format: `downloadClient.{clientId}.password` or `downloadClient.{clientId}.apiKey`

### 6. Migration Strategy

**Backward Compatibility:**
- Auto-create default qBittorrent client from existing env vars (`QBITTORRENT_*`)
- Backfill existing Download records with `downloadClientId` pointing to default client
- Support optional env vars for SABnzbd and NZBGet to bootstrap default clients

**Migration Script:** `migrate.ts`
- Run on server startup
- Check if DownloadClient table is empty
- Create clients from env vars
- Link existing downloads

## Implementation Phases

### Phase 1: Foundation
- [ ] Create DownloadClient Prisma model
- [ ] Write database migration
- [ ] Define IDownloadClient interface
- [ ] Create DownloadClientManager skeleton
- [ ] Run migration on dev database

### Phase 2: QBittorrent Refactor
- [ ] Refactor DownloadService → QBittorrentClient
- [ ] Implement IDownloadClient interface
- [ ] Update existing download flow to use new client
- [ ] Test with existing torrents

### Phase 3: SABnzbd Client
- [ ] Implement SABnzbdClient
- [ ] Map SABnzbd API to IDownloadClient methods
- [ ] Handle status mapping (Downloading, Paused, Extracting, etc.)
- [ ] Test connection and NZB adding

### Phase 4: NZBGet Client
- [ ] Implement NZBGetClient
- [ ] Handle JSON-RPC protocol
- [ ] Map NZBGet states to common DownloadState
- [ ] Test connection and NZB adding

### Phase 5: Service Integration
- [ ] Update DownloadManager to use client manager
- [ ] Update DownloadWorker for multi-client progress tracking
- [ ] Add release type detection to IndexerService
- [ ] Create and test migration script
- [ ] Update server startup to run migration

### Phase 6: API Layer
- [ ] Create downloadClients tRPC router
- [ ] Implement CRUD endpoints
- [ ] Add test connection endpoint
- [ ] Update app router

### Phase 7: UI Components
- [ ] Create download clients settings page
- [ ] Add client list view with status indicators
- [ ] Build add/edit client form
- [ ] Add test connection button
- [ ] Implement enable/disable toggle

### Phase 8: Testing
- [ ] End-to-end test: Create request with mixed torrent/NZB results
- [ ] Verify torrent routes to qBittorrent
- [ ] Verify NZB routes to SABnzbd/NZBGet
- [ ] Test migration from legacy env vars
- [ ] Test client priority switching

## Critical Files

**Database:**
- `/packages/server/prisma/schema.prisma` - DownloadClient model
- `/packages/server/prisma/migrations/xxx_add_download_clients.sql` - Migration

**Core Services:**
- `/packages/server/src/services/downloadClients/IDownloadClient.ts` - Interface
- `/packages/server/src/services/downloadClients/DownloadClientManager.ts` - Manager
- `/packages/server/src/services/downloadClients/QBittorrentClient.ts` - qBittorrent impl
- `/packages/server/src/services/downloadClients/SABnzbdClient.ts` - SABnzbd impl
- `/packages/server/src/services/downloadClients/NZBGetClient.ts` - NZBGet impl
- `/packages/server/src/services/downloadClients/migrate.ts` - Migration script

**Integration:**
- `/packages/server/src/services/downloadManager.ts` - Client selection
- `/packages/server/src/services/pipeline/workers/DownloadWorker.ts` - Multi-client monitoring
- `/packages/server/src/services/indexer.ts` - Release type detection

**API:**
- `/packages/server/src/routers/downloadClients.ts` - tRPC router
- `/packages/server/src/routers/index.ts` - Router registration

**UI:**
- `/packages/client/src/pages/Settings/DownloadClients.tsx` - Management page
- `/packages/client/src/components/DownloadClientForm.tsx` - Add/edit form
- `/packages/client/src/components/DownloadClientCard.tsx` - Client card

## SABnzbd API Reference

**Base URL:** `http://host:port/api`

**Key Endpoints:**
- `GET /api?mode=version&apikey={key}&output=json` - Test connection
- `POST /api?mode=addfile&apikey={key}` - Add NZB (multipart form)
- `GET /api?mode=queue&apikey={key}&output=json` - Get active downloads
- `GET /api?mode=history&apikey={key}&output=json` - Get completed
- `GET /api?mode=queue&name=pause&value={nzo_id}&apikey={key}` - Pause
- `GET /api?mode=queue&name=resume&value={nzo_id}&apikey={key}` - Resume
- `GET /api?mode=queue&name=delete&value={nzo_id}&apikey={key}` - Delete

**Status Mapping:**
- "Downloading" → downloading
- "Paused" → paused
- "Extracting" → extracting
- "Queued" → queued
- "Completed" → complete
- "Failed" → error

**Unique ID:** `nzo_id` (returned from addfile)

## NZBGet API Reference

**Base URL:** `http://host:port/jsonrpc`
**Auth:** HTTP Basic Auth

**Request Format:**
```json
{
  "version": "1.1",
  "method": "methodName",
  "params": [...],
  "id": 1
}
```

**Key Methods:**
- `version()` - Get version
- `listgroups()` - Get download queue
- `history()` - Get completed downloads
- `append(nzbfilename, nzbcontent, category, priority, ...)` - Add NZB (base64)
- `editqueue("GroupPause", "", nzbid)` - Pause
- `editqueue("GroupResume", "", nzbid)` - Resume
- `editqueue("GroupDelete", "", nzbid)` - Delete

**Status Mapping:**
- "DOWNLOADING" → downloading
- "PAUSED" → paused
- "QUEUED" → queued
- "POST_PROCESSING" → extracting
- "SUCCESS" → complete
- "FAILURE" → error

**Unique ID:** `NZBID` (integer)

## Verification

After implementation, verify:

1. **Migration:** Existing qBittorrent setup migrates cleanly
2. **Backward compatibility:** Existing torrent downloads continue working
3. **Client creation:** Can add SABnzbd and NZBGet clients via UI
4. **Connection testing:** Test buttons work for all client types
5. **Automatic routing:** Torrent releases go to qBittorrent, NZB releases go to Usenet client
6. **Priority:** Higher priority client selected when multiple support same type
7. **Progress tracking:** Download progress shows correctly for all client types
8. **Completion:** Downloads complete and transition to encoding step
9. **Health tracking:** Failed clients marked unhealthy and skipped
10. **Secrets:** Credentials stored securely in secrets service

## Environment Variables (Optional Bootstrap)

**Existing (still supported):**
```bash
QBITTORRENT_URL=http://localhost:8080
QBITTORRENT_USERNAME=admin
QBITTORRENT_PASSWORD=adminpass
```

**New (optional for auto-setup):**
```bash
SABNZBD_URL=http://localhost:8080
SABNZBD_API_KEY=your-api-key

NZBGET_URL=http://localhost:6789
NZBGET_USERNAME=nzbget
NZBGET_PASSWORD=tegbzn6789
```

## Notes

- Newznab indexers already supported (use Torznab protocol handler)
- Release type detection uses multiple signals (magnet URI, URL extension, indexer type)
- Client health monitoring can be added as future enhancement
- Load balancing across multiple clients of same type is future enhancement
