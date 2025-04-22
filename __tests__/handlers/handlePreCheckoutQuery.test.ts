import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { handlePreCheckoutQuery } from '@/handlers/paymentHandlers/handlePreCheckoutQuery'
import { makeMockContext } from '../utils/mockTelegrafContext'
import { logger } from '@/utils/logger'
import { MyContext } from '@/interfaces'

// Мокаем логгер
jest.mock('@/utils/logger')

describe('handlePreCheckoutQuery', () => {
  let mockCtx: MyContext

  beforeEach(() => {
    jest.clearAllMocks()
    // Создаем мок контекста с pre_checkout_query
    mockCtx = makeMockContext({
      pre_checkout_query: {
        id: 'pre_checkout_id_123',
        from: { id: 123, is_bot: false, first_name: 'Test' },
        currency: 'XTR',
        total_amount: 1000,
        invoice_payload: 'payload_123',
      },
    }) as MyContext

    // Мокаем метод ответа, чтобы он возвращал Promise<true>
    mockCtx.answerPreCheckoutQuery = jest.fn().mockResolvedValue(true)
  })

  it('should answer pre-checkout query successfully', async () => {
    await handlePreCheckoutQuery(mockCtx)

    expect(mockCtx.answerPreCheckoutQuery).toHaveBeenCalledWith(true)
    expect(logger.info).toHaveBeenCalledWith(
      'Успешно обработан PreCheckoutQuery:',
      'pre_checkout_id_123'
    )
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('should log error and answer false if answering pre-checkout query fails', async () => {
    const mockError = new Error('Failed to answer')
    // Мокаем ошибку при ответе
    ;(mockCtx.answerPreCheckoutQuery as jest.Mock).mockRejectedValue(mockError)

    await handlePreCheckoutQuery(mockCtx)

    // Должны попытаться ответить true сначала
    expect(mockCtx.answerPreCheckoutQuery).toHaveBeenCalledWith(true)
    // Затем должны попытаться ответить false после ошибки
    expect(mockCtx.answerPreCheckoutQuery).toHaveBeenCalledWith(false)
    expect(logger.error).toHaveBeenCalledWith(
      'Ошибка при ответе на PreCheckoutQuery:',
      mockError
    )
  })

  it('should log error if answering false also fails', async () => {
    const mockErrorTrue = new Error('Failed to answer true')
    const mockErrorFalse = new Error('Failed to answer false')
    // Мокаем ошибку при ответе true
    ;(mockCtx.answerPreCheckoutQuery as jest.Mock)
      .mockRejectedValueOnce(mockErrorTrue) // Оставляем Once для первого вызова
      .mockRejectedValue(mockErrorFalse) // Используем без Once для второго

    await handlePreCheckoutQuery(mockCtx)

    expect(mockCtx.answerPreCheckoutQuery).toHaveBeenCalledWith(true)
    expect(mockCtx.answerPreCheckoutQuery).toHaveBeenCalledWith(false)
    // Ошибка логгируется дважды
    expect(logger.error).toHaveBeenCalledWith(
      'Ошибка при ответе на PreCheckoutQuery:',
      mockErrorTrue
    )
    expect(logger.error).toHaveBeenCalledWith(
      'Критическая ошибка: не удалось ответить даже false на PreCheckoutQuery:',
      mockErrorFalse
    )
  })
})
