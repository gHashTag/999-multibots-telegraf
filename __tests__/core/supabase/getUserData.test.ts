import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'

describe('getUserData', () => {
  let builder: any
  let mockFrom: jest.Mock
  let getUserData: (telegram_id: string) => Promise<any>

  beforeEach(() => {
    jest.resetModules()
    // Build supabase query chain
    builder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn()
    }
    mockFrom = jest.fn(() => builder)
    // Mock supabase client
    jest.doMock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))
    // Import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    getUserData = require('@/core/supabase/getUserData').getUserData
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns user data when found', async () => {
    const userData = {
      username: 'u', first_name: 'f', last_name: 'l', company: 'c',
      position: 'pos', designation: 'des', language_code: 'en'
    }
    builder.maybeSingle.mockResolvedValueOnce({ data: userData, error: null })
    const res = await getUserData('123')
    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(builder.select).toHaveBeenCalledWith(
      'username, first_name, last_name, company, position, designation, language_code'
    )
    expect(builder.eq).toHaveBeenCalledWith('telegram_id', '123')
    expect(builder.maybeSingle).toHaveBeenCalled()
    expect(res).toBe(userData)
  })

  it('throws error when supabase returns error', async () => {
    const err = new Error('fail')
    builder.maybeSingle.mockResolvedValueOnce({ data: null, error: err })
    await expect(getUserData('321')).rejects.toThrow(
      `Ошибка при получении данных пользователя: ${err.message}`
    )
  })

  it('returns undefined when no data and no error', async () => {
    builder.maybeSingle.mockResolvedValueOnce({ data: undefined, error: null })
    const res = await getUserData('555')
    expect(res).toBeUndefined()
  })
})