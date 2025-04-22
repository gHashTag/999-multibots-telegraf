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
import { createMockSupabaseClient } from '@/utils/testUtils'
import { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/utils/logger'

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
  let mockSupabase: SupabaseClient
  let loggerSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    mockSupabase = createMockSupabaseClient() as unknown as SupabaseClient
    ;(supabase as any) = mockSupabase // Assign mock
    loggerSpy = jest.spyOn(logger, 'info').mockImplementation(() => {})
    jest.spyOn(logger, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    loggerSpy.mockRestore()
    jest.restoreAllMocks() // Restore all mocks
  })

  it('should insert payment info and log success', async () => {
    const paymentInfo: Payments = {
      telegram_id: 12345,
      user_id: 'user-abc',
      amount: 100,
      currency: 'RUB',
      payment_provider: 'Robokassa',
      status: 'pending',
      // invoice_id and created_at are usually set by DB
    }

    const mockInsert = jest.fn().mockReturnThis()
    const mockSelect = jest
      .fn()
      .mockResolvedValue({ data: [{ id: 1 }], error: null })

    mockSupabase.from = jest.fn().mockReturnValue({
      insert: mockInsert,
      select: mockSelect,
    })

    await sendPaymentInfo(paymentInfo)

    expect(mockSupabase.from).toHaveBeenCalledWith('payments')
    expect(mockInsert).toHaveBeenCalledWith([paymentInfo])
    expect(mockSelect).toHaveBeenCalledWith('id') // Assuming we select id after insert
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '✅ Информация о платеже успешно отправлена в Supabase',
        paymentId: 1,
        telegramId: paymentInfo.telegram_id,
        userId: paymentInfo.user_id,
      })
    )
  })

  it('should log error if insert fails', async () => {
    const paymentInfo: Payments = {
      telegram_id: 67890,
      user_id: 'user-def',
      amount: 50,
      currency: 'USD',
      payment_provider: 'Stripe',
      status: 'initiated',
    }
    const mockError = new Error('Insert failed')

    const mockInsert = jest
      .fn()
      .mockResolvedValue({ error: mockError, data: null })

    mockSupabase.from = jest.fn().mockReturnValue({
      insert: mockInsert,
    })

    await sendPaymentInfo(paymentInfo)

    expect(mockSupabase.from).toHaveBeenCalledWith('payments')
    expect(mockInsert).toHaveBeenCalledWith([paymentInfo])
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(
        '❌ Ошибка при отправке информации о платеже в Supabase'
      ),
      expect.objectContaining({ error: mockError })
    )
  })

  it('should handle potential errors during the process', async () => {
    const paymentInfo: Payments = {
      telegram_id: 11223,
      user_id: 'user-ghi',
      amount: 200,
      currency: 'EUR',
      payment_provider: 'PayPal',
      status: 'new',
    }
    const mockError = new Error('Something went wrong')

    // Make from() throw an error
    mockSupabase.from = jest.fn().mockImplementation(() => {
      throw mockError
    })

    await sendPaymentInfo(paymentInfo)

    expect(mockSupabase.from).toHaveBeenCalledWith('payments')
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('❌ Непредвиденная ошибка в sendPaymentInfo'),
      expect.objectContaining({ error: mockError })
    )
  })
})
