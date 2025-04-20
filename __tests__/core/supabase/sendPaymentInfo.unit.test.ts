
// Mock supabase client
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { sendPaymentInfo } from '@/core/supabase/sendPaymentInfo'

describe('sendPaymentInfo', () => {
  const user_id = '42'
  const level = 'gold'
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('throws error when supabase.insert returns error', async () => {
    const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'fail' } })
    const mockInsert = jest.fn().mockReturnValue({ single: mockSingle })
    ;(supabase.from as jest.Mock).mockReturnValue({ insert: mockInsert })
    await expect(sendPaymentInfo(user_id, level))
      .rejects.toThrow('Failed to send payment info: fail')
  })

  it('throws error when no data returned', async () => {
    const mockSingle = jest.fn().mockResolvedValue({ data: null, error: null })
    const mockInsert = jest.fn().mockReturnValue({ single: mockSingle })
    ;(supabase.from as jest.Mock).mockReturnValue({ insert: mockInsert })
    await expect(sendPaymentInfo(user_id, level))
      .rejects.toThrow('No data returned after inserting payment info.')
  })

  it('returns data when insert succeeds', async () => {
    const payment = { id: 1, user_id, level, created_at: '2025-04-19T00:00:00Z' }
    const mockSingle = jest.fn().mockResolvedValue({ data: payment, error: null })
    const mockInsert = jest.fn().mockReturnValue({ single: mockSingle })
    ;(supabase.from as jest.Mock).mockReturnValue({ insert: mockInsert })
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const result = await sendPaymentInfo(user_id, level)
    expect(mockInsert).toHaveBeenCalledWith([{ user_id, level }])
    expect(mockSingle).toHaveBeenCalled()
    expect(consoleLogSpy).toHaveBeenCalledWith('Payment info sent successfully:', payment)
    expect(result).toEqual(payment)
    consoleLogSpy.mockRestore()
  })
})