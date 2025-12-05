/**
 * Root Jest Configuration
 *
 * This config ensures Jest doesn't try to parse Vitest test files.
 * Main test runner is Vitest via `bun test`.
 *
 * CRITICAL: This config EXCLUDES all test files except those in src/models/zot/
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Preset for TypeScript
  preset: 'ts-jest',

  // CRITICAL: Explicitly ignore ALL test directories except src/models/zot
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/build/',
    '<rootDir>/.git/',
    '<rootDir>/src/__tests__/',
    '<rootDir>/src/helpers/test/',
    '<rootDir>/src/modules/',
    '<rootDir>/tests/',
  ],

  // ONLY run Jest tests for the zot model - everything else is Vitest!
  testMatch: [
    '**/src/models/zot/**/*.test.ts',
  ],

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Transform files
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },

  // Module name mapping
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@models/(.*)$': '<rootDir>/src/models/$1',
    '^@zot/(.*)$': '<rootDir>/src/models/zot/$1'
  },

  // Setup files - only if needed
  // setupFilesAfterEnv: [],

  // Coverage configuration
  collectCoverage: false, // Don't collect coverage by default at root level

  // Test timeout
  testTimeout: 30000,

  // Cache configuration
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',

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
    }
  }
};