// PipelineExecutor - Core service for executing customizable request pipelines
// Manages pipeline execution state, step orchestration, and error handling

import { prisma } from '../../db/client.js';
import { Prisma, type StepType, type ExecutionStatus, type StepStatus } from '@prisma/client';
import type { PipelineContext, StepOutput } from './PipelineContext';
import { StepRegistry } from './StepRegistry';
import { logger } from '../../utils/logger';

export class PipelineExecutor {
  // Start a new pipeline execution for a request
  async startExecution(requestId: string, templateId: string): Promise<void> {
    try {
      // Fetch the template with all its steps
      const template = await prisma.pipelineTemplate.findUnique({
        where: { id: templateId },
        include: { steps: { orderBy: { order: 'asc' } } },
      });

      if (!template) {
        throw new Error(`Pipeline template ${templateId} not found`);
      }

      // Fetch the request
      const request = await prisma.mediaRequest.findUnique({
        where: { id: requestId },
      });

      if (!request) {
        throw new Error(`Request ${requestId} not found`);
      }

      // Create immutable snapshot of steps
      const stepsSnapshot = template.steps.map((step) => ({
        order: step.order,
        type: step.type,
        name: step.name,
        config: step.config,
        condition: step.condition,
        required: step.required,
        retryable: step.retryable,
        timeout: step.timeout,
        continueOnError: step.continueOnError,
      }));

      // Initialize context from request
      const initialContext: PipelineContext = {
        requestId: request.id,
        mediaType: request.type,
        tmdbId: request.tmdbId,
        title: request.title,
        year: request.year,
        requestedSeasons: request.requestedSeasons,
        requestedEpisodes: request.requestedEpisodes as Array<{ season: number; episode: number }> | undefined,
        targets: request.targets as Array<{ serverId: string; encodingProfileId?: string }>,
      };

      // Create pipeline execution
      const execution = await prisma.pipelineExecution.create({
        data: {
          requestId,
          templateId,
          status: 'RUNNING' as ExecutionStatus,
          currentStep: 0,
          steps: stepsSnapshot as unknown as Prisma.JsonArray,
          context: initialContext as unknown as Prisma.JsonObject,
        },
      });

      // Create step execution records
      for (const step of template.steps) {
        await prisma.stepExecution.create({
          data: {
            executionId: execution.id,
            stepOrder: step.order,
            stepType: step.type,
            status: 'PENDING' as StepStatus,
          },
        });
      }

      logger.info(`Started pipeline execution ${execution.id} for request ${requestId}`);

      // Start executing the first step
      await this.executeNextStep(execution.id);
    } catch (error) {
      logger.error(`Failed to start pipeline execution for request ${requestId}:`, error);
      throw error;
    }
  }

