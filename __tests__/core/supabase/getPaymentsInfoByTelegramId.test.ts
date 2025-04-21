import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Mock supabase client
const mockOrder =
  jest.fn<() => Promise<{ data: Payment[] | null; error: any }>>()
const mockEq = jest.fn(() => ({ order: mockOrder }))
const mockSelect = jest.fn(() => ({ eq: mockEq }))
const mockFrom = jest.fn(() => ({ select: mockSelect }))
jest.mock('@/core/supabase', () => ({
  supabase: { from: mockFrom },
}))

import {
  getPaymentsInfoByTelegramId,
  Payment,
} from '@/core/supabase/getPaymentsInfoByTelegramId'

describe('getPaymentsInfoByTelegramId', () => {
  beforeEach(() => {
    mockFrom.mockClear()
    mockSelect.mockClear()
    mockEq.mockClear()
    mockOrder.mockClear()
  })

  it('returns payment data when query succeeds', async () => {
    const sampleData: Payment[] = [
      { id: 'p1', amount: 100, date: '2021-01-01' },
    ]
    mockOrder.mockResolvedValueOnce({ data: sampleData, error: null })
    const result = await getPaymentsInfoByTelegramId('telegram123')
    expect(mockFrom).toHaveBeenCalledWith('payments_v2')
    expect(mockSelect).toHaveBeenCalledWith('id, amount, date')
    expect(mockEq).toHaveBeenCalledWith('telegram_id', 'telegram123')
    expect(mockOrder).toHaveBeenCalledWith('date', { ascending: false })
    expect(result).toEqual(sampleData)
  })

  it('returns empty array and logs error when query fails', async () => {
    const fakeError = new Error('DB error')
    mockOrder.mockResolvedValueOnce({ data: null, error: fakeError })
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    const result = await getPaymentsInfoByTelegramId('telegram404')
    expect(result).toEqual([])
    expect(consoleError).toHaveBeenCalledWith(
      'Ошибка при получении информации о платежах пользователя:',
      fakeError
    )
    consoleError.mockRestore()
  })
})
