// Mock supabase client
jest.mock('@/core/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
  createBotByName: jest.fn(),
}))

import * as supabaseModule from '@/core/supabase'
import { createBotByName } from '@/core/bot'
import { sendPaymentInfo } from '@/core/supabase/sendPaymentInfo'
import { logger } from '@/utils/logger'
import { PaymentType, PaymentStatus } from '@/interfaces/payments.interface'
import { ModeEnum } from '@/interfaces/modes'

jest.mock('@/core/bot', () => ({
  createBotByName: jest.fn(),
}))

jest.mock('@/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
  },
}))

// Define the Payment interface for testing to match the actual function implementation
interface PaymentData {
  id: number
  telegram_id: number | string
  user_id: string
  amount: number
  currency: string
  payment_provider: string
  status: string
  username?: string
  stars?: number
  bot_name: string
  inv_id: string
  type?: PaymentType
  description?: string
  service_type?: ModeEnum
}

describe('sendPaymentInfo', () => {
  const supabaseMock = supabaseModule.supabase as jest.Mocked<
    typeof supabaseModule.supabase
  >
  const loggerInfoSpy = jest.spyOn(logger, 'info')
  const loggerErrorSpy = jest.spyOn(logger, 'error')
  const botMock = { telegram: { sendMessage: jest.fn() } }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(createBotByName as jest.Mock).mockResolvedValue({
      bot: botMock,
      groupId: 'group123',
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should fetch payment info and send notification on success', async () => {
    const invId = 'payment123'
    const paymentData: PaymentData = {
      id: 1,
      inv_id: invId,
      telegram_id: 12345,
      user_id: 'user-abc',
      amount: 100,
      currency: 'RUB',
      payment_provider: 'Robokassa',
      status: PaymentStatus.PENDING,
      bot_name: 'test_bot',
      username: 'testuser',
      stars: 50,
    }

    // Mock the supabase from chain for select
    const mockEq = jest.fn().mockReturnThis()
    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: paymentData, error: null })
    const mockSelect = jest.fn().mockReturnThis()

    supabaseMock.from.mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      single: mockSingle,
    } as any)

    await sendPaymentInfo(invId)

    expect(supabaseMock.from).toHaveBeenCalledWith('payments_v2')
    expect(mockSelect).toHaveBeenCalledWith('*')
    expect(mockEq).toHaveBeenCalledWith('inv_id', invId)
    expect(createBotByName).toHaveBeenCalledWith('test_bot')
    expect(botMock.telegram.sendMessage).toHaveBeenCalledWith(
      'group123',
      expect.stringContaining('Новый платеж!')
    )

    // Проверяем первый вызов info логгера для получения информации о платеже
    expect(loggerInfoSpy).toHaveBeenNthCalledWith(
      1,
      '✅ Информация о платеже получена:',
      expect.objectContaining({
        description: 'Payment info fetched successfully',
        invId,
        paymentData,
      })
    )

    // Проверяем второй вызов info логгера для отправки уведомления
    expect(loggerInfoSpy).toHaveBeenNthCalledWith(
      2,
      '✅ Уведомление об оплате отправлено в группу:',
      expect.objectContaining({
        description: 'Payment notification sent to group',
        groupId: 'group123',
        invId,
      })
    )
  })

  it('should log error if payment info not found', async () => {
    const invId = 'nonexistent'

    // Mock the supabase from chain for failed select
    const mockEq = jest.fn().mockReturnThis()
    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'Not found' } })
    const mockSelect = jest.fn().mockReturnThis()

    supabaseMock.from.mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      single: mockSingle,
    } as any)

    const result = await sendPaymentInfo(invId)

    expect(result).toBe(false)
    expect(supabaseMock.from).toHaveBeenCalledWith('payments_v2')
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      '❌ Ошибка при получении информации о платеже:',
      expect.objectContaining({
        invId,
        error: 'Not found',
      })
    )
    expect(createBotByName).not.toHaveBeenCalled()
  })

  it('should handle unexpected errors during the process', async () => {
    const invId = 'error-trigger'
    const mockError = new Error('Something went wrong')

    // Make from() throw an error
    supabaseMock.from.mockImplementation(() => {
      throw mockError
    })

    const result = await sendPaymentInfo(invId)

    expect(result).toBe(false)
    expect(supabaseMock.from).toHaveBeenCalledWith('payments_v2')
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      '❌ Неожиданная ошибка в sendPaymentInfo:',
      expect.objectContaining({
        invId,
        error: 'Something went wrong',
      })
    )
  })
})
