import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { trpc } from "../trpc";
import { Input, ToggleGroup, MediaCard, Button, LibraryInfo } from "../components/ui";
import { FilterPanel } from "../components/ui/FilterPanel";
import { DiscoveryModeTabs } from "../components/ui/DiscoveryModeTabs";
import { PeriodSelector } from "../components/ui/PeriodSelector";
import { SlideOutPanel } from "../components/ui/SlideOutPanel";
import {
  useDiscoverFilters,
  DISCOVERY_MODES,
  countActiveRatingFilters,
  modeHasPeriod,
} from "../hooks/useDiscoverFilters";

const mediaTypeOptions = [
  { value: "movie" as const, label: "Movies" },
  { value: "tv" as const, label: "TV Shows" },
];

// Debounce hook for search
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Media item type for display (transformed from API response)
interface DisplayMediaItem {
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  posterPath: string | null;
  year: number;
  voteAverage: number;
  ratings?: {
    imdbScore?: number | null;
    rtCriticScore?: number | null;
    rtAudienceScore?: number | null;
    metacriticScore?: number | null;
    traktScore?: number | null;
    letterboxdScore?: number | null;
    mdblistScore?: number | null;
  };
  trailerKey?: string | null;
}

// Transform API result to display format
function transformResult(item: {
  tmdbId: number;
  type: "movie" | "tv" | "MOVIE" | "TV";
  title: string;
  posterPath: string | null;
  year: number | null;
  voteAverage: number | null;
  ratings?: {
    imdbScore?: number | null;
    rtCriticScore?: number | null;
    rtAudienceScore?: number | null;
    metacriticScore?: number | null;
    traktScore?: number | null;
    letterboxdScore?: number | null;
    mdblistScore?: number | null;
  } | null;
  trailerKey?: string | null;
}): DisplayMediaItem {
  return {
    tmdbId: item.tmdbId,
    type: (typeof item.type === "string" && item.type.toUpperCase() === "TV" ? "tv" : "movie") as "movie" | "tv",
    title: item.title,
    posterPath: item.posterPath,
    year: item.year ?? 0,
    voteAverage: item.voteAverage ?? 0,
    ratings: item.ratings ? {
      imdbScore: item.ratings.imdbScore,
      rtCriticScore: item.ratings.rtCriticScore,
      rtAudienceScore: item.ratings.rtAudienceScore,
      metacriticScore: item.ratings.metacriticScore,
      traktScore: item.ratings.traktScore,
      letterboxdScore: item.ratings.letterboxdScore,
      mdblistScore: item.ratings.mdblistScore,
    } : undefined,
    trailerKey: item.trailerKey,
  };
}

// Format rating range for Trakt API (e.g., "7-10" for IMDB)
function formatRatingRange(min: number, max: number, sourceMax: number): string {
  // If max is at the source max, use just the min value
  if (max >= sourceMax) {
    return `${min}-${sourceMax}`;
  }
  return `${min}-${max}`;
}

