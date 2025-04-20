const { pathsToModuleNameMapper } = require('ts-jest')
// Загружаем пути из tsconfig.json
const { compilerOptions } = require('./tsconfig.json')

module.exports = {
  // Suppress console output from tested modules
  silent: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  // modulePaths: ['<rootDir>/src'], // Убираем, т.к. moduleNameMapper должен покрыть
  moduleNameMapper: {
    // Генерируем маппинг для @/* из tsconfig
    ...pathsToModuleNameMapper(compilerOptions.paths, {
      prefix: '<rootDir>/src/',
    }),
    // Оставляем маппинг для тестов
    '^@/__tests__/(.*)$': '<rootDir>/__tests__/$1',
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
  testMatch: ['**/__tests__/**/*.test.ts'],
  coveragePathIgnorePatterns: ['/node_modules/'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/utils/jest.setup.ts'],
}
