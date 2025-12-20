# Cardigann Engine - Architecture

## Overview

The Cardigann engine enables Annex to support hundreds of torrent indexers through YAML-based definitions, eliminating the need for custom code for each indexer.

## Design Principles

1. **Definition-Driven**: Indexer behavior defined in YAML, not code
2. **Upstream Compatibility**: Uses Prowlarr's definition format and repository
3. **Seamless Integration**: Cardigann indexers work like any other indexer type
4. **Type Safety**: Full TypeScript types throughout the stack
5. **Testability**: Comprehensive test coverage with mocked HTTP requests

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    External Systems                          │
│                                                              │
│  ┌────────────────┐          ┌─────────────────────────┐   │
│  │ GitHub API     │          │ Indexer Websites        │   │
│  │ (Prowlarr/     │          │ (HTML/JSON/XML APIs)    │   │
│  │  Indexers)     │          │                         │   │
│  └────────┬───────┘          └──────────┬──────────────┘   │
│           │                             │                   │
└───────────┼─────────────────────────────┼───────────────────┘
            │ YAML Files                  │ HTTP Requests
            │                             │
┌───────────▼─────────────────────────────▼───────────────────┐
│                      Annex Server                            │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                  tRPC Router Layer                    │  │
│  │  (cardigann.ts - API Endpoints)                      │  │
│  │  - Definition management                              │  │
│  │  - Indexer CRUD operations                           │  │
│  │  - Search execution                                   │  │
│  └────┬────────────────────────────┬────────────────────┘  │
│       │                            │                        │
│  ┌────▼─────────┐  ┌──────────────▼──────┐  ┌──────────┐  │
│  │ Repository   │  │    Executor         │  │ Provider │  │
│  │              │  │                      │  │          │  │
│  │ - Storage    │  │ - HTTP Requests     │  │ - Result │  │
│  │ - Caching    │  │ - Response Parsing  │  │   Transform│  │
│  │ - GitHub     │  │ - Deduplication     │  │ - Quality│  │
│  │   Sync       │  │                      │  │   Extract│  │
│  └────┬─────────┘  └──────────┬───────────┘  └────┬─────┘  │
│       │                       │                    │         │
│  ┌────▼────────┐  ┌──────────▼──────────┐        │         │
│  │   Parser    │  │   Selector Engine   │        │         │
│  │             │  │                      │        │         │
│  │ - YAML      │  │ - CSS Selectors     │        │         │
│  │   Parsing   │  │ - JSON Path         │        │         │
│  │ - Variables │  │ - Size Parsing      │        │         │
│  │ - Filters   │  │ - Date Parsing      │        │         │
│  └─────────────┘  └─────────────────────┘        │         │
│                                                   │         │
│  ┌───────────────────────────────────────────────▼───────┐ │
│  │              Database (PostgreSQL)                     │ │
│  │  - CardigannIndexer (user configurations)            │ │
│  │  - Indexer (unified indexer records)                 │ │
│  │  - CardigannIndexerRateLimitRequest (rate tracking) │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
            │
            │ tRPC/HTTP
            │
┌───────────▼──────────────────────────────────────────────────┐
│                    Annex Client (React)                       │
│                                                               │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ Definitions    │  │ IndexerForm  │  │ Settings        │  │
│  │ Browser        │  │              │  │ Integration     │  │
│  │                │  │ - Create     │  │                 │  │
│  │ - List/Search  │  │ - Edit       │  │ - List All      │  │
│  │ - Sync         │  │ - Configure  │  │ - Edit/Delete   │  │
│  │ - Filter       │  │              │  │                 │  │
│  └────────────────┘  └──────────────┘  └─────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Definition Sync Flow

```
GitHub → Repository.syncFromGitHub() → Parse YAML → Save to disk → Cache in memory
```

1. Repository fetches file list from GitHub API
2. For each .yml file:
   - Download raw content
   - Parse with Parser
   - Save to `data/cardigann-definitions/`
   - Cache parsed definition in memory
3. Update metadata.json with sync statistics

### 2. Indexer Creation Flow

```
UI → tRPC createIndexer → Create CardigannIndexer + Indexer → Database
```

