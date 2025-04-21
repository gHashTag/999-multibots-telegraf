import { handleSuccessfulPayment } from '@/handlers/paymentHandlers'
import { incrementBalance } from '@/core/supabase/incrementBalance'
import { setPayments } from '@/core/supabase/setPayments'
import { isRussian } from '@/helpers/language'
import { makeMockContext } from '@/utils/mockContext'
import { mockedUpdateUserBalance } from '@/core/supabase/incrementBalance'
import { logger } from '@/utils/logger'

jest.mock('@/core/supabase/incrementBalance', () => ({
  incrementBalance: jest.fn(),
  mockedUpdateUserBalance: jest.fn(),
}))
jest.mock('@/core/supabase/setPayments', () => ({ setPayments: jest.fn() }))
jest.mock('@/helpers/language', () => ({ isRussian: jest.fn() }))

describe('handleSuccessfulPayment', () => {
  let mockCtx: MyContext

  beforeEach(() => {
    jest.clearAllMocks()
    mockCtx = makeMockContext() as MyContext
    mockCtx.message = {
      ...mockCtx.message,
      successful_payment: {
        currency: 'RUB',
        total_amount: 10000, // 100 RUB
        invoice_payload: 'test-payload',
        telegram_payment_charge_id: 'charge-123',
        provider_payment_charge_id: 'provider-charge-456',
      },
    }
  })

  it('should update balance, send messages, and leave scene on successful payment', async () => {
    // Mock successful balance update
    mockedUpdateUserBalance.mockResolvedValueOnce(true)

    await handleSuccessfulPayment(mockCtx)

    // Check balance update
    expect(mockedUpdateUserBalance).toHaveBeenCalledWith(mockCtx.from?.id, 100) // Assuming 100 stars for 100 RUB
    expect(mockedUpdateUserBalance).toHaveBeenCalledTimes(1)

    // Check messages sent
    expect(mockCtx.reply).toHaveBeenCalledTimes(2)
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('🎉 Оплата прошла успешно!')
    )
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('💰 Ваш баланс пополнен на 100 звезд.')
    )

    // Check scene leave
    expect(mockCtx.scene.leave).toHaveBeenCalledTimes(1)
  })

  it('should handle failed balance update', async () => {
    // Mock failed balance update
    mockedUpdateUserBalance.mockResolvedValueOnce(false)
    const loggerSpy = jest.spyOn(logger, 'error').mockImplementation(() => {})

    await handleSuccessfulPayment(mockCtx)

    // Check balance update attempt
    expect(mockedUpdateUserBalance).toHaveBeenCalledWith(mockCtx.from?.id, 100)
    expect(mockedUpdateUserBalance).toHaveBeenCalledTimes(1)

    // Check error message sent
    expect(mockCtx.reply).toHaveBeenCalledTimes(1)
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining(
        '❌ Произошла ошибка при обновлении вашего баланса'
      )
    )

    // Check scene leave
    expect(mockCtx.scene.leave).toHaveBeenCalledTimes(1)

    // Check logger
    expect(loggerSpy).toHaveBeenCalledWith(
      'Failed to update balance after successful payment for user:',
      mockCtx.from?.id
    )
    loggerSpy.mockRestore()
  })

  it('should handle error during the process', async () => {
    const mockError = new Error('Something went wrong')
    mockedUpdateUserBalance.mockRejectedValue(mockError)
    const loggerSpy = jest.spyOn(logger, 'error').mockImplementation(() => {})

    await handleSuccessfulPayment(mockCtx)

    // Check balance update attempt
    expect(mockedUpdateUserBalance).toHaveBeenCalledTimes(1)

    // Check error message sent
    expect(mockCtx.reply).toHaveBeenCalledTimes(1)
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining(
        '❌ Произошла ошибка при обработке вашего платежа.'
      )
    )

    // Check scene leave
    expect(mockCtx.scene.leave).toHaveBeenCalledTimes(1)

    // Check logger
    expect(loggerSpy).toHaveBeenCalledWith(
      'Error handling successful payment:',
      mockError
    )
    loggerSpy.mockRestore()
  })

  it('should do nothing if successful_payment is missing', async () => {
    // Remove successful_payment for this test
    delete mockCtx.message.successful_payment

    await handleSuccessfulPayment(mockCtx)

    expect(mockedUpdateUserBalance).not.toHaveBeenCalled()
    expect(mockCtx.reply).not.toHaveBeenCalled()
    expect(mockCtx.scene.leave).not.toHaveBeenCalled()
  })
})
