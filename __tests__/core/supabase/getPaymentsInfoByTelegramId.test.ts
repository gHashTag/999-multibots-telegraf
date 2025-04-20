
// Mock supabase client
const mockEq = jest.fn()
const mockSelect = jest.fn(() => ({ eq: mockEq }))
const mockFrom = jest.fn(() => ({ select: mockSelect }))
jest.mock('@/core/supabase', () => ({
  supabase: { from: mockFrom }
}))

import { getPaymentsInfoByTelegramId, Payment } from '@/core/supabase/getPaymentsInfoByTelegramId'

describe('getPaymentsInfoByTelegramId', () => {
  beforeEach(() => {
    mockFrom.mockClear()
    mockSelect.mockClear()
    mockEq.mockClear()
  })

  it('returns payment data when query succeeds', async () => {
    const sampleData: Payment[] = [
      { id: 'p1', amount: 100, date: '2021-01-01' }
    ]
    mockEq.mockResolvedValueOnce({ data: sampleData, error: null })
    const result = await getPaymentsInfoByTelegramId('telegram123')
    expect(mockFrom).toHaveBeenCalledWith('payments')
    expect(mockSelect).toHaveBeenCalledWith('*')
    expect(mockEq).toHaveBeenCalledWith('telegram_id', 'telegram123')
    expect(result).toEqual(sampleData)
  })

  it('returns empty array and logs error when query fails', async () => {
    const fakeError = new Error('DB error')
    mockEq.mockResolvedValueOnce({ data: null, error: fakeError })
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getPaymentsInfoByTelegramId('telegram404')
    expect(result).toEqual([])
    expect(consoleError).toHaveBeenCalledWith('Error fetching payments info:', fakeError)
    consoleError.mockRestore()
  })
})