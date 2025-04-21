import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Мокаем полную цепочку вызовов supabase
const mockMaybeSingle = jest.fn<() => Promise<{ data: any; error: any }>>()
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }))
const mockSelect = jest.fn(() => ({ eq: mockEq }))
jest.mock('@/core/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({ select: mockSelect })),
  },
}))

import { supabase } from '@/core/supabase'
import { getUserData } from '@/core/supabase/getUserData'

describe('getUserData', () => {
  const telegram_id = '123'
  beforeEach(() => {
    mockMaybeSingle.mockReset()
    mockEq.mockClear()
    mockSelect.mockClear()
    ;(supabase.from as jest.Mock).mockClear()
  })

  it('throws error on supabase error', async () => {
    // Мокаем ошибку
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'err' } })
    await expect(getUserData(telegram_id)).rejects.toThrow(
      'Ошибка при получении данных пользователя: [object Object]'
    )
    // Проверяем вызовы
    expect(supabase.from).toHaveBeenCalledWith('users')
    expect(mockSelect).toHaveBeenCalledWith(
      'username, first_name, last_name, company, position, designation, language_code'
    )
    expect(mockEq).toHaveBeenCalledWith('telegram_id', telegram_id.toString())
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1)
  })

  it('returns data when successful', async () => {
    const userData = { username: 'test', first_name: 'fn' }
    // Мокаем успех
    mockMaybeSingle.mockResolvedValue({ data: userData, error: null })
    const result = await getUserData(telegram_id)
    expect(result).toEqual(userData)
    expect(supabase.from).toHaveBeenCalledWith('users')
    expect(mockSelect).toHaveBeenCalledWith(
      'username, first_name, last_name, company, position, designation, language_code'
    )
    expect(mockEq).toHaveBeenCalledWith('telegram_id', telegram_id.toString())
  })

  // Добавляем тест на случай, когда пользователь не найден (data: null, error: null)
  it('returns null when user not found', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
    const result = await getUserData(telegram_id)
    expect(result).toBeNull()
    expect(supabase.from).toHaveBeenCalledWith('users')
    expect(mockSelect).toHaveBeenCalledWith(
      'username, first_name, last_name, company, position, designation, language_code'
    )
    expect(mockEq).toHaveBeenCalledWith('telegram_id', telegram_id.toString())
  })
})
