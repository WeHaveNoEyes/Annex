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
  const settingStore = new Map<string, { key: string; value: string; updatedAt: Date }>();
  const mediaRequestStore = new Map<string, any>();
  const pipelineTemplateStore = new Map<string, any>();
  const pipelineExecutionStore = new Map<string, any>();
  const stepExecutionStore = new Map<string, any>();
  const notificationConfigStore = new Map<string, any>();
  const activityLogStore = new Map<string, any>();
  const approvalQueueStore = new Map<string, any>();

  let idCounter = 1;
  const generateId = () => `test-id-${idCounter++}`;

  return {
    $queryRaw: mock(async (query: TemplateStringsArray, ...values: any[]) => {
      // Mock implementation for timeout query
      const queryStr = Array.from(query).join('');

      // Handle ApprovalQueue timeout query
      if (queryStr.includes('ApprovalQueue') && queryStr.includes('timeoutHours')) {
        const now = values[0] as Date;
        const results = Array.from(approvalQueueStore.values())
          .filter(approval => {
            if (approval.status !== 'PENDING') return false;
            if (!approval.timeoutHours) return false;

            // Calculate timeout
            const timeoutMs = approval.timeoutHours * 60 * 60 * 1000;
            const createdAtTime = new Date(approval.createdAt).getTime();
            const timeoutDate = new Date(createdAtTime + timeoutMs);

            return timeoutDate <= now;
          })
          .map(a => ({
            id: a.id,
            requestId: a.requestId,
            autoAction: a.autoAction,
            timeoutHours: a.timeoutHours,
            createdAt: a.createdAt,
          }));

        return results;
      }

      return [];
    }),
    setting: {
      findUnique: mock(async ({ where }: { where: { key: string } }) => {
        return settingStore.get(where.key) || null;
      }),
      findMany: mock(async (args?: { select?: { key: boolean }; where?: { key?: { startsWith: string } } }) => {
        let results = Array.from(settingStore.values());

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
          const existing = settingStore.get(where.key);
          const record = {
            key: where.key,
            value: existing ? update.value : create.value,
            updatedAt: new Date(),
          };
          settingStore.set(where.key, record);
          return record;
        }
      ),
      delete: mock(async ({ where }: { where: { key: string } }) => {
        const record = settingStore.get(where.key);
        settingStore.delete(where.key);
        return record;
      }),
      count: mock(async () => settingStore.size),
    },
    mediaRequest: {
      create: mock(async ({ data }: { data: any }) => {
        const id = generateId();
        const record = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
        mediaRequestStore.set(id, record);
        return record;
      }),
      findUnique: mock(async ({ where }: { where: { id: string } }) => {
        return mediaRequestStore.get(where.id) || null;
      }),
      findFirst: mock(async ({ where }: { where: any }) => {
        const values = Array.from(mediaRequestStore.values());
        return values.find(v => !where || Object.keys(where).every(k => v[k] === where[k])) || null;
      }),
      findMany: mock(async ({ where }: { where?: any } = {}) => {
        let results = Array.from(mediaRequestStore.values());
        if (where) {
          results = results.filter(r => Object.keys(where).every(k => r[k] === where[k]));
        }
        return results;
      }),
      deleteMany: mock(async () => {
        const count = mediaRequestStore.size;
        mediaRequestStore.clear();
        return { count };
      }),
    },
    pipelineTemplate: {
      create: mock(async ({ data }: { data: any }) => {
        const id = generateId();
        const record = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
        pipelineTemplateStore.set(id, record);
        return record;
      }),
      findUnique: mock(async ({ where }: { where: { id: string } }) => {
        return pipelineTemplateStore.get(where.id) || null;
      }),
      deleteMany: mock(async () => {
        const count = pipelineTemplateStore.size;
        pipelineTemplateStore.clear();
        return { count };
      }),
    },
    pipelineExecution: {
      create: mock(async ({ data }: { data: any }) => {
        const id = generateId();
        const record = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
        pipelineExecutionStore.set(id, record);
        return record;
      }),
      findUnique: mock(async ({ where }: { where: { id: string } }) => {
        return pipelineExecutionStore.get(where.id) || null;
      }),
      findFirst: mock(async ({ where }: { where: any }) => {
        const values = Array.from(pipelineExecutionStore.values());
        return values.find(v => !where || Object.keys(where).every(k => v[k] === where[k])) || null;
      }),
      update: mock(async ({ where, data }: { where: { id: string }, data: any }) => {
        const record = pipelineExecutionStore.get(where.id);
        if (!record) return null;
        const updated = { ...record, ...data, updatedAt: new Date() };
        pipelineExecutionStore.set(where.id, updated);
        return updated;
      }),
      deleteMany: mock(async () => {
        const count = pipelineExecutionStore.size;
        pipelineExecutionStore.clear();
        return { count };
      }),
    },
    stepExecution: {
      create: mock(async ({ data }: { data: any }) => {
        const id = generateId();
        const record = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
        stepExecutionStore.set(id, record);
        return record;
      }),
      deleteMany: mock(async () => {
        const count = stepExecutionStore.size;
        stepExecutionStore.clear();
        return { count };
      }),
    },
    notificationConfig: {
      create: mock(async ({ data }: { data: any }) => {
        const id = generateId();
        const record = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
        notificationConfigStore.set(id, record);
        return record;
      }),
      findUnique: mock(async ({ where }: { where: { id: string } }) => {
        return notificationConfigStore.get(where.id) || null;
      }),
      findMany: mock(async ({ where }: { where?: any } = {}) => {
        let results = Array.from(notificationConfigStore.values());
        if (where) {
          results = results.filter(r => {
            // Filter by enabled
            if (where.enabled !== undefined && r.enabled !== where.enabled) return false;

            // Filter by events array (has operator)
            if (where.events?.has) {
              if (!Array.isArray(r.events) || !r.events.includes(where.events.has)) return false;
            }

            // Handle OR condition for mediaType
            if (where.OR) {
              const matchesOr = where.OR.some((condition: any) => {
                if (condition.mediaType === null) return r.mediaType === null || r.mediaType === undefined;
                if (condition.mediaType !== undefined) return r.mediaType === condition.mediaType;
                return true;
              });
              if (!matchesOr) return false;
            }

            // Filter by userId
            // When userId is in the where clause, match that specific userId
            // When userId is NOT in the where clause, match only null/undefined userId (global configs)
            const hasUserIdInWhere = 'userId' in where;
            if (hasUserIdInWhere) {
              if (r.userId !== where.userId) return false;
            } else {
              // No userId in where clause means match only global configs (userId: null or undefined)
              if (r.userId !== null && r.userId !== undefined) return false;
            }

            return true;
          });
        }
        return results;
      }),
      deleteMany: mock(async () => {
        const count = notificationConfigStore.size;
        notificationConfigStore.clear();
        return { count };
      }),
    },
    activityLog: {
      create: mock(async ({ data }: { data: any }) => {
        const id = generateId();
        const record = { id, ...data, createdAt: new Date() };
        activityLogStore.set(id, record);
        return record;
      }),
      findMany: mock(async ({ where }: { where?: any } = {}) => {
        let results = Array.from(activityLogStore.values());
        if (where) {
          results = results.filter(r => Object.keys(where).every(k => r[k] === where[k]));
        }
        return results;
      }),
      deleteMany: mock(async () => {
        const count = activityLogStore.size;
        activityLogStore.clear();
        return { count };
      }),
    },
    approvalQueue: {
      create: mock(async ({ data }: { data: any }) => {
        const id = generateId();
        const record = {
          id,
          createdAt: new Date(),
          updatedAt: new Date(),
          processedAt: null,
          processedBy: null,
          comment: null,
          ...data, // Spread data AFTER defaults so it can override them
        };
        approvalQueueStore.set(id, record);
        return record;
      }),
      findUnique: mock(async ({ where }: { where: { id: string } }) => {
        return approvalQueueStore.get(where.id) || null;
      }),
      findMany: mock(async ({ where, include }: { where?: any, include?: any } = {}) => {
        let results = Array.from(approvalQueueStore.values());
        if (where) {
          results = results.filter(r => {
            if (where.status && r.status !== where.status) return false;

            // Handle requiredRole filtering
            if (where.requiredRole) {
              if (typeof where.requiredRole === 'string') {
                // Exact match
                if (r.requiredRole !== where.requiredRole) return false;
              } else if (where.requiredRole.in) {
                // IN operator
                if (!where.requiredRole.in.includes(r.requiredRole)) return false;
              }
            }

            if (where.AND) {
              return where.AND.every((condition: any) => {
                if (condition.createdAt?.lte) {
                  return new Date(r.createdAt) <= new Date(condition.createdAt.lte);
                }
                if (condition.timeoutHours?.not) {
                  return r.timeoutHours !== condition.timeoutHours.not;
                }
                return true;
              });
            }
            return true;
          });
        }
        if (include?.request) {
          results = results.map(r => ({
            ...r,
            request: mediaRequestStore.get(r.requestId) || null,
          }));
        }
        return results;
      }),
      update: mock(async ({ where, data }: { where: { id: string }, data: any }) => {
        const record = approvalQueueStore.get(where.id);
        if (!record) return null;
        const updated = { ...record, ...data, updatedAt: new Date() };
        approvalQueueStore.set(where.id, updated);
        return updated;
      }),
      updateMany: mock(async ({ where, data }: { where: any, data: any }) => {
        let count = 0;
        Array.from(approvalQueueStore.values()).forEach(r => {
          const matches = Object.keys(where).every(k => {
            if (k === 'id' && where.id.in) return where.id.in.includes(r.id);
            return r[k] === where[k];
          });
          if (matches) {
            const updated = { ...r, ...data, updatedAt: new Date() };
            approvalQueueStore.set(r.id, updated);
            count++;
          }
        });
        return { count };
      }),
      deleteMany: mock(async () => {
        const count = approvalQueueStore.size;
        approvalQueueStore.clear();
        return { count };
      }),
    },
    _stores: {
      setting: settingStore,
      mediaRequest: mediaRequestStore,
      pipelineTemplate: pipelineTemplateStore,
      pipelineExecution: pipelineExecutionStore,
      stepExecution: stepExecutionStore,
      notificationConfig: notificationConfigStore,
      activityLog: activityLogStore,
      approvalQueue: approvalQueueStore,
    },
    _store: settingStore, // Backwards compatibility
    _clear: () => {
      settingStore.clear();
      mediaRequestStore.clear();
      pipelineTemplateStore.clear();
      pipelineExecutionStore.clear();
      stepExecutionStore.clear();
      notificationConfigStore.clear();
      activityLogStore.clear();
      approvalQueueStore.clear();
    },
  };
}

// Declare globals
declare global {
  var testTempDir: string;
}
