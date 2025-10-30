module.exports = {
  displayName: 'ElevenLabs Tests',
  testMatch: [
    '<rootDir>/tests/elevenlabs/**/*.test.{js,ts}'
  ],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  testEnvironment: 'node',
  setupFilesAfterEnv: [
    '<rootDir>/tests/elevenlabs/setup.js'
  ],
  collectCoverageFrom: [
    'src/core/elevenlabs/**/*.{js,ts}',
    'src/core/supabase/getVoiceId.{js,ts}',
    'src/core/supabase/updateUserVoice.{js,ts}',
    'src/helpers/voiceValidation.{js,ts}',
    '!**/*.d.ts',
    '!**/node_modules/**'
  ],
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  coverageDirectory: '<rootDir>/coverage/elevenlabs',
  testTimeout: 30000,
  maxWorkers: 1, // Run tests sequentially to avoid conflicts
  verbose: true,
  globals: {
    'ts-jest': {
      tsconfig: {
        compilerOptions: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true
        }
      }
    }
  }
}