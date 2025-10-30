/**
 * @fileoverview Jest configuration for generation limits testing suite
 * @description Specialized configuration for comprehensive testing of generation limits
 */

module.exports = {
  displayName: 'Generation Limits Tests',
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '<rootDir>/tests/generation-limits/**/*.test.ts'
  ],

  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/generation-limits/setup.ts'
  ],

  // Module resolution
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },

  // Transform TypeScript files
  preset: 'ts-jest',

  // Timeout settings
  testTimeout: 10000, // 10 seconds default

  // Coverage settings
  collectCoverage: true,
  collectCoverageFrom: [
    'src/core/supabase/checkAvatarTransformUsage.ts',
    'src/core/supabase/markAvatarTransformUsed.ts',
    'src/core/supabase/getUserDetailsSubscription.ts',
    'src/scenes/avatarTransformScene/**/*.ts',
    'src/handlers/handleMenu.ts'
  ],
  coverageDirectory: '<rootDir>/tests/generation-limits/coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    },
    'src/core/supabase/checkAvatarTransformUsage.ts': {
      branches: 90,
      functions: 95,
      lines: 90,
      statements: 90
    },
    'src/core/supabase/getUserDetailsSubscription.ts': {
      branches: 85,
      functions: 90,
      lines: 85,
      statements: 85
    }
  },

  // Test reporter
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicPath: './tests/generation-limits/reports',
      filename: 'test-report.html',
      expand: true,
      hideIcon: false,
      pageTitle: 'Generation Limits Test Report'
    }]
  ],

  // Performance settings
  maxWorkers: '50%', // Use half the available CPU cores

  // Test retry on failures
  retryTimes: 2,

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,

  // Verbose output for detailed test information
  verbose: true,

  // Test categories with different timeouts
  projects: [
    {
      displayName: 'Unit Tests',
      testMatch: ['<rootDir>/tests/generation-limits/unit/**/*.test.ts'],
      testTimeout: 5000
    },
    {
      displayName: 'Integration Tests',
      testMatch: ['<rootDir>/tests/generation-limits/integration/**/*.test.ts'],
      testTimeout: 10000
    },
    {
      displayName: 'E2E Tests',
      testMatch: ['<rootDir>/tests/generation-limits/e2e/**/*.test.ts'],
      testTimeout: 15000
    },
    {
      displayName: 'Performance Tests',
      testMatch: ['<rootDir>/tests/generation-limits/performance/**/*.test.ts'],
      testTimeout: 30000
    },
    {
      displayName: 'Edge Cases',
      testMatch: ['<rootDir>/tests/generation-limits/edge-cases/**/*.test.ts'],
      testTimeout: 10000
    }
  ],

  // Global test environment variables
  globals: {
    'ts-jest': {
      tsconfig: {
        target: 'es2020',
        module: 'commonjs',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        skipLibCheck: true
      }
    }
  },

  // Test result processor for custom analysis
  testResultsProcessor: '<rootDir>/tests/generation-limits/test-processor.js',

  // Watch mode settings
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ],

  // Error handling
  bail: 0, // Don't stop on first failure
  errorOnDeprecated: true,

  // Snapshot settings
  updateSnapshot: false,

  // Mock settings
  automock: false,

  // Custom test sequencer for performance tests
  testSequencer: '<rootDir>/tests/generation-limits/test-sequencer.js'
}