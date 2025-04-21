// Mock supabase client
jest.mock('@/core/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
  createBotByName: jest.fn(),
}))
import { supabase } from '@/core/supabase'
import { createBotByName } from '@/core/bot'
import { sendPaymentInfo } from '@/core/supabase/sendPaymentInfo'

jest.mock('@/core/bot', () => ({
  createBotByName: jest.fn(),
}))

jest.mock('@/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
  },
}))

describe('sendPaymentInfo', () => {
  const invId = '12345'
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('returns false when no payment data found', async () => {
    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'not found' } })
    const mockEq = jest.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: mockSelect })

    const result = await sendPaymentInfo(invId)

    expect(supabase.from).toHaveBeenCalledWith('payments_v2')
    expect(mockSelect).toHaveBeenCalledWith('*')
    expect(mockEq).toHaveBeenCalledWith('inv_id', invId)
    expect(result).toBe(false)
  })

  it('returns false when bot creation fails', async () => {
    const paymentData = {
      bot_name: 'testbot',
      amount: 100,
      telegram_id: '42',
      currency: 'USD',
      username: 'user123',
      stars: 50,
    }

    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: paymentData, error: null })
    const mockEq = jest.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: mockSelect })
    ;(createBotByName as jest.Mock).mockResolvedValue(null)

    const result = await sendPaymentInfo(invId)

    expect(createBotByName).toHaveBeenCalledWith('testbot')
    expect(result).toBe(false)
  })

  it('sends notification and returns true when successful', async () => {
    const paymentData = {
      bot_name: 'testbot',
      amount: 100,
      telegram_id: '42',
      currency: 'USD',
      username: 'user123',
      stars: 50,
    }

    const botData = {
      bot: {
        telegram: {
          sendMessage: jest.fn().mockResolvedValue(true),
        },
      },
      groupId: 'group123',
    }

    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: paymentData, error: null })
    const mockEq = jest.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: mockSelect })
    ;(createBotByName as jest.Mock).mockResolvedValue(botData)

    const result = await sendPaymentInfo(invId)

    expect(botData.bot.telegram.sendMessage).toHaveBeenCalledWith(
      'group123',
      expect.stringContaining('Новый платеж!')
    )
    expect(result).toBe(true)
  })
})
