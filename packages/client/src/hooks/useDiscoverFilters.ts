import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useLocation } from "react-router-dom";

// Trakt genre slugs (same for movies and TV)
export const TRAKT_GENRES = [
  { slug: "action", name: "Action" },
  { slug: "adventure", name: "Adventure" },
  { slug: "animation", name: "Animation" },
  { slug: "anime", name: "Anime" },
  { slug: "comedy", name: "Comedy" },
  { slug: "crime", name: "Crime" },
  { slug: "documentary", name: "Documentary" },
  { slug: "drama", name: "Drama" },
  { slug: "family", name: "Family" },
  { slug: "fantasy", name: "Fantasy" },
  { slug: "history", name: "History" },
  { slug: "holiday", name: "Holiday" },
  { slug: "horror", name: "Horror" },
  { slug: "music", name: "Music" },
  { slug: "musical", name: "Musical" },
  { slug: "mystery", name: "Mystery" },
  { slug: "romance", name: "Romance" },
  { slug: "science-fiction", name: "Science Fiction" },
  { slug: "short", name: "Short" },
  { slug: "sports", name: "Sports" },
  { slug: "superhero", name: "Superhero" },
  { slug: "thriller", name: "Thriller" },
  { slug: "war", name: "War" },
  { slug: "western", name: "Western" },
] as const;

export type TraktGenreSlug = typeof TRAKT_GENRES[number]["slug"];

// Discovery modes - Trakt list types
export const DISCOVERY_MODES = [
  { value: "trending", label: "Trending", description: "Being watched right now" },
  { value: "popular", label: "Popular", description: "Most popular all time" },
  { value: "favorited", label: "Most Favorited", description: "Most favorited by users" },
  { value: "played", label: "Most Played", description: "Most plays" },
  { value: "watched", label: "Most Watched", description: "Most watchers" },
  { value: "collected", label: "Most Downloaded", description: "Most collected" },
] as const;

export type DiscoveryMode = typeof DISCOVERY_MODES[number]["value"];

// Period options for played/watched/collected
export const PERIOD_OPTIONS = [
  { value: "daily", label: "Today" },
  { value: "weekly", label: "This Week" },
  { value: "monthly", label: "This Month" },
  { value: "yearly", label: "This Year" },
  { value: "all", label: "All Time" },
] as const;

export type TraktPeriod = typeof PERIOD_OPTIONS[number]["value"];

// Common languages for filtering (ISO 639-1 codes)
export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "hi", name: "Hindi" },
  { code: "ru", name: "Russian" },
  { code: "ar", name: "Arabic" },
  { code: "th", name: "Thai" },
  { code: "tr", name: "Turkish" },
  { code: "pl", name: "Polish" },
  { code: "nl", name: "Dutch" },
  { code: "sv", name: "Swedish" },
  { code: "da", name: "Danish" },
  { code: "no", name: "Norwegian" },
  { code: "fi", name: "Finnish" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "ml", name: "Malayalam" },
  { code: "id", name: "Indonesian" },
] as const;

export type LanguageCode = typeof LANGUAGES[number]["code"];

// Common countries for filtering (ISO 3166-1 alpha-2 codes)
export const COUNTRIES = [
  { code: "us", name: "United States" },
  { code: "gb", name: "United Kingdom" },
  { code: "ca", name: "Canada" },
  { code: "au", name: "Australia" },
  { code: "de", name: "Germany" },
  { code: "fr", name: "France" },
  { code: "es", name: "Spain" },
  { code: "it", name: "Italy" },
  { code: "jp", name: "Japan" },
  { code: "kr", name: "South Korea" },
  { code: "cn", name: "China" },
  { code: "in", name: "India" },
  { code: "br", name: "Brazil" },
  { code: "mx", name: "Mexico" },
  { code: "ru", name: "Russia" },
] as const;

export type CountryCode = typeof COUNTRIES[number]["code"];

// Content certifications
export const CERTIFICATIONS = {
  movie: [
    { code: "g", name: "G" },
    { code: "pg", name: "PG" },
    { code: "pg-13", name: "PG-13" },
    { code: "r", name: "R" },
    { code: "nc-17", name: "NC-17" },
  ],
  tv: [
    { code: "tv-y", name: "TV-Y" },
    { code: "tv-y7", name: "TV-Y7" },
    { code: "tv-g", name: "TV-G" },
    { code: "tv-pg", name: "TV-PG" },
    { code: "tv-14", name: "TV-14" },
    { code: "tv-ma", name: "TV-MA" },
  ],
} as const;

