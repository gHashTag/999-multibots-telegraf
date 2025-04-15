/**
 * Централизованный экспорт тест-раннеров
 * @module test-runners
 */

import { TestResult, TestCategory } from '../types'
import { TestRunnerConfig } from './types'
import { runScenesTests, runTestsGroup } from './runScenesTests'
import { createTestContext } from '../core/createTestContext'
import { mockFn } from '../core/mockFunction'
import { setupTestEnvironment } from '../core/setupTests'

// Re-export types
export type { TestResult, TestCategory, TestRunnerConfig }

// Export test runners
export { runScenesTests, runTestsGroup }

// Export test runner options
export interface TestRunnerOptions {
  verbose?: boolean
  filter?: string
  timeout?: number
  parallel?: boolean
  category?: TestCategory
}

// Export test runner result interface
export interface TestRunnerResult {
  passed: number
  total: number
  failed: number
  skipped: number
  duration: number
  category?: TestCategory
  failedTests?: string[]
}

// Export test utilities
export { createTestContext, mockFn, setupTestEnvironment }
