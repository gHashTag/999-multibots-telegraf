
describe('updateUserBalance', () => {
  let mockEq: jest.Mock
  let mockUpdate: jest.Mock
  let mockFrom: jest.Mock
  let updateUserBalance: (telegram_id: number, newBalance: number) => Promise<void>

  beforeEach(() => {
    jest.resetModules()
    // Mock supabase client
    mockEq = jest.fn()
    mockUpdate = jest.fn(() => ({ eq: mockEq }))
    mockFrom = jest.fn(() => ({ update: mockUpdate }))
    jest.doMock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))
    // Suppress console.error
    jest.spyOn(console, 'error').mockImplementation(() => {})
    // Import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    updateUserBalance = require('@/core/supabase/updateUserBalance').updateUserBalance
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('resolves when update succeeds', async () => {
    // Simulate no error
    mockEq.mockResolvedValueOnce({ error: null })
    await expect(updateUserBalance(42, 150)).resolves.toBeUndefined()
    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(mockUpdate).toHaveBeenCalledWith({ balance: 150 })
    expect(mockEq).toHaveBeenCalledWith('telegram_id', '42')
  })

  it('throws and logs error when update fails', async () => {
    const err = new Error('update fail')
    mockEq.mockResolvedValueOnce({ error: err })
    await expect(updateUserBalance(7, 200)).rejects.toThrow('Не удалось обновить баланс пользователя')
    expect(console.error).toHaveBeenCalledWith('Ошибка при обновлении баланса:', err)
  })
})