// Rating sources supported by Trakt filters
export const RATING_SOURCES = [
  {
    id: "trakt",
    name: "Trakt",
    min: 0,
    max: 100,
    step: 5,
    format: (v: number) => `${v}%`,
    urlKey: "ratings",
  },
  {
    id: "imdb",
    name: "IMDb",
    min: 0,
    max: 10,
    step: 0.5,
    format: (v: number) => v.toFixed(1),
    urlKey: "imdb_ratings",
  },
  {
    id: "tmdb",
    name: "TMDB",
    min: 0,
    max: 10,
    step: 0.5,
    format: (v: number) => v.toFixed(1),
    urlKey: "tmdb_ratings",
  },
  {
    id: "rt_critic",
    name: "RT Critics",
    min: 0,
    max: 100,
    step: 5,
    format: (v: number) => `${v}%`,
    urlKey: "rt_meters",
  },
  {
    id: "rt_audience",
    name: "RT Audience",
    min: 0,
    max: 100,
    step: 5,
    format: (v: number) => `${v}%`,
    urlKey: "rt_user_meters",
  },
  {
    id: "metacritic",
    name: "Metacritic",
    min: 0,
    max: 100,
    step: 5,
    format: (v: number) => `${v}`,
    urlKey: "metascores",
  },
] as const;

export type RatingSourceId = typeof RATING_SOURCES[number]["id"];

export interface RatingRange {
  min: number;
  max: number;
}

export type RatingFilters = Partial<Record<RatingSourceId, RatingRange>>;

// Runtime presets in minutes
export const RUNTIME_PRESETS = [
  { value: null, label: "Any" },
  { value: "0-90", label: "Under 90 min" },
  { value: "90-120", label: "90-120 min" },
  { value: "120-180", label: "2-3 hours" },
  { value: "180-", label: "Over 3 hours" },
] as const;

// Year presets
const currentYear = new Date().getFullYear();
export const YEAR_PRESETS = [
  { value: null, label: "Any Year" },
  { value: String(currentYear), label: String(currentYear) },
  { value: `${currentYear - 1}-${currentYear}`, label: "Last 2 Years" },
  { value: `${currentYear - 4}-${currentYear}`, label: "Last 5 Years" },
  { value: "2020-2029", label: "2020s" },
  { value: "2010-2019", label: "2010s" },
  { value: "2000-2009", label: "2000s" },
  { value: "1990-1999", label: "1990s" },
] as const;

export interface DiscoverFilters {
  type: "movie" | "tv";
  mode: DiscoveryMode;
  period: TraktPeriod;
  query: string;
  years: string | null;
  genres: string[];
  languages: string[];
  countries: string[];
  runtimes: string | null;
  certifications: string[];
  ratingFilters: RatingFilters;
}

export const DEFAULT_MODE: DiscoveryMode = "trending";
export const DEFAULT_PERIOD: TraktPeriod = "weekly";

const DEFAULT_FILTERS: DiscoverFilters = {
  type: "movie",
  mode: DEFAULT_MODE,
  period: DEFAULT_PERIOD,
  query: "",
  years: null,
  genres: [],
  languages: ["en"],
  countries: [],
  runtimes: null,
  certifications: [],
  ratingFilters: {},
};

// Helper to check if a rating filter is actually filtering
export function isRatingFilterActive(
  sourceId: RatingSourceId,
  range: RatingRange | undefined
): boolean {
  if (!range) return false;
  const source = RATING_SOURCES.find((s) => s.id === sourceId);
  if (!source) return false;
  return range.min > source.min || range.max < source.max;
}

// Helper to count active rating filters
export function countActiveRatingFilters(filters: RatingFilters): number {
  return Object.entries(filters).filter(([sourceId, range]) =>
    isRatingFilterActive(sourceId as RatingSourceId, range)
  ).length;
}

// Serialize rating filters to URL-safe string
function serializeRatingFilters(filters: RatingFilters): string {
  const parts: string[] = [];
  for (const [sourceId, range] of Object.entries(filters)) {
    if (range && isRatingFilterActive(sourceId as RatingSourceId, range)) {
      parts.push(`${sourceId}:${range.min}-${range.max}`);
    }
  }
  return parts.join(",");
}

