import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Find the main video file in a directory (largest video file)
 * If the path is already a file, returns it directly
 */
export async function findMainVideoFile(filePath: string): Promise<string | null> {
  try {
    // Check if path is a file or directory
    const stats = await fs.stat(filePath);
    if (!stats.isDirectory()) {
      // If it's already a file, return it
      return filePath;
    }

    // Path is a directory - find the largest video file
    const files = await fs.readdir(filePath);
    const videoExtensions = [".mkv", ".mp4", ".avi", ".m4v", ".ts", ".mov", ".wmv", ".flv"];

    let largestFile: string | null = null;
    let largestSize = 0;

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (videoExtensions.includes(ext)) {
        const fullPath = path.join(filePath, file);
        const fileStats = await fs.stat(fullPath);

        if (fileStats.size > largestSize) {
          largestSize = fileStats.size;
          largestFile = fullPath;
        }
      }
    }

    return largestFile;
  } catch (error) {
    console.error("[fileUtils] Error finding main video file:", error);
    return null;
  }
}
