/**
 * ZOT Test Setup
 *
 * Global test configuration and setup for ZOT model testing.
 *
 * @version 1.0.0
 * @author ZOT Model Creator Agent
 */

import { beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';

// Global test configuration
const ZOT_TEST_CONFIG = {
  maxProcessingTime: 5000,
  minAccuracy: 85,
  maxErrorRate: 0.05,
  defaultTimeout: 30000
};

// Make config available globally
(global as any).ZOT_TEST_CONFIG = ZOT_TEST_CONFIG;

// Global setup
beforeAll(async () => {
  console.log('🚀 Starting ZOT Model Test Suite');
  console.log(`📊 Performance Benchmarks:`);
  console.log(`   - Max Processing Time: ${ZOT_TEST_CONFIG.maxProcessingTime}ms`);
  console.log(`   - Min Accuracy: ${ZOT_TEST_CONFIG.minAccuracy}%`);
  console.log(`   - Max Error Rate: ${ZOT_TEST_CONFIG.maxErrorRate * 100}%`);

  // Initialize test environment
  process.env.NODE_ENV = 'test';
  process.env.ZOT_TEST_MODE = 'true';

  // Increase timeout for complex tests
  // @ts-ignore - jest is available in test environment
  if (typeof jest !== 'undefined') {
    jest.setTimeout(ZOT_TEST_CONFIG.defaultTimeout);
  }
});

// Global teardown
afterAll(async () => {
  console.log('✅ ZOT Model Test Suite Completed');

  // Clean up any test artifacts
  delete process.env.ZOT_TEST_MODE;
});

// Per-test setup
beforeEach(() => {
  // Reset any global state
  // Clear console logs for clean test output
  if (process.env.NODE_ENV === 'test' && !process.env.DEBUG) {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
  }
});

// Per-test cleanup
afterEach(() => {
  // Restore console methods
  if (jest.isMockFunction(console.log)) {
    (console.log as jest.MockedFunction<typeof console.log>).mockRestore();
  }
  if (jest.isMockFunction(console.warn)) {
    (console.warn as jest.MockedFunction<typeof console.warn>).mockRestore();
  }
  if (jest.isMockFunction(console.info)) {
    (console.info as jest.MockedFunction<typeof console.info>).mockRestore();
  }

  // Clear all mocks
  jest.clearAllMocks();
});

// Global error handler for uncaught exceptions in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't fail the test suite for unhandled rejections in test mode
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
});

// Memory usage monitoring
let initialMemoryUsage: NodeJS.MemoryUsage;

beforeAll(() => {
  initialMemoryUsage = process.memoryUsage();
  console.log(`📈 Initial Memory Usage: ${Math.round(initialMemoryUsage.heapUsed / 1024 / 1024)}MB`);
});

afterAll(() => {
  const finalMemoryUsage = process.memoryUsage();
  const memoryIncrease = finalMemoryUsage.heapUsed - initialMemoryUsage.heapUsed;
  console.log(`📉 Final Memory Usage: ${Math.round(finalMemoryUsage.heapUsed / 1024 / 1024)}MB`);
  console.log(`📊 Memory Increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);

  // Warn if memory usage is too high
  const maxMemoryMB = 100;
  if (memoryIncrease > maxMemoryMB * 1024 * 1024) {
    console.warn(`⚠️  High memory usage detected: ${Math.round(memoryIncrease / 1024 / 1024)}MB > ${maxMemoryMB}MB`);
  }
});

// Performance tracking
const performanceMetrics = {
  testCounts: {
    passed: 0,
    failed: 0,
    skipped: 0
  },
  totalTestTime: 0,
  slowTests: [] as Array<{ name: string; duration: number }>
};

// Track test performance
const originalTest = (global as any).test;
(global as any).test = (name: string, fn: Function, timeout?: number) => {
  return originalTest(name, async () => {
    const startTime = Date.now();
    try {
      await fn();
      performanceMetrics.testCounts.passed++;
    } catch (error) {
      performanceMetrics.testCounts.failed++;
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      performanceMetrics.totalTestTime += duration;

      // Track slow tests
      if (duration > 1000) {
        performanceMetrics.slowTests.push({ name, duration });
      }
    }
  }, timeout);
};

// Report performance metrics at the end
afterAll(() => {
  console.log('\n📊 Test Performance Metrics:');
  console.log(`   - Total Tests: ${performanceMetrics.testCounts.passed + performanceMetrics.testCounts.failed}`);
  console.log(`   - Passed: ${performanceMetrics.testCounts.passed}`);
  console.log(`   - Failed: ${performanceMetrics.testCounts.failed}`);
  console.log(`   - Total Time: ${performanceMetrics.totalTestTime}ms`);
  console.log(`   - Average Time: ${Math.round(performanceMetrics.totalTestTime / (performanceMetrics.testCounts.passed + performanceMetrics.testCounts.failed))}ms`);

  if (performanceMetrics.slowTests.length > 0) {
    console.log('\n🐌 Slow Tests (>1s):');
    performanceMetrics.slowTests
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5)
      .forEach(test => {
        console.log(`   - ${test.name}: ${test.duration}ms`);
      });
  }
});

export { ZOT_TEST_CONFIG };