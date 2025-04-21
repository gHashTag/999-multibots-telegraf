import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals'
// Используем import вместо require и типизируем telegram_id как string
import { updateUserBalance } from '@/core/supabase/updateUserBalance'

// Мокаем зависимости внутри describe или beforeEach
let mockEq: jest.Mock<() => Promise<{ data: any; error: any | null }>>
let mockUpdate: jest.Mock
let mockFrom: jest.Mock

describe('updateUserBalance', () => {
  beforeEach(() => {
    // jest.resetModules() // Не нужно при использовании import
    // Mock supabase client
    mockEq = jest.fn()
    mockUpdate = jest.fn(() => ({ eq: mockEq }))
    mockFrom = jest.fn(() => ({ update: mockUpdate }))
    // Используем jest.mock вместо jest.doMock для стандартного импорта
    jest.mock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))
    // Suppress console.error
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should update user balance and return no error on success', async () => {
    const telegram_id = '42'
    const new_balance = 100

    // Успешный ответ от Supabase
    mockEq.mockResolvedValueOnce({ data: null, error: null })

    const result = await updateUserBalance(
      telegram_id,
      new_balance,
      'money_income'
    )
    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(mockUpdate).toHaveBeenCalledWith({ balance: 100 })
    expect(mockEq).toHaveBeenCalledWith('telegram_id', '42')
  })

  it('should return an error if Supabase update fails', async () => {
    const telegram_id = '123'
    const new_balance = 50
    const expectedError = new Error('Supabase error')

    // Ответ с ошибкой от Supabase
    mockEq.mockResolvedValueOnce({ data: null, error: expectedError })

    const result = await updateUserBalance(
      telegram_id,
      new_balance,
      'money_income'
    )
    expect(console.error).toHaveBeenCalledWith(
      'Ошибка обновления баланса:',
      expect.any(Object)
    )
  })
})
