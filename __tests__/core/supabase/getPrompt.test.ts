import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'

describe('getPrompt', () => {
  let builder: any
  let mockFrom: jest.Mock
  let getPrompt: (prompt_id: string) => Promise<any>

  beforeEach(() => {
    jest.resetModules()
    // Build supabase query chain
    builder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
    }
    mockFrom = jest.fn(() => builder)
    jest.doMock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))
    // Suppress console.log and console.error
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    // Import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    getPrompt = require('@/core/supabase/getPrompt').getPrompt
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns data when found and no error', async () => {
    const dataObj = { prompt_id: 'p1', text: 'hello' }
    builder.single.mockResolvedValueOnce({ data: dataObj, error: null })
    const result = await getPrompt('p1')
    expect(mockFrom).toHaveBeenCalledWith('prompts_history')
    expect(builder.select).toHaveBeenCalledWith('*')
    expect(builder.eq).toHaveBeenCalledWith('prompt_id', 'p1')
    expect(builder.single).toHaveBeenCalled()
    expect(result).toBe(dataObj)
  })

  it('returns null and logs error when error in response', async () => {
    const err = new Error('fail')
    builder.single.mockResolvedValueOnce({ data: null, error: err })
    const result = await getPrompt('p2')
    expect(console.error).toHaveBeenCalledWith(
      'Ошибка при получении промпта по prompt_id:', err
    )
    expect(result).toBeNull()
  })

  it('returns null and logs error when no data', async () => {
    builder.single.mockResolvedValueOnce({ data: undefined, error: null })
    const result = await getPrompt('p3')
    expect(console.error).toHaveBeenCalledWith(
      'Ошибка при получении промпта по prompt_id:', null
    )
    expect(result).toBeNull()
  })
})