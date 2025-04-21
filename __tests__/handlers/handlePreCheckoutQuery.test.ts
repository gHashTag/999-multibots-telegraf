import { handlePreCheckoutQuery } from '@/handlers/paymentHandlers/handlePreCheckoutQuery'
import { handlePreCheckoutQuery } from '@/handlers/handleSuccessfulPayment'
import { makeMockContext } from '@/utils/mockContext'
import { logger } from '@/utils/logger'

describe('handlePreCheckoutQuery', () => {
  let mockCtx: MyContext

  beforeEach(() => {
    jest.clearAllMocks()
    mockCtx = makeMockContext() as MyContext
    // Explicitly type the pre_checkout_query
    mockCtx.preCheckoutQuery = {
      id: 'query-123',
      from: {
        id: 12345,
        is_bot: false,
        first_name: 'Test',
        username: 'testuser',
        language_code: 'en',
      },
      currency: 'USD',
      total_amount: 1000, // Example amount (in smallest unit, e.g., cents)
      invoice_payload: 'payload-abc',
    }
  })

  it('should answer pre-checkout query successfully', async () => {
    await handlePreCheckoutQuery(mockCtx)

    expect(mockCtx.answerPreCheckoutQuery).toHaveBeenCalledWith(true)
    expect(mockCtx.answerPreCheckoutQuery).toHaveBeenCalledTimes(1)
  })

  it('should handle potential errors during answering', async () => {
    const mockError = new Error('Failed to answer query')
    mockCtx.answerPreCheckoutQuery = jest.fn().mockRejectedValue(mockError)
    const loggerSpy = jest.spyOn(logger, 'error').mockImplementation(() => {})

    await handlePreCheckoutQuery(mockCtx)

    expect(mockCtx.answerPreCheckoutQuery).toHaveBeenCalledWith(true)
    expect(logger.error).toHaveBeenCalledWith(
      'Error answering pre-checkout query:',
      mockError
    )

    loggerSpy.mockRestore()
  })

  it('should handle cases where preCheckoutQuery is missing (though unlikely)', async () => {
    // Remove the preCheckoutQuery for this test case
    delete mockCtx.preCheckoutQuery
    const loggerSpy = jest.spyOn(logger, 'error').mockImplementation(() => {})

    await handlePreCheckoutQuery(mockCtx)

    // answerPreCheckoutQuery should not have been called
    expect(mockCtx.answerPreCheckoutQuery).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(
      'handlePreCheckoutQuery called without preCheckoutQuery in context'
    )

    loggerSpy.mockRestore()
  })
})
