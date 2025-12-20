# Cardigann API Reference

Complete reference for Cardigann tRPC endpoints.

## Base Router

All endpoints are under the `cardigann` router:

```typescript
import { trpc } from './trpc';

// Client-side usage
const definitions = await trpc.cardigann.listDefinitions.useQuery({});
```

## Definition Management

### `listDefinitions`

List all available Cardigann definitions with optional filtering.

**Type**: `query`

**Input**:
```typescript
{
  search?: string;          // Search in name, id, description
  language?: string;        // Filter by language code (e.g., "en")
  type?: string;           // Filter by type ("public", "private", "semi-private")
  supportsMovies?: boolean;// Filter by movie search support
  supportsTv?: boolean;    // Filter by TV search support
}
```

**Output**:
```typescript
Array<{
  id: string;                    // Definition ID (filename without .yml)
  name: string;                  // Display name
  description?: string;          // Optional description
  language?: string;             // Language code
  type?: string;                 // Indexer type
  links: string[];              // Base URLs
  version: string;              // Definition version
  categories?: string[];        // Available categories
  supportsMovieSearch?: boolean;// Supports movie search
  supportsTvSearch?: boolean;   // Supports TV search
  lastUpdated: Date;           // Last update time
}>
```

**Example**:
```typescript
// List all English public indexers
const definitions = await trpc.cardigann.listDefinitions.useQuery({
  language: 'en',
  type: 'public'
});

// Search for specific indexer
const results = await trpc.cardigann.listDefinitions.useQuery({
  search: 'rarbg'
});
```

---

### `getDefinition`

Get a single definition by ID with full parsed content.

**Type**: `query`

**Input**:
```typescript
{
  id: string;  // Definition ID
}
```

**Output**:
```typescript
{
  definition: CardigannDefinition;  // Full parsed YAML
  version: string;                  // Definition version
}
```

**CardigannDefinition Structure**:
```typescript
{
  id: string;
  name: string;
  description?: string;
  language?: string;
  type?: string;
  links: string[];
  settings?: Array<{
    name: string;
    type: 'text' | 'password' | 'checkbox';
    label: string;
    default?: string | boolean;
  }>;
  caps?: {
    categorymappings?: Array<{
      id: number;
      cat: string;
      desc: string;
    }>;
    modes?: {
      search?: string[];
      'movie-search'?: string[];
      'tv-search'?: string[];
    };
  };
  search: {
    paths: Array<{
      path: string;
      method?: 'get' | 'post';
      inputs?: Record<string, string>;
      rows?: { selector: string; after?: number };
      fields: Record<string, any>;
    }>;
  };
  // ... other fields
}
```

**Example**:
```typescript
const definition = await trpc.cardigann.getDefinition.useQuery({
  id: 'rarbg'
});

console.log(definition.definition.name);
console.log(definition.definition.settings);
```

**Errors**:
- `Definition not found: {id}` - Definition doesn't exist

---

### `info`

Get repository information and statistics.

**Type**: `query`

**Input**: None

**Output**:
```typescript
{
  totalDefinitions: number;  // Total definition count
  lastSync?: string;         // Last sync timestamp (ISO 8601)
  storageDir: string;        // Storage directory path
}
```

**Example**:
```typescript
const info = await trpc.cardigann.info.useQuery();
console.log(`${info.totalDefinitions} definitions available`);
```

---

### `sync`

Synchronize definitions from Prowlarr's GitHub repository.

**Type**: `mutation`

**Input**: None

**Output**:
```typescript
{
  success: boolean;
  added: number;          // New definitions added
  updated: number;        // Existing definitions updated
  errors: string[];       // Error messages if any
  message: string;        // Summary message
}
```

**Example**:
```typescript
const result = await trpc.cardigann.sync.useMutation();
await result.mutateAsync();

console.log(result.data.message);
// "Synced 503 definitions (12 new, 491 updated)"
```

**Notes**:
- Downloads all .yml files from GitHub
- Updates existing definitions
- Preserves local custom definitions
- May take 30-60 seconds depending on network

---

### `clearCache`

Clear the in-memory definition cache.

**Type**: `mutation`

**Input**: None

**Output**:
```typescript
{
  success: boolean;
  message: string;
}
```

**Example**:
```typescript
await trpc.cardigann.clearCache.useMutation()();
```

**Use Cases**:
- After manually editing definition files
- To force reload of definitions
- Memory cleanup in long-running instances

---

## Indexer Management

### `listIndexers`

List all configured Cardigann indexer instances.

**Type**: `query`

**Input**: None

**Output**:
```typescript
Array<{
  id: string;
  definitionId: string;
  name: string;
  settings: Record<string, any>;
  categoriesMovies: number[];
  categoriesTv: number[];
  priority: number;
  enabled: boolean;
  rateLimitEnabled: boolean;
  rateLimitMax?: number;
  rateLimitWindowSecs?: number;
  createdAt: Date;
  updatedAt: Date;
}>
```

