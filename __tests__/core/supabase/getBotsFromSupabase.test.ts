import { describe, it, expect, beforeEach, jest } from '@jest/globals'

// Prevent loading real .env file
jest.mock('dotenv', () => ({ config: jest.fn() }))

describe('core/supabase getBotsFromSupabase', () => {
  let supabaseModule: any
  let logger: any

  beforeEach(() => {
    jest.resetModules()
    // Import fresh modules
    supabaseModule = require('@/core/supabase')
    logger = require('@/utils/logger').default
    // Default: supabase not configured
    const config = require('@/config')
    config.isSupabaseConfigured = true
  })

  it('returns empty array and warns if not configured', async () => {
    const config = require('@/config')
    config.isSupabaseConfigured = false
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {})
    const { getBotsFromSupabase } = supabaseModule
    const bots = await getBotsFromSupabase()
    expect(bots).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith(
      'Supabase не настроен. Невозможно получить ботов из базы данных.'
    )
    warnSpy.mockRestore()
  })

  it('returns empty array and logs error on query error', async () => {
    const { supabaseAdmin, getBotsFromSupabase } = supabaseModule
    // Mock supabaseAdmin.from().select().eq() to return error
    supabaseAdmin.from = jest.fn(() => ({
      select: () => ({
        eq: async () => ({ data: null, error: { message: 'fail' } })
      })
    }))
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {})
    const bots = await getBotsFromSupabase()
    expect(bots).toEqual([])
    expect(errorSpy).toHaveBeenCalledWith(
      'Ошибка при получении ботов из Supabase: fail'
    )
    errorSpy.mockRestore()
  })

  it('returns empty array and logs info when no data', async () => {
    const { supabaseAdmin, getBotsFromSupabase } = supabaseModule
    supabaseAdmin.from = jest.fn(() => ({
      select: () => ({
        eq: async () => ({ data: [], error: null })
      })
    }))
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {})
    const bots = await getBotsFromSupabase()
    expect(bots).toEqual([])
    expect(infoSpy).toHaveBeenCalledWith('В Supabase не найдено активных ботов')
    infoSpy.mockRestore()
  })

  it('returns data array and logs info on success', async () => {
    const fakeData = [{ id: 1, name: 'bot1' }]
    const { supabaseAdmin, getBotsFromSupabase } = supabaseModule
    supabaseAdmin.from = jest.fn(() => ({
      select: () => ({
        eq: async () => ({ data: fakeData, error: null })
      })
    }))
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {})
    const bots = await getBotsFromSupabase()
    expect(bots).toEqual(fakeData)
    expect(infoSpy).toHaveBeenCalledWith(`Получено ${fakeData.length} ботов из Supabase`)
    infoSpy.mockRestore()
  })
  
  it('logs error and returns empty array when supabaseAdmin throws exception', async () => {
    const { supabaseAdmin, getBotsFromSupabase } = supabaseModule
    // Simulate thrown error
    supabaseAdmin.from = jest.fn(() => { throw new Error('fatal') })
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {})
    const bots = await getBotsFromSupabase()
    expect(bots).toEqual([])
    expect(errorSpy).toHaveBeenCalledWith(
      `Ошибка при получении ботов из Supabase: fatal`
    )
    errorSpy.mockRestore()
  })
})