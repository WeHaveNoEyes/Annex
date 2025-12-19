/**
 * PipelineExecutor Tests
 *
 * Comprehensive tests for parallel pipeline execution including:
 * - Sequential execution (single branch)
 * - Parallel execution (multiple branches)
 * - Nested branching
 * - Error handling and recovery
 * - Context merging across branches
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { PipelineExecutor } from "../../services/pipeline/PipelineExecutor.js";
import { prisma } from "../../db/client.js";
import { StepRegistry } from "../../services/pipeline/StepRegistry.js";
import { BaseStep } from "../../services/pipeline/steps/BaseStep.js";
import type { PipelineContext, StepOutput } from "../../services/pipeline/PipelineContext.js";
import type { StepType } from "@prisma/client";

// Mock step that tracks execution
class MockStep extends BaseStep {
  static executionLog: Array<{ name: string; timestamp: number }> = [];
  static resetLog() {
    this.executionLog = [];
  }

  constructor(public readonly type: StepType) {
    super();
  }

  async execute(context: PipelineContext, config: unknown): Promise<StepOutput> {
    const cfg = config as { name: string; delay?: number; shouldFail?: boolean; data?: Record<string, unknown> };

    // Log execution with timestamp
    MockStep.executionLog.push({ name: cfg.name, timestamp: Date.now() });

    // Simulate async work
    if (cfg.delay) {
      await new Promise(resolve => setTimeout(resolve, cfg.delay));
    }

    // Simulate failure if configured
    if (cfg.shouldFail) {
      return {
        success: false,
        error: `Mock step ${cfg.name} failed`,
      };
    }

    return {
      success: true,
      data: cfg.data || { [`${cfg.name}_completed`]: true },
    };
  }

  validateConfig(config: unknown): void {
    const cfg = config as { name?: string };
    if (!cfg || typeof cfg.name !== 'string') {
      throw new Error('MockStep requires config with name');
    }
  }
}

describe("PipelineExecutor - Parallel Execution", () => {
  let executor: PipelineExecutor;
  let mockRequestId: string;
  let mockTemplateId: string;

  beforeEach(async () => {
    executor = new PipelineExecutor();
    MockStep.resetLog();

    // Reset and register mock steps
    StepRegistry.reset();

    // Create factory classes for each step type
    class SearchStep extends MockStep { constructor() { super('SEARCH' as StepType); } }
    class DownloadStep extends MockStep { constructor() { super('DOWNLOAD' as StepType); } }
    class EncodeStep extends MockStep { constructor() { super('ENCODE' as StepType); } }
    class DeliverStep extends MockStep { constructor() { super('DELIVER' as StepType); } }
    class NotificationStep extends MockStep { constructor() { super('NOTIFICATION' as StepType); } }
    class ApprovalStep extends MockStep { constructor() { super('APPROVAL' as StepType); } }

    StepRegistry.register('SEARCH' as StepType, SearchStep);
    StepRegistry.register('DOWNLOAD' as StepType, DownloadStep);
    StepRegistry.register('ENCODE' as StepType, EncodeStep);
    StepRegistry.register('DELIVER' as StepType, DeliverStep);
    StepRegistry.register('NOTIFICATION' as StepType, NotificationStep);
    StepRegistry.register('APPROVAL' as StepType, ApprovalStep);

    // Clean up any existing test data
    await prisma.stepExecution.deleteMany({});
    await prisma.pipelineExecution.deleteMany({});
    await prisma.mediaRequest.deleteMany({});
    await prisma.pipelineTemplate.deleteMany({});

    // Create test request
    const request = await prisma.mediaRequest.create({
      data: {
        type: 'MOVIE',
        tmdbId: 12345,
        title: 'Test Movie',
        year: 2024,
        status: 'PENDING',
        targets: [],
      },
    });
    mockRequestId = request.id;
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.stepExecution.deleteMany({});
    await prisma.pipelineExecution.deleteMany({});
    await prisma.mediaRequest.deleteMany({});
    await prisma.pipelineTemplate.deleteMany({});
  });

  describe("Sequential Execution", () => {
    it("executes single branch steps in order", async () => {
      // Create template with sequential steps: Search -> Download -> Encode
      const template = await prisma.pipelineTemplate.create({
        data: {
          name: "Sequential Test",
          mediaType: 'MOVIE',
          isPublic: true,
          isDefault: false,
          steps: [
            {
              type: 'SEARCH',
              name: 'Search',
              config: { name: 'search', delay: 10 },
              required: true,
              retryable: true,
              continueOnError: false,
              children: [
                {
                  type: 'DOWNLOAD',
                  name: 'Download',
                  config: { name: 'download', delay: 10 },
                  required: true,
                  retryable: true,
                  continueOnError: false,
                  children: [
                    {
                      type: 'ENCODE',
                      name: 'Encode',
                      config: { name: 'encode', delay: 10 },
                      required: true,
                      retryable: true,
                      continueOnError: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
      });
      mockTemplateId = template.id;

      await executor.startExecution(mockRequestId, mockTemplateId);

      // Verify execution order
      expect(MockStep.executionLog.length).toBe(3);
      expect(MockStep.executionLog[0].name).toBe('search');
      expect(MockStep.executionLog[1].name).toBe('download');
      expect(MockStep.executionLog[2].name).toBe('encode');

      // Verify sequential execution (each step waits for previous)
      expect(MockStep.executionLog[1].timestamp).toBeGreaterThan(MockStep.executionLog[0].timestamp);
      expect(MockStep.executionLog[2].timestamp).toBeGreaterThan(MockStep.executionLog[1].timestamp);

      // Verify execution completed
      const execution = await prisma.pipelineExecution.findFirst({
        where: { requestId: mockRequestId },
      });
      expect(execution?.status).toBe('COMPLETED');
    });
  });

  describe("Parallel Execution", () => {
    it("executes parallel branches simultaneously", async () => {
      // Create template with 3 parallel branches from start
      const template = await prisma.pipelineTemplate.create({
        data: {
          name: "Parallel Test",
          mediaType: 'MOVIE',
          isPublic: true,
          isDefault: false,
          steps: [
            {
              type: 'SEARCH',
              name: 'Branch A',
              config: { name: 'branch_a', delay: 50 },
              required: true,
              retryable: true,
              continueOnError: false,
            },
            {
              type: 'NOTIFICATION',
              name: 'Branch B',
              config: { name: 'branch_b', delay: 30 },
              required: true,
              retryable: true,
              continueOnError: false,
            },
            {
              type: 'APPROVAL',
              name: 'Branch C',
              config: { name: 'branch_c', delay: 20 },
              required: true,
              retryable: true,
              continueOnError: false,
            },
          ],
        },
      });
      mockTemplateId = template.id;

      const startTime = Date.now();
      await executor.startExecution(mockRequestId, mockTemplateId);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Verify all 3 branches executed
      expect(MockStep.executionLog.length).toBe(3);

      // Verify parallel execution (should take ~50ms, not 100ms if sequential)
      expect(totalTime).toBeLessThan(80); // Some margin for overhead

      // Verify branches started around the same time
      const timestamps = MockStep.executionLog.map(log => log.timestamp);
      const timeDiffs = [
        timestamps[1] - timestamps[0],
        timestamps[2] - timestamps[0],
        timestamps[2] - timestamps[1],
      ];
      timeDiffs.forEach(diff => {
        expect(Math.abs(diff)).toBeLessThan(15); // Started within 15ms of each other
      });
    });

    it("executes nested parallel branches correctly", async () => {
      // Create template with nested parallel execution
      const template = await prisma.pipelineTemplate.create({
        data: {
          name: "Nested Parallel Test",
          mediaType: 'MOVIE',
          isPublic: true,
          isDefault: false,
          steps: [
            {
              type: 'SEARCH',
              name: 'Search',
              config: { name: 'search', delay: 10 },
              required: true,
              retryable: true,
              continueOnError: false,
              children: [
                {
                  type: 'DOWNLOAD',
                  name: 'Download A',
                  config: { name: 'download_a', delay: 20 },
                  required: true,
                  retryable: true,
                  continueOnError: false,
                },
                {
                  type: 'NOTIFICATION',
                  name: 'Notify',
                  config: { name: 'notify', delay: 10 },
                  required: true,
                  retryable: true,
                  continueOnError: false,
                },
              ],
            },
          ],
        },
      });
      mockTemplateId = template.id;

      await executor.startExecution(mockRequestId, mockTemplateId);

      // Verify execution
      expect(MockStep.executionLog.length).toBe(3);
      expect(MockStep.executionLog[0].name).toBe('search');

      // The two children should start after search but around the same time as each other
      const searchTime = MockStep.executionLog[0].timestamp;
      const downloadTime = MockStep.executionLog.find(l => l.name === 'download_a')!.timestamp;
      const notifyTime = MockStep.executionLog.find(l => l.name === 'notify')!.timestamp;

      expect(downloadTime).toBeGreaterThan(searchTime);
      expect(notifyTime).toBeGreaterThan(searchTime);
      expect(Math.abs(downloadTime - notifyTime)).toBeLessThan(15); // Started in parallel
    });
  });

  describe("Error Handling", () => {
    it("fails pipeline when required step fails", async () => {
      const template = await prisma.pipelineTemplate.create({
        data: {
          name: "Error Test - Required Fail",
          mediaType: 'MOVIE',
          isPublic: true,
          isDefault: false,
          steps: [
            {
              type: 'SEARCH',
              name: 'Failing Step',
              config: { name: 'failing', shouldFail: true },
              required: true,
              retryable: true,
              continueOnError: false,
            },
          ],
        },
      });
      mockTemplateId = template.id;

      await expect(executor.startExecution(mockRequestId, mockTemplateId)).rejects.toThrow();

      const execution = await prisma.pipelineExecution.findFirst({
        where: { requestId: mockRequestId },
      });
      expect(execution?.status).toBe('FAILED');
    });

    it("continues when optional step fails", async () => {
      const template = await prisma.pipelineTemplate.create({
        data: {
          name: "Error Test - Optional Fail",
          mediaType: 'MOVIE',
          isPublic: true,
          isDefault: false,
          steps: [
            {
              type: 'SEARCH',
              name: 'Optional Failing Step',
              config: { name: 'optional_fail', shouldFail: true },
              required: false,
              retryable: true,
              continueOnError: false,
            },
            {
              type: 'NOTIFICATION',
              name: 'Success Step',
              config: { name: 'success' },
              required: true,
              retryable: true,
              continueOnError: false,
            },
          ],
        },
      });
      mockTemplateId = template.id;

      await executor.startExecution(mockRequestId, mockTemplateId);

      // Both steps should have been attempted
      expect(MockStep.executionLog.length).toBe(2);

      const execution = await prisma.pipelineExecution.findFirst({
        where: { requestId: mockRequestId },
      });
      expect(execution?.status).toBe('COMPLETED');
    });

    it("continues when continueOnError is true", async () => {
      const template = await prisma.pipelineTemplate.create({
        data: {
          name: "Error Test - Continue On Error",
          mediaType: 'MOVIE',
          isPublic: true,
          isDefault: false,
          steps: [
            {
              type: 'SEARCH',
              name: 'Search',
              config: { name: 'search' },
              required: true,
              retryable: true,
              continueOnError: false,
              children: [
                {
                  type: 'DOWNLOAD',
                  name: 'Failing Download',
                  config: { name: 'failing_download', shouldFail: true },
                  required: true,
                  retryable: true,
                  continueOnError: true,
                },
                {
                  type: 'NOTIFICATION',
                  name: 'Notification',
                  config: { name: 'notification' },
                  required: true,
                  retryable: true,
                  continueOnError: false,
                },
              ],
            },
          ],
        },
      });
      mockTemplateId = template.id;

      await executor.startExecution(mockRequestId, mockTemplateId);

      // All steps should execute despite failure
      expect(MockStep.executionLog.length).toBe(3);

      const execution = await prisma.pipelineExecution.findFirst({
        where: { requestId: mockRequestId },
      });
      expect(execution?.status).toBe('COMPLETED');
    });
  });

  describe("Context Merging", () => {
    it("merges context from parallel branches", async () => {
      const template = await prisma.pipelineTemplate.create({
        data: {
          name: "Context Merge Test",
          mediaType: 'MOVIE',
          isPublic: true,
          isDefault: false,
          steps: [
            {
              type: 'SEARCH',
              name: 'Branch A',
              config: { name: 'branch_a', data: { resultA: 'value_a' } },
              required: true,
              retryable: true,
              continueOnError: false,
            },
            {
              type: 'NOTIFICATION',
              name: 'Branch B',
              config: { name: 'branch_b', data: { resultB: 'value_b' } },
              required: true,
              retryable: true,
              continueOnError: false,
            },
          ],
        },
      });
      mockTemplateId = template.id;

      await executor.startExecution(mockRequestId, mockTemplateId);

      const execution = await prisma.pipelineExecution.findFirst({
        where: { requestId: mockRequestId },
      });

      const context = execution?.context as Record<string, unknown>;
      expect(context.resultA).toBe('value_a');
      expect(context.resultB).toBe('value_b');
    });
  });
});