// Parse rating filters from URL string
function parseRatingFilters(str: string | null): RatingFilters {
  if (!str) return {};
  const filters: RatingFilters = {};
  const parts = str.split(",");
  for (const part of parts) {
    const match = part.match(/^(\w+):(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
    if (match) {
      const [, sourceId, minStr, maxStr] = match;
      const source = RATING_SOURCES.find((s) => s.id === sourceId);
      if (source) {
        filters[sourceId as RatingSourceId] = {
          min: parseFloat(minStr),
          max: parseFloat(maxStr),
        };
      }
    }
  }
  return filters;
}

// Session storage key for scroll positions
const SCROLL_STORAGE_KEY = "discover-scroll-positions";

function getScrollPositions(): Record<string, number> {
  try {
    const stored = sessionStorage.getItem(SCROLL_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveScrollPosition(key: string, position: number): void {
  try {
    const positions = getScrollPositions();
    positions[key] = position;
    sessionStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // Ignore storage errors
  }
}

// Check if mode requires period selector
export function modeHasPeriod(mode: DiscoveryMode): boolean {
  return mode === "played" || mode === "watched" || mode === "collected";
}

export function useDiscoverFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const isInitialMount = useRef(true);
  const hasRestoredScroll = useRef(false);

  // Parse filters from URL
  const filters = useMemo<DiscoverFilters>(() => {
    const type = searchParams.get("type");
    const query = searchParams.get("q") || "";
    const genresParam = searchParams.get("genres");
    const years = searchParams.get("years");
    const languagesParam = searchParams.get("languages");
    const countriesParam = searchParams.get("countries");
    const runtimes = searchParams.get("runtimes");
    const certificationsParam = searchParams.get("certifications");

    // Discovery mode - defaults to "trending"
    const modeParam = searchParams.get("mode") as DiscoveryMode | null;
    const mode =
      modeParam && DISCOVERY_MODES.some((m) => m.value === modeParam)
        ? modeParam
        : DEFAULT_MODE;

    // Period - defaults to "weekly"
    const periodParam = searchParams.get("period") as TraktPeriod | null;
    const period =
      periodParam && PERIOD_OPTIONS.some((p) => p.value === periodParam)
        ? periodParam
        : DEFAULT_PERIOD;

    // Parse rating filters
    const ratingsParam = searchParams.get("ratings");
    const ratingFilters = parseRatingFilters(ratingsParam);

    return {
      type: type === "tv" ? "tv" : "movie",
      mode,
      period,
      query,
      years,
      genres: genresParam ? genresParam.split(",").filter(Boolean) : [],
      languages: languagesParam ? languagesParam.split(",").filter(Boolean) : [],
      countries: countriesParam ? countriesParam.split(",").filter(Boolean) : [],
      runtimes,
      certifications: certificationsParam
        ? certificationsParam.split(",").filter(Boolean)
        : [],
      ratingFilters,
    };
  }, [searchParams]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      filters.query.length > 0 ||
      filters.years !== null ||
      filters.genres.length > 0 ||
      filters.languages.length > 0 ||
      filters.countries.length > 0 ||
      filters.runtimes !== null ||
      filters.certifications.length > 0 ||
      countActiveRatingFilters(filters.ratingFilters) > 0
    );
  }, [filters]);

  // Update URL params
  const setFilters = useCallback(
    (updates: Partial<DiscoverFilters>) => {
      setSearchParams(
        (prev) => {
          const newParams = new URLSearchParams(prev);
          const newFilters = { ...filters, ...updates };

          // Type
          if (newFilters.type !== DEFAULT_FILTERS.type) {
            newParams.set("type", newFilters.type);
          } else {
            newParams.delete("type");
          }

          // Mode
          if (newFilters.mode !== DEFAULT_MODE) {
            newParams.set("mode", newFilters.mode);
          } else {
            newParams.delete("mode");
          }

          // Period (only set if mode uses period)
          if (modeHasPeriod(newFilters.mode) && newFilters.period !== DEFAULT_PERIOD) {
            newParams.set("period", newFilters.period);
          } else {
            newParams.delete("period");
          }

          // Query
          if (newFilters.query) {
            newParams.set("q", newFilters.query);
          } else {
            newParams.delete("q");
          }

          // Years
          if (newFilters.years) {
            newParams.set("years", newFilters.years);
          } else {
            newParams.delete("years");
          }

          // Genres
          if (newFilters.genres.length > 0) {
            newParams.set("genres", newFilters.genres.join(","));
          } else {
            newParams.delete("genres");
          }

          // Languages
          if (newFilters.languages.length > 0) {
            newParams.set("languages", newFilters.languages.join(","));
          } else {
            newParams.delete("languages");
          }

          // Countries
          if (newFilters.countries.length > 0) {
            newParams.set("countries", newFilters.countries.join(","));
          } else {
            newParams.delete("countries");
          }

          // Runtimes
          if (newFilters.runtimes) {
            newParams.set("runtimes", newFilters.runtimes);
          } else {
            newParams.delete("runtimes");
          }

          // Certifications
          if (newFilters.certifications.length > 0) {
            newParams.set("certifications", newFilters.certifications.join(","));
          } else {
            newParams.delete("certifications");
          }

          // Rating filters
          const serializedRatings = serializeRatingFilters(newFilters.ratingFilters);
          if (serializedRatings) {
            newParams.set("ratings", serializedRatings);
          } else {
            newParams.delete("ratings");
          }

          return newParams;
        },
        { replace: true }
      );
    },
    [filters, setSearchParams]
  );

  // Individual filter setters
  const setType = useCallback(
    (type: "movie" | "tv") => {
      // Clear certifications when switching type as they're different
      setFilters({ type, certifications: [] });
    },
    [setFilters]
  );

  const setMode = useCallback(
    (mode: DiscoveryMode) => {
      setFilters({ mode });
    },
    [setFilters]
  );

  const setPeriod = useCallback(
    (period: TraktPeriod) => setFilters({ period }),
    [setFilters]
  );

  const setQuery = useCallback(
    (query: string) => setFilters({ query }),
    [setFilters]
  );

  const setYears = useCallback(
    (years: string | null) => setFilters({ years }),
    [setFilters]
  );

  const setGenres = useCallback(
    (genres: string[]) => setFilters({ genres }),
    [setFilters]
  );

  const toggleGenre = useCallback(
    (genreSlug: string) => {
      const newGenres = filters.genres.includes(genreSlug)
        ? filters.genres.filter((g) => g !== genreSlug)
        : [...filters.genres, genreSlug];
      setFilters({ genres: newGenres });
    },
    [filters.genres, setFilters]
  );

  const setLanguages = useCallback(
    (languages: string[]) => setFilters({ languages }),
    [setFilters]
  );

  const toggleLanguage = useCallback(
    (langCode: string) => {
      const newLanguages = filters.languages.includes(langCode)
        ? filters.languages.filter((l) => l !== langCode)
        : [...filters.languages, langCode];
      setFilters({ languages: newLanguages });
    },
    [filters.languages, setFilters]
  );

  const setCountries = useCallback(
    (countries: string[]) => setFilters({ countries }),
    [setFilters]
  );

  const toggleCountry = useCallback(
    (countryCode: string) => {
      const newCountries = filters.countries.includes(countryCode)
        ? filters.countries.filter((c) => c !== countryCode)
        : [...filters.countries, countryCode];
      setFilters({ countries: newCountries });
    },
    [filters.countries, setFilters]
  );

  const setRuntimes = useCallback(
    (runtimes: string | null) => setFilters({ runtimes }),
    [setFilters]
  );

  const setCertifications = useCallback(
    (certifications: string[]) => setFilters({ certifications }),
    [setFilters]
  );

  const toggleCertification = useCallback(
    (cert: string) => {
      const newCerts = filters.certifications.includes(cert)
        ? filters.certifications.filter((c) => c !== cert)
        : [...filters.certifications, cert];
      setFilters({ certifications: newCerts });
    },
    [filters.certifications, setFilters]
  );

  // Set a single rating source's range
  const setRatingRange = useCallback(
    (sourceId: RatingSourceId, range: RatingRange | null) => {
      const newFilters = { ...filters.ratingFilters };
      if (range === null) {
        delete newFilters[sourceId];
      } else {
        newFilters[sourceId] = range;
      }
      setFilters({ ratingFilters: newFilters });
    },
    [filters.ratingFilters, setFilters]
  );

  // Clear all rating filters
  const clearRatingFilters = useCallback(() => {
    setFilters({ ratingFilters: {} });
  }, [setFilters]);

  const clearFilters = useCallback(() => {
    setFilters({
      query: "",
      years: null,
      genres: [],
      languages: ["en"],
      countries: [],
      runtimes: null,
      certifications: [],
      ratingFilters: {},
    });
  }, [setFilters]);

  const resetAll = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  // Save scroll position before navigation
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveScrollPosition(location.search || "default", window.scrollY);
    };

    // Save on scroll (debounced via requestAnimationFrame)
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          saveScrollPosition(location.search || "default", window.scrollY);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("scroll", handleScroll);
      saveScrollPosition(location.search || "default", window.scrollY);
    };
  }, [location.search]);

  // Restore scroll position on back/forward navigation
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;

      const navType =
        performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      if (
        navType?.type === "back_forward" ||
        window.history.state?.idx !== undefined
      ) {
        const restoreScroll = () => {
          if (hasRestoredScroll.current) return;

          const positions = getScrollPositions();
          const savedPosition = positions[location.search || "default"];

          if (savedPosition !== undefined && savedPosition > 0) {
            hasRestoredScroll.current = true;
            window.scrollTo(0, savedPosition);
          }
        };

        restoreScroll();
        setTimeout(restoreScroll, 100);
        setTimeout(restoreScroll, 300);
        setTimeout(restoreScroll, 500);
      }
    }
  }, [location.search]);

  // Get available certifications for current type
  const availableCertifications = CERTIFICATIONS[filters.type];

  return {
    filters,
    hasActiveFilters,
    availableCertifications,
    setType,
    setMode,
    setPeriod,
    setQuery,
    setYears,
    setGenres,
    toggleGenre,
    setLanguages,
    toggleLanguage,
    setCountries,
    toggleCountry,
    setRuntimes,
    setCertifications,
    toggleCertification,
    setRatingRange,
    clearRatingFilters,
    clearFilters,
    resetAll,
  };
}
