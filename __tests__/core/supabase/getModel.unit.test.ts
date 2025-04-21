import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Мокаем полную цепочку вызовов supabase
const mockSingle = jest.fn<() => Promise<{ data: any; error: any }>>()
const mockEq = jest.fn(() => ({ single: mockSingle }))
const mockSelect = jest.fn(() => ({ eq: mockEq }))
jest.mock('@/core/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({ select: mockSelect })),
  },
}))

import { supabase } from '@/core/supabase'
import { getModel } from '@/core/supabase/getModel'

describe('getModel', () => {
  const telegram_id = '200'
  beforeEach(() => {
    // Сбрасываем моки перед каждым тестом
    mockSingle.mockReset()
    mockEq.mockClear()
    mockSelect.mockClear()
    ;(supabase.from as jest.Mock).mockClear()
    // jest.resetModules() // Это может быть излишним и замедлять тесты
  })

  it('throws error on supabase error', async () => {
    // Мокаем ошибку на этапе single
    mockSingle.mockResolvedValue({ data: null, error: { message: 'err' } })
    // Вызываем функцию
    await expect(getModel(telegram_id)).rejects.toThrow('Error getModel: [object Object]')
    // Проверяем вызовы
    expect(supabase.from).toHaveBeenCalledWith('users')
    expect(mockSelect).toHaveBeenCalledWith('model')
    expect(mockEq).toHaveBeenCalledWith('telegram_id', telegram_id)
    expect(mockSingle).toHaveBeenCalledTimes(1)
  })

  it('throws error when data null', async () => {
    // Мокаем null данные
    mockSingle.mockResolvedValue({ data: null, error: null })
    await expect(getModel(telegram_id)).rejects.toThrow('Error getModel: null')
    expect(supabase.from).toHaveBeenCalledWith('users')
    expect(mockSelect).toHaveBeenCalledWith('model')
    expect(mockEq).toHaveBeenCalledWith('telegram_id', telegram_id)
  })

  it('returns data.model on success', async () => {
    // Мокаем успешный ответ
    mockSingle.mockResolvedValue({ data: { model: 'm1' }, error: null })
    const result = await getModel(telegram_id)
    expect(result).toBe('m1')
    expect(supabase.from).toHaveBeenCalledWith('users')
    expect(mockSelect).toHaveBeenCalledWith('model')
    expect(mockEq).toHaveBeenCalledWith('telegram_id', telegram_id)
  })
})