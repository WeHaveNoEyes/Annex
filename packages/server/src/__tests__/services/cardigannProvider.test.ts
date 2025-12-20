import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CardigannRepository } from "../../services/cardigann/repository.js";
import type { CardigannSearchResult } from "../../services/cardigann/types.js";
import { getCardigannProvider } from "../../services/cardigannProvider.js";

describe("Cardigann Provider Integration", () => {
  let tempDir: string;
  let repository: CardigannRepository;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "cardigann-provider-test-"));
    repository = new CardigannRepository(tempDir);

    // Create a minimal test definition
    const testDefinition = `
id: test-indexer
name: Test Indexer
links:
  - https://test.example.com
settings:
  - name: username
    type: text
    label: Username
caps:
  categorymappings:
    - {id: 1, cat: TV, desc: "TV Shows"}
    - {id: 2, cat: Movies, desc: "Movies"}
  modes:
    search: [q]
search:
  paths:
    - path: /search
`;

    await repository.saveDefinition("test-indexer", testDefinition);
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("transformToRelease", () => {
    it("transforms CardigannSearchResult to Release format", () => {
      const provider = getCardigannProvider();

      const cardigannResult: CardigannSearchResult = {
        title: "Test Movie 2024 1080p BluRay x264",
        downloadUrl: "magnet:?xt=urn:btih:abc123",
        size: 5000000000,
        seeders: 10,
        leechers: 5,
        publishDate: new Date("2024-01-01"),
        category: ["2000"],
      };

      // Access private method through type casting for testing
      const release = (provider as any).transformToRelease(
        cardigannResult,
        "indexer-1",
        "Test Indexer"
      );

      expect(release.title).toBe("Test Movie 2024 1080p BluRay x264");
      expect(release.indexerId).toBe("indexer-1");
      expect(release.indexerName).toBe("Test Indexer");
      expect(release.resolution).toBe("1080p");
      expect(release.source).toBe("BLURAY");
      expect(release.codec).toBe("H264");
      expect(release.magnetUri).toBe("magnet:?xt=urn:btih:abc123");
      expect(release.downloadUrl).toBeUndefined();
      expect(release.size).toBe(5000000000);
      expect(release.seeders).toBe(10);
      expect(release.leechers).toBe(5);
      expect(release.score).toBeGreaterThan(0);
    });

    it("handles direct download URLs", () => {
      const provider = getCardigannProvider();

      const cardigannResult: CardigannSearchResult = {
        title: "Test.Release.720p.WEB-DL.H265",
        downloadUrl: "https://test.com/download/123.torrent",
        size: 2000000000,
      };

      const release = (provider as any).transformToRelease(
        cardigannResult,
        "indexer-1",
        "Test Indexer"
      );

      expect(release.downloadUrl).toBe("https://test.com/download/123.torrent");
      expect(release.magnetUri).toBeUndefined();
      expect(release.resolution).toBe("720p");
      expect(release.source).toBe("WEB-DL");
      expect(release.codec).toBe("HEVC");
    });
  });

  describe("quality extraction", () => {
    it("extracts resolution correctly", () => {
      const provider = getCardigannProvider();

      expect((provider as any).extractResolution("Movie 2160p UHD")).toBe("2160p");
      expect((provider as any).extractResolution("Movie 1080p")).toBe("1080p");
      expect((provider as any).extractResolution("Movie 720p")).toBe("720p");
      expect((provider as any).extractResolution("Movie 480p")).toBe("480p");
      expect((provider as any).extractResolution("Movie DVDRip")).toBe("SD");
    });

    it("extracts source correctly", () => {
      const provider = getCardigannProvider();

      expect((provider as any).extractSource("Movie REMUX")).toBe("REMUX");
      expect((provider as any).extractSource("Movie BluRay")).toBe("BLURAY");
      expect((provider as any).extractSource("Movie WEB-DL")).toBe("WEB-DL");
      expect((provider as any).extractSource("Movie WEBDL")).toBe("WEB-DL");
      expect((provider as any).extractSource("Movie WEBRip")).toBe("WEBRIP");
      expect((provider as any).extractSource("Movie HDTV")).toBe("HDTV");
      expect((provider as any).extractSource("Movie CAM")).toBe("CAM");
    });

    it("extracts codec correctly", () => {
      const provider = getCardigannProvider();

      expect((provider as any).extractCodec("Movie AV1")).toBe("AV1");
      expect((provider as any).extractCodec("Movie HEVC")).toBe("HEVC");
      expect((provider as any).extractCodec("Movie H265")).toBe("HEVC");
      expect((provider as any).extractCodec("Movie x265")).toBe("HEVC");
      expect((provider as any).extractCodec("Movie H264")).toBe("H264");
      expect((provider as any).extractCodec("Movie x264")).toBe("H264");
    });

    it("calculates quality scores", () => {
      const provider = getCardigannProvider();

      const score2160p = (provider as any).calculateScore(
        "Movie 2160p REMUX AV1",
        "2160p",
        "REMUX",
        "AV1",
        100
      );
      const score1080p = (provider as any).calculateScore(
        "Movie 1080p BluRay x264",
        "1080p",
        "BLURAY",
        "H264",
        50
      );

      expect(score2160p).toBeGreaterThan(score1080p);
    });
  });
});