1. User submits indexer form
2. Router validates definition exists
3. Transaction creates two records:
   - `CardigannIndexer`: Stores definition ID, settings, categories
   - `Indexer`: Unified record with `type: CARDIGANN`, `apiKey: CardigannIndexer.id`
4. Both records committed atomically

### 3. Search Execution Flow

```
Search Request → Get Indexer → Load Definition → Build Context → Execute → Parse → Transform → Results
```

1. **Request received** with query parameters
2. **Get indexer** from database (both CardigannIndexer and definition)
3. **Rate limit check** if enabled
4. **Build context**:
   - Definition from repository
   - User settings (username, password, etc.)
   - Base URL from definition
   - Cookies (if needed)
5. **Execute search**:
   - Replace variables in path/inputs ({{.Keywords}}, {{.Config.username}})
   - Make HTTP request (GET/POST)
   - Receive HTML/JSON/XML response
6. **Parse response**:
   - Extract rows using CSS selectors
   - Extract fields from each row
   - Apply filters (trim, urlencode, etc.)
   - Parse sizes/dates/numbers
7. **Transform results**:
   - Convert to Release format
   - Extract quality info (resolution, source, codec)
   - Calculate scores
   - Deduplicate by infohash
8. **Record request** for rate limiting
9. **Return results**

### 4. Update Flow

```
UI → tRPC updateIndexer → Update CardigannIndexer + Indexer → Database
```

1. User modifies indexer settings
2. Router updates `CardigannIndexer` record
3. Router finds corresponding `Indexer` record (via `apiKey` = CardigannIndexer.id)
4. Router updates `Indexer` record with synced fields
5. Both updates in single transaction

### 5. Delete Flow

```
UI → tRPC deleteIndexer → Delete CardigannIndexer + Indexer → Cascade deletes
```

1. User confirms deletion
2. Router deletes `CardigannIndexer` record
3. Router finds and deletes corresponding `Indexer` record
4. Database cascades delete to `CardigannIndexerRateLimitRequest` records
5. All deletes in single transaction

## Component Responsibilities

### Repository
- **Storage**: Manage definition files on disk
- **Caching**: In-memory cache of parsed definitions
- **Sync**: GitHub API integration
- **Metadata**: Extract and index definition capabilities

### Parser
- **YAML**: Parse definition files
- **Variables**: Replace template variables with actual values
- **Filters**: Transform values (urlencode, trim, regexp, etc.)
- **Validation**: Ensure required fields present

### Selector Engine
- **HTML**: CSS selector extraction via cheerio
- **JSON**: Path-based value extraction
- **XML**: XML parsing and traversal
- **Parsing**: Convert strings to numbers, sizes, dates

### Executor
- **HTTP**: Make requests to indexer websites
- **Context**: Build request context from definition + settings
- **Parsing**: Route to appropriate parser (HTML/JSON/XML)
- **Deduplication**: Remove duplicate results by infohash
- **Error Handling**: Catch and report errors

### Provider
- **Integration**: Plug into Annex's search system
- **Transformation**: Convert Cardigann results to Release format
- **Quality**: Extract resolution, source, codec from title
- **Scoring**: Calculate quality-based scores

### Router
- **API**: Expose tRPC endpoints
- **Validation**: Input validation with Zod
- **Orchestration**: Coordinate components
- **Transactions**: Ensure data consistency
- **Error Handling**: User-friendly error messages

## Database Schema

### CardigannIndexer
- **Purpose**: Store user's indexer configuration
- **Key Fields**: definitionId, settings, categories, rate limiting
- **Relationships**: Has many RateLimitRequest records

### Indexer
- **Purpose**: Unified indexer record for all types
- **Key Fields**: type (CARDIGANN), apiKey (stores CardigannIndexer.id)
- **Relationships**: Used by search system, request pipelines

### CardigannIndexerRateLimitRequest
- **Purpose**: Track API requests for rate limiting
- **Key Fields**: indexerId, requestedAt
- **Cleanup**: Old records removed based on time window

## Integration Points

### Search System
```typescript
// CardigannProvider implements ProviderInterface
const provider = getCardigannProvider();
const releases = await provider.search({
  query: 'Inception',
  indexerIds: [indexerId]
});
```

