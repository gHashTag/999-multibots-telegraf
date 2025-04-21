// Prevent dotenv from loading real .env
jest.mock('dotenv', () => ({ config: jest.fn() }))
// Mock supabase-js createClient
jest.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string) => ({ url, key }),
}))
import * as config from '@/config'
// Suppress logger output
import logger from '@/utils/logger'
jest.spyOn(logger, 'warn').mockImplementation(() => ({} as any))
jest.spyOn(logger, 'error').mockImplementation(() => ({} as any))
jest.spyOn(logger, 'info').mockImplementation(() => ({} as any))

describe('core/supabase index', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('creates supabase clients and re-exports methods', () => {
    const supabaseModule = require('@/core/supabase')
    // Check clients
    expect(supabaseModule.supabase).toEqual({
      url: 'http://supabase.test',
      key: 'service-key',
    })
    expect(supabaseModule.supabaseAdmin).toEqual({
      url: 'http://supabase.test',
      key: 'service-role',
    })
    // Check some re-exported functions
    expect(typeof supabaseModule.getBotsFromSupabase).toBe('function')
    expect(typeof supabaseModule.checkPaymentStatus).toBe('function')
    expect(typeof supabaseModule.createUser).toBe('function')
    expect(typeof supabaseModule.getUserByTelegramId).toBe('function')
  })
})
