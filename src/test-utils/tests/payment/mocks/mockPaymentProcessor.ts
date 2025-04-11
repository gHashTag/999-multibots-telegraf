import { logger } from '@/utils/logger'

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

  const mockFunction = jest.fn(
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
  ) as jest.MockedFunction<T>

  return mockFunction
}

/**
 * Создает мок Supabase клиента для тестирования
 */
export function createMockSupabaseClient() {
  return {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    rpc: jest.fn().mockReturnThis(),
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
  return jest.fn().mockResolvedValue(balance)
}

/**
 * Мок для функции createSuccessfulPayment
 * @param success Должен ли мок возвращать успех
 * @returns Мок функции createSuccessfulPayment
 */
export function createMockCreateSuccessfulPayment(success: boolean = true) {
  return jest.fn().mockResolvedValue({
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
  return jest.fn().mockResolvedValue({
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
  return jest.fn().mockResolvedValue({
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
  return jest.fn().mockResolvedValue({
    success,
    error: success ? null : new Error('Failed to send notification'),
  })
}
