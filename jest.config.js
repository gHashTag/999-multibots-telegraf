// const { pathsToModuleNameMapper } = require('ts-jest') // Убираем
// const { compilerOptions } = require('./tsconfig.json') // Убираем

module.exports = {
  // Suppress console output from tested modules
  silent: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
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
  setupFilesAfterEnv: ['<rootDir>/__tests__/utils/jest.setup.ts'],
  // Добавляем репортеры: стандартный и HTML
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicPath: './html-report',
      filename: 'report.html',
      expand: true,
    }],
  ],
}
