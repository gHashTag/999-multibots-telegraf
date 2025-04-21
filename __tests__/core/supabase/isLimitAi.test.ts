// Sequential mocking of supabase.from for isLimitAi
async function runIsLimitAiWithBuilders(builders: any[]) {
  jest.resetModules()
  const supabaseModule = require('@/core/supabase')
  // Sequence builders
  const spy = jest.spyOn(supabaseModule.supabase, 'from')
  builders.forEach(builder => spy.mockImplementationOnce(() => builder))
  // import after mock
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { isLimitAi } = require('@/core/supabase/isLimitAi')
  return await isLimitAi('42')
}

describe('isLimitAi', () => {
  let mockSupabase: SupabaseClient
  let loggerSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    mockSupabase = createMockSupabaseClient() as unknown as SupabaseClient
    ;(supabase as any) = mockSupabase // Assign mock
    // Spy on logger.info
    loggerSpy = jest.spyOn(logger, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    loggerSpy.mockRestore() // Restore original logger behavior
  })

  it('should return false and log if user has enough limit', async () => {
    const mockTelegramId = 'user-with-limit'
    const mockLimit = 5
    const mockUserData = {
      limit: mockLimit,
      id: 'user1',
      // other fields...
    }

    // Mock Supabase calls
    const selectMock = jest.fn().mockReturnThis()
    const eqMock = jest.fn().mockReturnThis()
    const singleMock = jest
      .fn()
      .mockResolvedValue({ data: mockUserData, error: null })

    mockSupabase.from = jest.fn().mockReturnValue({
      select: selectMock,
      eq: eqMock,
      single: singleMock,
    })

    const result = await isLimitAi(mockTelegramId)

    expect(result).toBe(false)
    expect(mockSupabase.from).toHaveBeenCalledWith('users')
    expect(selectMock).toHaveBeenCalledWith('limit')
    expect(eqMock).toHaveBeenCalledWith('telegram_id', mockTelegramId)
    expect(singleMock).toHaveBeenCalledTimes(1)
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Лимит НЕ превышен',
        telegramId: mockTelegramId,
        userLimit: mockLimit,
      })
    )
  })

  it('should return true and log if user limit is 0', async () => {
    const mockTelegramId = 'user-limit-zero'
    const mockUserData = {
      limit: 0,
      id: 'user2',
      // other fields...
    }

    // Mock Supabase calls
    const selectMock = jest.fn().mockReturnThis()
    const eqMock = jest.fn().mockReturnThis()
    const singleMock = jest
      .fn()
      .mockResolvedValue({ data: mockUserData, error: null })

    mockSupabase.from = jest.fn().mockReturnValue({
      select: selectMock,
      eq: eqMock,
      single: singleMock,
    })

    const result = await isLimitAi(mockTelegramId)

    expect(result).toBe(true)
    expect(mockSupabase.from).toHaveBeenCalledWith('users')
    expect(selectMock).toHaveBeenCalledWith('limit')
    expect(eqMock).toHaveBeenCalledWith('telegram_id', mockTelegramId)
    expect(singleMock).toHaveBeenCalledTimes(1)
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Лимит превышен',
        telegramId: mockTelegramId,
        userLimit: 0,
      })
    )
  })

  it('should return true and log if user limit is negative', async () => {
    const mockTelegramId = 'user-limit-negative'
    const mockUserData = {
      limit: -1,
      id: 'user3',
      // other fields...
    }

    // Mock Supabase calls
    const selectMock = jest.fn().mockReturnThis()
    const eqMock = jest.fn().mockReturnThis()
    const singleMock = jest
      .fn()
      .mockResolvedValue({ data: mockUserData, error: null })

    mockSupabase.from = jest.fn().mockReturnValue({
      select: selectMock,
      eq: eqMock,
      single: singleMock,
    })

    const result = await isLimitAi(mockTelegramId)

    expect(result).toBe(true)
    expect(mockSupabase.from).toHaveBeenCalledWith('users')
    expect(selectMock).toHaveBeenCalledWith('limit')
    expect(eqMock).toHaveBeenCalledWith('telegram_id', mockTelegramId)
    expect(singleMock).toHaveBeenCalledTimes(1)
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Лимит превышен',
        telegramId: mockTelegramId,
        userLimit: -1,
      })
    )
  })

  it('should return true and log error if user is not found', async () => {
    const mockTelegramId = 'user-not-found'

    // Mock Supabase calls
    const selectMock = jest.fn().mockReturnThis()
    const eqMock = jest.fn().mockReturnThis()
    const singleMock = jest.fn().mockResolvedValue({ data: null, error: null })

    mockSupabase.from = jest.fn().mockReturnValue({
      select: selectMock,
      eq: eqMock,
      single: singleMock,
    })

    const result = await isLimitAi(mockTelegramId)

    expect(result).toBe(true)
    expect(mockSupabase.from).toHaveBeenCalledWith('users')
    expect(selectMock).toHaveBeenCalledWith('limit')
    expect(eqMock).toHaveBeenCalledWith('telegram_id', mockTelegramId)
    expect(singleMock).toHaveBeenCalledTimes(1)
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Пользователь не найден в БД',
        telegramId: mockTelegramId,
      })
    )
  })

  it('should return true and log error if Supabase query fails', async () => {
    const mockTelegramId = 'user-query-fail'
    const mockError = new Error('DB query failed')

    // Mock Supabase calls
    const selectMock = jest.fn().mockReturnThis()
    const eqMock = jest.fn().mockReturnThis()
    const singleMock = jest.fn().mockResolvedValue({ data: null, error: mockError })

    mockSupabase.from = jest.fn().mockReturnValue({
      select: selectMock,
      eq: eqMock,
      single: singleMock,
    })

    const result = await isLimitAi(mockTelegramId)

    expect(result).toBe(true)
    expect(mockSupabase.from).toHaveBeenCalledWith('users')
    expect(selectMock).toHaveBeenCalledWith('limit')
    expect(eqMock).toHaveBeenCalledWith('telegram_id', mockTelegramId)
    expect(singleMock).toHaveBeenCalledTimes(1)
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Ошибка при проверке лимита AI',
        telegramId: mockTelegramId,
        error: mockError.message,
      })
    )
  })
})