  // Execute the next pending step in the pipeline
  async executeNextStep(executionId: string): Promise<void> {
    try {
      // Fetch execution with current state
      const execution = await prisma.pipelineExecution.findUnique({
        where: { id: executionId },
        include: {
          stepExecutions: {
            orderBy: { stepOrder: 'asc' },
          },
        },
      });

      if (!execution) {
        throw new Error(`Pipeline execution ${executionId} not found`);
      }

      // Check if execution is paused, cancelled, or completed
      if (execution.status !== 'RUNNING') {
        logger.info(`Pipeline execution ${executionId} is ${execution.status}, stopping`);
        return;
      }

      // Find next pending step
      const nextStep = execution.stepExecutions.find((s) => s.status === 'PENDING');

      if (!nextStep) {
        // All steps completed
        await this.completeExecution(executionId);
        return;
      }

      // Get step definition from snapshot
      const steps = execution.steps as Array<{
        order: number;
        type: StepType;
        name: string;
        config: unknown;
        condition: unknown;
        required: boolean;
        retryable: boolean;
        timeout?: number;
        continueOnError: boolean;
      }>;

      const stepDef = steps.find((s) => s.order === nextStep.stepOrder);
      if (!stepDef) {
        throw new Error(`Step definition not found for order ${nextStep.stepOrder}`);
      }

      // Update execution current step
      await prisma.pipelineExecution.update({
        where: { id: executionId },
        data: { currentStep: nextStep.stepOrder },
      });

      // Execute the step
      await this.executeStep(executionId, nextStep.id, stepDef);

      // After step completes, execute next step
      await this.executeNextStep(executionId);
    } catch (error) {
      logger.error(`Failed to execute next step for execution ${executionId}:`, error);
      await this.failExecution(executionId, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // Execute a single step
  private async executeStep(
    executionId: string,
    stepExecutionId: string,
    stepDef: {
      order: number;
      type: StepType;
      name: string;
      config: unknown;
      condition: unknown;
      required: boolean;
      retryable: boolean;
      timeout?: number;
      continueOnError: boolean;
    }
  ): Promise<void> {
    try {
      // Get current context
      const execution = await prisma.pipelineExecution.findUnique({
        where: { id: executionId },
      });

      if (!execution) {
        throw new Error(`Pipeline execution ${executionId} not found`);
      }

      const context = execution.context as PipelineContext;

      // Create step instance
      const step = StepRegistry.create(stepDef.type);

      // Validate config
      step.validateConfig(stepDef.config);

      // Evaluate condition
      const shouldExecute = step.evaluateCondition(context, stepDef.condition as unknown as Parameters<typeof step.evaluateCondition>[1]);

      if (!shouldExecute) {
        // Skip step
        await prisma.stepExecution.update({
          where: { id: stepExecutionId },
          data: {
            status: 'SKIPPED' as StepStatus,
            completedAt: new Date(),
          },
        });
        logger.info(`Skipped step ${stepDef.name} (condition not met)`);
        return;
      }

      // Update step status to RUNNING
      await prisma.stepExecution.update({
        where: { id: stepExecutionId },
        data: {
          status: 'RUNNING' as StepStatus,
          startedAt: new Date(),
        },
      });

      // Set progress callback
      step.setProgressCallback(async (progress, message) => {
        await prisma.stepExecution.update({
          where: { id: stepExecutionId },
          data: { progress },
        });
        logger.debug(`Step ${stepDef.name} progress: ${progress}% ${message || ''}`);
      });

      // Execute the step
      const result: StepOutput = await step.execute(context, stepDef.config);

      // Handle result
      if (result.shouldPause) {
        // Pause execution (used by ApprovalStep)
        await this.pauseExecution(executionId, 'Awaiting approval');
        await prisma.stepExecution.update({
          where: { id: stepExecutionId },
          data: {
            status: 'RUNNING' as StepStatus,
            output: result.data ? (result.data as unknown as Prisma.JsonObject) : Prisma.JsonNull,
          },
        });
        return;
      }

      if (result.shouldSkip) {
        // Skip step
        await prisma.stepExecution.update({
          where: { id: stepExecutionId },
          data: {
            status: 'SKIPPED' as StepStatus,
            output: result.data ? (result.data as unknown as Prisma.JsonObject) : Prisma.JsonNull,
            completedAt: new Date(),
          },
        });
        return;
      }

      if (!result.success) {
        // Step failed
        if (stepDef.continueOnError) {
          // Continue despite error
          await prisma.stepExecution.update({
            where: { id: stepExecutionId },
            data: {
              status: 'FAILED' as StepStatus,
              error: result.error,
              completedAt: new Date(),
            },
          });
          logger.warn(`Step ${stepDef.name} failed but continuing: ${result.error}`);
          return;
        } else {
          throw new Error(result.error || 'Step execution failed');
        }
      }

      // Step succeeded
      // Update context with step output
      const updatedContext = {
        ...context,
        ...result.data,
      };

      await prisma.pipelineExecution.update({
        where: { id: executionId },
        data: { context: updatedContext as unknown as Prisma.JsonObject },
      });

      await prisma.stepExecution.update({
        where: { id: stepExecutionId },
        data: {
          status: 'COMPLETED' as StepStatus,
          progress: 100,
          output: result.data ? (result.data as unknown as Prisma.JsonObject) : Prisma.JsonNull,
          completedAt: new Date(),
        },
      });

      logger.info(`Completed step ${stepDef.name}`);
    } catch (error) {
      logger.error(`Step ${stepDef.name} failed:`, error);

      // Update step status to FAILED
      await prisma.stepExecution.update({
        where: { id: stepExecutionId },
        data: {
          status: 'FAILED' as StepStatus,
          error: error instanceof Error ? error.message : 'Unknown error',
          completedAt: new Date(),
        },
      });

      // Fail the entire execution if step is required
      if (stepDef.required) {
        throw error;
      }
    }
  }

  // Pause execution
  async pauseExecution(executionId: string, reason: string): Promise<void> {
    await prisma.pipelineExecution.update({
      where: { id: executionId },
      data: {
        status: 'PAUSED' as ExecutionStatus,
        error: reason,
      },
    });
    logger.info(`Paused pipeline execution ${executionId}: ${reason}`);
  }

  // Resume execution
  async resumeExecution(executionId: string): Promise<void> {
    await prisma.pipelineExecution.update({
      where: { id: executionId },
      data: {
        status: 'RUNNING' as ExecutionStatus,
        error: null,
      },
    });
    logger.info(`Resumed pipeline execution ${executionId}`);

    // Continue executing steps
    await this.executeNextStep(executionId);
  }

  // Fail execution
  async failExecution(executionId: string, error: string): Promise<void> {
    await prisma.pipelineExecution.update({
      where: { id: executionId },
      data: {
        status: 'FAILED' as ExecutionStatus,
        error,
        completedAt: new Date(),
      },
    });
    logger.error(`Failed pipeline execution ${executionId}: ${error}`);
  }

  // Complete execution
  async completeExecution(executionId: string): Promise<void> {
    await prisma.pipelineExecution.update({
      where: { id: executionId },
      data: {
        status: 'COMPLETED' as ExecutionStatus,
        completedAt: new Date(),
      },
    });
    logger.info(`Completed pipeline execution ${executionId}`);
  }

  // Cancel execution
  async cancelExecution(executionId: string): Promise<void> {
    await prisma.pipelineExecution.update({
      where: { id: executionId },
      data: {
        status: 'CANCELLED' as ExecutionStatus,
        completedAt: new Date(),
      },
    });
    logger.info(`Cancelled pipeline execution ${executionId}`);
  }
}
