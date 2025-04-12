import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { processPayment, deductFunds, addFunds } from '@/helpers/paymentHelpers'
import { TransactionType } from '@/interfaces/payments.interface'
import { ModeEnum } from './price/types/modes'

// Мокаем зависимости
jest.mock('@/core/inngest', () => ({
  inngest: {
    send: jest.fn()
  }
}))

jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn()
  }
}))

// Мок для inngest
const mockInngest = {
  // @ts-ignore - игнорируем типизацию для упрощения тестов
  send: jest.fn()
}

// Переопределяем импорт для имитации inngest
jest.mock('@/core/inngest', () => ({
  inngest: mockInngest
}))

describe('Payment Helpers', () => {
  const mockTelegramId = '123456789'
  const mockAmount = 100
  const mockBotName = 'test_bot'
  const mockDescription = 'Test payment'

  beforeEach(() => {
    // Очищаем моки перед каждым тестом
    jest.clearAllMocks()
  })

  describe('processPayment', () => {
    it('должен обрабатывать успешный платеж и возвращать true', async () => {
      // Мокаем успешный ответ от inngest
      // @ts-ignore
      mockInngest.send.mockResolvedValue({
        data: { success: true },
        error: null
      })

      const result = await processPayment(
        mockTelegramId,
        mockAmount,
        TransactionType.MONEY_INCOME,
        mockDescription,
        mockBotName,
        ModeEnum.TopUpBalance
      )

      expect(result).toBe(true)
      expect(mockInngest.send).toHaveBeenCalledWith({
        name: 'payment/process',
        data: {
          telegram_id: mockTelegramId,
          amount: mockAmount,
          type: TransactionType.MONEY_INCOME,
          description: mockDescription,
          bot_name: mockBotName,
          service_type: ModeEnum.TopUpBalance
        }
      })
    })

    it('должен обрабатывать неудачный платеж и возвращать false', async () => {
      // Мокаем неудачный ответ от inngest
      // @ts-ignore
      mockInngest.send.mockResolvedValue({
        data: null,
        error: new Error('Failed to process payment')
      })

      const result = await processPayment(
        mockTelegramId,
        mockAmount,
        TransactionType.MONEY_INCOME,
        mockDescription,
        mockBotName,
        ModeEnum.TopUpBalance
      )

      expect(result).toBe(false)
    })

    it('должен обрабатывать исключение и возвращать false', async () => {
      // Мокаем исключение при вызове inngest.send
      // @ts-ignore
      mockInngest.send.mockRejectedValue(new Error('Network error'))

      const result = await processPayment(
        mockTelegramId,
        mockAmount,
        TransactionType.MONEY_INCOME,
        mockDescription,
        mockBotName,
        ModeEnum.TopUpBalance
      )

      expect(result).toBe(false)
    })
  })

  describe('deductFunds', () => {
    it('должен успешно списывать средства и возвращать успешный результат', async () => {
      // Мокаем успешный ответ от processPayment
      // @ts-ignore
      mockInngest.send.mockResolvedValue({
        data: { success: true },
        error: null
      })

      const result = await deductFunds(
        mockTelegramId,
        mockAmount,
        mockDescription,
        mockBotName,
        ModeEnum.NeuroPhoto
      )

      expect(result).toEqual({ success: true })
      expect(mockInngest.send).toHaveBeenCalledWith({
        name: 'payment/process',
        data: {
          telegram_id: mockTelegramId,
          amount: mockAmount,
          type: TransactionType.MONEY_EXPENSE,
          description: mockDescription,
          bot_name: mockBotName,
          service_type: ModeEnum.NeuroPhoto
        }
      })
    })

    it('должен возвращать ошибку при отрицательной или нулевой сумме', async () => {
      // Тест с отрицательной суммой
      const resultNegative = await deductFunds(
        mockTelegramId,
        -10,
        mockDescription,
        mockBotName,
        ModeEnum.NeuroPhoto
      )

      expect(resultNegative).toEqual({
        success: false,
        error: 'Amount must be positive'
      })
      expect(mockInngest.send).not.toHaveBeenCalled()

      // Тест с нулевой суммой
      const resultZero = await deductFunds(
        mockTelegramId,
        0,
        mockDescription,
        mockBotName,
        ModeEnum.NeuroPhoto
      )

      expect(resultZero).toEqual({
        success: false,
        error: 'Amount must be positive'
      })
    })

    it('должен обрабатывать ошибку при неудачной обработке платежа', async () => {
      // Мокаем неудачный ответ от processPayment
      // @ts-ignore
      mockInngest.send.mockResolvedValue({
        data: null,
        error: new Error('Failed to process payment')
      })

      const result = await deductFunds(
        mockTelegramId,
        mockAmount,
        mockDescription,
        mockBotName,
        ModeEnum.NeuroPhoto
      )

      expect(result).toEqual({ success: false })
    })
  })

  describe('addFunds', () => {
    it('должен успешно пополнять баланс и возвращать успешный результат', async () => {
      // Мокаем успешный ответ от processPayment
      // @ts-ignore
      mockInngest.send.mockResolvedValue({
        data: { success: true },
        error: null
      })

      const result = await addFunds(
        mockTelegramId,
        mockAmount,
        mockDescription,
        mockBotName
      )

      expect(result).toEqual({ success: true })
      expect(mockInngest.send).toHaveBeenCalledWith({
        name: 'payment/process',
        data: {
          telegram_id: mockTelegramId,
          amount: mockAmount,
          type: TransactionType.MONEY_INCOME,
          description: mockDescription,
          bot_name: mockBotName,
          service_type: ModeEnum.TopUpBalance
        }
      })
    })

    it('должен возвращать ошибку при отрицательной или нулевой сумме', async () => {
      // Тест с отрицательной суммой
      const resultNegative = await addFunds(
        mockTelegramId,
        -10,
        mockDescription,
        mockBotName
      )

      expect(resultNegative).toEqual({
        success: false,
        error: 'Amount must be positive'
      })
      expect(mockInngest.send).not.toHaveBeenCalled()

      // Тест с нулевой суммой
      const resultZero = await addFunds(
        mockTelegramId,
        0,
        mockDescription,
        mockBotName
      )

      expect(resultZero).toEqual({
        success: false,
        error: 'Amount must be positive'
      })
    })

    it('должен обрабатывать ошибку при неудачной обработке платежа', async () => {
      // Мокаем неудачный ответ от processPayment
      // @ts-ignore
      mockInngest.send.mockResolvedValue({
        data: null,
        error: new Error('Failed to process payment')
      })

      const result = await addFunds(
        mockTelegramId,
        mockAmount,
        mockDescription,
        mockBotName
      )

      expect(result).toEqual({ success: false })
    })
  })
}) 