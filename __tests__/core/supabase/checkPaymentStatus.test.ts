describe('checkPaymentStatus', () => {
  let mockSinglePayments: jest.Mock
  let mockLimitPayments: jest.Mock
  let mockOrderPayments: jest.Mock
  let mockEqPayments: jest.Mock
  let mockSelectPayments: jest.Mock
  let mockFromPayments: jest.Mock

  let mockEqUsers: jest.Mock
  let mockUpdateUsers: jest.Mock
  let mockFromUsers: jest.Mock

  let checkPaymentStatus: any
  let ctx: any

  beforeEach(() => {
    // Reset modules and mocks
    jest.resetModules()
    process.env.NODE_ENV = 'production'

    // Mock supabase payments chain
    mockSinglePayments = jest.fn()
    mockLimitPayments = jest.fn(() => ({ single: mockSinglePayments }))
    mockOrderPayments = jest.fn(() => ({ limit: mockLimitPayments }))
    mockEqPayments = jest.fn(() => ({ order: mockOrderPayments }))
    mockSelectPayments = jest.fn(() => ({ eq: mockEqPayments }))
    mockFromPayments = jest.fn((table: string) => ({
      select: mockSelectPayments,
    }))

    // Mock supabase users update chain
    mockEqUsers = jest.fn().mockResolvedValue({ error: null })
    mockUpdateUsers = jest.fn(() => ({ eq: mockEqUsers }))
    mockFromUsers = jest.fn((table: string) => ({ update: mockUpdateUsers }))

    // Provide supabase mock
    jest.doMock('@/core/supabase', () => ({
      supabase: {
        from: (table: string) =>
          table === 'payments' ? mockFromPayments(table) : mockFromUsers(table),
      },
    }))

    // Mock checkFullAccess and isRussian
    const mockCheckFullAccess = jest.fn().mockReturnValue(true)
    jest.doMock('@/handlers/checkFullAccess', () => ({
      checkFullAccess: mockCheckFullAccess,
    }))
    const mockIsRussian = jest.fn().mockReturnValue(true)
    jest.doMock('@/helpers/language', () => ({ isRussian: mockIsRussian }))

    // Prepare a mock context
    ctx = { from: { id: 42 }, reply: jest.fn() }
    // Suppress console output
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})

    // Import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    checkPaymentStatus =
      require('@/core/supabase/checkPaymentStatus').checkPaymentStatus
  })

  afterEach(() => {
    // Restore console and other mocks
    jest.restoreAllMocks()
  })

  it('returns false if ctx or ctx.from.id is missing', async () => {
    const result = await checkPaymentStatus({}, 'basic')
    expect(result).toBe(false)
  })

  it('returns false when payment query errors', async () => {
    mockSinglePayments.mockResolvedValueOnce({
      data: null,
      error: new Error('fail'),
    })
    const result = await checkPaymentStatus(ctx, 'basic')
    expect(mockFromPayments).toHaveBeenCalledWith('payments')
    expect(result).toBe(false)
  })

  it('returns true and updates subscription when last payment older than 30 days', async () => {
    // Older than 30 days
    const oldDate = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString()
    mockSinglePayments.mockResolvedValueOnce({
      data: { payment_date: oldDate },
      error: null,
    })
    const result = await checkPaymentStatus(ctx, 'basic')
    expect(result).toBe(true)
    expect(mockFromUsers).toHaveBeenCalledWith('users')
    expect(mockUpdateUsers).toHaveBeenCalledWith({ subscription: 'stars' })
    expect(mockEqUsers).toHaveBeenCalledWith('telegram_id', '42')
  })

  it('returns false and replies when last payment within 30 days and full access', async () => {
    // Recent payment
    const recentDate = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString()
    mockSinglePayments.mockResolvedValueOnce({
      data: { payment_date: recentDate },
      error: null,
    })
    // Force non-dev to send reply
    process.env.NODE_ENV = 'production'
    const result = await checkPaymentStatus(ctx, 'basic')
    expect(result).toBe(false)
    expect(ctx.reply).toHaveBeenCalled()
  })

  it('replies English message when subscription expired and not Russian', async () => {
    // Recent payment
    const recentDate = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString()
    mockSinglePayments.mockResolvedValueOnce({
      data: { payment_date: recentDate },
      error: null,
    })
    // full access true and not Russian
    const cf = jest.requireMock('@/handlers/checkFullAccess').checkFullAccess
    cf.mockReturnValue(true)
    const isRu = jest.requireMock('@/helpers/language').isRussian
    isRu.mockReturnValue(false)
    process.env.NODE_ENV = 'production'
    await checkPaymentStatus(ctx, 'basic')
    expect(ctx.reply).toHaveBeenCalledWith(
      '🤑Your subscription has expired. Please update your subscription to continue using the service.'
    )
  })

  it('returns true and updates when recent payment but no full access', async () => {
    // Recent payment
    const recentDate = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString()
    mockSinglePayments.mockResolvedValueOnce({
      data: { payment_date: recentDate },
      error: null,
    })
    // Override full access to false
    const cf = jest.requireMock('@/handlers/checkFullAccess').checkFullAccess
    cf.mockReturnValue(false)
    const result = await checkPaymentStatus(ctx, 'basic')
    expect(result).toBe(true)
    expect(mockFromUsers).toHaveBeenCalledWith('users')
    expect(mockUpdateUsers).toHaveBeenCalledWith({ subscription: 'stars' })
  })

  it('returns false without reply when in development environment', async () => {
    // Recent payment
    const recentDate = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
    mockSinglePayments.mockResolvedValueOnce({
      data: { payment_date: recentDate },
      error: null,
    })
    // full access true
    const cf2 = jest.requireMock('@/handlers/checkFullAccess').checkFullAccess
    cf2.mockReturnValue(true)
    // Simulate development
    process.env.NODE_ENV = 'development'
    const result = await checkPaymentStatus(ctx, 'basic')
    expect(result).toBe(false)
    // Reply should NOT be called in dev
    expect(ctx.reply).not.toHaveBeenCalled()
  })

  it('does not reply when subscription is neurotester', async () => {
    // Recent payment
    const recentDate = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()
    mockSinglePayments.mockResolvedValueOnce({
      data: { payment_date: recentDate },
      error: null,
    })
    // full access true
    const cf3 = jest.requireMock('@/handlers/checkFullAccess').checkFullAccess
    cf3.mockReturnValue(true)
    // production env
    process.env.NODE_ENV = 'production'
    const result = await checkPaymentStatus(ctx, 'neurotester')
    expect(result).toBe(false)
    // Should not reply for 'neurotester'
    expect(ctx.reply).not.toHaveBeenCalled()
  })

  it('logs error and returns true when updateError present', async () => {
    // Old payment triggers update path
    const oldDate = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString()
    mockSinglePayments.mockResolvedValueOnce({
      data: { payment_date: oldDate },
      error: null,
    })
    // Simulate update returning an error
    mockEqUsers.mockResolvedValueOnce({ error: new Error('update fail') })
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const result = await checkPaymentStatus(ctx, 'basic')
    expect(result).toBe(true)
    expect(errorSpy).toHaveBeenCalledWith(
      'Ошибка при обновлении уровня подписки:',
      expect.any(Error)
    )
    errorSpy.mockRestore()
  })

  it('logs error and returns false when update throws exception', async () => {
    // Old payment triggers update
    const oldDate = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString()
    mockSinglePayments.mockResolvedValueOnce({
      data: { payment_date: oldDate },
      error: null,
    })
    // Simulate update throwing error
    mockUpdateUsers.mockImplementationOnce(() => {
      throw new Error('upd fail')
    })
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const result = await checkPaymentStatus(ctx, 'basic')
    expect(result).toBe(false)
    expect(errorSpy).toHaveBeenCalledWith(
      'Ошибка при проверке статуса оплаты:',
      expect.any(Error)
    )
    errorSpy.mockRestore()
  })
})
