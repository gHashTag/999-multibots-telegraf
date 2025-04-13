import { logger } from '@/utils/logger'
import { create as mockFn } from '@/test-utils/core/mock'

/**
 * Создает функцию-мок с заданным поведением
 * @param options Опции мока
 * @returns Функция-мок
 */
export function createMockFn<T extends (...args: any[]) => any>(
  options: {
    name?: string
    implementation?: T
    returnValue?: ReturnType<T>
    throwError?: boolean
    errorMessage?: string
  } = {}
) {
  const {
    name = 'mockFunction',
    implementation,
    returnValue,
    throwError = false,
    errorMessage = 'Mock Error',
  } = options

  const mockFunction = mockFn(
    implementation ||
      ((...args: Parameters<T>) => {
        logger.info(`🔍 Вызов мок-функции: ${name}`, {
          description: `Mock function called: ${name}`,
          args,
        })

        if (throwError) {
          throw new Error(errorMessage)
        }

        return returnValue
      })
  )

  return mockFunction
}

/**
 * Создает мок Supabase клиента для тестирования
 */
export function createMockSupabaseClient() {
  return {
    from: mockFn().mockReturnThis(),
    select: mockFn().mockReturnThis(),
    eq: mockFn().mockReturnThis(),
    order: mockFn().mockReturnThis(),
    insert: mockFn().mockReturnThis(),
    update: mockFn().mockReturnThis(),
    delete: mockFn().mockReturnThis(),
    limit: mockFn().mockReturnThis(),
    single: mockFn().mockReturnThis(),
    rpc: mockFn().mockReturnThis(),
    data: null,
    error: null,
  }
}

/**
 * Мок для функции getUserBalance
 * @param balance Баланс, который должен вернуть мок
 * @returns Мок функции getUserBalance
 */
export function createMockGetUserBalance(balance: number) {
  return mockFn().mockResolvedValue(balance)
}

/**
 * Мок для функции createSuccessfulPayment
 * @param success Должен ли мок возвращать успех
 * @returns Мок функции createSuccessfulPayment
 */
export function createMockCreateSuccessfulPayment(success: boolean = true) {
  return mockFn().mockResolvedValue({
    success,
    payment: success ? { id: 'mock-payment-id', status: 'COMPLETED' } : null,
    error: success ? null : new Error('Failed to create payment'),
  })
}

/**
 * Мок для функции проверки существования платежа
 * @param exists Должен ли мок возвращать, что платеж существует
 * @returns Мок функции checkPaymentExists
 */
export function createMockCheckPaymentExists(exists: boolean = false) {
  return mockFn().mockResolvedValue({
    exists,
    payment: exists ? { id: 'mock-payment-id', status: 'COMPLETED' } : null,
  })
}

/**
 * Мок для функции обновления баланса пользователя
 * @param success Должен ли мок возвращать успех
 * @returns Мок функции updateUserBalance
 */
export function createMockUpdateUserBalance(success: boolean = true) {
  return mockFn().mockResolvedValue({
    success,
    oldBalance: 1000,
    newBalance: 1500,
    error: success ? null : new Error('Failed to update balance'),
  })
}

/**
 * Мок для функции отправки уведомления
 * @param success Должен ли мок возвращать успех
 * @returns Мок функции sendPaymentNotification
 */
export function createMockSendPaymentNotification(success: boolean = true) {
  return mockFn().mockResolvedValue({
    success,
    error: success ? null : new Error('Failed to send notification'),
  })
}