**Example**:
```typescript
const indexers = await trpc.cardigann.listIndexers.useQuery();

// Filter enabled indexers
const enabled = indexers.filter(i => i.enabled);
```

**Sort Order**: `enabled DESC, priority DESC, name ASC`

---

### `getIndexer`

Get a single indexer instance by ID.

**Type**: `query`

**Input**:
```typescript
{
  id: string;  // Indexer ID (CardigannIndexer.id)
}
```

**Output**: Same as listIndexers item

**Example**:
```typescript
const indexer = await trpc.cardigann.getIndexer.useQuery({
  id: 'clx1234abcd'
});
```

**Errors**:
- `Indexer not found: {id}` - Indexer doesn't exist

---

### `createIndexer`

Create a new Cardigann indexer instance.

**Type**: `mutation`

**Input**:
```typescript
{
  definitionId: string;                    // Required: Definition ID
  name: string;                           // Required: Display name
  settings?: Record<string, string>;      // User credentials/config
  categoriesMovies?: number[];           // Movie categories (default: [])
  categoriesTv?: number[];               // TV categories (default: [])
  priority?: number;                     // Priority 1-100 (default: 50)
  enabled?: boolean;                     // Enable immediately (default: true)
  rateLimitEnabled?: boolean;            // Enable rate limiting (default: false)
  rateLimitMax?: number;                 // Max requests (optional)
  rateLimitWindowSecs?: number;          // Time window in seconds (optional)
}
```

**Output**: Created indexer object

**Example**:
```typescript
const result = await trpc.cardigann.createIndexer.useMutation();

const indexer = await result.mutateAsync({
  definitionId: 'rarbg',
  name: 'RARBG Movies',
  settings: {
    username: 'myuser',
    password: 'mypass'
  },
  categoriesMovies: [2000, 2040, 2045],
  priority: 75,
  enabled: true,
  rateLimitEnabled: true,
  rateLimitMax: 10,
  rateLimitWindowSecs: 60
});
```

**Side Effects**:
- Creates `CardigannIndexer` record
- Creates corresponding `Indexer` record (type: CARDIGANN)
- `Indexer.apiKey` stores `CardigannIndexer.id`

**Errors**:
- `Definition not found: {definitionId}` - Invalid definition ID

---

### `updateIndexer`

Update an existing indexer instance.

**Type**: `mutation`

**Input**:
```typescript
{
  id: string;                            // Required: Indexer ID
  name?: string;                        // Update name
  settings?: Record<string, string>;    // Update settings
  categoriesMovies?: number[];         // Update movie categories
  categoriesTv?: number[];             // Update TV categories
  priority?: number;                   // Update priority
  enabled?: boolean;                   // Enable/disable
  rateLimitEnabled?: boolean;          // Enable/disable rate limiting
  rateLimitMax?: number;               // Update max requests
  rateLimitWindowSecs?: number;        // Update time window
}
```

**Output**: Updated indexer object

**Example**:
```typescript
const result = await trpc.cardigann.updateIndexer.useMutation();

await result.mutateAsync({
  id: indexerId,
  enabled: false,
  priority: 25
});
```

**Side Effects**:
- Updates `CardigannIndexer` record
- Updates corresponding `Indexer` record
- Both records stay in sync

---

### `deleteIndexer`

Delete an indexer instance.

**Type**: `mutation`

**Input**:
```typescript
{
  id: string;  // Indexer ID
}
```

**Output**:
```typescript
{
  success: boolean;
  message: string;
}
```

**Example**:
```typescript
await trpc.cardigann.deleteIndexer.useMutation()({
  id: indexerId
});
```

**Side Effects**:
- Deletes `CardigannIndexer` record
- Deletes corresponding `Indexer` record
- Cascade deletes rate limit tracking records

---

## Search Operations

### `searchIndexer`

Execute a search against a Cardigann indexer.

**Type**: `mutation`

**Input**:
```typescript
{
  id: string;                 // Required: Indexer ID
  query?: string;             // Search query
  imdbId?: string;            // IMDB ID (e.g., "tt1234567")
  tmdbId?: string;            // TMDB ID (not commonly supported)
  tvdbId?: string;            // TVDB ID for TV shows
  season?: number;            // Season number
  episode?: number;           // Episode number
  categories?: string[];      // Override default categories
  limit?: number;             // Max results to return
}
```

**Output**:
```typescript
{
  indexerName: string;
  resultCount: number;
  results: Array<{
    title: string;
    downloadUrl: string;
    infoUrl?: string;
    size?: number;
    seeders?: number;
    leechers?: number;
    publishDate?: Date;
    category?: string[];
  }>;
}
```

