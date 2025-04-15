/**
 * Core testing utilities index
 * Provides centralized exports for all core testing functionality
 */

// Mock utilities
export * from './mockFunction'
export * from './mockContext'
export * from './mockHelper'

// Test runners and setup
export * from './TestRunner'
export * from './TestDiscovery'
export * from './TestReporter'
export * from './setupTests'
export * from './environment'
export * from './runTests'

// Assertions and utilities
export * from './assert'
export * from './utils'
export * from './testUtils'

// Types and categories
export type { 
  TestCategory,
  TestConfig,
  AfterAll,
  AfterEach,
  BeforeAll,
  BeforeEach,
  Test,
  TestMetadata,
  TestSuite,
  TestSuiteMetadata
} from './types'

// Scene testing
export * from './TelegramSceneTester'
export * from './invokeHandler'
export * from './InngestFunctionTester'

// Core functionality
export * from './SnapshotManager'
export * from './ReportGenerator'
export * from './InteractiveRunner'

// Test configuration
export * from './esmCompat'

// Import commonly used functions from their source files
export {
  mockFn,
  createMockFunction,
  mockObject
} from './mockFunction'

export {
  createMockUser,
  createTypedContext,
  createMockWizardScene,
  runSceneStep
} from './mockHelper'

export {
  createSceneTest,
  runTestGroup,
  assertMockCalled
} from './testUtils'

export {
  equal,
  strictEqual,
  deepEqual,
  assert,
  isTrue,
  isFalse,
  includes,
  contains,
  throws,
  doesNotThrow,
  instanceOf,
  typeOf
} from './assert/index'

// Default exports
export { default as mockFunction } from './mockFunction'
export { default as mockContext } from './mockContext'
