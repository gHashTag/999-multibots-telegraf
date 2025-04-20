import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'

describe('getUid', () => {
  let builder: any
  let mockFrom: jest.Mock
  let getUid: (telegram_id: string | number) => Promise<any>
  let consoleWarn: jest.SpyInstance
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.resetModules()
    // Mock supabase.from chain: select().eq()
    builder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn(),
    }
    mockFrom = jest.fn(() => builder)
    jest.doMock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))
    // Spy console
    consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    // Import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    getUid = require('@/core/supabase/getUid').getUid
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns null and warns when no telegram_id provided', async () => {
    // @ts-ignore
    const res = await getUid(undefined)
    expect(consoleWarn).toHaveBeenCalledWith('No telegram_id provided to getUid')
    expect(res).toBeNull()
  })

  it('returns null and logs error when supabase returns error', async () => {
    const err = new Error('db fail')
    builder.eq.mockReturnValueOnce(Promise.resolve({ data: null, error: err }))
    const res = await getUid('42')
    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(builder.select).toHaveBeenCalledWith('user_id, username, telegram_id')
    expect(builder.eq).toHaveBeenCalledWith('telegram_id', '42')
    expect(consoleError).toHaveBeenCalledWith('Error getting user_id:', err)
    expect(res).toBeNull()
  })

  it('returns null and logs error on exception', async () => {
    const err = new Error('exception')
    builder.eq.mockReturnValueOnce(Promise.reject(err))
    const res = await getUid('43')
    expect(consoleError).toHaveBeenCalledWith('Error in getUid:', err)
    expect(res).toBeNull()
  })

  it('returns user_id and username when data returned', async () => {
    const data = [{ user_id: 'u1', username: 'user1', telegram_id: '99' }]
    builder.eq.mockReturnValueOnce(Promise.resolve({ data, error: null }))
    const res = await getUid('99')
    expect(res).toEqual({ user_id: 'u1', username: 'user1' })
  })

  it('returns null user_id and username when data empty', async () => {
    builder.eq.mockReturnValueOnce(Promise.resolve({ data: [], error: null }))
    const res = await getUid('100')
    expect(res).toEqual({ user_id: null, username: null })
  })
})