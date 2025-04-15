/**
 * Type definitions index
 * Centralizes all type exports for the test framework
 */

export * from './mockFunction';
export * from './global';

// Test categories
export enum TestCategory {
  All = 'all',
  Scenes = 'scenes',
  Wizards = 'wizards',
  Utils = 'utils',
  Integration = 'integration'
}

// Re-export common types
export interface TestResult {
  name: string;
  success: boolean;
  message: string;
  category?: TestCategory;
}

export interface TestContext {
  name: string;
  description?: string;
  skip?: boolean;
  only?: boolean;
}

export interface TestSuite {
  name: string;
  tests: Test[];
}

export interface Test {
  name: string;
  fn: () => Promise<void> | void;
  context: TestContext;
} 