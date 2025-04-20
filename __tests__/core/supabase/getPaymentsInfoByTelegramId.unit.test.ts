import { jest, describe, it, expect, beforeEach } from '@jest/globals'
// Mock supabase client
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { getPaymentsInfoByTelegramId } from '@/core/supabase/getPaymentsInfoByTelegramId'

describe('getPaymentsInfoByTelegramId', () => {
  const telegram_id = '300'
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('returns empty array on error', async () => {
    const selectMock = jest.fn().mockReturnValue({ data: null, error: { message: 'err' } })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getPaymentsInfoByTelegramId(telegram_id)
    expect(result).toEqual([])
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching payments info:', { message: 'err' })
    consoleErrorSpy.mockRestore()
  })

  it('returns payments data when present', async () => {
    const paymentsData = [{ id: '1', amount: 10, date: 'd1' }]
    const selectMock = jest.fn().mockReturnValue({ data: paymentsData, error: null })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    const result = await getPaymentsInfoByTelegramId(telegram_id)
    expect(result).toBe(paymentsData)
  })
})