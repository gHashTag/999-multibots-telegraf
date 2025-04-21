
describe('getUidInviter', () => {
  let builder: any
  let mockFrom: jest.Mock
  let getUidInviter: (telegram_id: string | number) => Promise<any>
  let consoleWarn: jest.SpyInstance
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.resetModules()
    // Build supabase.from chain: select().eq()
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
    getUidInviter = require('@/core/supabase/getUidInviter').getUidInviter
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns null and warns when no telegram_id provided', async () => {
    // @ts-ignore
    const res = await getUidInviter(undefined)
    expect(consoleWarn).toHaveBeenCalledWith('No telegram_id provided to getUid')
    expect(res).toBeNull()
  })

  it('returns null and logs error when supabase returns error', async () => {
    const err = new Error('db fail')
    builder.eq.mockReturnValueOnce(Promise.resolve({ data: null, error: err }))
    const res = await getUidInviter('42')
    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(builder.select).toHaveBeenCalledWith('user_id, username, telegram_id, balance')
    expect(builder.eq).toHaveBeenCalledWith('telegram_id', '42')
    expect(consoleError).toHaveBeenCalledWith('Error getting user_id:', err)
    expect(res).toBeNull()
  })

  it('returns inviter info when data returned', async () => {
    const data = [{ user_id: 'u1', username: 'user1', telegram_id: '42', balance: 100 }]
    builder.eq.mockReturnValueOnce(Promise.resolve({ data, error: null }))
    const res = await getUidInviter('42')
    expect(res).toEqual({
      inviter_id: 'u1',
      inviter_username: 'user1',
      inviter_telegram_id: '42',
      inviter_balance: 100,
    })
  })

  it('returns null fields when data empty', async () => {
    builder.eq.mockReturnValueOnce(Promise.resolve({ data: [], error: null }))
    const res = await getUidInviter('43')
    expect(res).toEqual({
      inviter_id: null,
      inviter_username: null,
      inviter_telegram_id: null,
      inviter_balance: null,
    })
  })

  it('returns null and logs error on exception', async () => {
    const err = new Error('exception')
    builder.eq.mockReturnValueOnce(Promise.reject(err))
    const res = await getUidInviter('44')
    expect(consoleError).toHaveBeenCalledWith('Error in getUid:', err)
    expect(res).toBeNull()
  })
})