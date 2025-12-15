/**
 * TMDB Image URL Utility
 *
 * Provides image URL construction for TMDB poster paths.
 * Note: Most TMDB functionality has been replaced by Trakt API.
 */

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

/**
 * TMDBService class - minimal version for image URL construction only
 */
export class TMDBService {
  /**
   * Build a TMDB image URL from a path
   */
  static getImageUrl(path: string | null, size: "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "original" = "w500"): string | null {
    if (!path) return null;
    return `${TMDB_IMAGE_BASE}/${size}${path}`;
  }
}

// Singleton instance for compatibility
let tmdbService: TMDBService | null = null;

export function getTMDBService(): TMDBService {
  if (!tmdbService) {
    tmdbService = new TMDBService();
  }
  return tmdbService;
}
