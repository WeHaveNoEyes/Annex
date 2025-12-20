# Cardigann Engine - Developer Guide

This document explains the internal architecture and implementation of Annex's Cardigann engine.

## Architecture Overview

The Cardigann engine consists of six main components:

```
┌─────────────────────────────────────────────────────────────┐
│                         UI Layer                            │
│  (Definitions.tsx, IndexerForm.tsx, Settings.tsx)          │
└──────────────────────┬──────────────────────────────────────┘
                       │ tRPC
┌──────────────────────▼──────────────────────────────────────┐
│                    tRPC Router                              │
│           (cardigann.ts - API endpoints)                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┬─────────────┐
        │                             │             │
┌───────▼────────┐  ┌────────────────▼──┐  ┌───────▼─────────┐
│   Repository   │  │    Executor       │  │    Provider     │
│  (repository)  │  │   (executor)      │  │  (provider)     │
└───────┬────────┘  └────────┬──────────┘  └─────────────────┘
        │                    │
┌───────▼────────┐  ┌────────▼──────────┐
│     Parser     │  │    Selectors      │
│   (parser)     │  │   (selectors)     │
└────────────────┘  └───────────────────┘
```

## Components

### 1. Parser (`services/cardigann/parser.ts`)

**Purpose**: Parse YAML definition files into typed objects.

**Key Features**:
- YAML parsing with version extraction
- Variable replacement ({{.Config.username}}, {{.Keywords}}, etc.)
- Filter chain execution (trim, urlencode, regexp, etc.)
- Date parsing (timeago, fuzzytime)
- URL normalization

**Example**:
```typescript
const parser = new CardigannParser();
const parsed = parser.parseDefinition(yamlContent);
// Returns: { definition: CardigannDefinition, version: string }
```

**Variable Types**:
- `.Config.{field}` - User settings (username, password, etc.)
- `.Keywords` - Search query
- `.Categories` - Category IDs (comma-separated)
- `.Query.IMDBId` - IMDB ID for movie search
- `.Query.TVDBId` - TVDB ID for TV search

**Filter Types**:
- String: `append`, `prepend`, `replace`, `trim`, `toupper`, `tolower`
- Encoding: `urlencode`, `urldecode`, `diacritics`
- Regex: `regexp`, `re_replace`
- Parsing: `split`, `querystring`
- Date: `timeago`, `fuzzytime`, `dateparse`

### 2. Repository (`services/cardigann/repository.ts`)

**Purpose**: Manage definition storage, caching, and GitHub sync.

**Key Features**:
- Definition file storage in `data/cardigann-definitions/`
- In-memory caching of parsed definitions
- GitHub API integration for sync
- Metadata extraction (languages, types, capabilities)
- Search and filter operations

**Storage Structure**:
```
data/cardigann-definitions/
├── indexer1.yml
├── indexer2.yml
├── ...
└── .metadata.json
```

**API Methods**:
```typescript
// Sync from GitHub
const stats = await repository.syncFromGitHub();

// Get definition
const def = await repository.getDefinition('indexer-id');

// List with metadata
const defs = await repository.listDefinitions();

// Search
const results = await repository.searchDefinitions('query');
```

**Metadata Extraction**:
- `supportsMovieSearch`: Checks for `caps.modes['movie-search']`
- `supportsTvSearch`: Checks for `caps.modes['tv-search']`
- `categories`: Extracts from `caps.categorymappings`

### 3. Selector Engine (`services/cardigann/selectors.ts`)

**Purpose**: Extract data from HTML, JSON, and XML responses.

**Key Features**:
- CSS selector support (via cheerio)
- JSON path extraction
- XML parsing
- Size/number/date parsing
- Attribute extraction

**HTML Extraction**:
```typescript
const engine = new CardigannSelectorEngine();

// Extract rows
const rows = engine.extractRows(html, {
  selector: 'tr.result',
  after: 1  // Skip first row
});

// Extract field
const title = engine.extractField(element, {
  selector: '.title',
  filters: [{ name: 'trim' }]
}, $);
```

**JSON Extraction**:
```typescript
const value = engine.extractJsonValue(json, 'data.items.title');
```

**Size Parsing**:
```typescript
const bytes = engine.parseSize('1.5 GB');  // 1610612736
```

### 4. Executor (`services/cardigann/executor.ts`)

**Purpose**: Execute searches against indexers and parse results.

**Key Features**:
- HTTP request execution (GET/POST)
- HTML/JSON response handling
- Result deduplication by infohash
- Multi-path search support
- Cookie management

