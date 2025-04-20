// require('dotenv').config({ path: '.env' }) // Убираем загрузку отсюда

// const { pathsToModuleNameMapper } = require('ts-jest') // Убираем
// const { compilerOptions } = require('./tsconfig.json') // Убираем

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
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
  testMatch: ['**/__tests__/**/*.test.ts'],
  coveragePathIgnorePatterns: ['/node_modules/'],
  // Добавляем репортеры: стандартный и HTML
  reporters: [
    'default',
    [
      'jest-html-reporters',
      {
        publicPath: './html-report',
        filename: 'report.html',
        expand: true,
      },
    ],
  ],
}
