
interface CreateUserData {
  username: string
  telegram_id: number
  first_name: string
  last_name: string
  is_bot: boolean
  language_code: string
  photo_url?: string
  chat_id: number
  mode: string
  model: string
  count: number
  aspect_ratio: string
  balance: number
  inviter?: number
  bot_name: string
}

describe('createUser', () => {
  let mockMaybeSingle: jest.Mock
  let mockEqSelect: jest.Mock
  let mockSelect: jest.Mock
  let mockEqUpdate: jest.Mock
  let mockUpdate: jest.Mock
  let mockInsert: jest.Mock
  let mockFrom: jest.Mock
  let createUser: any

  const baseData: CreateUserData = {
    username: 'user',
    telegram_id: 123,
    first_name: 'First',
    last_name: 'Last',
    is_bot: false,
    language_code: 'en',
    photo_url: 'url',
    chat_id: 456,
    mode: 'm',
    model: 'mod',
    count: 1,
    aspect_ratio: '1:1',
    balance: 10,
    bot_name: 'bot',
  }

  beforeEach(() => {
    jest.resetModules()
    // Setup supabase.from chain mocks
    mockMaybeSingle = jest.fn()
    mockEqSelect = jest.fn(() => ({ maybeSingle: mockMaybeSingle }))
    mockSelect = jest.fn(() => ({ eq: mockEqSelect }))
    mockEqUpdate = jest.fn()
    mockUpdate = jest.fn(() => ({ eq: mockEqUpdate }))
    mockInsert = jest.fn()
    mockFrom = jest.fn(() => ({ select: mockSelect, update: mockUpdate, insert: mockInsert }))
    jest.doMock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))
    // Import createUser
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    createUser = require('@/core/supabase/createUser').createUser
  })

  it('throws if inviter check fails', async () => {
    const err = new Error('invite error')
    // inviter check select
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: err })
    const data = { ...baseData, inviter: 999 }
    await expect(createUser(data)).rejects.toThrow(`Ошибка при проверке инвайтера: ${err.message}`)
  })

  it('throws if existing user select fails', async () => {
    // inviter absent => first select is existing user
    const err = new Error('select error')
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: err })
    await expect(createUser(baseData)).rejects.toThrow(`Ошибка при проверке существующего пользователя: ${err.message}`)
  })

  it('updates existing user when found without inviter', async () => {
    const existingUser = { telegram_id: '123', inviter: 0 }
    // existing select ok
    mockMaybeSingle.mockResolvedValueOnce({ data: existingUser, error: null })
    // update ok
    mockEqUpdate.mockResolvedValueOnce({ error: null })
    const result = await createUser(baseData)
    expect(result).toBe(existingUser)
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockEqUpdate).toHaveBeenCalledWith('telegram_id', baseData.telegram_id.toString())
  })

  it('inserts new user when not exists', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    mockInsert.mockResolvedValueOnce({ error: null })
    const result = await createUser(baseData)
    expect(result).toBe(null)
    expect(mockInsert).toHaveBeenCalledWith([expect.objectContaining({ telegram_id: baseData.telegram_id })])
  })

  it('throws on update error', async () => {
    const existingUser = { telegram_id: '123', inviter: 0 }
    mockMaybeSingle.mockResolvedValueOnce({ data: existingUser, error: null })
    const upErr = new Error('upd error')
    mockEqUpdate.mockResolvedValueOnce({ error: upErr })
    await expect(createUser(baseData)).rejects.toThrow(`Ошибка при обновлении пользователя: ${upErr.message}`)
  })

  it('throws on insert error', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    const insErr = new Error('ins error')
    mockInsert.mockResolvedValueOnce({ error: insErr })
    await expect(createUser(baseData)).rejects.toThrow(`Ошибка при добавлении пользователя: ${insErr.message}`)
  })
})