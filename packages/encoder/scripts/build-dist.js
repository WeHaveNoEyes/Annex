#!/usr/bin/env bun

/**
 * Build script for cross-platform encoder binaries
 *
 * Creates standalone executables for all platforms using `bun build --compile`:
 * - linux-x64
 * - linux-arm64
 * - windows-x64
 * - darwin-x64
 * - darwin-arm64
 *
 * Outputs:
 * - dist-binaries/<platform>/annex-encoder[.exe]
 * - dist-binaries/manifest.json (with checksums and metadata)
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT, "dist-binaries");
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));

const PLATFORMS = [
  { target: "bun-linux-x64", output: "annex-encoder-linux-x64", ext: "" },
  { target: "bun-linux-arm64", output: "annex-encoder-linux-arm64", ext: "" },
  { target: "bun-windows-x64", output: "annex-encoder-windows-x64", ext: ".exe" },
  { target: "bun-darwin-x64", output: "annex-encoder-darwin-x64", ext: "" },
  { target: "bun-darwin-arm64", output: "annex-encoder-darwin-arm64", ext: "" },
];

/**
 * Generate version.ts with embedded version and build date
 */
function generateVersionFile() {
  const versionContent = `/**
 * Version information
 * Auto-generated during build
 */

export const VERSION = "${PKG.version}";
export const BUILD_DATE = "${new Date().toISOString()}";
export const BUILD_TIMESTAMP = ${Date.now()};
`;

  const versionPath = path.join(ROOT, "src", "version.ts");
  fs.writeFileSync(versionPath, versionContent);
  console.log(`[Build] Generated version.ts: ${PKG.version}`);
}

/**
 * Calculate SHA256 checksum of a file
 */
function calculateChecksum(filePath) {
  const content = fs.readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Build for a specific platform
 */
async function buildPlatform(platform) {
  console.log(`\n[Build] Building for ${platform.target}...`);

  const outputPath = path.join(DIST_DIR, `${platform.output}${platform.ext}`);

  // Build with Bun
  const proc = Bun.spawn(
    [
      "bun",
      "build",
      "--compile",
      `--target=${platform.target}`,
      `--outfile=${outputPath}`,
      path.join(ROOT, "src", "index.ts"),
    ],
    {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  const _stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    console.error(`[Build] Failed to build ${platform.target}:`);
    console.error(stderr);
    throw new Error(`Build failed with exit code ${exitCode}`);
  }

  // Get file stats
  const stats = fs.statSync(outputPath);
  const checksum = calculateChecksum(outputPath);

  console.log(`[Build] ✓ ${platform.output}${platform.ext}`);
  console.log(`       Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`       SHA256: ${checksum.slice(0, 16)}...`);

  return {
    size: stats.size,
    sha256: checksum,
  };
}

/**
 * Generate manifest.json with all platform metadata
 */
function generateManifest(platformData) {
  const manifest = {
    version: PKG.version,
    buildDate: new Date().toISOString(),
    platforms: {},
  };

  for (let i = 0; i < PLATFORMS.length; i++) {
    const platform = PLATFORMS[i];
    const data = platformData[i];
    const platformKey = platform.output.replace("annex-encoder-", "");

    manifest.platforms[platformKey] = {
      size: data.size,
      sha256: data.sha256,
    };
  }

  const manifestPath = path.join(DIST_DIR, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n[Build] Generated manifest.json`);
}

/**
 * Main build function
 */
async function build() {
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║    Annex Encoder - Cross-Platform Build                      ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝");
  console.log(`\nVersion: ${PKG.version}`);
  console.log(`Platforms: ${PLATFORMS.length}`);

  // Clean dist directory
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // Generate version.ts
  generateVersionFile();

  // Build for each platform sequentially
  const platformData = [];
  for (const platform of PLATFORMS) {
    const data = await buildPlatform(platform);
    platformData.push(data);
  }

  // Generate manifest
  generateManifest(platformData);

  // Summary
  const totalSize = platformData.reduce((sum, data) => sum + data.size, 0);
  console.log("\n╔═══════════════════════════════════════════════════════════════╗");
  console.log("║    Build Complete                                             ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝");
  console.log(`\nTotal size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Output: ${DIST_DIR}`);
  console.log(`\nBinaries:`);
  for (const platform of PLATFORMS) {
    console.log(`  - ${platform.output}${platform.ext}`);
  }
  console.log(`  - manifest.json`);
}

build().catch((err) => {
  console.error("\n[Build] Error:", err);
  process.exit(1);
});
