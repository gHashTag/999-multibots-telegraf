/**
 * Jest Configuration for Financial Testing Suite
 * Optimized for comprehensive testing with coverage reporting
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Root directory for tests
  rootDir: '../../',

  // Test file patterns
  testMatch: [
    '<rootDir>/tests/financial/**/*.test.ts',
    '<rootDir>/tests/financial/**/*.test.js'
  ],

  // TypeScript configuration
  preset: 'ts-jest',
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },

  // Module resolution
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/financial/jest.setup.js'
  ],

  // Coverage configuration
  collectCoverage: true,
  collectCoverageFrom: [
    'src/price/**/*.ts',
    'src/core/supabase/payments.ts',
    'src/core/supabase/getUserBalanceStats.ts',
    'src/utils/excelReportGenerator.ts',
    'src/price/helpers/calculateServiceCost.ts',
    'src/price/helpers/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts'
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    },
    // Critical files require higher coverage
    'src/price/helpers/calculateServiceCost.ts': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95
    },
    'src/core/supabase/payments.ts': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },

  // Coverage reporters
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'json-summary',
    'lcov'
  ],

  // Coverage directory
  coverageDirectory: '<rootDir>/tests/financial/coverage',

  // Test timeout
  testTimeout: 30000,

  // Verbose output
  verbose: true,

  // Error handling
  bail: false,
  detectOpenHandles: true,
  forceExit: true,

  // Performance optimization
  maxWorkers: '50%',
  cache: true,
  cacheDirectory: '<rootDir>/tests/financial/.jest-cache',

  // Global setup and teardown
  globalSetup: '<rootDir>/tests/financial/jest.globalSetup.js',
  globalTeardown: '<rootDir>/tests/financial/jest.globalTeardown.js',

  // Test result processor
  testResultsProcessor: '<rootDir>/tests/financial/jest.resultsProcessor.js',

  // Custom matchers
  customMatchers: {
    'toBeWithinStars': (received, expected, precision = 0.01) => {
      const pass = Math.abs(received - expected) <= precision
      return {
        pass,
        message: () => pass
          ? `Expected ${received} not to be within ${precision} stars of ${expected}`
          : `Expected ${received} to be within ${precision} stars of ${expected}`
      }
    }
  },

  // Performance monitoring
  collectCoverageReport: true,
  slowTestThreshold: 5000,

  // Mocking configuration
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Error handling for async tests
  unhandledPromiseRejectionHandling: 'strict'
}