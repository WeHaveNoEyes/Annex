// StepRegistry - Central registry for all pipeline step types
// Allows dynamic instantiation of steps by type

import type { StepType } from '@prisma/client';
import type { BaseStep } from './steps/BaseStep';

type StepConstructor = new () => BaseStep;

export class StepRegistry {
  private static steps: Map<StepType, StepConstructor> = new Map();

  // Register a step type with its constructor
  static register(type: StepType, stepClass: StepConstructor): void {
    this.steps.set(type, stepClass);
  }

  // Reset registry (used for testing)
  static reset(): void {
    this.steps.clear();
  }

  // Create a new instance of a step by type
  static create(type: StepType): BaseStep {
    const StepClass = this.steps.get(type);
    if (!StepClass) {
      throw new Error(`Step type ${type} is not registered`);
    }
    return new StepClass();
  }

  // Check if a step type is registered
  static has(type: StepType): boolean {
    return this.steps.has(type);
  }

  // Get all registered step types
  static getRegisteredTypes(): StepType[] {
    return Array.from(this.steps.keys());
  }

  // Clear all registered steps (mainly for testing)
  static clear(): void {
    this.steps.clear();
  }
}
