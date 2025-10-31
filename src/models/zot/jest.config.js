/**
 * Jest Configuration for ZOT Model Testing
 *
 * Comprehensive testing configuration for the ZOT validation system
 * with coverage reporting and performance benchmarks.
 *
 * @version 1.0.0
 * @author ZOT Model Creator Agent
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Preset for TypeScript
  preset: 'ts-jest',

  // Test file patterns
  testMatch: [
    '**/src/models/zot/tests/**/*.test.ts',
    '**/src/models/zot/**/*.test.ts'
  ],

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Transform files
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },

  // Module name mapping
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@models/(.*)$': '<rootDir>/src/models/$1',
    '^@zot/(.*)$': '<rootDir>/src/models/zot/$1'
  },

  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/src/models/zot/tests/setup.ts'
  ],

  // Coverage configuration
  collectCoverage: true,
  collectCoverageFrom: [
    'src/models/zot/**/*.ts',
    '!src/models/zot/**/*.test.ts',
    '!src/models/zot/tests/**/*',
    '!src/models/zot/examples.ts',
    '!src/models/zot/jest.config.js'
  ],

  // Coverage thresholds (ZOT quality standards)
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 90,
      lines: 92,
      statements: 92
    },
    './src/models/zot/interfaces.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    },
    './src/models/zot/classifier.ts': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './src/models/zot/validator.ts': {
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
    'lcov',
    'json'
  ],

  // Coverage directory
  coverageDirectory: '<rootDir>/coverage/zot',

  // Test timeout
  testTimeout: 30000,

  // Verbose output
  verbose: true,

  // Display individual test results
  displayName: {
    name: 'ZOT-MODEL',
    color: 'blue'
  },

  // Error handling
  errorOnDeprecated: true,

  // Performance monitoring
  maxWorkers: '50%',

  // Cache configuration
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache/zot',

  // Test result processor
  testResultsProcessor: '<rootDir>/src/models/zot/tests/results-processor.js',

  // Global variables
  globals: {
    'ts-jest': {
      tsconfig: {
        target: 'es2020',
        module: 'commonjs',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true
      }
    },
    ZOT_TEST_MODE: true,
    ZOT_TEST_TIMEOUT: 30000,
    ZOT_PERFORMANCE_BENCHMARKS: {
      maxProcessingTime: 5000,
      minRecordsPerSecond: 1000,
      maxMemoryUsage: 100 * 1024 * 1024 // 100MB
    }
  },

  // Test reporting
  reporters: [
    'default',
    [
      'jest-html-reporters',
      {
        publicPath: '<rootDir>/coverage/zot/html-report',
        filename: 'zot-test-report.html',
        pageTitle: 'ZOT Model Test Report',
        logoImgPath: undefined,
        hideIcon: false,
        expand: true,
        darkTheme: false,
        includeCoverageReport: true
      }
    ],
    [
      'jest-junit',
      {
        outputDirectory: '<rootDir>/coverage/zot',
        outputName: 'zot-junit.xml',
        suiteName: 'ZOT Model Tests',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: true
      }
    ]
  ],

  // Test environment options
  testEnvironmentOptions: {
    node: {
      experimental: {
        vm: true
      }
    }
  },

  // Custom matchers
  setupFilesAfterEnv: [
    '<rootDir>/src/models/zot/tests/custom-matchers.ts'
  ]
};