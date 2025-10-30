/**
 * @fileoverview Test setup for generation limits testing suite
 * @description Global test configuration and setup utilities
 */

import { jest } from '@jest/globals'

// Global test timeout for performance tests
jest.setTimeout(30000)

// Mock console to reduce test noise
const originalConsole = global.console

beforeEach(() => {
  global.console = {
    ...originalConsole,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
})

afterEach(() => {
  global.console = originalConsole
  jest.clearAllMocks()
})

// Global test data
global.TEST_CONFIG = {
  ADMIN_IDS: [12345, 67890],
  REGULAR_USER_LIMIT: 3,
  PERFORMANCE_THRESHOLDS: {
    USAGE_CHECK_MS: 100,
    SUBSCRIPTION_CHECK_MS: 150,
    CONCURRENT_USERS: 100
  }
}

// Test utilities
global.testUtils = {
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  mockSupabaseResponse: (data: any, error: any = null) => ({
    data,
    error
  }),

  createMockTelegramUser: (id: string, overrides: any = {}) => ({
    id: parseInt(id),
    first_name: 'Test',
    last_name: 'User',
    username: `user_${id}`,
    is_bot: false,
    language_code: 'ru',
    ...overrides
  }),

  assertWithinThreshold: (actual: number, threshold: number, message?: string) => {
    expect(actual).toBeLessThan(threshold)
    if (message) {
      console.info(`✅ ${message}: ${actual}ms (threshold: ${threshold}ms)`)
    }
  }
}

// Performance monitoring
let performanceMetrics: Array<{
  testName: string
  duration: number
  category: string
  passed: boolean
}> = []

beforeEach(() => {
  global.testStartTime = performance.now()
})

afterEach(() => {
  if (global.testStartTime && expect.getState().currentTestName) {
    const duration = performance.now() - global.testStartTime
    performanceMetrics.push({
      testName: expect.getState().currentTestName,
      duration,
      category: expect.getState().testPath?.includes('performance') ? 'performance' : 'functional',
      passed: !expect.getState().numPassingAsserts === 0
    })
  }
})

afterAll(() => {
  // Performance summary
  if (performanceMetrics.length > 0) {
    const avgDuration = performanceMetrics.reduce((sum, m) => sum + m.duration, 0) / performanceMetrics.length
    const slowTests = performanceMetrics.filter(m => m.duration > 1000).length

    console.info('\n📊 Test Performance Summary:')
    console.info(`   Average test duration: ${avgDuration.toFixed(2)}ms`)
    console.info(`   Slow tests (>1s): ${slowTests}`)
    console.info(`   Total tests: ${performanceMetrics.length}`)

    if (slowTests > performanceMetrics.length * 0.1) {
      console.warn('⚠️  High percentage of slow tests detected')
    }
  }
})

// Error boundary for async tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  // Don't exit the process in tests
})

// Memory monitoring
let initialMemoryUsage: NodeJS.MemoryUsage

beforeAll(() => {
  initialMemoryUsage = process.memoryUsage()
})

afterAll(() => {
  if (global.gc) {
    global.gc()
  }

  const finalMemoryUsage = process.memoryUsage()
  const memoryIncrease = finalMemoryUsage.heapUsed - initialMemoryUsage.heapUsed

  if (memoryIncrease > 100 * 1024 * 1024) { // 100MB threshold
    console.warn(`⚠️  High memory usage detected: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB increase`)
  } else {
    console.info(`✅ Memory usage acceptable: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB increase`)
  }
})

// Extend Jest matchers for generation limits
expect.extend({
  toAllowGeneration(received: any, expectedUserType: string) {
    const pass = received.canUse === true

    if (pass) {
      return {
        message: () => `Expected ${expectedUserType} to NOT be allowed to generate, but it was allowed`,
        pass: true
      }
    } else {
      return {
        message: () => `Expected ${expectedUserType} to be allowed to generate, but it was denied`,
        pass: false
      }
    }
  },

  toDenyGeneration(received: any, expectedUserType: string) {
    const pass = received.canUse === false

    if (pass) {
      return {
        message: () => `Expected ${expectedUserType} to be allowed to generate, but it was denied`,
        pass: true
      }
    } else {
      return {
        message: () => `Expected ${expectedUserType} to NOT be allowed to generate, but it was allowed`,
        pass: false
      }
    }
  },

  toBeWithinPerformanceThreshold(received: number, threshold: number, operation: string) {
    const pass = received < threshold

    if (pass) {
      return {
        message: () => `Expected ${operation} to be slower than ${threshold}ms, but it was ${received}ms`,
        pass: true
      }
    } else {
      return {
        message: () => `Expected ${operation} to complete within ${threshold}ms, but it took ${received}ms`,
        pass: false
      }
    }
  }
})

// Type declarations for global utilities
declare global {
  namespace NodeJS {
    interface Global {
      TEST_CONFIG: {
        ADMIN_IDS: number[]
        REGULAR_USER_LIMIT: number
        PERFORMANCE_THRESHOLDS: {
          USAGE_CHECK_MS: number
          SUBSCRIPTION_CHECK_MS: number
          CONCURRENT_USERS: number
        }
      }
      testUtils: {
        wait: (ms: number) => Promise<void>
        mockSupabaseResponse: (data: any, error?: any) => { data: any; error: any }
        createMockTelegramUser: (id: string, overrides?: any) => any
        assertWithinThreshold: (actual: number, threshold: number, message?: string) => void
      }
      testStartTime: number
      gc?: () => void
    }
  }

  namespace jest {
    interface Matchers<R> {
      toAllowGeneration(expectedUserType: string): R
      toDenyGeneration(expectedUserType: string): R
      toBeWithinPerformanceThreshold(threshold: number, operation: string): R
    }
  }
}

export {}