#!/usr/bin/env bun
/**
 * Build script for creating distributable encoder package
 *
 * Creates a tarball containing:
 * - Bundled encoder (single JS file with all dependencies)
 * - Update script
 * - Minimal package.json
 * - Systemd service template
 */

import * as fs from "fs";
import * as path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT, "dist-package");
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));

async function build() {
  console.log("[Build] Creating distributable encoder package...");

  // Clean dist directory
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // Bundle with Bun.build()
  console.log("[Build] Bundling with Bun...");
  const result = await Bun.build({
    entrypoints: [path.join(ROOT, "src/index.ts")],
    outdir: DIST_DIR,
    target: "bun",
    format: "esm",
    minify: false,
    sourcemap: "external",
    naming: "encoder.js",
  });

  if (!result.success) {
    console.error("[Build] Bundle failed:");
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  // Add shebang to the bundled file
  const bundledPath = path.join(DIST_DIR, "encoder.js");
  const bundledContent = fs.readFileSync(bundledPath, "utf-8");
  fs.writeFileSync(bundledPath, `#!/usr/bin/env bun\n${bundledContent}`);
  fs.chmodSync(bundledPath, 0o755);

  // Create minimal package.json
  const distPackage = {
    name: "annex-encoder",
    version: PKG.version,
    description: PKG.description,
    type: "module",
    main: "encoder.js",
    bin: {
      "annex-encoder": "./encoder.js",
    },
    scripts: {
      start: "bun encoder.js",
    },
    engines: {
      bun: ">=1.0.0",
    },
  };
  fs.writeFileSync(
    path.join(DIST_DIR, "package.json"),
    JSON.stringify(distPackage, null, 2)
  );

  // Copy update script from scripts directory
  const updateScriptSrc = path.join(__dirname, "update.sh");
  fs.copyFileSync(updateScriptSrc, path.join(DIST_DIR, "update.sh"));
  fs.chmodSync(path.join(DIST_DIR, "update.sh"), 0o755);

  // Create systemd service template
  const systemdService = `[Unit]
Description=Annex Remote Encoder
After=network-online.target nfs-client.target
Wants=network-online.target

[Service]
Type=simple
User=annex
Group=annex
WorkingDirectory=/opt/annex-encoder
EnvironmentFile=/etc/annex-encoder.env
ExecStart=/usr/local/bin/bun /opt/annex-encoder/encoder.js
Restart=always
RestartSec=10

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/mnt/downloads
PrivateTmp=true

# GPU access
SupplementaryGroups=video render

[Install]
WantedBy=multi-user.target
`;
  fs.writeFileSync(path.join(DIST_DIR, "annex-encoder.service"), systemdService);

  // Create tarball using Bun shell
  console.log("[Build] Creating tarball...");
  const tarballName = `annex-encoder-${PKG.version}.tar.gz`;
  const tarProc = Bun.spawn(["tar", "-czf", tarballName, "-C", DIST_DIR, "."], {
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  await tarProc.exited;

  // Also create a "latest" copy
  fs.copyFileSync(
    path.join(ROOT, tarballName),
    path.join(ROOT, "annex-encoder-latest.tar.gz")
  );

  const stats = fs.statSync(path.join(ROOT, tarballName));
  console.log(`[Build] Created: ${tarballName} (${(stats.size / 1024).toFixed(1)} KB)`);
  console.log(`[Build] Created: annex-encoder-latest.tar.gz`);
  console.log("[Build] Done!");
}

build().catch((err) => {
  console.error("[Build] Error:", err);
  process.exit(1);
});
