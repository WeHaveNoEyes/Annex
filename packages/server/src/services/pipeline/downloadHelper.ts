import { ProcessingStatus } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { isSampleFile } from "../archive.js";
import { getDownloadService } from "../download.js";

/**
 * Extract episode files from a completed download
 * Updates ProcessingItem records with DOWNLOADED status and file paths
 */
export async function extractEpisodeFilesFromDownload(
  torrentHash: string,
  requestId: string
): Promise<
  Array<{
    season: number;
    episode: number;
    path: string;
    size: number;
    episodeId: string;
  }>
> {
  const qb = getDownloadService();

  // Get torrent progress to get file list
  const progress = await qb.getProgress(torrentHash);
  if (!progress) {
    throw new Error(`Torrent ${torrentHash} not found`);
  }

  // Get all files in the torrent
  const files = await qb.getTorrentFiles(torrentHash);

  // Filter to video files only
  const videoExtensions = [".mkv", ".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v"];
  const minSizeBytes = 100 * 1024 * 1024; // 100MB

  const videoFiles = files.filter(
    (f) =>
      videoExtensions.some((ext) => f.name.toLowerCase().endsWith(ext)) &&
      !isSampleFile(f.name) &&
      f.size >= minSizeBytes
  );

  const episodeFiles: Array<{
    season: number;
    episode: number;
    path: string;
    size: number;
    episodeId: string;
  }> = [];

  // Get download record
  const download = await prisma.download.findFirst({
    where: { torrentHash },
  });

  if (!download) {
    throw new Error(`Download not found for torrent ${torrentHash}`);
  }

  // Parse each file for S##E## pattern
  const episodeRegex = /S(\d{1,2})E(\d{1,2})/i;

  for (const file of videoFiles) {
    const match = file.name.match(episodeRegex);

    if (!match) {
      console.warn(`[DownloadHelper] Could not parse episode info from: ${file.name}`);
      continue;
    }

    const season = Number.parseInt(match[1], 10);
    const episode = Number.parseInt(match[2], 10);
    const fullPath = `${progress.savePath}/${file.name}`;

    // Find existing ProcessingItem record (created during request creation)
    let processingItem = await prisma.processingItem.findUnique({
      where: {
        requestId_type_season_episode: {
          requestId,
          type: "EPISODE",
          season,
          episode,
        },
      },
    });

    // If ProcessingItem doesn't exist (shouldn't happen with new pipeline system),
    // create it now so the episode can be tracked
    if (!processingItem) {
      console.log(
        `[DownloadHelper] Creating missing ProcessingItem record for S${season}E${episode} in request ${requestId}`
      );
      processingItem = await prisma.processingItem.create({
        data: {
          requestId,
          type: "EPISODE",
          season,
          episode,
          status: ProcessingStatus.PENDING,
        },
      });
    }

    // Skip episode if it's already completed or cancelled
    if (
      processingItem.status === ProcessingStatus.COMPLETED ||
      processingItem.status === ProcessingStatus.CANCELLED
    ) {
      console.log(
        `[DownloadHelper] Skipping S${season}E${episode} - already ${processingItem.status.toLowerCase()}`
      );
      continue;
    }

    // Update ProcessingItem with download info
    await prisma.processingItem.update({
      where: { id: processingItem.id },
      data: {
        downloadId: download.id,
        sourceFilePath: fullPath,
        status: ProcessingStatus.DOWNLOADED,
        downloadedAt: new Date(),
      },
    });

    episodeFiles.push({
      season,
      episode,
      path: fullPath,
      size: file.size,
      episodeId: processingItem.id,
    });

    console.log(
      `[DownloadHelper] Updated S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")} to DOWNLOADED: ${file.name}`
    );
  }

  // Sort by season then episode
  episodeFiles.sort((a, b) => {
    if (a.season !== b.season) return a.season - b.season;
    return a.episode - b.episode;
  });

  console.log(
    `[DownloadHelper] Extracted ${episodeFiles.length} episodes from ${videoFiles.length} video files`
  );

  return episodeFiles;
}
