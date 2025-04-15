/**
 * Type definitions index
 * Centralizes all type exports for the test framework
 */

export * from './mockFunction';
export * from './global';

// Re-export common types
export interface TestResult {
  passed: boolean;
  message?: string;
  error?: Error;
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