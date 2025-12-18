/**
 * Configuration and Environment Validation
 *
 * Validates encoder environment on startup:
 * - NFS directory access (read/write permissions)
 * - GPU device availability
 * - FFmpeg installation and capabilities
 * - Network connectivity to server
 */

import * as fs from "fs";
import * as path from "path";
import { getConfig } from "./config.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate the encoder environment
 */
export async function validateEnvironment(): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config = getConfig();

  console.log("\n[Validation] Checking encoder environment...\n");

  // 1. Validate NFS paths from environment
  const nfsBasePath = process.env.ANNEX_NFS_BASE_PATH;
  if (nfsBasePath) {
    console.log(`[Validation] NFS Base Path: ${nfsBasePath}`);

    // Check if NFS mount exists
    if (!fs.existsSync(nfsBasePath)) {
      errors.push(`NFS base path does not exist: ${nfsBasePath}`);
    } else {
      // Check read permissions
      try {
        fs.readdirSync(nfsBasePath);
        console.log("  ✓ NFS mount is readable");
      } catch (e) {
        errors.push(`Cannot read NFS base path: ${nfsBasePath} - ${e}`);
      }

      // Check write permissions
      const testFile = path.join(nfsBasePath, `.annex-write-test-${Date.now()}`);
      try {
        fs.writeFileSync(testFile, "test");
        fs.unlinkSync(testFile);
        console.log("  ✓ NFS mount is writable");
      } catch (e) {
        errors.push(`Cannot write to NFS base path: ${nfsBasePath} - ${e}`);
      }

      // Check for expected subdirectories
      const expectedPaths = [
        process.env.ENCODER_REMOTE_DOWNLOADS_PATH,
        process.env.ENCODER_REMOTE_WORKING_PATH,
      ].filter(Boolean);

      for (const expectedPath of expectedPaths) {
        if (expectedPath && !fs.existsSync(expectedPath)) {
          warnings.push(`Expected path not found: ${expectedPath} (will be created on demand)`);
        }
      }
    }
  } else {
    warnings.push("ANNEX_NFS_BASE_PATH not configured - file access may fail");
  }

  // 2. Validate GPU device (optional - for hardware encoding)
  console.log(`\n[Validation] GPU Device: ${config.gpuDevice}`);
  if (!fs.existsSync(config.gpuDevice)) {
    warnings.push(`GPU device not found: ${config.gpuDevice} - hardware encoding will not be available`);
  } else {
    try {
      fs.accessSync(config.gpuDevice, fs.constants.R_OK | fs.constants.W_OK);
      console.log("  ✓ GPU device is accessible");
    } catch (_e) {
      warnings.push(`Cannot access GPU device: ${config.gpuDevice} - hardware encoding will not be available`);
    }
  }

  // 3. Validate FFmpeg installation
  console.log("\n[Validation] FFmpeg Installation:");
  try {
    const ffmpegCheck = Bun.spawn(["ffmpeg", "-version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const ffmpegOutput = await new Response(ffmpegCheck.stdout).text();
    const ffmpegExit = await ffmpegCheck.exited;

    if (ffmpegExit === 0) {
      const version = ffmpegOutput.split("\n")[0];
      console.log(`  ✓ ${version}`);

      // Check for VAAPI support
      const hasVaapi = ffmpegOutput.includes("--enable-vaapi");
      if (hasVaapi) {
        console.log("  ✓ VAAPI hardware acceleration available");
      } else {
        warnings.push("FFmpeg does not have VAAPI support - hardware encoding will not be available");
      }

      // Check for available video encoders
      const ffmpegEncoders = Bun.spawn(["ffmpeg", "-encoders"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const encodersOutput = await new Response(ffmpegEncoders.stdout).text();
      await ffmpegEncoders.exited;

      // Check for various encoder types
      const encoders = {
        // AV1 encoders
        av1_vaapi: encodersOutput.includes("av1_vaapi"),
        libsvtav1: encodersOutput.includes("libsvtav1"),
        libaom: encodersOutput.includes("libaom-av1"),

        // HEVC/H.265 encoders
        hevc_vaapi: encodersOutput.includes("hevc_vaapi"),
        libx265: encodersOutput.includes("libx265"),

        // H.264 encoders
        h264_vaapi: encodersOutput.includes("h264_vaapi"),
        libx264: encodersOutput.includes("libx264"),
      };

      // Display available encoders
      console.log("\n[Validation] Available Video Encoders:");

      if (encoders.av1_vaapi) console.log("  ✓ AV1 (hardware): av1_vaapi");
      if (encoders.libsvtav1) console.log("  ✓ AV1 (software): libsvtav1");
      if (encoders.libaom) console.log("  ✓ AV1 (software): libaom-av1");

      if (encoders.hevc_vaapi) console.log("  ✓ HEVC/H.265 (hardware): hevc_vaapi");
      if (encoders.libx265) console.log("  ✓ HEVC/H.265 (software): libx265");

      if (encoders.h264_vaapi) console.log("  ✓ H.264 (hardware): h264_vaapi");
      if (encoders.libx264) console.log("  ✓ H.264 (software): libx264");

      // Check if any video encoder is available
      const hasAnyEncoder = Object.values(encoders).some(e => e);

      if (!hasAnyEncoder) {
        errors.push("No video encoders available - FFmpeg cannot encode video");
      } else {
        // Provide helpful recommendations
        if (!encoders.av1_vaapi && !encoders.libsvtav1 && !encoders.libaom) {
          warnings.push("No AV1 encoders available - profiles using AV1 will fail (HEVC/H.264 profiles will work)");
        }
        if (!encoders.av1_vaapi && !encoders.hevc_vaapi && !encoders.h264_vaapi) {
          warnings.push("No hardware encoders available - encoding will use CPU (slower)");
        }
      }
    } else {
      errors.push("FFmpeg check failed");
    }
  } catch (e) {
    errors.push(`FFmpeg not found or not executable: ${e}`);
  }

  // 4. Validate ffprobe installation
  console.log("\n[Validation] FFprobe Installation:");
  try {
    const ffprobeCheck = Bun.spawn(["ffprobe", "-version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const ffprobeExit = await ffprobeCheck.exited;

    if (ffprobeExit === 0) {
      console.log("  ✓ ffprobe is available");
    } else {
      errors.push("ffprobe check failed");
    }
  } catch (e) {
    errors.push(`ffprobe not found or not executable: ${e}`);
  }

  // 5. Validate network connectivity to server
  console.log(`\n[Validation] Server Connectivity: ${config.serverUrl}`);
  try {
    const url = new URL(config.serverUrl);
    const protocol = url.protocol === "wss:" ? "https:" : "http:";
    const healthUrl = `${protocol}//${url.host}/health`;

    const response = await fetch(healthUrl, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      console.log("  ✓ Server is reachable");
    } else {
      warnings.push(`Server returned status ${response.status} - may not be healthy`);
    }
  } catch (e) {
    warnings.push(`Cannot reach server: ${e}`);
  }

  // 6. Validate encoder configuration
  console.log("\n[Validation] Encoder Configuration:");
  console.log(`  Encoder ID: ${config.encoderId}`);
  console.log(`  Max Concurrent: ${config.maxConcurrent}`);
  console.log(`  Heartbeat Interval: ${config.heartbeatInterval}ms`);
  console.log(`  Reconnect Interval: ${config.reconnectInterval}ms - ${config.maxReconnectInterval}ms`);

  if (config.maxConcurrent < 1 || config.maxConcurrent > 8) {
    warnings.push(`Unusual maxConcurrent value: ${config.maxConcurrent} (recommended: 1-8)`);
  }

  if (config.heartbeatInterval < 5000) {
    warnings.push(`Very short heartbeat interval: ${config.heartbeatInterval}ms (may cause excessive traffic)`);
  }

  // Summary
  console.log("\n[Validation] Summary:");
  console.log(`  Errors: ${errors.length}`);
  console.log(`  Warnings: ${warnings.length}\n`);

  if (errors.length > 0) {
    console.error("❌ Validation failed with errors:");
    errors.forEach((error) => console.error(`   - ${error}`));
  }

  if (warnings.length > 0) {
    console.warn("⚠️  Validation warnings:");
    warnings.forEach((warning) => console.warn(`   - ${warning}`));
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log("✅ All validation checks passed!");
  }

  console.log("");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
