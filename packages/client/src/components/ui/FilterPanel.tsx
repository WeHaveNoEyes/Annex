import { useState, useCallback } from "react";
import { RangeSlider } from "./RangeSlider";
import {
  TRAKT_GENRES,
  LANGUAGES,
  COUNTRIES,
  RATING_SOURCES,
  YEAR_PRESETS,
  RUNTIME_PRESETS,
  countActiveRatingFilters,
  type DiscoverFilters,
  type RatingRange,
  type RatingSourceId,
} from "../../hooks/useDiscoverFilters";

interface FilterPanelProps {
  filters: DiscoverFilters;
  hasActiveFilters: boolean;
  availableCertifications: readonly { code: string; name: string }[];
  onToggleGenre: (genreSlug: string) => void;
  onSetYears: (years: string | null) => void;
  onToggleLanguage: (langCode: string) => void;
  onToggleCountry: (countryCode: string) => void;
  onSetRuntimes: (runtimes: string | null) => void;
  onToggleCertification: (cert: string) => void;
  onSetRatingRange: (sourceId: RatingSourceId, range: RatingRange | null) => void;
  onClearRatingFilters: () => void;
  onClearFilters: () => void;
}

interface FilterSectionProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: string | number;
}

function FilterSection({
  title,
  isOpen,
  onToggle,
  children,
  badge,
}: FilterSectionProps) {
  return (
    <div className="border-b border-white/10 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-3 px-1 text-left text-sm font-medium text-white/80 hover:text-white transition-colors"
      >
        <span className="flex items-center gap-2">
          {title}
          {badge !== undefined && badge !== 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-annex-500/20 text-annex-400 rounded">
              {badge}
            </span>
          )}
        </span>
        <svg
          className={`w-4 h-4 text-white/40 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? "max-h-[800px] pb-4" : "max-h-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function FilterPanel({
  filters,
  hasActiveFilters,
  availableCertifications,
  onToggleGenre,
  onSetYears,
  onToggleLanguage,
  onToggleCountry,
  onSetRuntimes,
  onToggleCertification,
  onSetRatingRange,
  onClearRatingFilters,
  onClearFilters,
}: FilterPanelProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    genres: true,
    year: false,
    runtime: false,
    language: false,
    country: false,
    certification: false,
    ratings: false,
  });

  const toggleSection = useCallback((section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const activeRatingCount = countActiveRatingFilters(filters.ratingFilters);

  const handleRatingChange = (sourceId: RatingSourceId) => (value: [number, number]) => {
    const source = RATING_SOURCES.find((s) => s.id === sourceId);
    if (!source) return;

    if (value[0] === source.min && value[1] === source.max) {
      onSetRatingRange(sourceId, null);
    } else {
      onSetRatingRange(sourceId, { min: value[0], max: value[1] });
    }
  };

  const getRangeForSource = (sourceId: RatingSourceId): [number, number] => {
    const source = RATING_SOURCES.find((s) => s.id === sourceId);
    if (!source) return [0, 100];
    const range = filters.ratingFilters[sourceId];
    return range ? [range.min, range.max] : [source.min, source.max];
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h3 className="text-sm font-semibold text-white/90">Filters</h3>
        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            className="text-xs text-annex-400 hover:text-annex-300 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="px-4">
        {/* Genres */}
        <FilterSection
          title="Genres"
          isOpen={openSections.genres}
          onToggle={() => toggleSection("genres")}
          badge={filters.genres.length}
        >
          <div className="flex flex-wrap gap-1.5">
            {TRAKT_GENRES.map((genre) => {
              const isSelected = filters.genres.includes(genre.slug);
              return (
                <button
                  key={genre.slug}
                  onClick={() => onToggleGenre(genre.slug)}
                  className={`px-2.5 py-1 text-xs rounded transition-all duration-150 ${
                    isSelected
                      ? "bg-annex-500/30 text-annex-300 border border-annex-500/50"
                      : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white/80"
                  }`}
                >
                  {genre.name}
                </button>
              );
            })}
          </div>
        </FilterSection>

        {/* Year */}
        <FilterSection
          title="Year"
          isOpen={openSections.year}
          onToggle={() => toggleSection("year")}
          badge={filters.years || undefined}
        >
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {YEAR_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => onSetYears(preset.value)}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${
                    filters.years === preset.value
                      ? "bg-annex-500/30 text-annex-300 border border-annex-500/50"
                      : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white/80"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {/* Custom year input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="e.g., 2020 or 2020-2024"
                value={filters.years || ""}
                onChange={(e) => onSetYears(e.target.value || null)}
                className="flex-1 px-2.5 py-1.5 text-xs bg-white/5 border border-white/10 rounded text-white/80 placeholder-white/30 focus:outline-none focus:border-annex-500/50"
              />
            </div>
          </div>
        </FilterSection>

        {/* Runtime */}
        <FilterSection
          title="Runtime"
          isOpen={openSections.runtime}
          onToggle={() => toggleSection("runtime")}
          badge={filters.runtimes || undefined}
        >
          <div className="flex flex-wrap gap-1.5">
            {RUNTIME_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => onSetRuntimes(preset.value)}
                className={`px-2.5 py-1 text-xs rounded transition-colors ${
                  filters.runtimes === preset.value
                    ? "bg-annex-500/30 text-annex-300 border border-annex-500/50"
                    : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white/80"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </FilterSection>

        {/* Language */}
        <FilterSection
          title="Language"
          isOpen={openSections.language}
          onToggle={() => toggleSection("language")}
          badge={filters.languages.length || undefined}
        >
          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
            {LANGUAGES.map((lang) => {
              const isSelected = filters.languages.includes(lang.code);
              return (
                <button
                  key={lang.code}
                  onClick={() => onToggleLanguage(lang.code)}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${
                    isSelected
                      ? "bg-annex-500/30 text-annex-300 border border-annex-500/50"
                      : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white/80"
                  }`}
                >
                  {lang.name}
                </button>
              );
            })}
          </div>
        </FilterSection>

        {/* Country */}
        <FilterSection
          title="Country"
          isOpen={openSections.country}
          onToggle={() => toggleSection("country")}
          badge={filters.countries.length || undefined}
        >
          <div className="flex flex-wrap gap-1.5">
            {COUNTRIES.map((country) => {
              const isSelected = filters.countries.includes(country.code);
              return (
                <button
                  key={country.code}
                  onClick={() => onToggleCountry(country.code)}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${
                    isSelected
                      ? "bg-annex-500/30 text-annex-300 border border-annex-500/50"
                      : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white/80"
                  }`}
                >
                  {country.name}
                </button>
              );
            })}
          </div>
        </FilterSection>

        {/* Certification */}
        <FilterSection
          title="Certification"
          isOpen={openSections.certification}
          onToggle={() => toggleSection("certification")}
          badge={filters.certifications.length || undefined}
        >
          <div className="flex flex-wrap gap-1.5">
            {availableCertifications.map((cert) => {
              const isSelected = filters.certifications.includes(cert.code);
              return (
                <button
                  key={cert.code}
                  onClick={() => onToggleCertification(cert.code)}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${
                    isSelected
                      ? "bg-annex-500/30 text-annex-300 border border-annex-500/50"
                      : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white/80"
                  }`}
                >
                  {cert.name}
                </button>
              );
            })}
          </div>
        </FilterSection>

        {/* Rating Filters */}
        <FilterSection
          title="Ratings"
          isOpen={openSections.ratings}
          onToggle={() => toggleSection("ratings")}
          badge={activeRatingCount > 0 ? activeRatingCount : undefined}
        >
          <div className="space-y-4">
            <p className="text-xs text-white/40">
              Filter by rating sources. Trakt uses these when filtering results.
            </p>

            <div className="space-y-5 px-2">
              {RATING_SOURCES.map((source) => {
                const range = getRangeForSource(source.id);

                return (
                  <RangeSlider
                    key={source.id}
                    min={source.min}
                    max={source.max}
                    step={source.step}
                    value={range}
                    onChange={handleRatingChange(source.id)}
                    formatValue={source.format}
                    label={source.name}
                    color="bg-annex-500"
                  />
                );
              })}
            </div>

            {activeRatingCount > 0 && (
              <button
                onClick={onClearRatingFilters}
                className="w-full px-3 py-1.5 text-xs text-white/50 hover:text-white/70 bg-white/5 hover:bg-white/10 border border-white/10 rounded transition-colors"
              >
                Clear all rating filters
              </button>
            )}
          </div>
        </FilterSection>
      </div>
    </div>
  );
}
