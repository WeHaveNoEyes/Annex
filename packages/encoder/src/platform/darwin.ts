/**
 * macOS Platform Setup
 *
 * Generates and optionally installs launchd service.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { CliArgs } from "../cli.js";

interface SetupOptions {
  install: boolean;
  systemLevel: boolean;
}

/**
 * Get setup options from CLI args with defaults
 */
function getSetupOptions(args: CliArgs): SetupOptions {
  return {
    install: args.flags.install ?? false,
    systemLevel: false, // User-level by default
  };
}

/**
 * Generate launchd plist file content
 */
function generatePlistFile(systemLevel: boolean): string {
  const hostname = os.hostname();
  const binPath = systemLevel ? "/usr/local/bin/annex-encoder" : `${os.homedir()}/bin/annex-encoder`;
  const logPath = systemLevel ? "/var/log/annex-encoder" : `${os.homedir()}/Library/Logs/annex-encoder`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.annex.encoder</string>
    <key>ProgramArguments</key>
    <array>
        <string>${binPath}</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>ANNEX_SERVER_URL</key>
        <string>ws://server:3000/encoder</string>
        <key>ANNEX_ENCODER_ID</key>
        <string>encoder-${hostname}</string>
        <key>ANNEX_GPU_DEVICE</key>
        <string>0</string>
        <key>ANNEX_NFS_BASE_PATH</key>
        <string>/Volumes/downloads</string>
        <key>ANNEX_LOG_LEVEL</key>
        <string>info</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${logPath}.log</string>
    <key>StandardErrorPath</key>
    <string>${logPath}.error.log</string>
</dict>
</plist>
`;
}

/**
 * Check if launchctl is available
 */
function hasLaunchctl(): boolean {
  try {
    const proc = Bun.spawn(["which", "launchctl"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = proc.exitCode;
    return exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Setup macOS launchd service
 */
export async function setupDarwin(args: CliArgs): Promise<void> {
  const options = getSetupOptions(args);

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║    Annex Encoder - macOS launchd Setup                       ║
╚═══════════════════════════════════════════════════════════════╝

Configuration:
  Service Level:  ${options.systemLevel ? "System (LaunchDaemons)" : "User (LaunchAgents)"}
  Install:        ${options.install ? "Yes" : "No (generate plist only)"}
`);

  // Check if launchctl is available (only required for install)
  if (options.install && !hasLaunchctl()) {
    console.error("Error: launchctl not found. This system may not support launchd.");
    process.exit(1);
  }

  // Determine plist path
  const plistFilename = "com.annex.encoder.plist";
  const plistPath = options.systemLevel
    ? `/Library/LaunchDaemons/${plistFilename}`
    : `${os.homedir()}/Library/LaunchAgents/${plistFilename}`;

  // Generate plist content
  const plistContent = generatePlistFile(options.systemLevel);

  if (options.install) {
    console.log("[1/3] Installing launchd plist...");

    // Ensure directory exists
    const plistDir = path.dirname(plistPath);
    try {
      fs.mkdirSync(plistDir, { recursive: true });
    } catch (error) {
      console.error(`  ✗ Failed to create directory ${plistDir}:`, error);
      process.exit(1);
    }

    // Write plist file
    try {
      fs.writeFileSync(plistPath, plistContent);
      console.log(`  ✓ Created ${plistPath}`);
    } catch (error) {
      console.error(`  ✗ Failed to write ${plistPath}:`, error);
      process.exit(1);
    }

    // Unload existing service if running
    console.log("\n[2/3] Unloading existing service (if any)...");
    try {
      const unloadProc = Bun.spawn(["launchctl", "unload", plistPath], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await unloadProc.exited;
      console.log("  ✓ Unloaded existing service");
    } catch {
      console.log("  ⚠ No existing service to unload");
    }

    // Load the service
    console.log("\n[3/3] Loading service...");
    try {
      const loadProc = Bun.spawn(["launchctl", "load", plistPath], {
        stdout: "inherit",
        stderr: "inherit",
      });
      await loadProc.exited;
      console.log("  ✓ Service loaded");
    } catch (error) {
      console.error("  ✗ Failed to load service:", error);
      process.exit(1);
    }

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║    Installation Complete                                      ║
╚═══════════════════════════════════════════════════════════════╝

Next steps:
  1. Edit plist to configure: ${plistPath}
  2. Ensure encoder binary is installed
  3. Reload service: launchctl unload ${plistPath} && launchctl load ${plistPath}
  4. Check status: launchctl list | grep annex
  5. View logs: tail -f ${options.systemLevel ? "/var/log/annex-encoder" : os.homedir() + "/Library/Logs/annex-encoder"}.log
`);
  } else {
    // Generate plist only
    console.log("[1/1] Generating launchd plist...");

    const outputDir = process.cwd();
    const plistFilePath = path.join(outputDir, plistFilename);

    try {
      fs.writeFileSync(plistFilePath, plistContent);
      console.log(`  ✓ Generated ${plistFilePath}`);
    } catch (error) {
      console.error(`  ✗ Failed to write ${plistFilePath}:`, error);
      process.exit(1);
    }

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║    Plist Generated                                            ║
╚═══════════════════════════════════════════════════════════════╝

Plist file has been generated in the current directory.

To install manually (user-level):
  1. Edit com.annex.encoder.plist with your configuration
  2. cp com.annex.encoder.plist ~/Library/LaunchAgents/
  3. launchctl load ~/Library/LaunchAgents/com.annex.encoder.plist

To install system-level (requires sudo):
  1. sudo cp com.annex.encoder.plist /Library/LaunchDaemons/
  2. sudo launchctl load /Library/LaunchDaemons/com.annex.encoder.plist

Or run with --install to install automatically.
`);
  }
}
