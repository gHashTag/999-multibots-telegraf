import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'

describe('incrementGeneratedImages', () => {
  let builder: any
  let mockFrom: jest.Mock
  let incrementGeneratedImages: (telegram_id: number) => Promise<boolean>
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.resetModules()
    // Setup supabase.from chain
    builder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      insert: jest.fn(),
      update: jest.fn().mockReturnThis(),
    }
    builder.eq = jest.fn().mockReturnValue(builder)
    // For update chaining: builder.update().eq()
    const updateEq = jest.fn()
    builder.update = jest.fn(() => ({ eq: updateEq }))
    builder.insert = jest.fn()
    mockFrom = jest.fn(() => builder)
    jest.doMock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))
    // Suppress console.error
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    // Import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    incrementGeneratedImages = require('@/core/supabase/incrementGeneratedImages').incrementGeneratedImages
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('inserts new user when error code PGRST116 and insert succeeds', async () => {
    const err = { code: 'PGRST116' }
    builder.single.mockResolvedValueOnce({ data: null, error: err })
    builder.insert.mockResolvedValueOnce({ error: null })
    const result = await incrementGeneratedImages(77)
    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(builder.insert).toHaveBeenCalledWith({ telegram_id: '77', count: 1 })
    expect(result).toBe(true)
  })

  it('returns false when insert fails', async () => {
    const err = { code: 'PGRST116' }
    const insErr = new Error('ins fail')
    builder.single.mockResolvedValueOnce({ data: null, error: err })
    builder.insert.mockResolvedValueOnce({ error: insErr })
    const result = await incrementGeneratedImages(88)
    expect(consoleError).toHaveBeenCalledWith('Ошибка при добавлении нового telegram_id:', insErr)
    expect(result).toBe(false)
  })

  it('updates existing user when data present and update succeeds', async () => {
    builder.single.mockResolvedValueOnce({ data: { count: 5 }, error: null })
    // builder.update().eq returns promise chain, override eq
    const updateEq = jest.fn().mockResolvedValue({ error: null })
    builder.update.mockReturnValue({ eq: updateEq })
    const result = await incrementGeneratedImages(99)
    expect(builder.update).toHaveBeenCalledWith({ count: 6 })
    expect(updateEq).toHaveBeenCalledWith('telegram_id', '99')
    expect(result).toBe(true)
  })

  it('returns false when update fails', async () => {
    const upErr = new Error('upd fail')
    builder.single.mockResolvedValueOnce({ data: { count: 2 }, error: null })
    const updateEq = jest.fn().mockResolvedValue({ error: upErr })
    builder.update.mockReturnValue({ eq: updateEq })
    const result = await incrementGeneratedImages(100)
    expect(consoleError).toHaveBeenCalledWith('Ошибка при обновлении count для telegram_id:', upErr)
    expect(result).toBe(false)
  })

  it('returns false when error not PGRST116 and no data', async () => {
    const err = { code: 'OTHER' }
    builder.single.mockResolvedValueOnce({ data: null, error: err })
    const result = await incrementGeneratedImages(123)
    expect(consoleError).toHaveBeenCalledWith('Ошибка при проверке существования telegram_id:', err)
    expect(result).toBe(false)
  })
})