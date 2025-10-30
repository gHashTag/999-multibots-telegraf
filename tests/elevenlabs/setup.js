// Jest setup file for ElevenLabs tests
const path = require('path')

// Ensure environment variables are loaded
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

// Mock console methods to reduce noise in tests
const originalConsoleLog = console.log
const originalConsoleWarn = console.warn
const originalConsoleError = console.error

// Only show logs in verbose mode
const isVerbose = process.argv.includes('--verbose') || process.env.JEST_VERBOSE === 'true'

if (!isVerbose) {
  console.log = jest.fn()
  console.warn = jest.fn()
  console.error = jest.fn()
}

// Set test environment variables
process.env.NODE_ENV = 'test'
process.env.JEST_TESTING = 'true'

// Mock API keys for testing
if (!process.env.ELEVENLABS_API_KEY) {
  process.env.ELEVENLABS_API_KEY = 'sk_test_mock_key_for_testing'
}

if (!process.env.AI_SERVER_URL) {
  process.env.AI_SERVER_URL = 'https://mock-ai-server.test.com'
}

// Global test utilities
global.testUtils = {
  mockVoiceId: 'test_voice_id_12345',
  mockTelegramId: 'test_telegram_id_12345',
  mockText: 'This is a test message for ElevenLabs TTS',

  // Restore console for debugging
  restoreConsole: () => {
    console.log = originalConsoleLog
    console.warn = originalConsoleWarn
    console.error = originalConsoleError
  },

  // Helper to wait for async operations
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Helper to check if running in CI
  isCI: () => process.env.CI === 'true',

  // Helper to check if integration tests should run
  shouldRunIntegrationTests: () => {
    return process.env.RUN_INTEGRATION_TESTS === 'true' &&
           process.env.ELEVENLABS_API_KEY &&
           process.env.ELEVENLABS_API_KEY.startsWith('sk_')
  }
}

// Global test timeout
jest.setTimeout(30000)

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks()

  // Clean up any test files in /tmp
  const fs = require('fs')
  const os = require('os')

  try {
    const tmpDir = os.tmpdir()
    const testFiles = fs.readdirSync(tmpDir).filter(file =>
      file.includes('audio_') || file.includes('test_') || file.includes('mock_')
    )

    testFiles.forEach(file => {
      try {
        fs.unlinkSync(path.join(tmpDir, file))
      } catch (error) {
        // Ignore cleanup errors
      }
    })
  } catch (error) {
    // Ignore cleanup errors
  }
})

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  if (isVerbose) {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  }
})