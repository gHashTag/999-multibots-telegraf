import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Prevent dotenv from loading real .env
jest.mock('dotenv', () => ({ config: jest.fn() }))
// Mock supabase-js createClient
jest.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string) => ({ url, key }),
}))
import * as config from '@/config'
// Suppress logger output
import logger from '@/utils/logger'
jest.spyOn(logger, 'warn').mockImplementation(() => {})
jest.spyOn(logger, 'error').mockImplementation(() => {})
jest.spyOn(logger, 'info').mockImplementation(() => {})

describe('core/supabase index', () => {
  beforeEach(() => {
    jest.resetModules()
    // Set environment config
    config.SUPABASE_URL = 'http://supabase.test'
    config.SUPABASE_SERVICE_KEY = 'service-key'
    config.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
    config.isSupabaseConfigured = true
  })

  it('creates supabase clients and re-exports methods', () => {
    const supabaseModule = require('@/core/supabase')
    // Check clients
    expect(supabaseModule.supabase).toEqual({ url: 'http://supabase.test', key: 'service-key' })
    expect(supabaseModule.supabaseAdmin).toEqual({ url: 'http://supabase.test', key: 'service-role' })
    // Check some re-exported functions
    expect(typeof supabaseModule.getBotsFromSupabase).toBe('function')
    expect(typeof supabaseModule.checkPaymentStatus).toBe('function')
    expect(typeof supabaseModule.createUser).toBe('function')
    expect(typeof supabaseModule.getUserByTelegramId).toBe('function')
  })
})