**Search Flow**:
```typescript
const executor = new CardigannExecutor();

const results = await executor.search(context, {
  query: 'movie name',
  categories: ['2000', '2040'],
  imdbId: 'tt1234567'
});
```

**Context Object**:
```typescript
interface CardigannContext {
  definition: CardigannDefinition;  // Parsed YAML
  settings: Record<string, string>; // User credentials
  cookies: Record<string, string>;  // Session cookies
  baseUrl: string;                  // Indexer base URL
}
```

**Response Types**:
- `text` (default): HTML parsing
- `json`: JSON API parsing
- `xml`: XML/RSS parsing

### 5. Provider (`services/cardigannProvider.ts`)

**Purpose**: Integrate Cardigann with Annex's search system.

**Key Features**:
- Transform Cardigann results to Release format
- Quality extraction (resolution, source, codec)
- Score calculation
- Indexer-agnostic interface

**Quality Detection**:
```typescript
// From title: "Movie.2024.1080p.BluRay.x264"
resolution: "1080p"   // 2160p, 1080p, 720p, 480p, SD
source: "BLURAY"      // REMUX, BLURAY, WEB-DL, WEBRIP, HDTV
codec: "H264"         // AV1, HEVC, H264, XVID
```

**Score Calculation**:
```typescript
score = resolutionScore + sourceScore + codecScore + seederBonus
// Higher quality + more seeders = higher score
```

### 6. tRPC Router (`routers/cardigann.ts`)

**Purpose**: Expose Cardigann functionality via API endpoints.

**Endpoints**:

#### Definition Management
- `listDefinitions` - List all definitions with filtering
- `getDefinition` - Get single definition
- `sync` - Sync from GitHub
- `info` - Repository statistics
- `clearCache` - Clear definition cache

#### Indexer Management
- `listIndexers` - List configured indexers
- `getIndexer` - Get single indexer
- `createIndexer` - Create new indexer instance
- `updateIndexer` - Update indexer configuration
- `deleteIndexer` - Delete indexer

#### Search Operations
- `searchIndexer` - Execute search
- `testIndexer` - Test indexer connection

**Dual Record Pattern**:
When creating a Cardigann indexer, two database records are created:

1. **CardigannIndexer**: Stores definition ID and Cardigann-specific settings
2. **Indexer**: Unified record for all indexer types (stores CardigannIndexer ID in `apiKey` field)

This allows Cardigann indexers to integrate seamlessly with the existing search system.

## Database Schema

### CardigannIndexer
```prisma
model CardigannIndexer {
  id               String   @id @default(cuid())
  definitionId     String   // ID from YAML file
  name             String
  settings         Json     @default("{}")  // User credentials
  categoriesMovies Int[]
  categoriesTv     Int[]
  priority         Int      @default(50)
  enabled          Boolean  @default(true)
  rateLimitEnabled Boolean  @default(false)
  rateLimitMax     Int?
  rateLimitWindowSecs Int?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```

### Integration with Indexer
```typescript
// Indexer.apiKey stores CardigannIndexer.id
// Indexer.type = "CARDIGANN"
```

## YAML Specification

Cardigann definitions follow the Prowlarr specification. Key sections:

### Basic Information
```yaml
id: indexer-name
name: Indexer Display Name
description: Optional description
language: en
type: public  # or private, semi-private
links:
  - https://indexer.example.com
```

### Settings
```yaml
settings:
  - name: username
    type: text
    label: Username
  - name: password
    type: password
    label: Password
  - name: cookie
    type: text
    label: Cookie
```

### Capabilities
```yaml
caps:
  categorymappings:
    - {id: 1, cat: TV, desc: "TV Shows"}
    - {id: 2, cat: Movies, desc: "Movies"}
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, tvdbid, season, ep]
```

### Search Configuration
```yaml
search:
  paths:
    - path: /search.php
      method: get  # or post
      inputs:
        q: "{{.Keywords}}"
        cat: "{{.Categories}}"
      rows:
        selector: "tr.result"
        after: 1  # Skip header row
      fields:
        title:
          selector: ".title"
        download:
          selector: ".download"
          attribute: href
        size:
          selector: ".size"
        seeders:
          selector: ".seeders"
        leechers:
          selector: ".leechers"
        publishdate:
          selector: ".date"
          filters:
            - name: dateparse
              args: ["Jan 2, 2006"]
```

