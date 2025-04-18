module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  coveragePathIgnorePatterns: ['/node_modules/'],
  setupFilesAfterEnv: ['./__tests__/utils/jest.setup.ts'],
  globals: {
    'ts-jest': {
      isolatedModules: true
    }
  }
}; 