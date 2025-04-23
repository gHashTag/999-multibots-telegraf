// Указываем путь к файлу для теста

import { supabase } from '@/core/supabase/client'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { describe, expect, it, jest, beforeEach } from '@jest/globals'

// Мокаем Supabase клиент и конкретно метод rpc
jest.mock('@/core/supabase/client', () => ({
  supabase: {
    // Создаем мок rpc сразу как jest.fn()
    // Уточняем сигнатуру: принимает funcName и args
    rpc: jest.fn<
      (funcName: string, args: any) => Promise<{ data: any; error: any }>
    >(),
    // Оставляем from на случай, если другие тесты его используют, но основной мок - rpc
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(),
        })),
      })),
    })),
  },
}))

describe('getUserBalance Unit Tests', () => {
  // Используем jest.MockedFunction для более строгой типизации
  const mockedRpc = supabase.rpc as jest.MockedFunction<typeof supabase.rpc>

  beforeEach(() => {
    jest.clearAllMocks()
    // Сбрасываем мок rpc перед каждым тестом
    mockedRpc.mockClear()
  })

  // --- Тесты, адаптированные под rpc ---

  it('should return 0 if user not found (simulated via rpc returning error)', async () => {
    // get_user_balance вернет ошибку или null, если пользователь не найден.
    // Для теста симулируем ошибку, как будто rpc вернул её.
    const rpcError = {
      message: 'User balance function error',
      code: 'FUNC404',
      details: '',
      hint: '',
      name: 'MockRPCError',
    }
    mockedRpc.mockResolvedValue({
      data: null,
      error: rpcError,
      count: null,
      status: 500,
      statusText: 'Internal Server Error',
    })

    const result = await getUserBalance('123')
    expect(result).toBe(0)
    expect(mockedRpc).toHaveBeenCalledWith('get_user_balance', {
      user_telegram_id: '123',
    })
  })

  it('should return 0 for other Supabase RPC errors', async () => {
    const error = {
      message: 'Generic DB error',
      code: 'XXXXX',
      details: '',
      hint: '',
      name: 'MockGenericError',
    }
    // Симулируем, что rpc вернул ошибку
    mockedRpc.mockResolvedValue({
      data: null,
      error,
      count: null,
      status: 500,
      statusText: 'Internal Server Error',
    })

    const result = await getUserBalance('456')
    expect(result).toBe(0)
    expect(mockedRpc).toHaveBeenCalledWith('get_user_balance', {
      user_telegram_id: '456',
    })
  })

  it('should return balance when user exists and balance is number', async () => {
    // Симулируем успешный ответ от rpc
    mockedRpc.mockResolvedValue({
      data: 500,
      error: null,
      count: 1,
      status: 200,
      statusText: 'OK',
    }) // data - это сам баланс

    const result = await getUserBalance('789')
    expect(result).toBe(500)
    expect(mockedRpc).toHaveBeenCalledWith('get_user_balance', {
      user_telegram_id: '789',
    })
  })

  it('should return 0 when user exists but balance is null/undefined from rpc', async () => {
    // Симулируем ответ, где data = null
    mockedRpc.mockResolvedValue({
      data: null,
      error: null,
      count: 1,
      status: 200,
      statusText: 'OK',
    })

    const result = await getUserBalance('101')
    expect(result).toBe(0) // Функция должна вернуть 0, если data is null
    expect(mockedRpc).toHaveBeenCalledWith('get_user_balance', {
      user_telegram_id: '101',
    })
  })

  it('should return 0 when user exists but balance is 0 from rpc', async () => {
    // Симулируем ответ, где data = 0
    mockedRpc.mockResolvedValue({
      data: 0,
      error: null,
      count: 1,
      status: 200,
      statusText: 'OK',
    })

    const result = await getUserBalance('112')
    expect(result).toBe(0)
    expect(mockedRpc).toHaveBeenCalledWith('get_user_balance', {
      user_telegram_id: '112',
    })
  })

  // Убираем старые тесты, которые проверяли цепочку from/select/eq/single
  // it('should throw error if user not found (PGRST116)', async () => { ... })
  // it('should return 0 when user exists but data is null (covered by PGRST116 test)', async () => { ... })
})
