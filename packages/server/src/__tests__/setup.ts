/**
 * Bun Test Setup
 *
 * Global setup for all tests. Runs before each test file.
 */

import { beforeAll, afterAll, afterEach, mock, spyOn } from "bun:test";
import { randomBytes } from "crypto";
import { mkdtempSync, rmSync, existsSync, writeFileSync, chmodSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Test temp directory for key files
let testTempDir: string;

// Store spies so we can restore them
let consoleLogSpy: ReturnType<typeof spyOn> | null = null;
let consoleWarnSpy: ReturnType<typeof spyOn> | null = null;

beforeAll(() => {
  // Create temp directory for test files
  testTempDir = mkdtempSync(join(tmpdir(), "annex-test-"));

  // Set test key path environment variable
  process.env.ANNEX_KEY_PATH = join(testTempDir, ".annex-key");

  // Suppress console output during tests unless DEBUG is set
  if (!process.env.DEBUG) {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});
  }
});

afterEach(() => {
  // Note: Bun doesn't have clearAllMocks, mocks are cleared individually if needed
});

afterAll(() => {
  // Clean up temp directory
  if (testTempDir && existsSync(testTempDir)) {
    rmSync(testTempDir, { recursive: true, force: true });
  }

  // Restore console
  consoleLogSpy?.mockRestore();
  consoleWarnSpy?.mockRestore();
});

/**
 * Create a test encryption key file
 */
export function createTestKeyFile(keyPath: string, keyLength = 32): Buffer {
  const key = randomBytes(keyLength);
  writeFileSync(keyPath, key);
  chmodSync(keyPath, 0o600);
  return key;
}

/**
 * Get the test temp directory
 */
export function getTestTempDir(): string {
  return testTempDir;
}

/**
 * Create a mock Prisma client for testing
 */
export function createMockPrisma() {
  const store = new Map<string, { key: string; value: string; updatedAt: Date }>();

  return {
    setting: {
      findUnique: mock(async ({ where }: { where: { key: string } }) => {
        return store.get(where.key) || null;
      }),
      findMany: mock(async (args?: { select?: { key: boolean }; where?: { key?: { startsWith: string } } }) => {
        let results = Array.from(store.values());

        // Apply startsWith filter if provided
        if (args?.where?.key?.startsWith) {
          const prefix = args.where.key.startsWith;
          results = results.filter((r) => r.key.startsWith(prefix));
        }

        return results;
      }),
      upsert: mock(
        async ({
          where,
          create,
          update,
        }: {
          where: { key: string };
          create: { key: string; value: string };
          update: { value: string };
        }) => {
          const existing = store.get(where.key);
          const record = {
            key: where.key,
            value: existing ? update.value : create.value,
            updatedAt: new Date(),
          };
          store.set(where.key, record);
          return record;
        }
      ),
      delete: mock(async ({ where }: { where: { key: string } }) => {
        const record = store.get(where.key);
        store.delete(where.key);
        return record;
      }),
      count: mock(async () => store.size),
    },
    _store: store, // Expose for test inspection
    _clear: () => store.clear(), // Helper to reset between tests
  };
}

// Declare globals
declare global {
  var testTempDir: string;
}
