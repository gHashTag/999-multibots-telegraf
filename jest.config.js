// require('dotenv').config({ path: '.env' }) // Убираем загрузку отсюда

// const { pathsToModuleNameMapper } = require('ts-jest') // Убираем
// const { compilerOptions } = require('./tsconfig.json') // Убираем

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  // Disable watchman to prevent Watchman errors
  watchman: false,
  // Use local cache directory to avoid permission issues
  cacheDirectory: '<rootDir>/tmp_tests/jest_cache',
  // Suppress console output from tested modules
  silent: false, // Временно выключим silent, чтобы видеть лог из setup файла
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Указываем globalSetup
  globalSetup: '<rootDir>/jest.globalSetup.js',
  // Добавляем стандартные директории и пути
  moduleDirectories: ['node_modules', 'src'],
  modulePaths: ['<rootDir>'],
  // Возвращаем более простой маппинг
  moduleNameMapper: {
    '^@/__tests__/(.*)$': '<rootDir>/__tests__/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
        noCache: true,
      },
    ],
  },
  // Run all tests in __tests__ and tests directories
  testMatch: ['**/__tests__/**/*.test.ts', '**/tests/**/*.test.ts'],
  // Ignore node_modules directory
  testPathIgnorePatterns: ['/node_modules/'],
  coveragePathIgnorePatterns: ['/node_modules/'],
  // Use default reporter only
  reporters: ['default'],
}
