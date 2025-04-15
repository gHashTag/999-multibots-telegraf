import dotenv from 'dotenv'
import path from 'path'

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

// Mock environment variables if they don't exist
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321'
process.env.SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY || 'test-service-key'
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-role-key'
process.env.ELEVENLABS_API_KEY =
  process.env.ELEVENLABS_API_KEY || 'test-elevenlabs-key'
process.env.INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY || 'test-key'
process.env.NODE_ENV = 'test'

// Silence console logs during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}
