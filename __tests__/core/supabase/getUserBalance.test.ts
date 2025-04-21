// Указываем путь к файлу для теста

// Добавляем beforeEach в импорт Jest
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { supabase } from '@/core/supabase/client'
import { getUserBalance } from '@/core/supabase/getUserBalance'

// Мокаем Supabase клиент
jest.mock('@/core/supabase/client', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          // Мокаем single, чтобы он возвращал Promise
          single: jest.fn<() => Promise<{ data: any; error: any }>>(),
        })),
      })),
    })),
  },
}))

describe('getUserBalance', () => {
  const mockedFrom = supabase.from as jest.Mock
  // Мокаем возвращаемые значения методов
  const mockEqReturn = { single: jest.fn<() => Promise<{ data: any; error: any }>>() }
  const mockSelectReturn = { eq: jest.fn().mockReturnValue(mockEqReturn) }
  const mockFromReturn = { select: jest.fn().mockReturnValue(mockSelectReturn) }

  beforeEach(() => {
    // Сбрасываем моки
    mockedFrom.mockClear()
    mockFromReturn.select.mockClear()
    mockSelectReturn.eq.mockClear()
    mockEqReturn.single.mockClear()

    // Настраиваем цепочку вызовов
    mockedFrom.mockReturnValue(mockFromReturn)
  })

  it('should return balance for existing user', async () => {
    // Теперь передаем объект напрямую, так как single ожидает Promise
    mockEqReturn.single.mockResolvedValue({ data: { balance: 100 }, error: null })

    const balance = await getUserBalance('99')
    expect(balance).toBe(100)
    expect(mockedFrom).toHaveBeenCalledWith('users')
    // Используем as any для обхода ошибки типа
    expect((mockedFrom('users') as any).select).toHaveBeenCalledWith('balance') 
    expect(mockSelectReturn.eq).toHaveBeenCalledWith('telegram_id', '99')
    expect(mockEqReturn.single).toHaveBeenCalled()
  })

  it('should return 0 if user has no balance field (or null)', async () => {
    mockEqReturn.single.mockResolvedValue({ data: { balance: null }, error: null })

    const balance = await getUserBalance('55')
    expect(balance).toBe(0)
    expect(mockSelectReturn.eq).toHaveBeenCalledWith('telegram_id', '55')
  })

  it('should throw error if user not found', async () => {
    mockEqReturn.single.mockResolvedValue({ data: null, error: null })

    await expect(getUserBalance('1')).rejects.toThrow('Пользователь не найден')
    expect(mockSelectReturn.eq).toHaveBeenCalledWith('telegram_id', '1')
  })

  it('should throw error if supabase query fails', async () => {
    const error = new Error('Supabase error')
    mockEqReturn.single.mockResolvedValue({ data: null, error })

    await expect(getUserBalance('2')).rejects.toThrow('Не удалось получить баланс пользователя: Supabase error')
    expect(mockSelectReturn.eq).toHaveBeenCalledWith('telegram_id', '2')
  })
})