### Advanced Features
```yaml
# Login configuration
login:
  path: /login.php
  method: post
  inputs:
    username: "{{.Config.username}}"
    password: "{{.Config.password}}"
  test:
    path: /
    selector: "a[href='/logout']"

# Ratio checking
ratio:
  path: /userdetails.php
  selector: "#ratio"

# Error detection
error:
  - selector: ".error"
    message: "Error: {{.Text}}"
```

## Testing

### Unit Tests

**Parser Tests** (`parser.test.ts`):
```typescript
it('parses valid YML definition', () => {
  const yml = `id: test\nname: Test\n...`;
  const result = parser.parseDefinition(yml);
  expect(result.definition.id).toBe('test');
});
```

**Selector Tests** (`selectors.test.ts`):
```typescript
it('extracts rows using CSS selector', () => {
  const html = '<tr class="result">...</tr>';
  const rows = engine.extractRows(html, { selector: 'tr.result' });
  expect(rows.length).toBe(1);
});
```

### Integration Tests

**Router Tests** (`cardigann-integration.test.ts`):
```typescript
it('creates indexer with corresponding Indexer record', async () => {
  const result = await caller.createIndexer({
    definitionId: 'test-tracker',
    name: 'My Tracker'
  });

  // Verify CardigannIndexer created
  expect(result.id).toBeDefined();

  // Verify Indexer record created
  const indexer = await prisma.indexer.findFirst({
    where: { type: 'CARDIGANN', apiKey: result.id }
  });
  expect(indexer).not.toBeNull();
});
```

**Mock Searches**:
```typescript
global.fetch = mock(async () => ({
  text: async () => mockHtml,
  headers: new Headers()
}));

const results = await caller.searchIndexer({
  id: indexerId,
  query: 'test'
});
```

## Debugging

### Enable Logging

Add console.log statements in:
- `executor.ts` - HTTP requests/responses
- `selectors.ts` - Parsing results
- `parser.ts` - Variable replacement

### Test Specific Definition

```typescript
const definition = await repository.getDefinition('indexer-id');
const context = {
  definition: definition.definition,
  settings: { username: 'test', password: 'test' },
  cookies: {},
  baseUrl: definition.definition.links[0]
};

const results = await executor.search(context, {
  query: 'test',
  limit: 5
});

console.log(results);
```

### Validate YAML

Use online YAML validators or:
```bash
bun test packages/server/src/__tests__/services/cardigann/parser.test.ts
```

## Performance Optimization

### Caching
- Definitions are cached in memory after first parse
- Clear cache with `repository.clearCache()`
- Cache is per-instance, not shared

### Rate Limiting
```typescript
// Check rate limit before search
const canSearch = await rateLimiter.checkLimit(indexerId);
if (!canSearch) {
  throw new Error('Rate limit exceeded');
}

// Record request after search
await rateLimiter.recordRequest(indexerId);
```

### Parallel Searches
```typescript
// Search multiple indexers in parallel
const results = await Promise.all(
  indexers.map(indexer =>
    executor.search(contextFor(indexer), params)
  )
);
```

## Contributing

### Adding New Definitions

1. **Create YAML file** in `data/cardigann-definitions/custom-indexer.yml`
2. **Follow specification** from Prowlarr documentation
3. **Test locally** through the UI
4. **Contribute upstream** to Prowlarr/Indexers repository

### Extending Parser

To add new filters:

```typescript
// In parser.ts
private applyFilter(value: string, filter: Filter): string {
  switch (filter.name) {
    case 'your-filter':
      return yourFilterLogic(value, filter.args);
    default:
      return value;
  }
}
```

### Adding New Selector Types

To support new response types:

```typescript
// In executor.ts
private async parseResponse(
  response: string,
  path: CardigannSearchPath
): Promise<CardigannSearchResult[]> {
  if (path.response?.type === 'your-type') {
    return this.parseYourType(response, path);
  }
  // ...
}
```

## Common Issues

### Definition Not Parsing
- Check YAML syntax
- Verify required fields (id, name, links, search)
- Test with minimal definition first
- Review error messages in logs

### Search Returns No Results
- Verify selector matches HTML structure
- Check if indexer requires login
- Test selectors in browser DevTools
- Review HTTP response in network tab

### Authentication Failures
- Check if cookies are needed instead of credentials
- Verify login path and inputs
- Test login separately from search
- Check for CSRF tokens or captchas

## Resources

- **Prowlarr Indexers**: https://github.com/Prowlarr/Indexers
- **Cardigann Specification**: Prowlarr Wiki
- **Test Indexers**: Use public trackers for development
- **YAML Reference**: https://yaml.org/spec/
