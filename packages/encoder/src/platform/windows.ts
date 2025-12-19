/**
 * Windows Platform Setup
 *
 * Generates and optionally installs Windows Service.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CliArgs } from "../cli.js";

interface SetupOptions {
  install: boolean;
}

/**
 * Get setup options from CLI args with defaults
 */
function getSetupOptions(args: CliArgs): SetupOptions {
  return {
    install: args.flags.install ?? false,
  };
}

/**
 * Generate PowerShell installation script
 */
function generateInstallScript(): string {
  const computerName = os.hostname();
  return `# Annex Encoder Windows Service Setup
# Run this script as Administrator

$ErrorActionPreference = "Stop"

# Configuration
$serviceName = "AnnexEncoder"
$displayName = "Annex Remote Encoder"
$description = "Remote AV1 encoding service for Annex media platform"
$installPath = "C:\\Program Files\\Annex Encoder"
$execPath = "$installPath\\annex-encoder.exe"

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Error: This script must be run as Administrator" -ForegroundColor Red
    exit 1
}

Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║    Annex Encoder - Windows Service Installation              ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if service already exists
$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Host "Service already exists. Stopping and removing..." -ForegroundColor Yellow
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $serviceName
    Start-Sleep -Seconds 2
}

# Set environment variables for the service
Write-Host "[1/3] Setting environment variables..." -ForegroundColor Cyan
[Environment]::SetEnvironmentVariable("ANNEX_SERVER_URL", "ws://server:3000/encoder", "Machine")
[Environment]::SetEnvironmentVariable("ANNEX_ENCODER_ID", "encoder-${computerName}", "Machine")
[Environment]::SetEnvironmentVariable("ANNEX_GPU_DEVICE", "0", "Machine")
[Environment]::SetEnvironmentVariable("ANNEX_NFS_BASE_PATH", "Z:\\downloads", "Machine")
[Environment]::SetEnvironmentVariable("ANNEX_LOG_LEVEL", "info", "Machine")
Write-Host "  ✓ Environment variables set" -ForegroundColor Green

# Create the service
Write-Host ""
Write-Host "[2/3] Creating Windows Service..." -ForegroundColor Cyan
sc.exe create $serviceName binPath= "$execPath" start= auto DisplayName= "$displayName"
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Failed to create service" -ForegroundColor Red
    exit 1
}

sc.exe description $serviceName "$description"
sc.exe failure $serviceName reset= 86400 actions= restart/60000/restart/60000/restart/60000
Write-Host "  ✓ Service created: $serviceName" -ForegroundColor Green

# Start the service
Write-Host ""
Write-Host "[3/3] Starting service..." -ForegroundColor Cyan
Start-Service -Name $serviceName -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$service = Get-Service -Name $serviceName
if ($service.Status -eq "Running") {
    Write-Host "  ✓ Service started successfully" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Service created but not running. Check Event Viewer for errors." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║    Installation Complete                                      ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Edit environment variables in System Properties"
Write-Host "  2. Ensure encoder binary is at: $execPath"
Write-Host "  3. Restart service: Restart-Service $serviceName"
Write-Host "  4. Check status: Get-Service $serviceName"
Write-Host "  5. View logs: Get-EventLog -LogName Application -Source $serviceName -Newest 50"
Write-Host ""
`;
}

/**
 * Check if running as Administrator
 */
function isAdmin(): boolean {
  // On Windows, check if we can write to a system directory
  try {
    const testPath = "C:\\Windows\\Temp\\annex-test";
    fs.writeFileSync(testPath, "test");
    fs.unlinkSync(testPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Setup Windows service
 */
export async function setupWindows(args: CliArgs): Promise<void> {
  const options = getSetupOptions(args);

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║    Annex Encoder - Windows Service Setup                     ║
╚═══════════════════════════════════════════════════════════════╝

Configuration:
  Install:        ${options.install ? "Yes" : "No (generate script only)"}
`);

  // Check if install requires admin
  if (options.install && !isAdmin()) {
    console.error("Error: --install requires Administrator privileges");
    console.error("Run from an elevated PowerShell prompt");
    process.exit(1);
  }

  // Generate installation script
  const scriptContent = generateInstallScript();

  if (options.install) {
    console.log("[1/2] Generating installation script...");
    const tempScript = path.join(os.tmpdir(), "install-annex-encoder.ps1");

    try {
      fs.writeFileSync(tempScript, scriptContent);
      console.log(`  ✓ Generated ${tempScript}`);
    } catch (error) {
      console.error(`  ✗ Failed to write script:`, error);
      process.exit(1);
    }

    console.log("\n[2/2] Running installation script...");
    try {
      const proc = Bun.spawn(
        ["powershell.exe", "-ExecutionPolicy", "Bypass", "-File", tempScript],
        {
          stdout: "inherit",
          stderr: "inherit",
        }
      );
      await proc.exited;

      // Clean up temp script
      try {
        fs.unlinkSync(tempScript);
      } catch {
        // Ignore cleanup errors
      }
    } catch (error) {
      console.error("  ✗ Failed to run installation script:", error);
      process.exit(1);
    }
  } else {
    // Generate script only
    console.log("[1/1] Generating installation script...");

    const outputDir = process.cwd();
    const scriptPath = path.join(outputDir, "install-service.ps1");

    try {
      fs.writeFileSync(scriptPath, scriptContent);
      console.log(`  ✓ Generated ${scriptPath}`);
    } catch (error) {
      console.error(`  ✗ Failed to write ${scriptPath}:`, error);
      process.exit(1);
    }

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║    Script Generated                                           ║
╚═══════════════════════════════════════════════════════════════╝

Installation script has been generated in the current directory.

To install manually:
  1. Review and edit install-service.ps1 if needed
  2. Open PowerShell as Administrator
  3. Run: .\\install-service.ps1

Or run with --install to install automatically (requires Administrator).
`);
  }
}
