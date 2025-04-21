describe('checkSubscriptionByTelegramId', () => {
  let mockSingle: jest.Mock
  let mockLimit: jest.Mock
  let mockOrder: jest.Mock
  let mockEq: jest.Mock
  let mockSelect: jest.Mock
  let mockFrom: jest.Mock
  let checkSubscriptionByTelegramId: (id: string) => Promise<string>

  beforeEach(() => {
    jest.resetModules()
    // Mock supabase.from chain
    mockSingle = jest.fn()
    mockLimit = jest.fn(() => ({ single: mockSingle }))
    mockOrder = jest.fn(() => ({ limit: mockLimit }))
    mockEq = jest.fn(() => ({ order: mockOrder }))
    mockSelect = jest.fn(() => ({ eq: mockEq }))
    mockFrom = jest.fn(() => ({ select: mockSelect }))
    jest.doMock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))
    // Suppress console.error
    jest.spyOn(console, 'error').mockImplementation(() => {})
    // Import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    checkSubscriptionByTelegramId =
      require('@/core/supabase/checkSubscriptionByTelegramId').checkSubscriptionByTelegramId
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns unsubscribed and logs error if query error', async () => {
    const err = new Error('db fail')
    mockSingle.mockResolvedValueOnce({ data: null, error: err })
    const result = await checkSubscriptionByTelegramId('42')
    expect(mockFrom).toHaveBeenCalledWith('payments')
    expect(mockSelect).toHaveBeenCalledWith('*')
    expect(mockEq).toHaveBeenCalledWith('telegram_id', '42')
    expect(console.error).toHaveBeenCalledWith(
      'Ошибка при получении информации о подписке:',
      err
    )
    expect(result).toBe('unsubscribed')
  })

  it('returns unsubscribed when no data', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: null })
    const result = await checkSubscriptionByTelegramId('100')
    expect(result).toBe('unsubscribed')
  })

  it('returns unsubscribed when last payment older than 30 days', async () => {
    const oldDate = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString()
    mockSingle.mockResolvedValueOnce({
      data: { created_at: oldDate, level: 'premium' },
      error: null,
    })
    const result = await checkSubscriptionByTelegramId('100')
    expect(result).toBe('unsubscribed')
  })

  it('returns level when last payment within 30 days', async () => {
    const recentDate = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString()
    mockSingle.mockResolvedValueOnce({
      data: { created_at: recentDate, level: 'gold' },
      error: null,
    })
    const result = await checkSubscriptionByTelegramId('200')
    expect(result).toBe('gold')
  })
})
