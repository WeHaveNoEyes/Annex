// SSH Key Management Service
// Generates and manages SSH keys for secure server connections

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { logger } from "../utils/logger";

export class SshKeyService {
  private keyDir: string;
  private privateKeyPath: string;
  private publicKeyPath: string;

  constructor() {
    // Store SSH keys in ~/.annex/ssh directory
    const homeDir = os.homedir();
    this.keyDir = path.join(homeDir, ".annex", "ssh");
    this.privateKeyPath = path.join(this.keyDir, "id_ed25519");
    this.publicKeyPath = path.join(this.keyDir, "id_ed25519.pub");
  }

  // Initialize SSH keys (generate if they don't exist)
  async initialize(): Promise<void> {
    try {
      // Create directory if it doesn't exist
      if (!fs.existsSync(this.keyDir)) {
        fs.mkdirSync(this.keyDir, { recursive: true, mode: 0o700 });
        logger.info(`[SSH] Created key directory: ${this.keyDir}`);
      }

      // Check if keys already exist
      if (fs.existsSync(this.privateKeyPath) && fs.existsSync(this.publicKeyPath)) {
        logger.info("[SSH] SSH keys already exist");
        this.validateKeyPermissions();
        return;
      }

      // Generate new SSH key pair
      logger.info("[SSH] Generating new SSH key pair...");
      this.generateKeyPair();
      logger.info("[SSH] SSH key pair generated successfully");
    } catch (error) {
      logger.error("[SSH] Failed to initialize SSH keys:", error);
      throw error;
    }
  }

  // Generate a new SSH key pair using ssh-keygen
  private generateKeyPair(): void {
    try {
      // Generate ed25519 key (modern, secure, and compact)
      const command = [
        "ssh-keygen",
        "-t ed25519",
        "-f",
        this.privateKeyPath,
        "-N ''", // No passphrase
        "-C 'annex@server'",
        "-q", // Quiet mode
      ].join(" ");

      execSync(command, { stdio: "pipe" });

      // Set proper permissions
      fs.chmodSync(this.privateKeyPath, 0o600); // Private key: read/write for owner only
      fs.chmodSync(this.publicKeyPath, 0o644); // Public key: readable by all

      logger.info(`[SSH] Generated SSH key pair at ${this.keyDir}`);
    } catch (error) {
      throw new Error(
        `Failed to generate SSH key pair: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  // Validate key file permissions
  private validateKeyPermissions(): void {
    try {
      const privateKeyStats = fs.statSync(this.privateKeyPath);
      const privateKeyMode = privateKeyStats.mode & 0o777;

      // Private key should be 600 (rw-------)
      if (privateKeyMode !== 0o600) {
        logger.warn(
          `[SSH] Fixing private key permissions from ${privateKeyMode.toString(8)} to 600`
        );
        fs.chmodSync(this.privateKeyPath, 0o600);
      }

      // Public key should be readable
      if (!fs.existsSync(this.publicKeyPath)) {
        throw new Error("Public key file missing");
      }
    } catch (error) {
      logger.error("[SSH] Key permission validation failed:", error);
    }
  }

  // Get the public key content
  getPublicKey(): string {
    try {
      if (!fs.existsSync(this.publicKeyPath)) {
        throw new Error("Public key file does not exist. Run initialize() first.");
      }

      return fs.readFileSync(this.publicKeyPath, "utf-8").trim();
    } catch (error) {
      throw new Error(
        `Failed to read public key: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  // Get the private key path for use in SSH connections
  getPrivateKeyPath(): string {
    if (!fs.existsSync(this.privateKeyPath)) {
      throw new Error("Private key file does not exist. Run initialize() first.");
    }
    return this.privateKeyPath;
  }

  // Get key fingerprint for verification
  getFingerprint(): string {
    try {
      const output = execSync(`ssh-keygen -lf ${this.publicKeyPath}`, {
        encoding: "utf-8",
      });
      return output.trim();
    } catch (error) {
      throw new Error(
        `Failed to get key fingerprint: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  // Get key info for display
  getKeyInfo(): { publicKey: string; fingerprint: string; keyPath: string } {
    return {
      publicKey: this.getPublicKey(),
      fingerprint: this.getFingerprint(),
      keyPath: this.keyDir,
    };
  }
}

// Singleton instance
let sshKeyServiceInstance: SshKeyService | null = null;

export function getSshKeyService(): SshKeyService {
  if (!sshKeyServiceInstance) {
    sshKeyServiceInstance = new SshKeyService();
  }
  return sshKeyServiceInstance;
}