export default function DiscoverPage() {
  const {
    filters,
    hasActiveFilters,
    availableCertifications,
    setType,
    setMode,
    setPeriod,
    setQuery,
    setYears,
    toggleGenre,
    toggleLanguage,
    toggleCountry,
    setRuntimes,
    toggleCertification,
    setRatingRange,
    clearRatingFilters,
    clearFilters,
  } = useDiscoverFilters();

  // Local search input state (synced with URL via debounce)
  const [searchInput, setSearchInput] = useState(filters.query);
  const [page, setPage] = useState(1);
  const [allResults, setAllResults] = useState<DisplayMediaItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [totalResults, setTotalResults] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const processedDataRef = useRef<string>("");

  // Sync search input with URL query
  useEffect(() => {
    setSearchInput(filters.query);
  }, [filters.query]);

  // Debounce search input to URL update
  const debouncedSearchInput = useDebounce(searchInput, 300);

  // Update URL when debounced search changes
  useEffect(() => {
    if (debouncedSearchInput !== filters.query) {
      setQuery(debouncedSearchInput);
    }
  }, [debouncedSearchInput, filters.query, setQuery]);

  // Create a stable query key for caching
  const queryKey = useMemo(
    () =>
      JSON.stringify({
        type: filters.type,
        mode: filters.mode,
        period: filters.period,
        query: filters.query,
        years: filters.years,
        genres: filters.genres,
        languages: filters.languages,
        countries: filters.countries,
        runtimes: filters.runtimes,
        certifications: filters.certifications,
        ratingFilters: filters.ratingFilters,
        page,
      }),
    [filters, page]
  );

  // Build rating filter strings for API
  const ratingParams = useMemo(() => {
    const params: Record<string, string | undefined> = {};

    if (filters.ratingFilters.trakt) {
      params.ratings = formatRatingRange(filters.ratingFilters.trakt.min, filters.ratingFilters.trakt.max, 100);
    }
    if (filters.ratingFilters.imdb) {
      params.imdbRatings = formatRatingRange(filters.ratingFilters.imdb.min, filters.ratingFilters.imdb.max, 10);
    }
    if (filters.ratingFilters.tmdb) {
      params.tmdbRatings = formatRatingRange(filters.ratingFilters.tmdb.min, filters.ratingFilters.tmdb.max, 10);
    }
    if (filters.ratingFilters.rt_critic) {
      params.rtMeters = formatRatingRange(filters.ratingFilters.rt_critic.min, filters.ratingFilters.rt_critic.max, 100);
    }
    if (filters.ratingFilters.rt_audience) {
      params.rtUserMeters = formatRatingRange(filters.ratingFilters.rt_audience.min, filters.ratingFilters.rt_audience.max, 100);
    }
    if (filters.ratingFilters.metacritic) {
      params.metascores = formatRatingRange(filters.ratingFilters.metacritic.min, filters.ratingFilters.metacritic.max, 100);
    }

    return params;
  }, [filters.ratingFilters]);

  // Use the traktDiscover endpoint
  const discoverQuery = trpc.discovery.traktDiscover.useQuery(
    {
      type: filters.type,
      listType: filters.mode,
      page,
      period: filters.period,
      query: filters.query || undefined,
      years: filters.years || undefined,
      genres: filters.genres.length > 0 ? filters.genres : undefined,
      languages: filters.languages.length > 0 ? filters.languages : undefined,
      countries: filters.countries.length > 0 ? filters.countries : undefined,
      runtimes: filters.runtimes || undefined,
      certifications: filters.certifications.length > 0 ? filters.certifications : undefined,
      ...ratingParams,
    },
    {
      keepPreviousData: true,
    }
  );

  // Build a list of items to check for library status
  const itemsToCheck = useMemo(() => {
    return allResults.map((item) => ({
      tmdbId: item.tmdbId,
      type: item.type,
    }));
  }, [allResults]);

  // Check library status for displayed items
  const libraryStatusQuery = trpc.servers.checkInLibrary.useQuery(
    { items: itemsToCheck },
    {
      enabled: itemsToCheck.length > 0,
      staleTime: 60000, // Cache for 1 minute
    }
  );

  // Get library info for a specific item
  const getLibraryInfo = useCallback(
    (type: "movie" | "tv", tmdbId: number): LibraryInfo | null => {
      const key = `${type}-${tmdbId}`;
      const info = libraryStatusQuery.data?.inLibrary[key];
      return info || null;
    },
    [libraryStatusQuery.data]
  );

  // Accumulate results when new data arrives
  useEffect(() => {
    const data = discoverQuery.data;
    if (!data?.results || discoverQuery.isFetching) return;

    // Create a unique key for this data to avoid reprocessing
    const dataKey = `${queryKey}-${data.results.length}`;
    if (processedDataRef.current === dataKey) return;
    processedDataRef.current = dataKey;

    // Transform results to display format
    const transformedResults = data.results.map(transformResult);

    if (page === 1) {
      setAllResults(transformedResults);
      setTotalResults(data.totalResults ?? 0);
    } else {
      setAllResults((prev) => {
        const existingIds = new Set(prev.map((r) => `${r.type}-${r.tmdbId}`));
        const newItems = transformedResults.filter(
          (r) => !existingIds.has(`${r.type}-${r.tmdbId}`)
        );
        return [...prev, ...newItems];
      });
    }

    setHasMore(page < (data.totalPages ?? 1));
  }, [discoverQuery.data, discoverQuery.isFetching, page, queryKey]);

  // Reset pagination when filters change
  useEffect(() => {
    setPage(1);
    setAllResults([]);
    setHasMore(true);
    setTotalResults(0);
    processedDataRef.current = "";
  }, [
    filters.type,
    filters.mode,
    filters.period,
    filters.query,
    filters.years,
    filters.genres,
    filters.languages,
    filters.countries,
    filters.runtimes,
    filters.certifications,
    filters.ratingFilters,
  ]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
  };

  const handleMediaTypeChange = (newType: "movie" | "tv") => {
    setType(newType);
  };

  // Load more function
  const loadMore = useCallback(() => {
    if (!discoverQuery.isFetching && hasMore) {
      setPage((p) => p + 1);
    }
  }, [discoverQuery.isFetching, hasMore]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const currentRef = loadMoreRef.current;
    if (!currentRef) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (
          entry.isIntersecting &&
          hasMore &&
          !discoverQuery.isFetching &&
          allResults.length > 0
        ) {
          loadMore();
        }
      },
      { threshold: 0, rootMargin: "600px" }
    );

    observer.observe(currentRef);

    return () => {
      observer.disconnect();
    };
  }, [loadMore, hasMore, discoverQuery.isFetching, allResults.length]);

  const isInitialLoading = discoverQuery.isLoading && allResults.length === 0;
  const isLoadingMore = discoverQuery.isFetching && allResults.length > 0;

  // Build title based on active filters
  const resultsTitle = useMemo(() => {
    if (filters.query) {
      return `Search Results for "${filters.query}"`;
    }

    const modeLabel = DISCOVERY_MODES.find((m) => m.value === filters.mode)?.label || "Discover";
    const prefix = filters.type === "movie" ? "Movies" : "TV Shows";

    return `${modeLabel} ${prefix}`;
  }, [filters]);

  // Check if Trakt is configured
  const traktNotConfigured = discoverQuery.data && !discoverQuery.data.configured;

  // Count total active filters for badge
  const totalActiveFilters = useMemo(() => {
    let count = 0;
    count += filters.genres.length;
    count += filters.languages.length;
    count += filters.countries.length;
    count += filters.certifications.length;
    count += countActiveRatingFilters(filters.ratingFilters);
    if (filters.years) count++;
    if (filters.runtimes) count++;
    return count;
  }, [filters]);

  return (
    <div className="space-y-4">
      {/* Filters slide-out panel */}
      <SlideOutPanel
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        title="Advanced Filters"
        side="right"
        width="w-80"
      >
        <div className="p-4">
          <FilterPanel
            filters={filters}
            hasActiveFilters={hasActiveFilters}
            availableCertifications={availableCertifications}
            onToggleGenre={toggleGenre}
            onSetYears={setYears}
            onToggleLanguage={toggleLanguage}
            onToggleCountry={toggleCountry}
            onSetRuntimes={setRuntimes}
            onToggleCertification={toggleCertification}
            onSetRatingRange={setRatingRange}
            onClearRatingFilters={clearRatingFilters}
            onClearFilters={clearFilters}
          />
        </div>
      </SlideOutPanel>

      {/* Main content */}
      <main className="space-y-4">
        {/* Discovery mode tabs */}
        <DiscoveryModeTabs mode={filters.mode} onModeChange={setMode} />

        {/* Period selector for played/watched/collected modes */}
        {modeHasPeriod(filters.mode) && (
          <PeriodSelector period={filters.period} onPeriodChange={setPeriod} />
        )}

        {/* Search bar, type toggle, and filters button */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="Search movies and TV shows..."
              value={searchInput}
              onChange={handleSearchChange}
            />
          </div>
          <div className="flex gap-2">
            <ToggleGroup
              options={mediaTypeOptions}
              value={filters.type}
              onChange={handleMediaTypeChange}
            />
            <Button
              variant="secondary"
              onClick={() => setShowFilters(true)}
              className="shrink-0 relative"
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
              Filters
              {totalActiveFilters > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-medium bg-annex-500 text-white rounded-full">
                  {totalActiveFilters}
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* Active filters pills */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-white/10">
            {filters.genres.length > 0 && (
              <span className="shrink-0 px-2 py-1 text-xs bg-annex-500/20 text-annex-300 rounded">
                {filters.genres.length} genre{filters.genres.length > 1 ? "s" : ""}
              </span>
            )}
            {countActiveRatingFilters(filters.ratingFilters) > 0 && (
              <button
                onClick={clearRatingFilters}
                className="shrink-0 flex items-center gap-1 px-2 py-1 text-xs bg-annex-500/20 text-annex-300 rounded hover:bg-annex-500/30 transition-colors"
              >
                {countActiveRatingFilters(filters.ratingFilters)} rating{countActiveRatingFilters(filters.ratingFilters) > 1 ? "s" : ""}
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            {filters.years && (
              <span className="shrink-0 px-2 py-1 text-xs bg-annex-500/20 text-annex-300 rounded">
                {filters.years}
              </span>
            )}
            {filters.runtimes && (
              <span className="shrink-0 px-2 py-1 text-xs bg-annex-500/20 text-annex-300 rounded">
                {filters.runtimes} min
              </span>
            )}
            {filters.languages.length > 0 && (
              <span className="shrink-0 px-2 py-1 text-xs bg-annex-500/20 text-annex-300 rounded">
                {filters.languages.length} language{filters.languages.length > 1 ? "s" : ""}
              </span>
            )}
            {filters.countries.length > 0 && (
              <span className="shrink-0 px-2 py-1 text-xs bg-annex-500/20 text-annex-300 rounded">
                {filters.countries.length} countr{filters.countries.length > 1 ? "ies" : "y"}
              </span>
            )}
            {filters.certifications.length > 0 && (
              <span className="shrink-0 px-2 py-1 text-xs bg-annex-500/20 text-annex-300 rounded">
                {filters.certifications.join(", ")}
              </span>
            )}
            <button
              onClick={clearFilters}
              className="shrink-0 px-2 py-1 text-xs text-white/40 hover:text-white/60 transition-colors"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Results section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">{resultsTitle}</h2>
            {totalResults > 0 && (
              <span className="text-sm text-white/50">
                {allResults.length.toLocaleString()} of{" "}
                {totalResults.toLocaleString()} items
              </span>
            )}
          </div>

          {/* Trakt not configured warning */}
          {traktNotConfigured && (
            <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded text-yellow-200">
              <p className="font-medium">Trakt API not configured</p>
              <p className="text-sm mt-1 text-yellow-200/70">
                Set ANNEX_TRAKT_CLIENT_ID in your environment to enable Trakt-powered discovery.
              </p>
            </div>
          )}

          {/* Error state */}
          {discoverQuery.error && (
            <div className="text-center py-12 text-red-400">
              <p>Failed to load content.</p>
              <p className="text-sm mt-2 text-white/30">
                {discoverQuery.error.message}
              </p>
            </div>
          )}

          {/* Initial loading state */}
          {isInitialLoading && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="aspect-[2/3] bg-white/5 rounded animate-pulse" />
                  <div className="h-4 bg-white/5 rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-white/5 rounded animate-pulse w-1/2" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isInitialLoading &&
            !discoverQuery.isFetching &&
            allResults.length === 0 &&
            discoverQuery.data &&
            !traktNotConfigured && (
              <div className="text-center py-12 text-white/50">
                {filters.query ? (
                  <>
                    <p>No results found for "{filters.query}".</p>
                    <p className="text-sm mt-2 text-white/30">
                      Try a different search term or adjust your filters.
                    </p>
                  </>
                ) : hasActiveFilters ? (
                  <>
                    <p>No content matches your filters.</p>
                    <p className="text-sm mt-2 text-white/30">
                      Try adjusting your filters or{" "}
                      <button
                        onClick={clearFilters}
                        className="text-annex-400 hover:text-annex-300"
                      >
                        clear all filters
                      </button>
                      .
                    </p>
                  </>
                ) : (
                  <>
                    <p>No content available.</p>
                    <p className="text-sm mt-2 text-white/30">
                      Try a different list or check your Trakt configuration.
                    </p>
                  </>
                )}
              </div>
            )}

          {/* Results grid */}
          {allResults.length > 0 && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {allResults.map((item) => (
                  <MediaCard
                    key={`${item.type}-${item.tmdbId}`}
                    tmdbId={item.tmdbId}
                    type={item.type}
                    title={item.title}
                    posterPath={item.posterPath}
                    year={item.year}
                    voteAverage={item.voteAverage}
                    ratings={item.ratings}
                    trailerKey={item.trailerKey}
                    inLibrary={getLibraryInfo(item.type, item.tmdbId)}
                  />
                ))}
              </div>

              {/* Load more section */}
              <div
                ref={loadMoreRef}
                className="flex flex-col items-center gap-4 py-8"
              >
                {isLoadingMore && (
                  <div className="flex items-center gap-3 text-white/50">
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                    <span className="text-sm">Loading more...</span>
                  </div>
                )}

                {hasMore && !isLoadingMore && (
                  <Button
                    variant="secondary"
                    onClick={loadMore}
                    disabled={discoverQuery.isFetching}
                  >
                    Load More
                  </Button>
                )}

                {!hasMore && allResults.length > 0 && (
                  <span className="text-sm text-white/30">
                    You've reached the end
                  </span>
                )}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