**Example**:
```typescript
const result = await trpc.cardigann.searchIndexer.useMutation();

const search = await result.mutateAsync({
  id: indexerId,
  query: 'Inception 2010',
  imdbId: 'tt1375666',
  categories: ['2000', '2040'],
  limit: 50
});

console.log(`Found ${search.resultCount} results`);
search.results.forEach(r => {
  console.log(`${r.title} - ${r.seeders} seeders`);
});
```

**Errors**:
- `Indexer not found: {id}` - Invalid indexer ID
- `Indexer is disabled: {name}` - Indexer is disabled
- `Definition not found: {definitionId}` - Broken definition reference
- `No base URL found in definition` - Invalid definition
- HTTP errors from indexer website

**Notes**:
- Respects rate limiting if enabled
- Deduplicates results by infohash
- Returns empty array if no results found
- Query parameters depend on definition's `caps.modes`

---

### `testIndexer`

Test indexer connection and configuration.

**Type**: `mutation`

**Input**:
```typescript
{
  id: string;  // Indexer ID
}
```

**Output**:
```typescript
{
  success: boolean;
  message: string;
  indexerName: string;
  definition: {
    id: string;
    name: string;
    links: string[];
  };
  testResults?: {
    resultCount: number;
    sample: Array<{
      title: string;
      size?: number;
      seeders?: number;
    }>;
  };
}
```

**Example**:
```typescript
const result = await trpc.cardigann.testIndexer.useMutation();

const test = await result.mutateAsync({
  id: indexerId
});

if (test.success) {
  console.log(`Test successful! Found ${test.testResults.resultCount} results`);
} else {
  console.error(`Test failed: ${test.message}`);
}
```

**Test Behavior**:
- Executes search with query "test"
- Limits to 5 results
- Returns first 3 as samples
- Catches and reports errors

**Use Cases**:
- Verify credentials are correct
- Check if indexer is accessible
- Validate definition is working
- Debug configuration issues

---

## Client-Side Usage Patterns

### React Query Hooks

```typescript
import { trpc } from '../trpc';

// Query (automatically cached and refetched)
function DefinitionsList() {
  const { data, isLoading, error } = trpc.cardigann.listDefinitions.useQuery({
    language: 'en'
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {data.map(def => (
        <li key={def.id}>{def.name}</li>
      ))}
    </ul>
  );
}

// Mutation (for create/update/delete)
function CreateIndexer() {
  const utils = trpc.useContext();
  const createMutation = trpc.cardigann.createIndexer.useMutation({
    onSuccess: () => {
      // Refetch indexers list after creation
      utils.cardigann.listIndexers.invalidate();
    }
  });

  const handleSubmit = async (formData) => {
    await createMutation.mutateAsync(formData);
  };

  return (
    <button onClick={handleSubmit} disabled={createMutation.isPending}>
      {createMutation.isPending ? 'Creating...' : 'Create'}
    </button>
  );
}
```

### Error Handling

```typescript
try {
  const result = await trpc.cardigann.searchIndexer.mutateAsync({
    id: indexerId,
    query: 'test'
  });
} catch (error) {
  if (error.message.includes('rate limit')) {
    // Handle rate limit
  } else if (error.message.includes('disabled')) {
    // Handle disabled indexer
  } else {
    // Handle other errors
  }
}
```

### Conditional Queries

```typescript
// Only fetch definition if ID is present
const { data } = trpc.cardigann.getDefinition.useQuery(
  { id: definitionId },
  { enabled: !!definitionId }
);
```

### Optimistic Updates

```typescript
const utils = trpc.useContext();
const updateMutation = trpc.cardigann.updateIndexer.useMutation({
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await utils.cardigann.listIndexers.cancel();

    // Snapshot current value
    const prev = utils.cardigann.listIndexers.getData();

    // Optimistically update
    utils.cardigann.listIndexers.setData(undefined, (old) =>
      old?.map(i => i.id === newData.id ? { ...i, ...newData } : i)
    );

    return { prev };
  },
  onError: (err, newData, context) => {
    // Rollback on error
    utils.cardigann.listIndexers.setData(undefined, context?.prev);
  }
});
```

## Rate Limiting

Rate limiting is handled automatically when enabled on an indexer:

```typescript
// Rate limit checked before search
const canSearch = await checkRateLimit(indexerId);
if (!canSearch) {
  throw new Error('Rate limit exceeded. Please wait.');
}

// Request recorded after search
await recordRequest(indexerId);
```

**Database Tracking**:
- `CardigannIndexerRateLimitRequest` table stores timestamps
- Cleanup happens automatically via time window
- Queries count requests within the configured window

## Type Definitions

Complete TypeScript types are available in:
- `packages/server/src/services/cardigann/types.ts` - Service types
- `packages/server/src/routers/cardigann.ts` - Router input/output types

Import types for client-side use:
```typescript
import type { RouterOutputs } from '../trpc';

type Definition = RouterOutputs['cardigann']['listDefinitions'][0];
type Indexer = RouterOutputs['cardigann']['listIndexers'][0];
```
