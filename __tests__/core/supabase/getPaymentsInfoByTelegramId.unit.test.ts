import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals'

// Mock supabase client
const mockOrder = jest.fn<() => Promise<{ data: any[] | null; error: any }>>()
const mockEq = jest.fn(() => ({ order: mockOrder }))
const mockSelect = jest.fn(() => ({ eq: mockEq }))
const mockFrom = jest.fn(() => ({ select: mockSelect }))
jest.mock('@/core/supabase', () => ({
  supabase: { from: mockFrom },
}))

import { getPaymentsInfoByTelegramId } from '@/core/supabase/getPaymentsInfoByTelegramId'

describe('getPaymentsInfoByTelegramId', () => {
  const telegramId = 'user123'
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    mockFrom.mockClear()
    mockSelect.mockClear()
    mockEq.mockClear()
    mockOrder.mockClear()
    consoleError.mockClear()
  })

  afterAll(() => {
    consoleError.mockRestore()
  })

  it('returns empty array on error', async () => {
    const error = new Error('DB error')
    mockOrder.mockResolvedValueOnce({ data: null, error })
    const result = await getPaymentsInfoByTelegramId(telegramId)
    expect(result).toEqual([])
    expect(consoleError).toHaveBeenCalledWith(
      'Ошибка при получении информации о платежах пользователя:',
      error
    )
    expect(mockFrom).toHaveBeenCalledWith('payments_v2')
    expect(mockSelect).toHaveBeenCalledWith('id, amount, date')
    expect(mockEq).toHaveBeenCalledWith('telegram_id', telegramId)
    expect(mockOrder).toHaveBeenCalledWith('date', { ascending: false })
  })

  it('returns payments data when present', async () => {
    const payments = [{ id: '1', amount: 100, date: '2023-01-01' }]
    mockOrder.mockResolvedValueOnce({ data: payments, error: null })
    const result = await getPaymentsInfoByTelegramId(telegramId)
    expect(result).toEqual(payments)
    expect(consoleError).not.toHaveBeenCalled()
    expect(mockFrom).toHaveBeenCalledWith('payments_v2')
    expect(mockSelect).toHaveBeenCalledWith('id, amount, date')
    expect(mockEq).toHaveBeenCalledWith('telegram_id', telegramId)
    expect(mockOrder).toHaveBeenCalledWith('date', { ascending: false })
  })

  it('returns empty array when no payments found', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: null })
    const result = await getPaymentsInfoByTelegramId(telegramId)
    expect(result).toEqual([])
    expect(consoleError).not.toHaveBeenCalled()
  })
})