Cardigann indexers participate in unified search alongside:
- Torznab indexers
- Newznab indexers
- TorrentLeech
- Unit3D
- RSS feeds

### Request Pipeline
When media is requested:
1. Discovery finds media on TMDB
2. Search executes across all enabled indexers (including Cardigann)
3. Results filtered and scored
4. Best release selected
5. Download initiated

### Rate Limiter Service
```typescript
await rateLimiter.checkLimit(indexerId);  // Before request
await rateLimiter.recordRequest(indexerId); // After request
```

Shared with other indexer types for consistent rate limiting.

## Security Considerations

### Credential Storage
- User passwords stored in JSON field
- Database should use encryption at rest
- Consider encrypting sensitive fields in application layer
- Never log credentials

### HTTP Requests
- All indexer requests go through Executor
- No direct user access to definitions
- SSRF protection via URL validation
- Timeout enforcement (default: 30 seconds)

### Rate Limiting
- Enforced server-side
- Cannot be bypassed by client
- Protects indexers from abuse
- Protects Annex from bans

### Input Validation
- All inputs validated with Zod schemas
- URL inputs sanitized
- SQL injection prevented by Prisma ORM
- XSS prevented by React escaping

## Performance Characteristics

### Definition Loading
- **First load**: Parse YAML from disk (~10ms per definition)
- **Subsequent**: Serve from memory cache (~0.1ms)
- **Memory**: ~1KB per definition, 500 definitions = ~500KB

### Search Execution
- **HTTP Request**: 100-2000ms (depends on indexer)
- **HTML Parsing**: 10-50ms (depends on response size)
- **Total**: Typically 150-2500ms per indexer

### Parallel Searches
- Multiple indexers searched in parallel
- Limited by network/CPU
- Typical: 5-10 concurrent searches perform well

### Rate Limiting Overhead
- Database query: ~5ms
- Negligible impact on search time
- Prevents expensive ban scenarios

## Scalability

### Horizontal Scaling
- **Stateless**: No shared state between instances
- **Cache**: Each instance has own definition cache
- **Database**: Single source of truth
- **Concurrent Searches**: Naturally parallel

### Vertical Scaling
- **CPU**: Parallel searches benefit from more cores
- **Memory**: Definition cache is small (<1GB for 500 definitions)
- **Network**: Indexer requests are I/O bound
- **Database**: Connection pooling handles concurrent queries

### Caching Strategy
- **Definitions**: Cached in memory, never stale
- **Search Results**: Not cached (always fresh)
- **Rate Limits**: Tracked in database (shared state)

## Error Handling

### Definition Errors
- **Parse errors**: Logged, definition skipped
- **Missing required fields**: Validation error
- **Invalid YAML**: Syntax error with line number

### Search Errors
- **HTTP errors**: Caught, returned to user
- **Timeout**: 30-second default
- **Rate limit**: Clear error message
- **Authentication**: Indicates credential issue

### Database Errors
- **Constraint violations**: Handled gracefully
- **Transaction failures**: Rolled back
- **Connection errors**: Retry with backoff

## Monitoring

### Metrics to Track
- Search success/failure rate per indexer
- Average search time per indexer
- Rate limit hits
- Definition sync success rate
- Parse errors

### Logging
- Search execution (query, indexer, results count)
- HTTP requests (URL, status, timing)
- Parse errors (definition, error message)
- Rate limit violations

### Alerting
- High error rate on indexer
- Repeated authentication failures
- Definition parse failures after sync
- Database transaction failures

## Future Enhancements

### Potential Improvements
1. **Definition Versioning**: Track and rollback definition changes
2. **Custom Definitions**: UI for creating/editing definitions
3. **Result Caching**: Cache recent searches for duplicate requests
4. **Proxy Support**: Route requests through proxies for region restrictions
5. **Cookie Management**: Auto-refresh cookies for private trackers
6. **Login Automation**: Automated login flow for session cookies
7. **Health Monitoring**: Auto-disable failing indexers
8. **A/B Testing**: Test definition changes before deployment

### Upstream Contributions
- Bug fixes to Prowlarr definitions
- New indexer definitions
- Parser improvements
- Filter additions
